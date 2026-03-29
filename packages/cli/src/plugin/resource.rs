use crate::{dev_rundir, is_in_path};
use rolldown::ModuleType;
use std::borrow::Cow;
use std::collections::HashSet;
use std::future::Future;
use std::path::Path;
use std::sync::{Arc, RwLock};
use std::{fs, process};

const FILE_SUFFIX: &str = "?file";

#[derive(Debug, Clone)]
pub struct GResource {
    pub prefix: String,
    pub files: Vec<ResourceFile>,
}

#[derive(Debug, Clone, Default, Eq, Hash, PartialEq)]
pub struct ResourceFile {
    pub file: String,
    pub alias: String,
}

pub fn generate_resource(gresources: &[GResource], outfile: &str) -> Result<(), String> {
    let resources: Vec<String> = gresources
        .iter()
        .map(|r| {
            let files: Vec<String> = r
                .files
                .iter()
                .map(|f| format!("<file alias={:?}>{}</file>", f.alias, f.file))
                .collect();

            format!(
                "<gresource prefix={:?}>{}</gresource>",
                r.prefix,
                files.join("")
            )
        })
        .collect();

    let xml_file = dev_rundir()
        .join("gresource.xml")
        .to_string_lossy()
        .to_string();

    let xml_contents = format!("<gresources>{}</gresources>", resources.join(""));
    fs::write(&xml_file, xml_contents).expect("Failed to write gresource.xml");

    if is_in_path("glib-compile-resources") {
        let status = process::Command::new("glib-compile-resources")
            .args(["--target", outfile, &xml_file])
            .status();

        if let Err(e) = status {
            return Err(format!("Failed to compile: {e}"));
        }
    } else {
        return Err("Cannot compile: glib-compile-resources is not found".to_string());
    }

    Ok(())
}

#[derive(Debug, Default)]
pub struct GnimResourcePlugin {
    prefix: Option<String>,
    imports: Arc<RwLock<HashSet<ResourceFile>>>,
    root_dir: String,
}

impl GnimResourcePlugin {
    pub fn new(prefix: Option<String>) -> Self {
        Self {
            prefix,
            imports: Arc::default(),
            root_dir: match std::env::current_dir() {
                Ok(path) => path.to_string_lossy().to_string(),
                Err(err) => {
                    eprintln!("warning: failed to get current dir: {}", err);
                    std::process::exit(1);
                }
            },
        }
    }

    pub fn imports(&self) -> Vec<ResourceFile> {
        self.imports.read().unwrap().iter().cloned().collect()
    }
}

impl rolldown_plugin::Plugin for GnimResourcePlugin {
    fn name(&self) -> Cow<'static, str> {
        Cow::from("gnim:resource")
    }

    fn register_hook_usage(&self) -> rolldown_plugin::HookUsage {
        rolldown_plugin::HookUsage::ResolveId | rolldown_plugin::HookUsage::Load
    }

    fn resolve_id(
        &self,
        _: &rolldown_plugin::PluginContext,
        args: &rolldown_plugin::HookResolveIdArgs<'_>,
    ) -> impl Future<Output = rolldown_plugin::HookResolveIdReturn> + Send {
        let specifier = args.specifier.to_string();
        let importer = args.importer.map(|s| s.to_string());

        async move {
            if !specifier.ends_with(FILE_SUFFIX) {
                return Ok(None);
            }

            let file_path = specifier.strip_suffix(FILE_SUFFIX).unwrap();

            let resolved_path = match &importer {
                None => file_path.to_string(),
                Some(importer_path) => {
                    let importer = Path::new(importer_path);
                    let dir = importer.parent().unwrap_or(Path::new("."));
                    dir.join(file_path)
                        .canonicalize()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| file_path.to_string())
                }
            };

            Ok(Some(rolldown_plugin::HookResolveIdOutput {
                id: format!("{}{}", resolved_path, FILE_SUFFIX).into(),
                ..Default::default()
            }))
        }
    }

    fn load(
        &self,
        _: std::sync::Arc<rolldown_plugin::LoadPluginContext>,
        args: &rolldown_plugin::HookLoadArgs<'_>,
    ) -> impl Future<Output = rolldown_plugin::HookLoadReturn> + Send {
        let id = args.id.to_string();
        let imports = Arc::clone(&self.imports);

        async move {
            if !id.ends_with(FILE_SUFFIX) {
                return Ok(None);
            }

            let file_path = id.strip_suffix(FILE_SUFFIX).unwrap();

            Ok(Some(rolldown_plugin::HookLoadOutput {
                code: match &self.prefix {
                    Some(prefix) => {
                        let alias = if file_path.starts_with(&self.root_dir) {
                            file_path.strip_prefix(&self.root_dir).unwrap().to_string()
                        } else {
                            format!("root{file_path}")
                        };

                        imports.write().unwrap().insert(ResourceFile {
                            file: file_path.to_string(),
                            alias: alias.clone(),
                        });

                        format!(
                            "export default imports.gi.Gio.File.new_for_uri({:?})",
                            format!("resource://{prefix}{alias}")
                        )
                        .into()
                    }

                    None => format!(
                        "export default imports.gi.Gio.File.new_for_path({:?})",
                        file_path
                    )
                    .into(),
                },
                module_type: Some(ModuleType::Js),
                ..Default::default()
            }))
        }
    }
}
