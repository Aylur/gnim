use super::{dev_rundir, rolldown_config};
use crate::gtk4_layer_shell;
use clap::Args;
use std::{collections::HashMap, path, process};

#[derive(Args)]
pub struct RunArgs {
    /// File
    pub script: String,
    /// Arguments to pass to the script
    #[arg(value_name = "ARGS", num_args = 0..)]
    pub args: Vec<String>,
    /// Preload Gtk4LayerShell
    #[arg(long, default_value_t = false)]
    pub gtk4_layer_shell: bool,
    /// Replace global identifiers with constant expressions
    #[arg(short, long, value_name = "KEY=VALUE", value_parser = crate::parse_key_val)]
    pub define: Vec<(String, String)>,
}

pub async fn run(args: &RunArgs) -> process::ExitCode {
    let stem = path::Path::new(&args.script)
        .file_stem()
        .and_then(|s| s.to_str())
        .expect("valid file");

    let tmpname = dev_rundir()
        .join(format!("{}_{}.js", stem, process::id()))
        .to_string_lossy()
        .to_string();

    let mut bundler = rolldown::Bundler::new(rolldown::BundlerOptions {
        input: Some(vec![args.script.to_owned().into()]),
        file: Some(tmpname.clone()),
        ..rolldown_config()
    })
    .expect("failed to create bundler");

    if let Err(err) = bundler.write().await {
        for d in err.into_vec() {
            println!("{}", d.to_diagnostic().to_color_string());
        }
        return process::ExitCode::FAILURE;
    }

    let gjs_args: Vec<&str> = args.args.iter().map(|s| s.as_ref()).collect();
    let mut gjs_env: HashMap<&'static str, String> = HashMap::new();

    if args.gtk4_layer_shell {
        if let Some(so) = option_env!("GTK4_LAYER_SHELL_LIBDIR")
            .map(|dir| format!("{dir}/libgtk4_layer_shell.so"))
        {
            gjs_env.insert("LD_PRELOAD", so);
        } else {
            match gtk4_layer_shell().await {
                Ok(so) => {
                    gjs_env.insert("LD_PRELOAD", so);
                }
                Err(err) => {
                    eprintln!("[dev] failed to find libgtk4_layer_shell.so: {err}")
                }
            }
        }
    }

    let status = process::Command::new("gjs")
        .args([vec!["-m", &tmpname], gjs_args].concat())
        .envs(gjs_env)
        .status()
        .expect("failed to run script");

    status
        .code()
        .map(|c| process::ExitCode::from(c as u8))
        .unwrap_or(process::ExitCode::from(1))
}
