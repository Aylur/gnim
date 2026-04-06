use super::tracker::ModuleTracker;
use crate::dev_rundir;
use serde_json::json;
use std::path::PathBuf;
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

pub async fn gjs_runner(args: GjsRunnerArgs) {
    let mut restart_rx = args.restart_rx;
    let rundir = dev_rundir();

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
        });

        let mut gjs = Command::new("gjs")
            .arg("-m")
            .arg(&args.dev_entry_js)
            .env("GNIM_DEV", props.to_string())
            .env("GSETTINGS_SCHEMA_DIR", "./.gnim/schemas")
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
