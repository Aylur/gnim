pub mod bundle;
pub mod dev;
pub mod exe;
pub mod plugin;
pub mod schemas;
pub mod types;

use std::{path::PathBuf, sync::OnceLock};

static GLOBAL_OPTIONS: OnceLock<GlobalOptions> = OnceLock::new();

#[derive(Default)]
pub struct GlobalOptions {
    pub alias: Option<rolldown::PathsOutputOption>,
    pub define: Option<rolldown_utils::indexmap::FxIndexMap<String, String>>,
}

pub fn init(opts: GlobalOptions) {
    if GLOBAL_OPTIONS.set(opts).is_err() {
        eprintln!("failed to init global options");
    }
}

pub fn dev_rundir() -> PathBuf {
    let dir = std::env::var("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
        .join(format!("gnim_{}", std::process::id()));

    std::fs::create_dir_all(&dir).ok();
    dir
}

pub fn rolldown_config() -> rolldown::BundlerOptions {
    let define = GLOBAL_OPTIONS.get().and_then(|o| o.define.clone());
    let alias = GLOBAL_OPTIONS.get().and_then(|o| o.alias.clone());

    let import_source = match PathBuf::from("./tsconfig.json").exists() {
        true => None,
        false => Some("gnim".to_owned()),
    };

    rolldown::BundlerOptions {
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
                strict_null_checks: Some(true),
                emit_decorator_metadata: Some(true),
            }),
            jsx: Some(rolldown::Either::Right(rolldown::JsxOptions {
                import_source,
                ..Default::default()
            })),
            ..Default::default()
        }),
        sourcemap: Some(rolldown::SourceMapType::Inline),
        format: Some(rolldown::OutputFormat::Esm),
        define,
        paths: alias,
        ..Default::default()
    }
}

pub fn parse_key_val(s: &str) -> Result<(String, String), String> {
    s.split_once('=')
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .ok_or_else(|| format!("invalid KEY=VALUE: {s}"))
}

pub fn is_in_path(program: &str) -> bool {
    std::env::var_os("PATH")
        .and_then(|paths| std::env::split_paths(&paths).find(|dir| dir.join(program).is_file()))
        .is_some()
}

pub fn gsettings_schema_dir() -> std::ffi::OsString {
    use std::env::{join_paths, split_paths, var_os};

    // nix uses GSETTINGS_SCHEMAS_PATH
    let schema_paths = var_os("GSETTINGS_SCHEMAS_PATH")
        .map(|paths| {
            split_paths(&paths)
                .map(|p| p.join("glib-2.0").join("schemas"))
                .collect::<Vec<PathBuf>>()
        })
        .unwrap_or_default();

    let schema_dirs = var_os("GSETTINGS_SCHEMA_DIR")
        .map(|dirs| split_paths(&dirs).collect::<Vec<PathBuf>>())
        .unwrap_or_default();

    let gnim_schemas = vec![PathBuf::from("./.gnim/schemas")];

    join_paths([gnim_schemas, schema_paths, schema_dirs].concat()).unwrap()
}
