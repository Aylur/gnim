use super::tracker::ModuleTracker;
use crate::dev_rundir;
use crate::plugin::resource::{GResource, ResourceFile, generate_resource};
use crate::run::gsettings_schema_dir;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tokio::process::Command;
use tokio::sync::mpsc;

pub struct GjsRunnerArgs {
    pub application_id: Option<String>,
    pub gtk_version: Option<String>,
    pub verbose: bool,
    pub socket_path: PathBuf,
    pub entry_js: String,
    pub dev_entry_js: String,
    pub restart_rx: mpsc::Receiver<()>,
    pub module_tracker: Arc<RwLock<ModuleTracker>>,
}

fn collect_icon_files(root: &Path, dir: &Path, files: &mut Vec<ResourceFile>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();

        if path.is_dir() {
            collect_icon_files(root, &path, files);
            continue;
        }

        let rel = path
            .strip_prefix(root)
            .expect("icon file must be inside icon root");

        files.push(ResourceFile {
            file: path.to_string_lossy().to_string(),
            alias: Path::new("icons").join(rel).to_string_lossy().to_string(),
        });
    }
}

fn bundle_dev_icons(rundir: &Path) -> Option<PathBuf> {
    let icon_dir = Path::new("data").join("icons");

    if !icon_dir.is_dir() {
        if icon_dir.exists() {
            eprintln!("path data/icons is expected to be a directory");
        }
        return None;
    }

    let icon_dir = match fs::canonicalize(&icon_dir) {
        Ok(ok) => ok,
        Err(err) => {
            eprintln!(
                "Failed to canonicalize icon directory {}: {}",
                icon_dir.to_string_lossy(),
                err
            );
            return None;
        }
    };

    let mut files = Vec::new();
    collect_icon_files(&icon_dir, &icon_dir, &mut files);

    let prefix = "/dev/icons".to_string();
    let outfile = rundir.join("icons.gresource");
    match generate_resource(&[GResource { prefix, files }], &outfile) {
        Ok(_) => Some(outfile),
        Err(err) => {
            eprintln!("{}", err);
            None
        }
    }
}

pub async fn gjs_runner(args: GjsRunnerArgs) {
    let mut restart_rx = args.restart_rx;
    let rundir = dev_rundir();

    let schema_dir = gsettings_schema_dir();
    let icon_resource = bundle_dev_icons(&rundir).map(|p| p.to_string_lossy().to_string());

    loop {
        if args.verbose {
            eprintln!("[dev] starting gjs");
        }

        let modules = args
            .module_tracker
            .read()
            .expect("Failed to read module tracker")
            .modules
            .clone();

        let props = json!({
            "applicationId": args.application_id,
            "verbose": args.verbose,
            "gtk": args.gtk_version,
            "socket": args.socket_path,
            "entry": args.entry_js,
            "modules": modules,
            "rundir": rundir.to_string_lossy(),
            "iconResource": icon_resource,
        });

        let mut gjs = Command::new("gjs")
            .arg("-m")
            .arg(&args.dev_entry_js)
            .env("GNIM_DEV", props.to_string())
            .env("GSETTINGS_SCHEMA_DIR", schema_dir.clone())
            .spawn()
            .expect("failed to spawn gjs");

        tokio::select! {
            status = gjs.wait() => {
                match status {
                    Ok(s)  => {
                        if args.verbose {
                            eprintln!("[dev] gjs exited with code {}", s.code().unwrap_or(0));
                        }
                        break;
                    }
                    Err(e) => {
                        eprintln!("[dev] gjs wait error: {}", e);
                        break;
                    }
                }
            }
            _ = restart_rx.recv() => {
                eprintln!("[dev] restarting gjs");
                gjs.kill().await.ok();
                gjs.wait().await.ok();
            }
        }
    }
}
