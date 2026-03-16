use crate::{is_in_path, schemas};
use std::path::PathBuf;

pub async fn compile_schemas(gschema_path: &str) {
    let dir = PathBuf::from(gschema_path)
        .parent()
        .expect("failed to get parent dir of gschema file")
        .to_owned();

    if !is_in_path("glib-compile-schemas") {
        eprintln!("[dev] glib-compile-schemas was not found in $PATH");
        return;
    }

    let args = schemas::SchemasArgs {
        directory: dir.to_string_lossy().to_string(),
        compile: true,
        outdir: Some(PathBuf::from("./.gnim/schemas")),
    };

    schemas::schemas(&args).await;
}
