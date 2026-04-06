use crate::dev::ModuleTracker;
use crate::plugin::css::GnimCssPlugin;
use crate::plugin::resource::{GResource, GnimResourcePlugin, ResourceFile, generate_resource};
use crate::{dev_rundir, rolldown_config};
use clap::Args;
use rolldown_utils::replace_all_placeholder::ReplaceAllPlaceholder;
use std::path::{Path, PathBuf};
use std::{fs, io, sync::Arc};

#[derive(Args)]
pub struct BundleArgs {
    /// Entry module
    pub entry: String,
    /// Output target
    #[arg(short, long)]
    pub outfile: Option<String>,
    /// Application ID in reverse DNS format
    #[arg(long)]
    pub id: Option<String>,
    /// Replace global identifiers with constant expressions
    #[arg(short, long, value_name = "KEY=VALUE", value_parser = crate::parse_key_val)]
    pub define: Vec<(String, String)>,
    /// Extra directories to include in the bundle
    #[arg(short, long, value_name = "PATH")]
    pub include: Vec<PathBuf>,
}

fn walk_recursively(root: &Path) -> io::Result<Vec<PathBuf>> {
    if root.is_file() {
        return Ok(vec![root.to_owned()]);
    }

    fs::read_dir(root)?.try_fold(Vec::new(), |mut acc, entry| {
        let entry = entry?;
        let path = entry.path();

        acc.push(path.clone());

        if path.is_dir() {
            acc.extend(walk_recursively(&path)?);
        }

        Ok(acc)
    })
}

pub async fn bundle(args: &BundleArgs) -> Result<(), String> {
    let mainjs = "main.js";

    let resource_prefix = match &args.id {
        Some(id) => format!("/{}/", id.clone().replace_all(".", "/")),
        None => "/".to_string(),
    };

    let outfile = Path::new(args.outfile.as_deref().unwrap_or("gresource"));
    let tracker = ModuleTracker::new(&args.entry).await?;
    let resources = Arc::new(GnimResourcePlugin::new(Some(resource_prefix.clone())));
    let js_bundle_target = dev_rundir().join(mainjs).to_string_lossy().to_string();

    let mut bundler = rolldown::Bundler::with_plugins(
        rolldown::BundlerOptions {
            input: Some(vec![args.entry.to_owned().into()]),
            file: Some(js_bundle_target.clone()),
            ..rolldown_config()
        },
        vec![
            Arc::new(GnimCssPlugin::new(tracker.gtk_version)),
            resources.clone(),
        ],
    )
    .expect("Failed to create bundler");

    bundler.write().await.map_err(|err| {
        err.iter()
            .map(|d| d.to_diagnostic().to_color_string())
            .collect::<Vec<_>>()
            .join("\n")
    })?;

    let extra_files: Vec<ResourceFile> = args
        .include
        .iter()
        .filter_map(|dir| match walk_recursively(dir) {
            Err(err) => {
                eprintln!(
                    "Failed to include {} in the bundle: {}",
                    dir.to_string_lossy(),
                    err
                );
                None
            }
            Ok(files) => {
                let result: Vec<ResourceFile> = files
                    .iter()
                    .filter(|file| file.is_file())
                    .map(|file| {
                        let last = dir
                            .file_name()
                            .expect("dir must have a last segment")
                            .to_string_lossy();

                        let rel = file
                            .strip_prefix(dir)
                            .expect("file must be inside dir")
                            .to_string_lossy();

                        let alias = if rel.is_empty() {
                            format!("{last}")
                        } else {
                            format!("{last}/{rel}")
                        };

                        // example:
                        //
                        // dir: "$(pwd)/data/icons"
                        // file: "$(pwd)/data/icons/path/to/file.svg"
                        //
                        // <file alias="icons/path/to/file.svg">$file</file>
                        ResourceFile {
                            file: file.to_string_lossy().to_string(),
                            alias,
                        }
                    })
                    .collect();

                Some(result)
            }
        })
        .flatten()
        .collect();

    let main = ResourceFile {
        file: js_bundle_target,
        alias: mainjs.to_string(),
    };

    let resources = &[GResource {
        prefix: resource_prefix.clone(),
        files: [vec![main], resources.imports(), extra_files].concat(),
    }];

    generate_resource(resources, outfile)?;

    Ok(())
}
