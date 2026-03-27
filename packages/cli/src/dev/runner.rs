use super::tracker::ModuleTracker;
use serde_json::json;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tokio::process::Command;
use tokio::sync::mpsc;

pub struct GjsRunnerArgs {
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
            "verbose": args.verbose,
            "gtk": args.gtk_version,
            "socket": args.socket_path,
            "entry": args.entry_js,
            "modules": modules
        });

        let mut gjs = Command::new("gjs")
            .arg("-m")
            .arg(&args.dev_entry_js)
            .env("GNIM_DEV_PROPS", props.to_string())
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
