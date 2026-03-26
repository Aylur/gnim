use crate::schemas;
use std::path::PathBuf;

pub async fn compile_schemas(gschema_path: &str) -> Result<(), String> {
    let dir = PathBuf::from(gschema_path)
        .parent()
        .expect("Failed to get parent dir of gschema file")
        .to_owned();

    let args = schemas::SchemasArgs {
        define: Vec::default(),
        directory: dir.to_string_lossy().to_string(),
        compile: true,
        outdir: Some(PathBuf::from("./.gnim/schemas")),
    };

    schemas::schemas(&args).await
}
