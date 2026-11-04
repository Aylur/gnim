use crate::plugin::css::GnimCssPlugin;
use crate::plugin::resource::GnimResourcePlugin;
use crate::plugin::sourcemap::GnimSourceMapPlugin;
use crate::{dev_rundir, rolldown_dev_config};
use std::borrow::Cow;
use std::path::Path;
use std::{collections::HashMap, fs, io, sync::Arc};

const DEV_ENTRY: &str = "gnim:dev";

#[derive(Debug)]
struct GnimDevEntryPlugin(/*importer*/ String);

impl rolldown_plugin::Plugin for GnimDevEntryPlugin {
    fn name(&self) -> Cow<'static, str> {
        Cow::from("gnim:dev-entry")
    }

    fn register_hook_usage(&self) -> rolldown_plugin::HookUsage {
        rolldown_plugin::HookUsage::ResolveId
    }

    async fn resolve_id(
        &self,
        ctx: &rolldown_plugin::PluginContext,
        args: &rolldown_plugin::HookResolveIdArgs<'_>,
    ) -> rolldown_plugin::HookResolveIdReturn {
        if args.specifier != DEV_ENTRY {
            return Ok(None);
        }

        let gnim = ctx.resolve("gnim", Some(&self.0), None).await??;
        let index = Path::new(gnim.id.as_str());
        let ext = index.extension().unwrap_or_default();
        let dev = index.with_file_name("dev").with_extension(ext);

        if !dev.exists() {
            Err(io::Error::other(format!(
                "gnim dev runtime not found at {}",
                dev.display()
            )))?;
        }

        Ok(Some(rolldown_plugin::HookResolveIdOutput::from_id(
            dev.to_string_lossy().into_owned(),
        )))
    }
}

#[derive(Debug)]
pub struct ModuleTracker {
    pub entry_js: String,
    pub dev_entry_js: Option<String>,
    pub gtk_version: Option<String>,
    pub canonical_entry: String,
    pub modules: HashMap</* id */ String, /* js_module */ String>,
    pub versions: HashMap</* js_module */ String, u64>,
}

impl ModuleTracker {
    pub fn bump(&mut self, id: &str, js_module: &str) -> u64 {
        self.modules.insert(id.to_string(), js_module.to_string());

        let version = self.versions.entry(js_module.to_string()).or_insert(0);
        *version += 1;

        self.modules
            .retain(|id, _| std::path::Path::new(id).exists());

        *version
    }

    pub fn get_version(&self, js_module: &str) -> u64 {
        self.versions.get(js_module).copied().unwrap_or(0)
    }

    pub async fn new(entry: &str, dev: bool) -> Result<Self, String> {
        let dir = dev_rundir();

        let prog_entry = fs::canonicalize(entry)
            .map(|path| path.to_string_lossy().to_string())
            .map_err(|e| format!("Invalid entry file: {e}"))?;

        let mut inputs: Vec<rolldown::InputItem> = vec![prog_entry.clone().into()];

        if dev {
            inputs.push(DEV_ENTRY.to_owned().into());
        }

        let mut bundler = rolldown::Bundler::with_plugins(
            rolldown::BundlerOptions {
                input: Some(inputs),
                dir: Some(dir.to_string_lossy().to_string()),
                preserve_modules: Some(true),
                ..rolldown_dev_config()
            },
            vec![
                Arc::new(GnimDevEntryPlugin(prog_entry.clone())),
                Arc::new(GnimCssPlugin::default()),
                Arc::new(GnimResourcePlugin::default()),
                Arc::new(GnimSourceMapPlugin),
            ],
        )
        .expect("failed to create bundler");

        let output = match bundler.write().await {
            Ok(ok) => ok,
            Err(err) => {
                return Err(err
                    .into_vec()
                    .into_iter()
                    .map(|err| err.to_diagnostic().to_color_string())
                    .collect::<Vec<_>>()
                    .join("\n"));
            }
        };

        let mut modules = HashMap::new();
        let mut versions = HashMap::new();
        let mut entry_js = None;
        let mut dev_entry_js = None;
        let mut gtk_version = None;

        for asset in output.assets {
            if let rolldown_common::Output::Chunk(chunk) = &asset {
                for import in chunk.imports.iter() {
                    match import.as_ref() {
                        "gi://Adw"
                        | "gi://Adw?version=1"
                        | "gi://Gtk?version=4.0"
                        | "gi://Gdk?version=4.0" => {
                            gtk_version = Some("4.0".to_string());
                        }
                        "gi://Gtk?version=3.0" | "gi://Gdk?version=3.0" => {
                            gtk_version = Some("3.0".to_string());
                        }
                        _ => (),
                    }
                }

                if chunk.is_entry
                    && let Some(id) = chunk.facade_module_id.as_deref()
                {
                    let js = Some(dir.join(asset.filename()).to_string_lossy().to_string());
                    if id == prog_entry {
                        entry_js = js;
                    } else if dev {
                        dev_entry_js = js;
                    }
                }

                let js = asset.filename();

                for module_id in &chunk.module_ids {
                    if !module_id.starts_with("\0") {
                        let module = fs::canonicalize(dir.join(js))
                            .expect("Failed to canonicalize js chunk")
                            .to_string_lossy()
                            .to_string();

                        modules.insert(module_id.to_string(), module);
                    }
                }

                versions.insert(js.to_string(), 0);
            }
        }

        Ok(Self {
            entry_js: entry_js.expect("Failed to match entry module"),
            dev_entry_js,
            gtk_version,
            canonical_entry: prog_entry,
            modules,
            versions,
        })
    }
}
