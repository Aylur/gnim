use clap::Args;
use rolldown_utils::replace_all_placeholder::ReplaceAllPlaceholder;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::{env, fs, path::Path};

#[derive(Args)]
pub struct ExeArgs {
    /// The gresource bundle
    pub gresource: String,
    /// Output target, if omitted stdout is used
    #[arg(short, long)]
    pub outfile: Option<String>,
    /// Application ID in reverse DNS format
    #[arg(short, long)]
    pub id: Option<String>,
    /// Installation prefix
    #[arg(short, long, default_value_t = String::from("/usr/local"))]
    pub prefix: String,
    /// Data directory
    #[arg(short, long, default_value_t = String::from("share"))]
    pub datadir: String,
    /// Library directory
    #[arg(short, long, default_value_t = String::from("lib"))]
    pub libdir: String,
}

pub async fn exe(args: &ExeArgs) -> Result<(), String> {
    let gjs = env::var_os("PATH")
        .and_then(|paths| {
            env::split_paths(&paths)
                .map(|dir| dir.join("gjs"))
                .find(|path| path.is_file())
        })
        .ok_or("GJS was not found in $PATH".to_string())?;

    let mainjs = "main.js";
    let resource_prefix = match &args.id {
        Some(id) => format!("/{}/", id.clone().replace_all(".", "/")),
        None => "/".to_string(),
    };

    let gresource = {
        let entry = Path::new(&args.gresource);
        if entry.is_absolute() {
            entry.to_path_buf()
        } else {
            env::current_dir()
                .expect("Failed to read current_dir")
                .join(entry)
        }
    };

    let prefix = PathBuf::from(&args.prefix);
    let datadir = prefix.join(&args.datadir);
    let libdir = prefix.join(&args.libdir);

    let gettext = args.id.as_deref().map(|id| {
        let localedir = datadir.join("locale");
        format!(
            "imports.gettext.bindtextdomain({:?}, {:?})",
            id,
            localedir.to_string_lossy()
        )
    });

    let libsearch = args.id.as_deref().map(|id| {
        let pkglibdir = libdir.join(id);
        let girdir = pkglibdir.join("girepository-1.0");

        let content = [
            "const gir = imports.gi.GIRepository.Repository.dup_default()",
            &format!("gir.prepend_search_path({:?})", girdir.to_string_lossy()),
            &format!("gir.prepend_search_path({:?})", pkglibdir.to_string_lossy()),
            &format!(
                "gir.prepend_library_path({:?})",
                pkglibdir.to_string_lossy()
            ),
        ];

        content.join("\n")
    });

    let content = [
        &format!("#!{} -m", gjs.to_string_lossy()),
        &gettext.unwrap_or_default(),
        &libsearch.unwrap_or_default(),
        &format!(
            "const r = imports.gi.Gio.Resource.load({:?})",
            gresource.to_string_lossy(),
        ),
        "r._register()",
        &format!(
            "await import({:?})",
            format!("resource://{}{}", resource_prefix, mainjs)
        ),
    ]
    .join("\n");

    if let Some(out) = &args.outfile {
        let outfile = Path::new(&out);

        let outdir = outfile
            .parent()
            .expect("Target must have a parent directory");

        fs::create_dir_all(outdir).expect("Failed to create directories");
        fs::write(outfile, content).expect("Failed to write file");

        let mut perms = fs::metadata(outfile)
            .expect("Failed to get metadata for outfile")
            .permissions();
        perms.set_mode(perms.mode() | 0o111);
        fs::set_permissions(outfile, perms).expect("Failed set file permissions");
    } else {
        println!("{content}");
    }

    Ok(())
}
