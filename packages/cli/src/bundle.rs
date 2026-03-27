use crate::dev::ModuleTracker;
use crate::plugin::{css::GnimCssPlugin, resource::GnimResourcePlugin};
use crate::{dev_rundir, rolldown_config};
use clap::Args;
use std::os::unix::fs::PermissionsExt;
use std::path;
use std::{env, fs, sync::Arc};

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
}

pub async fn bundle(args: &BundleArgs) -> Result<(), String> {
    if !args.prefix.ends_with("/") || !args.prefix.starts_with("/") {
        return Err("prefix should end and start with a slash '/'".into());
    }

    if args.exe {
        let outfile = path::Path::new(&args.outfile);
        let outdir = outfile.parent().expect("Invalid outfile");
        fs::create_dir_all(outdir).expect("Failed to create directories");

        let gresource = {
            let entry = path::Path::new(&args.entry);
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
                let mut content = String::new();
                content.push_str(&format!("#!{} -m\n", gjs.to_string_lossy()));
                content.push_str("import Gio from \"gi://Gio\"\n");
                content.push_str(&format!(
                    "const r = Gio.Resource.load({:?})\n",
                    gresource.to_string_lossy(),
                ));
                content.push_str("r._register()\n");
                content.push_str(&format!("await import({:?})\n", main));

                fs::write(outfile, content).expect("Failed to write file");

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

    resources.generate_gresource(&js_bundle_target, &args.main_alias, &args.outfile)?;
    Ok(())
}
