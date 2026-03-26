use crate::plugin::css::GnimCssPlugin;
use crate::plugin::resource::GnimResourcePlugin;
use crate::{GNIM_LIBDIR, dev_rundir, rolldown_config};
use std::collections::{HashMap, HashSet};
use std::{fs, sync::Arc};

#[derive(Debug, Default)]
pub struct ModuleVersions(HashMap<String, u64>);

impl ModuleVersions {
    pub fn bump(&mut self, jsfile: &str) -> u64 {
        let version = self.0.entry(jsfile.to_string()).or_insert(0);
        *version += 1;
        *version
    }

    pub fn get(&self, jsfile: &str) -> u64 {
        self.0.get(jsfile).copied().unwrap_or(0)
    }
}

fn get_dev_entry() -> Option<String> {
    let candidates = [
        Some("./node_modules/gnim/lib/dev.js".to_string()),
        GNIM_LIBDIR.map(|dir| format!("{dir}/lib/dev.js")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if let Ok(path) = fs::canonicalize(candidate)
            && path.exists()
        {
            return Some(path.to_string_lossy().to_string());
        }
    }

    None
}

#[derive(Debug)]
pub struct ModuleTracker {
    pub modules: HashSet<String>,
    pub entry_js: String,
    pub dev_entry_js: Option<String>,
    pub gtk_version: Option<String>,
    pub canonical_entry: String,
}

impl ModuleTracker {
    pub fn sync(&mut self, file: Option<String>) -> Vec<String> {
        if let Some(file) = file {
            self.modules.insert(file);
            self.modules.retain(|f| std::path::Path::new(f).exists());
        }

        self.modules.iter().cloned().collect()
    }

    pub async fn new(entry: &str) -> Result<Self, String> {
        let dir = dev_rundir();
        let dev_entry = get_dev_entry();

        let prog_entry = fs::canonicalize(entry)
            .map(|path| path.to_string_lossy().to_string())
            .map_err(|e| format!("Invalid entry file {e}"))?;

        let mut inputs: Vec<rolldown::InputItem> = vec![prog_entry.clone().into()];

        if let Some(dev_entry) = &dev_entry {
            inputs.push(dev_entry.clone().into());
        }

        let mut bundler = rolldown::Bundler::with_plugins(
            rolldown::BundlerOptions {
                input: Some(inputs),
                dir: Some(dir.to_string_lossy().to_string()),
                preserve_modules: Some(true),
                ..rolldown_config()
            },
            vec![
                Arc::new(GnimCssPlugin::default()),
                Arc::new(GnimResourcePlugin::default()),
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

        let mut modules = HashSet::new();
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
                    if let Some(dev_entry) = &dev_entry
                        && id == dev_entry
                    {
                        dev_entry_js =
                            Some(dir.join(asset.filename()).to_string_lossy().to_string());
                    }
                    if id == prog_entry {
                        entry_js = Some(dir.join(asset.filename()).to_string_lossy().to_string());
                    }
                }

                for module_id in &chunk.module_ids {
                    if !module_id.starts_with("\0") {
                        modules.insert(module_id.to_string());
                    }
                }
            }
        }

        Ok(Self {
            canonical_entry: prog_entry,
            modules,
            entry_js: entry_js.expect("Failed to match entry module"),
            dev_entry_js,
            gtk_version,
        })
    }
}
