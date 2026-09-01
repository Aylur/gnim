use crate::dev_rundir;

use super::{is_in_path, rolldown_config};
use clap::Args;
use quick_xml::escape::{partial_escape, resolve_xml_entity};
use quick_xml::events::{BytesStart, BytesText, Event};
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;
use std::io::Cursor;
use std::{fs, path, process};

const PRINTER: &str = r#"
import(import.meta.url).then((m) => {
    if (typeof m.default !== 'string') {
        throw Error('missing `export default defineSchemaList()`')
    }
    print(m.default)
})
"#;

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
            PRINTER.to_owned(),
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

fn escape_attribute(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '&' => escaped.push_str("&amp;"),
            '"' => escaped.push_str("&quot;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn parse_err(e: impl std::fmt::Display) -> String {
    format!("Failed to parse xml: {e}")
}

fn write_err(e: impl std::fmt::Display) -> String {
    format!("Failed to format xml: {e}")
}

fn rebuild_tag(elem: &BytesStart) -> Result<BytesStart<'static>, String> {
    let name = String::from_utf8_lossy(elem.name().as_ref()).into_owned();
    let mut tag = BytesStart::new(name);

    for attr in elem.attributes() {
        let attr = attr.map_err(parse_err)?;
        let key = String::from_utf8_lossy(attr.key.as_ref()).into_owned();
        let value = attr
            .normalized_value(quick_xml::XmlVersion::Implicit1_0)
            .map_err(parse_err)?;
        tag.push_attribute((key.as_bytes(), escape_attribute(&value).as_bytes()));
    }

    Ok(tag)
}

fn format_xml(input: &str) -> Result<String, String> {
    let mut reader = Reader::from_str(input);
    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2);

    let mut pending_start: Option<BytesStart> = None;
    let mut text = String::new();

    loop {
        let event = reader.read_event().map_err(parse_err)?;

        match event {
            Event::Text(e) => text.push_str(&e.decode().map_err(parse_err)?),
            Event::GeneralRef(e) => match e.resolve_char_ref().map_err(parse_err)? {
                Some(ch) => text.push(ch),
                None => {
                    let name = e.decode().map_err(parse_err)?;
                    let resolved = resolve_xml_entity(&name)
                        .ok_or_else(|| format!("Failed to parse xml: unknown entity &{name};"))?;
                    text.push_str(resolved);
                }
            },
            event => {
                let content = text.trim();

                if let Some(start) = pending_start.take() {
                    if content.is_empty() && matches!(event, Event::End(_)) {
                        writer.write_event(Event::Empty(start)).map_err(write_err)?;
                        text.clear();
                        continue;
                    }
                    writer.write_event(Event::Start(start)).map_err(write_err)?;
                }

                if !content.is_empty() {
                    writer
                        .write_event(Event::Text(BytesText::from_escaped(partial_escape(
                            content,
                        ))))
                        .map_err(write_err)?;
                }
                text.clear();

                match event {
                    Event::Eof => break,
                    Event::Start(e) => pending_start = Some(rebuild_tag(&e)?),
                    Event::Empty(e) => writer
                        .write_event(Event::Empty(rebuild_tag(&e)?))
                        .map_err(write_err)?,
                    event => writer.write_event(event).map_err(write_err)?,
                }
            }
        }
    }

    let result = String::from_utf8(writer.into_inner().into_inner())
        .map_err(|e| format!("Failed to format xml: {e}"))?;

    Ok(result)
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
