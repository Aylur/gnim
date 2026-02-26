use clap::Args;
use rolldown;
use std::{env, fs, path, process};
use tokio::runtime::Runtime;

#[derive(Args)]
pub struct RunArgs {
    /// File
    script: String,

    /// Arguments to pass to the script
    #[arg(value_name = "ARGS", num_args = 0..)]
    args: Vec<String>,
}

fn transpile_typescript(target: &str, outfile: &str) {
    let mut bundler = rolldown::Bundler::new(rolldown::BundlerOptions {
        input: Some(vec![target.to_owned().into()]),
        file: Some(outfile.into()),
        external: Some(
            vec![
                "gi://*".to_owned(),
                "resource://*".to_owned(),
                "file://*".to_owned(),
                "system".to_owned(),
                "gettext".to_owned(),
                "console".to_owned(),
                "cairo".to_owned(),
            ]
            .into(),
        ),
        transform: Some(rolldown::BundlerTransformOptions {
            decorator: Some(rolldown::DecoratorOptions {
                legacy: Some(true),
                emit_decorator_metadata: Some(true),
            }),
            ..Default::default()
        }),
        sourcemap: Some(rolldown::SourceMapType::Inline),
        format: Some(rolldown::OutputFormat::Esm),
        ..Default::default()
    })
    .expect("Failed to create bundler");

    let rt = Runtime::new().unwrap();
    let _ = rt.block_on(async { bundler.write().await.unwrap() });
}

pub fn run(args: &RunArgs) -> process::ExitCode {
    let tmpdir = match env::var("XDG_RUNTIME_DIR") {
        Ok(ok) => format!("{ok}/gnim"),
        Err(_) => "/tmp".to_owned(),
    };

    let stem = path::Path::new(&args.script)
        .file_stem()
        .and_then(|s| s.to_str())
        .expect("Invalid File");

    let tmpname = format!("{}/{}.js", tmpdir, stem);
    transpile_typescript(&args.script, &tmpname);

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
