mod transform;

use crate::utils::dev_rundir;
use clap::Args;
use rolldown::{BundleEvent, ModuleType, WatcherEvent};
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::{fs, process};
use tokio::io::AsyncWriteExt;
use tokio::net::UnixListener;
use tokio::sync::broadcast;

#[derive(Args)]
pub struct DevArgs {
    /// Entry file
    entry: String,
}

#[derive(Debug, Default)]
pub struct ModuleVersions {
    pub versions: HashMap<String, u64>,
}

impl ModuleVersions {
    pub fn bump(&mut self, output_filename: &str) -> u64 {
        let version = self
            .versions
            .entry(output_filename.to_string())
            .or_insert(0);
        *version += 1;
        *version
    }

    pub fn get(&self, output_filename: &str) -> u64 {
        self.versions.get(output_filename).copied().unwrap_or(0)
    }
}

#[derive(Debug)]
struct GnimDevPlugin {
    pub dir: PathBuf,
    pub tx: broadcast::Sender<String>,
    pub changed_sources: Arc<RwLock<HashSet<String>>>,
    pub module_versions: Arc<RwLock<ModuleVersions>>,
}

impl rolldown_plugin::Plugin for GnimDevPlugin {
    fn name(&self) -> Cow<'static, str> {
        Cow::from("gnim:dev")
    }

    fn register_hook_usage(&self) -> rolldown_plugin::HookUsage {
        rolldown_plugin::HookUsage::Transform
            | rolldown_plugin::HookUsage::RenderChunk
            | rolldown_plugin::HookUsage::WriteBundle
    }

    fn transform(
        &self,
        _: rolldown_plugin::SharedTransformPluginContext,
        args: &rolldown_plugin::HookTransformArgs<'_>,
    ) -> impl Future<Output = rolldown_plugin::HookTransformReturn> + Send {
        let id = args.id.to_string();
        let code = args.code.to_string();

        async move {
            if matches!(args.module_type, ModuleType::Jsx | ModuleType::Tsx) {
                return match transform::transform_code(&code, &id) {
                    Ok(code) => Ok(Some(rolldown_plugin::HookTransformOutput {
                        code: Some(code),
                        side_effects: Some(rolldown_common::side_effects::HookSideEffects::True),
                        ..Default::default()
                    })),
                    Err(err) => {
                        println!("[dev] {}", err);
                        Ok(None)
                    }
                };
            }

            Ok(None)
        }
    }

    fn render_chunk(
        &self,
        _: &rolldown_plugin::PluginContext,
        args: &rolldown_plugin::HookRenderChunkArgs<'_>,
    ) -> impl Future<Output = rolldown_plugin::HookRenderChunkReturn> + Send {
        let code = args.code.to_string();
        let chunk_filename = args.chunk.filename.to_string();
        let module_versions = Arc::clone(&self.module_versions);

        async move {
            let versions = module_versions.read().unwrap();
            match transform::transform_imports(&code, &chunk_filename, &versions) {
                Ok(transformed) => Ok(Some(rolldown_plugin::HookRenderChunkOutput {
                    code: transformed,
                    map: None,
                })),
                Err(err) => {
                    eprintln!("[dev] {}", err);
                    Ok(None)
                }
            }
        }
    }

    fn write_bundle(
        &self,
        _: &rolldown_plugin::PluginContext,
        args: &mut rolldown_plugin::HookWriteBundleArgs,
    ) -> impl Future<Output = rolldown_plugin::HookNoopReturn> + Send {
        let changed = self.changed_sources.read().unwrap();
        let mut versions = self.module_versions.write().unwrap();

        for output in &*args.bundle {
            if let rolldown_common::Output::Chunk(chunk) = output {
                let filename = output.filename();

                let is_changed = chunk
                    .module_ids
                    .iter()
                    .any(|id| changed.contains(id.as_str()));

                if is_changed {
                    let version = versions.bump(filename);

                    match fs::canonicalize(self.dir.join(filename)) {
                        Ok(path) => {
                            self.tx
                                .send(format!("{} {}", path.to_string_lossy(), version))
                                .ok();
                        }
                        Err(err) => {
                            eprintln!("[dev] error {:?}", err);
                        }
                    };
                }
            }
        }

        drop(changed);
        drop(versions);
        self.changed_sources.write().unwrap().clear();
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
    let changed_sources: Arc<RwLock<HashSet<String>>> = Arc::default();
    let module_versions: Arc<RwLock<ModuleVersions>> = Arc::default();
    let dev_dir = ".gnim/dev";

    let config = rolldown::BundlerConfig::new(
        rolldown::BundlerOptions {
            input: Some(vec![args.entry.clone().into()]),
            dir: Some(dev_dir.into()),
            preserve_modules: Some(true),
            preserve_entry_signatures: Some(rolldown::PreserveEntrySignatures::Strict),
            minify_internal_exports: Some(false),
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
            treeshake: rolldown::TreeshakeOptions::Option(rolldown::InnerOptions {
                module_side_effects: rolldown::ModuleSideEffects::Boolean(true),
                ..Default::default()
            }),
            ..Default::default()
        },
        vec![Arc::new(GnimDevPlugin {
            dir: PathBuf::from(dev_dir),
            tx: tx.clone(),
            changed_sources: Arc::clone(&changed_sources),
            module_versions: Arc::clone(&module_versions),
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
                            .write()
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
