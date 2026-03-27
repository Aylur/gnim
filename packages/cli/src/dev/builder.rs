use super::rolldown_config;
use super::socket::SocketMsg;
use super::tracker::ModuleTracker;
use super::transform::{transform_code, transform_imports};
use crate::plugin::css::GnimCssPlugin;
use crate::plugin::resource::GnimResourcePlugin;
use rolldown::ModuleType;
use std::borrow::Cow;
use std::fs;
use std::future::Future;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tokio::sync::broadcast;

pub async fn build_modules(plugin: GnimDevPlugin) -> Result<rolldown::BundleOutput, String> {
    let inputs: Vec<rolldown::InputItem> = {
        let files = &plugin
            .module_tracker
            .read()
            .expect("Failed to read module_tracker")
            .modules;

        let mut inputs: Vec<String> = files.keys().cloned().collect();

        if let Some(input) = &plugin.changed_source {
            inputs.push(input.clone());
        }

        inputs.into_iter().map(|i| i.into()).collect()
    };

    let mut bundler = rolldown::Bundler::with_plugins(
        rolldown::BundlerOptions {
            input: Some(inputs),
            dir: Some(plugin.dir.clone().to_string_lossy().to_string()),
            preserve_modules: Some(true),
            treeshake: rolldown::TreeshakeOptions::Boolean(false),
            ..rolldown_config()
        },
        vec![
            Arc::new(plugin),
            Arc::new(GnimCssPlugin::default()),
            Arc::new(GnimResourcePlugin::default()),
        ],
    )
    .expect("Failed to create bundler");

    bundler.write().await.map_err(|err| {
        err.into_vec()
            .iter()
            .map(|d| d.to_diagnostic().to_color_string())
            .collect::<Vec<_>>()
            .join("\n")
    })
}

#[derive(Debug)]
pub struct GnimDevPlugin {
    pub dir: PathBuf,
    pub socket_tx: broadcast::Sender<SocketMsg>,
    pub changed_source: Option<String>,
    pub module_tracker: Arc<RwLock<ModuleTracker>>,
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
                return match transform_code(&code, &id) {
                    Ok(code) => Ok(Some(rolldown_plugin::HookTransformOutput {
                        code: Some(code),
                        side_effects: Some(rolldown_common::side_effects::HookSideEffects::True),
                        ..Default::default()
                    })),
                    Err(err) => {
                        eprintln!("[dev] {}", err);
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
        let module_tracker = self.module_tracker.clone();

        async move {
            let versions = module_tracker.read().unwrap();
            match transform_imports(&code, &chunk_filename, &versions) {
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
        let mut tracker = self.module_tracker.write().unwrap();

        for output in args.bundle.iter() {
            if let rolldown_common::Output::Chunk(chunk) = output {
                let filename = output.filename();

                if let Some(source) = &self.changed_source
                    && chunk.module_ids.iter().any(|id| source == id.as_str())
                {
                    let version = tracker.bump(source, filename);
                    let js = fs::canonicalize(self.dir.join(filename))
                        .expect("Failed to canonicalize js chunk");

                    self.socket_tx
                        .send(SocketMsg {
                            source: source.to_string(),
                            module: js.to_string_lossy().to_string(),
                            version,
                        })
                        .ok();
                }
            }
        }

        async { Ok(()) }
    }
}
