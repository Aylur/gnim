use crate::gtk4_layer_shell;
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::process::Command;
use tokio::sync::mpsc::Receiver;

pub struct GjsRunnerArgs {
    pub gtk_version: Option<String>,
    pub verbose: bool,
    pub socket_path: PathBuf,
    pub entry_js: String,
    pub dev_entry_js: String,
    pub restart_rx: Receiver<()>,
    pub gtk4_layer_shell: bool,
}

pub async fn gjs_runner(args: GjsRunnerArgs) {
    let mut restart_rx = args.restart_rx;

    loop {
        if args.verbose {
            eprintln!("[dev] starting gjs");
        }

        let mut extra_env = HashMap::<&'static str, String>::new();

        if args.verbose {
            extra_env.insert("GNIM_VERBOSE", "true".to_string());
        }

        if let Some(version) = &args.gtk_version {
            extra_env.insert("GNIM_GTK_VERSION", version.clone());
        }

        if args.gtk4_layer_shell {
            if let Some(so) = option_env!("GTK4_LAYER_SHELL_LIBDIR")
                .map(|dir| format!("{dir}/libgtk4_layer_shell.so"))
            {
                extra_env.insert("LD_PRELOAD", so);
            } else {
                match gtk4_layer_shell().await {
                    Ok(so) => {
                        extra_env.insert("LD_PRELOAD", so);
                    }
                    Err(err) => {
                        eprintln!("[dev] failed to find libgtk4_layer_shell.so: {err}")
                    }
                }
            }
        }

        let mut gjs = Command::new("gjs")
            .arg("-m")
            .arg(&args.dev_entry_js)
            .env("GNIM_DEV_SOCK", args.socket_path.to_str().unwrap())
            .env("GNIM_ENTRY_MODULE", &args.entry_js)
            .env("GSETTINGS_SCHEMA_DIR", "./.gnim/schemas")
            .envs(extra_env)
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
