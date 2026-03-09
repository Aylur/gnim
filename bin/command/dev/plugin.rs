use super::tracker::ModuleVersions;
use super::transform::{transform_code, transform_imports};
use rolldown::ModuleType;
use std::borrow::Cow;
use std::fs;
use std::future::Future;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tokio::sync::broadcast;

#[derive(Debug)]
pub struct GnimDevPlugin {
    pub dir: PathBuf,
    pub tx: broadcast::Sender<String>,
    pub changed_source: Option<String>,
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
                return match transform_code(&code, &id) {
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
        let changed = &self.changed_source;
        let mut versions = self.module_versions.write().unwrap();

        for output in &*args.bundle {
            if let rolldown_common::Output::Chunk(chunk) = output {
                let filename = output.filename();

                if changed
                    .as_deref()
                    .is_some_and(|file| chunk.module_ids.iter().any(|id| file == id.as_str()))
                {
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

        async { Ok(()) }
    }
}
