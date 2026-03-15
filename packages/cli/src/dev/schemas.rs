use crate::schemas;
use std::path::PathBuf;

pub async fn compile_schemas(gschema_path: &str) {
    let dir = PathBuf::from(gschema_path)
        .parent()
        .expect("failed to get parent dir of gschema file")
        .to_owned();

    let has_glib = std::env::var_os("PATH")
        .and_then(|paths| {
            std::env::split_paths(&paths).find(|dir| dir.join("glib-compile-schemas").is_file())
        })
        .is_some();

    if !has_glib {
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
