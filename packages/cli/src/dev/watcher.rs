use super::socket::SocketMsg;
use super::tracker::ModuleTracker;
use super::{builder, rolldown_config, schemas::compile_schemas};
use rolldown::{BundlerConfig, BundlerOptions};
use rolldown_common::WatcherChangeKind;
use rolldown_watcher::{WatchEvent, Watcher, WatcherConfig, WatcherEventHandler};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};

#[derive(Clone)]
pub struct DevWatcherArgs {
    pub gjs_restart_tx: mpsc::Sender<()>,
    pub socket_tx: broadcast::Sender<SocketMsg>,
    pub verbose: bool,
    pub canonical_entry: String,
    pub module_tracker: Arc<RwLock<ModuleTracker>>,
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
                compile_schemas(path).await.ok();
                self.gjs_restart_tx.send(()).await.ok();
                return;
            }

            let build = builder::build_modules(builder::GnimDevPlugin {
                dir: self.dir.clone(),
                socket_tx: self.socket_tx.clone(),
                changed_source: Some(path.to_string()),
                module_tracker: self.module_tracker.clone(),
            });

            if let Err(err) = build.await {
                eprintln!("{err}");
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

    let watcher = Watcher::new(
        vec![config],
        args.clone(),
        &WatcherConfig {
            // I'm not sure if this is the correct way to do this, but
            // withouth debounce the change event is emitted twice
            debounce: Some(Duration::from_millis(100)),
            ..Default::default()
        },
    )
    .expect("Failed to create watcher");

    watcher.run();
    watcher
}
