mod builder;
mod runner;
mod schemas;
mod socket;
mod tracker;
mod transform;
mod watcher;

use super::{dev_rundir, rolldown_config};
use clap::Args;
use runner::{GjsRunnerArgs, gjs_runner};
use schemas::compile_schemas;
use socket::{DevSocketArgs, SocketMsg, dev_socket};
use std::sync::{Arc, Mutex, RwLock};
use std::{fs, process};
use tokio::sync::{broadcast, mpsc};
use tracker::{ModuleTracker, ModuleVersions};
use watcher::{DevWatcherArgs, dev_watcher};

#[derive(Args)]
pub struct DevArgs {
    /// Entry file
    pub entry: String,
    /// Verbose logging
    #[arg(short, long, default_value_t = false)]
    pub verbose: bool,
    /// Preload Gtk4LayerShell
    #[arg(long, default_value_t = false)]
    pub gtk4_layer_shell: bool,
    /// Replace global identifiers with constant expressions
    #[arg(short, long, value_parser = crate::parse_key_val)]
    pub define: Vec<(String, String)>,
}

pub async fn dev(args: &DevArgs) -> process::ExitCode {
    let canonical_entry = match fs::canonicalize(&args.entry) {
        Ok(ok) => ok.to_string_lossy().to_string(),
        Err(err) => {
            eprintln!("Invalid entry file {}", err);
            return process::ExitCode::FAILURE;
        }
    };

    let dir = dev_rundir();
    let (socket_tx, _) = broadcast::channel::<SocketMsg>(16);
    let (gjs_restart_tx, gjs_restart_rx) = mpsc::channel::<()>(1);
    let module_versions: Arc<RwLock<ModuleVersions>> = Arc::default();
    let module_tracker = match ModuleTracker::new(dir.clone(), &canonical_entry).await {
        Ok(ok) => ok,
        Err(err) => {
            eprintln!("{err}");
            return process::ExitCode::FAILURE;
        }
    };

    let entry_js = module_tracker.entry_js.clone();
    let dev_entry_js = module_tracker.dev_entry_js.clone();
    let gtk_version = module_tracker.gtk_version.clone();

    for file in module_tracker.modules.iter() {
        if file.ends_with(".gschema.ts") || file.ends_with(".gschema.js") {
            compile_schemas(file).await;
        }
    }

    let module_tracker = Arc::new(Mutex::new(module_tracker));

    let initial_build = builder::build(
        module_tracker.clone(),
        builder::GnimDevPlugin {
            dir: dir.clone(),
            socket_tx: socket_tx.clone(),
            changed_source: None,
            module_versions: Arc::clone(&module_versions),
        },
    );

    if let Err(err) = initial_build.await {
        eprintln!("{err}");
        return process::ExitCode::FAILURE;
    }

    let watcher = dev_watcher(DevWatcherArgs {
        gjs_restart_tx,
        socket_tx: socket_tx.clone(),
        verbose: args.verbose,
        canonical_entry,
        module_tracker,
        module_versions,
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

    let mut gjs_task = tokio::spawn({
        gjs_runner(GjsRunnerArgs {
            gtk_version: gtk_version.clone(),
            verbose: args.verbose,
            socket_path: socket_path.clone(),
            entry_js: entry_js.clone(),
            dev_entry_js: dev_entry_js.clone(),
            rx: gjs_restart_rx,
            gtk4_layer_shell: args.gtk4_layer_shell,
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
    process::ExitCode::SUCCESS
}
