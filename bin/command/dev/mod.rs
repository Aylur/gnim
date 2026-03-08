mod transform;

use crate::utils::dev_rundir;
use clap::Args;
use rolldown::{BundleEvent, ModuleType, WatcherEvent};
use std::borrow::Cow;
use std::collections::HashSet;
use std::future::Future;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::{fs, process};
use tokio::io::AsyncWriteExt;
use tokio::net::UnixListener;
use tokio::sync::broadcast;

#[derive(Args)]
pub struct DevArgs {
    /// Entry file
    entry: String,
}

#[derive(Debug)]
struct GnimDevPlugin {
    pub dir: PathBuf,
    pub tx: broadcast::Sender<String>,
    pub changed_sources: Arc<Mutex<HashSet<String>>>,
}

impl rolldown_plugin::Plugin for GnimDevPlugin {
    fn name(&self) -> Cow<'static, str> {
        Cow::from("gnim:dev")
    }

    fn register_hook_usage(&self) -> rolldown_plugin::HookUsage {
        rolldown_plugin::HookUsage::Transform | rolldown_plugin::HookUsage::WriteBundle
    }

    fn transform(
        &self,
        _: rolldown_plugin::SharedTransformPluginContext,
        args: &rolldown_plugin::HookTransformArgs<'_>,
    ) -> impl Future<Output = rolldown_plugin::HookTransformReturn> + Send {
        let id = args.id.to_string();
        let code = args.code.to_string();

        async move {
            match args.module_type {
                ModuleType::Jsx | ModuleType::Tsx => match transform::transform_code(&code, &id) {
                    Ok(code) => Ok(Some(rolldown_plugin::HookTransformOutput {
                        code: Some(code),
                        ..Default::default()
                    })),
                    Err(err) => {
                        println!("[dev] {}", err);
                        Ok(None)
                    }
                },
                _ => Ok(None),
            }
        }
    }

    fn write_bundle(
        &self,
        _: &rolldown_plugin::PluginContext,
        args: &mut rolldown_plugin::HookWriteBundleArgs,
    ) -> impl Future<Output = rolldown_plugin::HookNoopReturn> + Send {
        let mut changed = self.changed_sources.lock().unwrap();

        for output in &mut *args.bundle {
            if let rolldown_common::Output::Chunk(chunk) = output {
                let is_changed = chunk
                    .module_ids
                    .iter()
                    .any(|id| changed.contains(id.as_str()));

                if is_changed {
                    match fs::canonicalize(self.dir.join(output.filename())) {
                        Ok(path) => {
                            self.tx.send(path.to_string_lossy().to_string()).ok();
                        }
                        Err(err) => {
                            eprintln!("[dev] error {:?}", err);
                        }
                    };
                }
            }
        }

        changed.clear();
        async { Ok(()) }
    }
}

pub async fn dev(args: &DevArgs) -> process::ExitCode {
    let socket_path = dev_rundir().join(format!("dev_{}.sock", process::id()));
    fs::remove_file(&socket_path).ok();

    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => Arc::new(l),
        Err(e) => {
            eprintln!("[dev] failed to bind socket at {:?}: {}", socket_path, e);
            return process::ExitCode::FAILURE;
        }
    };

    let (tx, _) = broadcast::channel::<String>(16);
    let changed_sources: Arc<Mutex<HashSet<String>>> = Arc::default();
    let dev_dir = ".gnim/dev";

    let config = rolldown::BundlerConfig::new(
        rolldown::BundlerOptions {
            input: Some(vec![args.entry.clone().into()]),
            dir: Some(dev_dir.into()),
            preserve_modules: Some(true),
            external: Some(
                vec![
                    "gi://*".to_owned(),
                    "resource://*".to_owned(),
                    "file://*".to_owned(),
                    "system".to_owned(),
                    "gettext".to_owned(),
                    "console".to_owned(),
                    "cairo".to_owned(),
                ]
                .into(),
            ),
            transform: Some(rolldown::BundlerTransformOptions {
                decorator: Some(rolldown::DecoratorOptions {
                    legacy: Some(true),
                    emit_decorator_metadata: Some(true),
                }),
                ..Default::default()
            }),
            sourcemap: Some(rolldown::SourceMapType::Inline),
            format: Some(rolldown::OutputFormat::Esm),
            ..Default::default()
        },
        vec![Arc::new(GnimDevPlugin {
            dir: PathBuf::from(dev_dir),
            tx: tx.clone(),
            changed_sources: Arc::clone(&changed_sources),
        })],
    );

    let watcher = match rolldown::Watcher::new(config, None) {
        Ok(w) => Arc::new(w),
        Err(e) => {
            eprintln!("[dev] failed to create watcher: {:#?}", e);
            return process::ExitCode::FAILURE;
        }
    };

    let watcher_task = tokio::spawn({
        let watcher_clone = Arc::clone(&watcher);

        async move {
            watcher_clone.start().await;
        }
    });

    let event_task = tokio::task::spawn_blocking({
        let emitter = watcher.emitter();

        move || {
            loop {
                let rx = emitter.rx.blocking_lock();

                match rx.recv() {
                    Ok(WatcherEvent::Change(change)) => {
                        eprintln!("[dev] {} {}", change.kind, change.path);
                        changed_sources
                            .lock()
                            .unwrap()
                            .insert(change.path.to_string());
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

    let socket_task = tokio::spawn(async move {
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
    });

    tokio::signal::ctrl_c().await.ok();
    watcher.close().await.ok();
    socket_task.abort();
    watcher_task.await.ok();
    event_task.await.ok();
    fs::remove_file(&socket_path).ok();
    process::ExitCode::SUCCESS
}
