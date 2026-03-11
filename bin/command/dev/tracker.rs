use std::collections::{HashMap, HashSet};
use std::{fs, path};

use crate::command::rolldown_config;

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

fn get_dev_entry() -> Result<String, String> {
    let candidates = [Some("./node_modules/gnim/lib/dev.js".to_string())];

    for candidate in candidates.into_iter().flatten() {
        if let Ok(path) = fs::canonicalize(candidate)
            && path.exists()
        {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    Err("Could not find dev entry file. Is Gnim installed?".to_string())
}

#[derive(Debug)]
pub struct ModuleTracker {
    pub modules: HashSet<String>,
    pub entry_js: String,
    pub dev_entry_js: String,
}

impl ModuleTracker {
    pub fn sync(&mut self, file: Option<String>) -> Vec<String> {
        if let Some(file) = file {
            self.modules.insert(file);
            self.modules.retain(|f| std::path::Path::new(f).exists());
        }

        self.modules.iter().cloned().collect()
    }

    pub async fn new(dir: path::PathBuf, canonical_entry: &str) -> Result<Self, String> {
        let prog_entry = canonical_entry.to_string();
        let dev_entry = get_dev_entry()?;

        let mut bundler = rolldown::Bundler::with_plugins(
            rolldown::BundlerOptions {
                input: Some(vec![prog_entry.clone().into(), dev_entry.clone().into()]),
                dir: Some(dir.clone().to_string_lossy().to_string()),
                preserve_modules: Some(true),
                ..rolldown_config()
            },
            vec![],
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

        for asset in output.assets {
            if let rolldown_common::Output::Chunk(chunk) = &asset {
                if chunk.is_entry
                    && let Some(id) = chunk.facade_module_id.as_deref()
                {
                    if id == dev_entry {
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
            modules,
            entry_js: entry_js.expect("failed to match entry file"),
            dev_entry_js: dev_entry_js.expect("failed to match dev entry file"),
        })
    }
}
