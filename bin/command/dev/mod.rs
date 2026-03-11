mod builder;
mod tracker;
mod transform;

use super::{dev_rundir, rolldown_config};
use clap::Args;
use rolldown::WatcherEvent;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::{fs, process};
use tokio::io::AsyncWriteExt;
use tokio::net::UnixListener;
use tokio::process::Command;
use tokio::sync::{broadcast, mpsc};
use tracker::{ModuleTracker, ModuleVersions};

#[derive(Args)]
pub struct DevArgs {
    /// Entry file
    entry: String,
    /// Verbose logging
    #[arg(short, long, default_value_t = false)]
    verbose: bool,
}

pub static VERBOSE: OnceLock<bool> = OnceLock::new();

pub fn is_verbose() -> bool {
    VERBOSE.get_or_init(|| false).to_owned()
}

pub async fn dev(args: &DevArgs) -> process::ExitCode {
    VERBOSE.get_or_init(|| args.verbose);

    let entry_canonical = match fs::canonicalize(&args.entry) {
        Ok(ok) => ok.to_string_lossy().to_string(),
        Err(err) => {
            eprintln!("Invalid entry file {}", err);
            return process::ExitCode::FAILURE;
        }
    };

    let dir = dev_rundir();
    let (socket_tx, _) = broadcast::channel::<String>(16);
    let (restart_tx, restart_rx) = mpsc::channel::<()>(1);
    let module_versions: Arc<RwLock<ModuleVersions>> = Arc::default();
    let module_tracker = match ModuleTracker::new(dir.clone(), &entry_canonical).await {
        Ok(ok) => ok,
        Err(err) => {
            eprintln!("{err}");
            return process::ExitCode::FAILURE;
        }
    };

    let (entry_js, dev_entry_js) = module_tracker.entry_files();
    let module_tracker = Arc::new(Mutex::new(module_tracker));

    let initial_build = builder::build(
        module_tracker.clone(),
        builder::GnimDevPlugin {
            dir: dir.clone(),
            socket_tx: socket_tx.clone(),
            changed_source: None,
            module_versions: Arc::clone(&module_versions),
        },
    );

    if let Err(err) = initial_build.await {
        eprintln!("{err}");
        return process::ExitCode::FAILURE;
    }

    let watcher = {
        let watcher_config = rolldown::BundlerConfig::new(
            rolldown::BundlerOptions {
                input: Some(vec![args.entry.clone().into()]),
                dir: Some("/dev/null".into()),
                ..rolldown_config()
            },
            vec![],
        );

        match rolldown::Watcher::new(watcher_config, None) {
            Ok(w) => Arc::new(w),
            Err(e) => {
                eprintln!("[dev] failed to create watcher: {:#?}", e);
                return process::ExitCode::FAILURE;
            }
        }
    };

    let watcher_task = tokio::spawn({
        let watcher = Arc::clone(&watcher);

        async move {
            watcher.start().await;
        }
    });

    let watcher_event_task = tokio::task::spawn_blocking({
        let emitter = watcher.emitter();
        let socket_tx = socket_tx.clone();
        let dir = dir.clone();
        let entry_canonical = entry_canonical.clone();
        let module_tracker = module_tracker.clone();

        move || {
            loop {
                let rx = emitter.rx.blocking_lock();

                match rx.recv() {
                    Ok(WatcherEvent::Change(change)) => {
                        if matches!(change.kind, rolldown_common::WatcherChangeKind::Update) {
                            if is_verbose() {
                                eprintln!("[dev] {} {}", change.kind, change.path);
                            }

                            tokio::runtime::Handle::current().block_on(async {
                                let build = builder::build(
                                    module_tracker.clone(),
                                    builder::GnimDevPlugin {
                                        dir: dir.clone(),
                                        socket_tx: socket_tx.clone(),
                                        changed_source: Some(change.path.to_string()),
                                        module_versions: Arc::clone(&module_versions),
                                    },
                                );

                                if let Err(err) = build.await {
                                    println!("{err}");
                                }
                            });

                            if change.path.to_string() == entry_canonical {
                                restart_tx.blocking_send(()).ok();
                            }
                        }
                    }
                    Ok(WatcherEvent::Event(_)) => (),
                    Ok(WatcherEvent::Restart) => (),
                    Ok(WatcherEvent::Close) => {
                        break;
                    }
                    Err(err) => {
                        println!("{}", err);
                        break;
                    }
                }
            }
        }
    });

    let socket_path = dir.clone().join("dev.sock");
    let socket_task = tokio::spawn({
        let socket_path = socket_path.clone();
        fs::remove_file(&socket_path).ok();

        let listener = match UnixListener::bind(&socket_path) {
            Ok(l) => Arc::new(l),
            Err(e) => {
                eprintln!("[dev] failed to bind socket at {:?}: {}", socket_path, e);
                return process::ExitCode::FAILURE;
            }
        };

        async move {
            loop {
                match listener.accept().await {
                    Ok((mut stream, _)) => {
                        let mut rx = socket_tx.subscribe();
                        tokio::spawn(async move {
                            while let Ok(path) = rx.recv().await {
                                let msg = format!("{}\n", path);
                                if stream.write_all(msg.as_bytes()).await.is_err() {
                                    if is_verbose() {
                                        eprintln!("[dev] failed to write socket");
                                    }
                                    break;
                                }
                                if stream.flush().await.is_err() {
                                    if is_verbose() {
                                        eprintln!("[dev] failed to flush socket");
                                    }
                                    break;
                                };
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("[dev] socket accept error: {}", e);
                        break;
                    }
                }
            }
        }
    });

    let mut gjs_task = tokio::spawn({
        let socket_path = socket_path.clone();
        let entry_js = entry_js.clone();
        let dev_entry_js = dev_entry_js.clone();

        async move {
            let mut restart_rx = restart_rx;

            loop {
                if is_verbose() {
                    eprintln!("[dev] starting gjs");
                }

                let mut child = Command::new("gjs")
                    .arg("-m")
                    .arg(&dev_entry_js)
                    .env("GNIM_DEV_SOCK", socket_path.to_str().unwrap())
                    .env("GNIM_ENTRY_MODULE", &entry_js)
                    .env("GNIM_VERBOSE", if is_verbose() { "true" } else { "" })
                    .spawn()
                    .expect("failed to spawn gjs");

                tokio::select! {
                    status = child.wait() => {
                        match status {
                            Ok(s)  => {
                                if is_verbose() {
                                    eprintln!("[dev] gjs exited with code {}", s.code().unwrap_or(0));
                                }
                                break;
                            }
                            Err(e) => {
                                eprintln!("[dev] gjs wait error: {}", e);
                                break;
                            }
                        }
                    }
                    _ = restart_rx.recv() => {
                        eprintln!("[dev] restarting gjs");
                        child.kill().await.ok();
                        child.wait().await.ok();
                    }
                }
            }
        }
    });

    if is_verbose() {
        eprintln!("[dev] socket: {}", socket_path.to_string_lossy());
        eprintln!("[dev] entry: {entry_js}");
        eprintln!("[dev] dev_entry: {dev_entry_js}");
    }

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            if is_verbose() {
                eprintln!("[dev] received ctrl-c, shutting down");
            }
        }
        _ = &mut gjs_task => ()
    }

    watcher.close().await.ok();
    gjs_task.abort();
    socket_task.abort();
    watcher_task.await.ok();
    watcher_event_task.await.ok();
    fs::remove_dir_all(dir).ok();
    process::ExitCode::SUCCESS
}
