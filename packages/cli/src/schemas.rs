use crate::dev_rundir;

use super::{is_in_path, rolldown_config};
use clap::Args;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;
use std::io::Cursor;
use std::{fs, path, process};

#[derive(Args)]
pub struct SchemasArgs {
    /// Directory where the schemas are located
    pub directory: String,
    /// Compile into a gschema.compiled binary
    #[arg(short, long)]
    pub compile: bool,
    /// Where to store generated xml and compiled files
    #[arg(short, long, value_name = "PATH")]
    pub outdir: Option<path::PathBuf>,
    /// Replace global identifiers with constant expressions
    #[arg(short, long, value_name = "KEY=VALUE", value_parser = crate::parse_key_val)]
    pub define: Vec<(String, String)>,
}

async fn transpile_typescript(
    target: &str,
    outfile: &str,
) -> Result<rolldown::BundleOutput, String> {
    let mut bundler = rolldown::Bundler::new(rolldown::BundlerOptions {
        input: Some(vec![target.to_owned().into()]),
        file: Some(outfile.into()),
        footer: Some(rolldown::AddonOutputOption::String(Some(
            "import(import.meta.url).then((m) => print(m.default))".to_owned(),
        ))),
        ..rolldown_config()
    })
    .expect("Failed to create bundler");

    bundler.write().await.map_err(|err| {
        err.into_vec()
            .iter()
            .map(|d| d.to_diagnostic().to_color_string())
            .collect::<Vec<_>>()
            .join("\n")
    })
}

fn format_xml(input: &str) -> Result<String, String> {
    let mut reader = Reader::from_str(input);
    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2);

    loop {
        match reader.read_event() {
            Ok(Event::Eof) => break,
            Ok(event) => writer
                .write_event(event)
                .map_err(|e| format!("Failed to format xml: {e}"))?,
            Err(e) => return Err(format!("Failed to parse xml: {e}")),
        }
    }

    String::from_utf8(writer.into_inner().into_inner())
        .map_err(|e| format!("Failed to format xml: {e}"))
}

fn compile(directory: &str) -> Result<(), String> {
    if is_in_path("glib-compile-schemas") {
        let status = process::Command::new("glib-compile-schemas")
            .args([&directory])
            .status()
            .map_err(|e| format!("Failed to compile: {e}"))?;

        if !status.success() {
            return Err(format!("glib-compile-schemas failed: {status}"));
        }

        Ok(())
    } else {
        Err("Cannot compile: glib-compile-schemas was not found".into())
    }
}

pub async fn schemas(args: &SchemasArgs) -> Result<(), String> {
    let outdir = match args.outdir.as_ref() {
        Some(ok) => path::PathBuf::from(ok),
        None => path::PathBuf::from(&args.directory),
    };

    let schemas = match fs::read_dir(&args.directory) {
        Err(e) => return Err(format!("Failed to read directory: {e}")),
        Ok(entries) => entries
            .filter_map(Result::ok)
            .filter(|e| !e.metadata().map(|m| m.is_dir()).unwrap_or(false))
            .filter(|e| {
                e.file_name().into_string().is_ok_and(|name| {
                    name.ends_with(".gschema.ts") || name.ends_with(".gschema.js")
                })
            }),
    };

    fs::create_dir_all(&outdir).expect("Failed to create directory");

    for schema in schemas {
        let path = schema.path();
        let stem = path.file_stem().unwrap().to_str().unwrap().to_owned();
        let tmpjs = dev_rundir()
            .join(format!("{stem}.js"))
            .to_string_lossy()
            .to_string();

        transpile_typescript(path.to_str().unwrap(), tmpjs.as_str()).await?;

        let output = process::Command::new("gjs")
            .args(["-m", tmpjs.as_str()])
            .output()
            .map_err(|e| format!("Failed to run gjs: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "Failed to evaluate {}:\n{}",
                path.display(),
                stderr.trim()
            ));
        }

        let xml = String::from_utf8_lossy(&output.stdout);
        let formatted = format_xml(xml.as_ref())
            .map_err(|e| format!("Invalid schemalist from {}: {e}", path.display()))?;

        let mut outfile = path::PathBuf::from(&outdir);
        outfile.push(format!("{stem}.xml"));
        fs::write(outfile, formatted).expect("failed to write file");
    }

    if args.compile {
        compile(outdir.as_os_str().to_str().expect("valid outdir"))?;
    }

    Ok(())
}
