use super::{dev_rundir, rolldown_config};
use crate::plugin::{css::GnimCssPlugin, resource::GnimResourcePlugin};
use clap::Args;
use std::{path, process, sync::Arc};

#[derive(Args)]
pub struct RunArgs {
    /// File
    pub script: String,
    /// Arguments to pass to the script
    #[arg(value_name = "ARGS", num_args = 0..)]
    pub args: Vec<String>,
    /// Replace global identifiers with constant expressions
    #[arg(short, long, value_name = "KEY=VALUE", value_parser = crate::parse_key_val)]
    pub define: Vec<(String, String)>,
}

pub async fn run(args: &RunArgs) -> Result<(), String> {
    let stem = path::Path::new(&args.script)
        .file_stem()
        .and_then(|s| s.to_str())
        .expect("Invalid filename");

    let tmpname = dev_rundir()
        .join(format!("{}_{}.js", stem, process::id()))
        .to_string_lossy()
        .to_string();

    let mut bundler = rolldown::Bundler::with_plugins(
        rolldown::BundlerOptions {
            input: Some(vec![args.script.to_owned().into()]),
            file: Some(tmpname.clone()),
            ..rolldown_config()
        },
        vec![
            Arc::new(GnimCssPlugin::default()),
            Arc::new(GnimResourcePlugin::default()),
        ],
    )
    .expect("Failed to create bundler");

    bundler.write().await.map_err(|err| {
        err.iter()
            .map(|d| d.to_diagnostic().to_color_string())
            .collect::<Vec<_>>()
            .join("\n")
    })?;

    let gjs_args: Vec<&str> = args.args.iter().map(|s| s.as_ref()).collect();

    let status = process::Command::new("gjs")
        .args([vec!["-m", &tmpname], gjs_args].concat())
        .status()
        .expect("Failed to run script");

    match status.code() {
        None | Some(0) => Ok(()),
        Some(c) => Err(format!("GJS exited with code {c}")),
    }
}
