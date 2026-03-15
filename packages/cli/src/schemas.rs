use super::rolldown_config;
use clap::Args;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;
use std::io::Cursor;
use std::{env, fs, path, process};

#[derive(Args)]
pub struct SchemasArgs {
    /// Directory where the schemas are located at
    pub directory: String,

    /// Compile into a gschema.compiled binary
    #[arg(short, long)]
    pub compile: bool,

    /// Where to store generated xml and compiled files
    #[arg(short, long, value_name = "PATH")]
    pub outdir: Option<path::PathBuf>,
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

fn format_xml(input: &str) -> String {
    let mut reader = Reader::from_str(input);
    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2);

    loop {
        match reader.read_event() {
            Ok(Event::Eof) => break,
            Ok(event) => writer.write_event(event).unwrap(),
            Err(e) => panic!("Error: {e}"),
        }
    }

    String::from_utf8(writer.into_inner().into_inner()).unwrap()
}

fn compile(directory: &str) -> process::ExitCode {
    let glib_compile_schemas = "glib-compile-schemas";
    let has_glib = env::var_os("PATH")
        .and_then(|paths| {
            env::split_paths(&paths).find(|dir| dir.join(glib_compile_schemas).is_file())
        })
        .is_some();

    if has_glib {
        let status = process::Command::new(glib_compile_schemas)
            .args([&directory])
            .status();

        if let Err(e) = status {
            eprintln!("Failed to compile: {e}");
            return process::ExitCode::FAILURE;
        }
    } else {
        eprintln!("Cannot compile: glib-compile-schemas is not found");
        return process::ExitCode::FAILURE;
    }

    process::ExitCode::SUCCESS
}

pub async fn schemas(args: &SchemasArgs) -> process::ExitCode {
    let outdir = match args.outdir.as_ref() {
        Some(ok) => path::PathBuf::from(ok),
        None => path::PathBuf::from(&args.directory),
    };

    let tmpdir = match env::var("XDG_RUNTIME_DIR") {
        Ok(ok) => format!("{ok}/gnim/schemas"),
        Err(_) => "/tmp".to_owned(),
    };

    let schemas = match fs::read_dir(&args.directory) {
        Ok(entries) => entries
            .filter_map(Result::ok)
            .filter(|e| !e.metadata().map(|m| m.is_dir()).unwrap_or(false))
            .filter(|e| {
                e.file_name().into_string().is_ok_and(|name| {
                    name.ends_with(".gschema.ts") || name.ends_with(".gschema.js")
                })
            }),
        Err(_) => {
            eprintln!("failed to read directory");
            return process::ExitCode::FAILURE;
        }
    };

    fs::create_dir_all(&outdir).expect("Failed to create directory");

    for schema in schemas {
        let path = schema.path();
        let stem = path.file_stem().unwrap().to_str().unwrap().to_owned();
        let tmpjs = format!("{}/{}.js", &tmpdir, &stem);

        if let Err(err) = transpile_typescript(path.to_str().unwrap(), tmpjs.as_str()).await {
            eprintln!("{err}");
            return process::ExitCode::FAILURE;
        };

        let output = process::Command::new("gjs")
            .args(["-m", tmpjs.as_str()])
            .output()
            .expect("failed to evaluate schemalist");

        let xml = String::from_utf8_lossy(&output.stdout);
        let mut outfile = path::PathBuf::from(&outdir);
        outfile.push(format!("{stem}.xml"));
        fs::write(outfile, format_xml(xml.as_ref())).expect("failed to write file");
        fs::remove_file(tmpjs).expect("failed to remove tmp file");
    }

    match args.compile {
        true => compile(outdir.as_os_str().to_str().expect("valid outdir")),
        false => process::ExitCode::SUCCESS,
    }
}
