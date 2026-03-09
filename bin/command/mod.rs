pub mod dev;
pub mod run;
pub mod schemas;
pub mod types;

use std::path::PathBuf;

pub fn dev_rundir() -> PathBuf {
    let dir = std::env::var("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
        .join("gnim");

    std::fs::create_dir_all(&dir).ok();
    dir
}

pub fn rolldown_config() -> rolldown::BundlerOptions {
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
                emit_decorator_metadata: Some(true),
            }),
            ..Default::default()
        }),
        sourcemap: Some(rolldown::SourceMapType::Inline),
        format: Some(rolldown::OutputFormat::Esm),
        ..Default::default()
    }
}
