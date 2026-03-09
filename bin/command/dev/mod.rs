mod plugin;
mod tracker;
mod transform;

use super::{dev_rundir, rolldown_config};
use clap::Args;
use plugin::GnimDevPlugin;
use rolldown::{BundleEvent, WatcherEvent};
use std::collections::HashSet;
use std::sync::{Arc, Mutex, RwLock};
use std::{fs, path, process};
use tokio::io::AsyncWriteExt;
use tokio::net::UnixListener;
use tokio::sync::broadcast;
use tracker::{ModuleTracker, ModuleVersions};

#[derive(Args)]
pub struct DevArgs {
    /// Entry file
    entry: String,
}

/// Initial bundle which returns (entry_js_file, dev_entry_js_file, modules_to_track)
async fn init(dir: path::PathBuf, entry: &str) -> (String, String, Arc<Mutex<ModuleTracker>>) {
    let prog_entry = fs::canonicalize(entry)
        .expect("valid program entry")
        .to_string_lossy()
        .to_string();

    let dev_entry = fs::canonicalize("lib/dev.ts")
        .expect("valid dev entry")
        .to_string_lossy()
        .to_string();

    let mut bundler = rolldown::Bundler::with_plugins(
        rolldown::BundlerOptions {
            input: Some(vec![entry.to_string().into(), dev_entry.clone().into()]),
            ..Default::default()
        },
        vec![],
    )
    .expect("failed to create bundler");

    let output = bundler.generate().await.expect("failed initial bundle");
    let mut modules = HashSet::new();
    let mut entry_js = None;
    let mut dev_entry_js = None;

    for asset in output.assets {
        if let rolldown_common::Output::Chunk(chunk) = asset {
            if chunk.is_entry
                && let Some(id) = chunk.facade_module_id.as_deref()
            {
                if id == dev_entry {
                    dev_entry_js = Some(dir.join(&*chunk.filename).to_string_lossy().to_string());
                }
                if id == prog_entry {
                    entry_js = Some(dir.join(&*chunk.filename).to_string_lossy().to_string());
                }
            }

            for module_id in &chunk.module_ids {
                modules.insert(module_id.to_string());
            }
        }
    }

    (
        entry_js.expect("failed to match entry file"),
        dev_entry_js.expect("failed to match dev entry file"),
        Arc::new(Mutex::new(ModuleTracker::new(modules))),
    )
}

pub async fn dev(args: &DevArgs) -> process::ExitCode {
    let dir = dev_rundir();
    let (tx, _) = broadcast::channel::<String>(16);
    let module_versions: Arc<RwLock<ModuleVersions>> = Arc::default();
    let (entry_js, dev_entry_js, module_tracker) = init(dir.clone(), &args.entry).await;

    let watcher = {
        let watcher_config = rolldown::BundlerConfig::new(
            rolldown::BundlerOptions {
                input: Some(vec![args.entry.clone().into()]),
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

    let event_task = tokio::task::spawn_blocking({
        let emitter = watcher.emitter();
        let tx = tx.clone();
        let dir = dir.clone();

        move || {
            loop {
                let rx = emitter.rx.blocking_lock();

                match rx.recv() {
                    Ok(WatcherEvent::Change(change)) => {
                        eprintln!("[dev] {} {}", change.kind, change.path);

                        let inputs: Vec<rolldown::InputItem> = {
                            let files = module_tracker
                                .lock()
                                .expect("failed to lock module_tracker")
                                .sync(change.path.to_string());

                            eprintln!("build {:#?}", files);
                            files.into_iter().map(|f| f.into()).collect()
                        };

                        if matches!(change.kind, rolldown_common::WatcherChangeKind::Update) {
                            let mut bundler = rolldown::Bundler::with_plugins(
                                rolldown::BundlerOptions {
                                    input: Some(inputs),
                                    dir: Some(dir.to_string_lossy().to_string()),
                                    preserve_modules: Some(true),
                                    treeshake: rolldown::TreeshakeOptions::Boolean(false),
                                    ..rolldown_config()
                                },
                                vec![Arc::new(GnimDevPlugin {
                                    dir: dir.clone(),
                                    tx: tx.clone(),
                                    changed_source: Some(change.path.to_string()),
                                    module_versions: Arc::clone(&module_versions),
                                })],
                            )
                            .expect("failed to create bundler");

                            tokio::runtime::Handle::current()
                                .block_on(bundler.write())
                                .expect("failed to bundle");
                        }
                    }
                    Ok(WatcherEvent::Event(event)) => {
                        if let BundleEvent::Error(err) = &event {
                            for d in &err.error.diagnostics {
                                eprintln!("[dev] {}", d.to_diagnostic().to_color_string())
                            }
                        }
                    }
                    Ok(WatcherEvent::Restart) => (),
                    Err(_) | Ok(WatcherEvent::Close) => {
                        break;
                    }
                }
            }
        }
    });

    let socket_task = tokio::spawn({
        let socket_path = dir.clone().join(format!("dev_{}.sock", process::id()));
        fs::remove_file(&socket_path).ok();

        let listener = match UnixListener::bind(&socket_path) {
            Ok(l) => Arc::new(l),
            Err(e) => {
                eprintln!("[dev] failed to bind socket at {:?}: {}", socket_path, e);
                return process::ExitCode::FAILURE;
            }
        };

        eprintln!(
            "GNIM_DEV_SOCK={} GNIM_ENTRY_MODULE={:?} gjs -m {:?}",
            socket_path.to_str().unwrap(),
            entry_js,
            dev_entry_js
        );

        async move {
            loop {
                match listener.accept().await {
                    Ok((mut stream, _)) => {
                        let mut rx = tx.subscribe();
                        tokio::spawn(async move {
                            while let Ok(path) = rx.recv().await {
                                let msg = format!("{}\n", path);
                                if stream.write_all(msg.as_bytes()).await.is_err() {
                                    eprintln!("[dev] failed to write socket");
                                    break;
                                }
                                if stream.flush().await.is_err() {
                                    eprintln!("[dev] failed to flush socket");
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

            fs::remove_file(&socket_path).ok();
        }
    });

    tokio::signal::ctrl_c().await.ok();
    watcher.close().await.ok();
    socket_task.abort();
    watcher_task.await.ok();
    event_task.await.ok();
    process::ExitCode::SUCCESS
}
