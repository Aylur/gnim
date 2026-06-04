use super::socket::SocketMsg;
use super::tracker::ModuleTracker;
use super::{builder, rolldown_config, schemas::compile_schemas};
use rolldown::{BundlerConfig, BundlerOptions};
use rolldown_common::WatcherChangeKind;
use rolldown_watcher::{WatchEvent, Watcher, WatcherConfig, WatcherEventHandler};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio::task::JoinHandle;

#[derive(Clone)]
pub struct DevWatcherArgs {
    pub gjs_restart_tx: mpsc::Sender<()>,
    pub socket_tx: broadcast::Sender<SocketMsg>,
    pub verbose: bool,
    pub canonical_entry: String,
    pub module_tracker: Arc<RwLock<ModuleTracker>>,
    pub dir: PathBuf,
}

pub struct DevWatcher {
    close_tx: oneshot::Sender<()>,
    task: JoinHandle<()>,
}

impl DevWatcher {
    pub async fn close(self) -> Result<(), String> {
        self.close_tx.send(()).ok();
        self.task.await.map_err(|err| err.to_string())
    }
}

#[derive(Clone)]
struct DevWatcherEventHandler {
    args: DevWatcherArgs,
    watcher_restart_tx: mpsc::UnboundedSender<()>,
}

impl DevWatcherEventHandler {
    fn restart_watcher(&self) {
        self.watcher_restart_tx.send(()).ok();
    }
}

impl WatcherEventHandler for DevWatcherEventHandler {
    async fn on_restart(&self) {}
    async fn on_close(&self) {}
    async fn on_event(&self, _: WatchEvent) {}

    async fn on_change(&self, path: &str, kind: WatcherChangeKind) {
        if self.args.verbose {
            eprintln!("[dev] {} {}", kind, path);
        }

        if !matches!(kind, WatcherChangeKind::Update) {
            self.restart_watcher();
            return;
        }

        if path.ends_with(".gschema.ts") || path.ends_with(".gschema.js") {
            compile_schemas(path).await.ok();
            self.args.gjs_restart_tx.send(()).await.ok();
            self.restart_watcher();
            return;
        }

        let build = builder::build_modules(builder::GnimDevPlugin {
            dir: self.args.dir.clone(),
            socket_tx: self.args.socket_tx.clone(),
            changed_source: Some(path.to_string()),
            module_tracker: self.args.module_tracker.clone(),
        });

        if let Err(err) = build.await {
            eprintln!("{err}");
        }

        if path == self.args.canonical_entry {
            self.args.gjs_restart_tx.send(()).await.ok();
        }

        self.restart_watcher();
    }
}

pub fn dev_watcher(args: DevWatcherArgs) -> DevWatcher {
    let (watcher_restart_tx, watcher_restart_rx) = mpsc::unbounded_channel();
    let (close_tx, close_rx) = oneshot::channel();
    let watcher = create_watcher(args.clone(), watcher_restart_tx.clone());

    let task = tokio::spawn(run_dev_watcher(
        args,
        watcher,
        watcher_restart_tx,
        watcher_restart_rx,
        close_rx,
    ));

    DevWatcher { close_tx, task }
}

fn create_watcher(args: DevWatcherArgs, watcher_restart_tx: mpsc::UnboundedSender<()>) -> Watcher {
    let config = BundlerConfig::new(
        BundlerOptions {
            input: Some(vec![args.canonical_entry.clone().into()]),
            dir: Some("/dev/null".into()),
            ..rolldown_config()
        },
        vec![],
    );

    let handler = DevWatcherEventHandler {
        args: args.clone(),
        watcher_restart_tx,
    };

    let watcher = Watcher::new(
        vec![config],
        handler,
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

async fn run_dev_watcher(
    args: DevWatcherArgs,
    mut watcher: Watcher,
    watcher_restart_tx: mpsc::UnboundedSender<()>,
    mut watcher_restart_rx: mpsc::UnboundedReceiver<()>,
    mut close_rx: oneshot::Receiver<()>,
) {
    loop {
        tokio::select! {
            biased;
            _ = &mut close_rx => {
                close_watcher(&watcher).await;
                break;
            }
            restart = watcher_restart_rx.recv() => {
                if restart.is_none() {
                    close_watcher(&watcher).await;
                    break;
                }

                if args.verbose {
                    eprintln!("[dev] restarting watcher");
                }

                close_watcher(&watcher).await;

                while watcher_restart_rx.try_recv().is_ok() {}

                watcher = create_watcher(args.clone(), watcher_restart_tx.clone());
            }
        }
    }
}

async fn close_watcher(watcher: &Watcher) {
    if let Err(err) = watcher.close().await {
        eprintln!("[dev] failed to close watcher: {err}");
    }
}
