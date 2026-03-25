use std::fs;
use std::path::PathBuf;
use std::process;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::net::UnixListener;
use tokio::sync::broadcast::Sender;

pub struct DevSocketArgs {
    pub tx: Sender<String>,
    pub verbose: bool,
    pub path: PathBuf,
}

pub async fn dev_socket(args: DevSocketArgs) {
    fs::remove_file(&args.path).ok();

    let listener = match UnixListener::bind(&args.path) {
        Ok(l) => Arc::new(l),
        Err(e) => {
            eprintln!("[dev] failed to bind socket at {:?}: {}", args.path, e);
            process::exit(1);
        }
    };

    loop {
        match listener.accept().await {
            Ok((mut stream, _)) => {
                let mut rx = args.tx.subscribe();
                tokio::spawn(async move {
                    while let Ok(path) = rx.recv().await {
                        let msg = format!("{}\n", path);
                        if stream.write_all(msg.as_bytes()).await.is_err() {
                            if args.verbose {
                                eprintln!("[dev] failed to write socket");
                            }
                            break;
                        }
                        if stream.flush().await.is_err() {
                            if args.verbose {
                                eprintln!("[dev] failed to flush socket");
                            }
                            break;
                        };
                    }
                });
            }
            Err(e) => {
                eprintln!("[dev] socket accept error: {}", e);
                break;
            }
        }
    }
}
