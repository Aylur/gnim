use super::{dev_rundir, rolldown_config};
use clap::Args;
use std::{fs, path, process};

#[derive(Args)]
pub struct RunArgs {
    /// File
    script: String,

    /// Arguments to pass to the script
    #[arg(value_name = "ARGS", num_args = 0..)]
    args: Vec<String>,
}

pub async fn run(args: &RunArgs) -> process::ExitCode {
    let tmpdir = dev_rundir();

    let stem = path::Path::new(&args.script)
        .file_stem()
        .and_then(|s| s.to_str())
        .expect("valid file");

    let tmpname = tmpdir
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

    let args: Vec<&str> = args.args.iter().map(|s| s.as_ref()).collect();

    let status = process::Command::new("gjs")
        .args([vec!["-m", &tmpname], args].concat())
        .status()
        .expect("failed to run script");

    fs::remove_file(tmpname).expect("failed to remove tmp file");

    status
        .code()
        .map(|c| process::ExitCode::from(c as u8))
        .unwrap_or(process::ExitCode::from(1))
}
