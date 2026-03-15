use super::builder;
use super::schemas::compile_schemas;
use super::tracker::{ModuleTracker, ModuleVersions};
use crate::command::rolldown_config;
use rolldown::{BundlerConfig, BundlerOptions};
use rolldown_common::WatcherChangeKind;
use rolldown_watcher::{WatchEvent, Watcher, WatcherConfig, WatcherEventHandler};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tokio::sync::{broadcast, mpsc};

#[derive(Clone)]
pub struct DevWatcherArgs {
    pub gjs_restart_tx: mpsc::Sender<()>,
    pub socket_tx: broadcast::Sender<String>,
    pub verbose: bool,
    pub canonical_entry: String,
    pub module_tracker: Arc<Mutex<ModuleTracker>>,
    pub module_versions: Arc<RwLock<ModuleVersions>>,
    pub dir: PathBuf,
}

impl WatcherEventHandler for DevWatcherArgs {
    async fn on_restart(&self) {}
    async fn on_close(&self) {}
    async fn on_event(&self, _: WatchEvent) {}

    async fn on_change(&self, path: &str, kind: WatcherChangeKind) {
        if matches!(kind, WatcherChangeKind::Update) {
            if self.verbose {
                eprintln!("[dev] {} {}", kind, path);
            }

            if path.ends_with(".gschema.ts") || path.ends_with(".gschema.js") {
                compile_schemas(path).await;
                self.gjs_restart_tx.send(()).await.ok();
                return;
            }

            let build = builder::build(
                self.module_tracker.clone(),
                builder::GnimDevPlugin {
                    dir: self.dir.clone(),
                    socket_tx: self.socket_tx.clone(),
                    changed_source: Some(path.to_string()),
                    module_versions: Arc::clone(&self.module_versions),
                },
            );

            if let Err(err) = build.await {
                println!("{err}");
            }

            if path == self.canonical_entry {
                self.gjs_restart_tx.send(()).await.ok();
            }
        }
    }
}

pub fn dev_watcher(args: DevWatcherArgs) -> Watcher {
    let config = BundlerConfig::new(
        BundlerOptions {
            input: Some(vec![args.canonical_entry.clone().into()]),
            dir: Some("/dev/null".into()),
            ..rolldown_config()
        },
        vec![],
    );

    let watcher = Watcher::new(vec![config], args.clone(), &WatcherConfig::default())
        .expect("Failed to create watcher");

    watcher.run();
    watcher
}
