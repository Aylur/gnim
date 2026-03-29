use crate::dev::ModuleTracker;
use crate::plugin::css::GnimCssPlugin;
use crate::plugin::resource::{GResource, GnimResourcePlugin, ResourceFile, generate_resource};
use crate::{dev_rundir, rolldown_config};
use clap::Args;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::{env, fs, io, sync::Arc};

#[derive(Args)]
pub struct BundleArgs {
    /// Entry module or gresource location for the executable
    pub entry: String,
    /// Output file
    pub outfile: String,
    /// Replace global identifiers with constant expressions
    #[arg(short, long, value_name = "KEY=VALUE", value_parser = crate::parse_key_val)]
    pub define: Vec<(String, String)>,
    /// Alias used in the gresource for the main js module
    #[arg(short, long, value_name = "NAME", default_value_t = String::from("main.js"))]
    pub main_alias: String,
    /// Path prefix used in the gresource
    #[arg(short, long, value_name = "PATH", default_value_t = String::from("/"))]
    pub prefix: String,
    /// Create an executable for a given gresource
    #[arg(short, long)]
    pub exe: bool,
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
    if !args.prefix.ends_with("/") || !args.prefix.starts_with("/") {
        return Err("prefix should end and start with a slash '/'".into());
    }

    if args.exe {
        let outfile = Path::new(&args.outfile);
        let outdir = outfile.parent().expect("Invalid outfile");
        fs::create_dir_all(outdir).expect("Failed to create directories");

        let gresource = {
            let entry = Path::new(&args.entry);
            if entry.is_absolute() {
                entry.to_path_buf()
            } else {
                env::current_dir()
                    .expect("Failed to read current_dir")
                    .join(entry)
            }
        };

        let gjs = env::var_os("PATH").and_then(|paths| {
            env::split_paths(&paths)
                .map(|dir| dir.join("gjs"))
                .find(|path| path.is_file())
        });

        let main = format!("resource://{}{}", args.prefix, args.main_alias);

        return match gjs {
            None => Err("Failed to find gjs in $PATH".into()),
            Some(gjs) => {
                let content = [
                    &format!("#!{} -m", gjs.to_string_lossy()),
                    "import Gio from \"gi://Gio\"",
                    &format!(
                        "const r = Gio.Resource.load({:?})",
                        gresource.to_string_lossy(),
                    ),
                    "r._register()",
                    &format!("await import({:?})", main),
                ];

                fs::write(outfile, content.join("\n")).expect("Failed to write file");

                let mut perms = fs::metadata(outfile)
                    .expect("Failed to get metadata for outfile")
                    .permissions();
                perms.set_mode(perms.mode() | 0o111);
                fs::set_permissions(outfile, perms).expect("Failed set file permissions");

                Ok(())
            }
        };
    }

    let tracker = ModuleTracker::new(&args.entry).await?;
    let resources = Arc::new(GnimResourcePlugin::new(Some(args.prefix.clone())));

    let js_bundle_target = dev_rundir()
        .join(&args.main_alias)
        .to_string_lossy()
        .to_string();

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
        alias: args.main_alias.clone(),
    };

    let resources = &[GResource {
        prefix: args.prefix.clone(),
        files: [vec![main], resources.imports(), extra_files].concat(),
    }];

    generate_resource(resources, &args.outfile)?;

    Ok(())
}
