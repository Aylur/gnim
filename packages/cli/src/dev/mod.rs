mod builder;
mod runner;
mod schemas;
mod socket;
mod tracker;
mod transform;
mod watcher;

pub use tracker::ModuleTracker;

use super::{dev_rundir, rolldown_config};
use crate::is_in_path;
use clap::Args;
use runner::{GjsRunnerArgs, gjs_runner};
use schemas::compile_schemas;
use socket::{DevSocketArgs, SocketMsg, dev_socket};
use std::sync::{Arc, RwLock};
use std::{fs, path, process};
use tokio::sync::{broadcast, mpsc};
use watcher::{DevWatcherArgs, dev_watcher};

#[derive(Args)]
pub struct DevArgs {
    /// Entry file
    pub entry: String,
    /// Verbose logging
    #[arg(short, long, default_value_t = false)]
    pub verbose: bool,
    /// Replace global identifiers with constant expressions
    #[arg(short, long, value_parser = crate::parse_key_val)]
    pub define: Vec<(String, String)>,
    /// Application ID in reverse DNS format
    #[arg(short, long)]
    pub id: Option<String>,
}

pub async fn dev(args: &DevArgs) -> Result<(), String> {
    let dir = dev_rundir();
    let (socket_tx, _) = broadcast::channel::<SocketMsg>(16);
    let (gjs_restart_tx, gjs_restart_rx) = mpsc::channel::<()>(1);
    let module_tracker = ModuleTracker::new(&args.entry).await?;

    let entry_js = module_tracker.entry_js.clone();
    let gtk_version = module_tracker.gtk_version.clone();
    let canonical_entry = module_tracker.canonical_entry.clone();
    let dev_entry_js = module_tracker
        .dev_entry_js
        .clone()
        .ok_or("Could not find dev entry file. Is Gnim installed?".to_string())?;

    for (file, _) in module_tracker.modules.iter() {
        if file.ends_with(".gschema.ts") || file.ends_with(".gschema.js") {
            compile_schemas(file).await?;
        }
    }

    let module_tracker = Arc::new(RwLock::new(module_tracker));

    builder::build_modules(builder::GnimDevPlugin {
        dir: dir.clone(),
        socket_tx: socket_tx.clone(),
        changed_source: None,
        module_tracker: module_tracker.clone(),
    })
    .await?;

    let watcher = dev_watcher(DevWatcherArgs {
        gjs_restart_tx,
        socket_tx: socket_tx.clone(),
        verbose: args.verbose,
        canonical_entry,
        module_tracker: module_tracker.clone(),
        dir: dir.clone(),
    });

    let socket_path = dir.clone().join("dev.sock");

    let mut socket_task = tokio::spawn({
        dev_socket(DevSocketArgs {
            tx: socket_tx.clone(),
            verbose: args.verbose,
            path: socket_path.clone(),
        })
    });

    if let Some(app_id) = &args.id
        && let Err(err) = init_translations(app_id)
    {
        eprintln!("Failed to init translations {err}")
    }

    let mut gjs_task = tokio::spawn({
        gjs_runner(GjsRunnerArgs {
            application_id: args.id.clone(),
            gtk_version: gtk_version.clone(),
            verbose: args.verbose,
            socket_path: socket_path.clone(),
            entry_js: entry_js.clone(),
            dev_entry_js: dev_entry_js.clone(),
            restart_rx: gjs_restart_rx,
            module_tracker: module_tracker.clone(),
        })
    });

    if args.verbose {
        eprintln!("[dev] socket: {}", socket_path.to_string_lossy());
        eprintln!("[dev] entry: {entry_js}");
        eprintln!("[dev] dev_entry: {dev_entry_js}");
    }

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            if args.verbose {
                eprintln!("[dev] received ctrl-c, shutting down");
            }
        }
        _ = &mut gjs_task => (),
        _ = &mut socket_task => (),
    }

    gjs_task.abort();
    socket_task.abort();
    watcher.close().await.expect("Failed to close watcher");
    Ok(())
}

fn init_translations(app_id: &str) -> Result<(), String> {
    let Ok(podir) = fs::canonicalize("po") else {
        return Ok(());
    };

    let translations: Vec<path::PathBuf> = fs::read_dir(podir)
        .map_err(|err| err.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().map(|e| e == "po").unwrap_or(false))
        .collect();

    if !translations.is_empty() && !is_in_path("msgfmt") {
        return Err("msgfmt is not in $PATH".to_string());
    }

    for translation in translations {
        if let Some(stem) = translation.file_stem() {
            let locale = stem.to_string_lossy();
            let localedir = dev_rundir()
                .join("locale")
                .join(locale.to_string())
                .join("LC_MESSAGES");

            fs::create_dir_all(&localedir).expect("Failed to write directory");

            let status = process::Command::new("msgfmt")
                .arg(&translation)
                .arg("-o")
                .arg(localedir.join(format!("{}.mo", app_id)))
                .status();

            if let Err(err) = status {
                eprintln!("{err}")
            }
        }
    }

    Ok(())
}
