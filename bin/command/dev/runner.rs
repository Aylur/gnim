use std::path::PathBuf;
use tokio::process::Command;
use tokio::sync::mpsc::Receiver;

pub struct GjsRunnerArgs {
    pub verbose: bool,
    pub socket_path: PathBuf,
    pub entry_js: String,
    pub dev_entry_js: String,
    pub rx: Receiver<()>,
}

pub async fn gjs_runner(args: GjsRunnerArgs) {
    let mut restart_rx = args.rx;

    loop {
        if args.verbose {
            eprintln!("[dev] starting gjs");
        }

        let mut child = Command::new("gjs")
            .arg("-m")
            .arg(&args.dev_entry_js)
            .env("GNIM_DEV_SOCK", args.socket_path.to_str().unwrap())
            .env("GNIM_ENTRY_MODULE", &args.entry_js)
            .env("GNIM_VERBOSE", if args.verbose { "true" } else { "" })
            .env("GSETTINGS_SCHEMA_DIR", "./.gnim/schemas")
            .spawn()
            .expect("failed to spawn gjs");

        tokio::select! {
            status = child.wait() => {
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
                child.kill().await.ok();
                child.wait().await.ok();
            }
        }
    }
}
