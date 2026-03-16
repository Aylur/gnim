pub mod dev;
pub mod run;
pub mod schemas;
pub mod types;

use std::{fmt, path::PathBuf};

pub fn dev_rundir() -> PathBuf {
    let dir = std::env::var("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
        .join(format!("gnim_{}", std::process::id()));

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

pub fn is_in_path(program: &str) -> bool {
    std::env::var_os("PATH")
        .and_then(|paths| std::env::split_paths(&paths).find(|dir| dir.join(program).is_file()))
        .is_some()
}

pub enum PkgConfigError {
    NotInPath,
    Io(std::io::Error),
    CommandFailed(String),
    InvalidUtf8(std::string::FromUtf8Error),
}

impl fmt::Display for PkgConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotInPath => write!(f, "pkg-config was not found in $PATH"),
            Self::Io(err) => write!(f, "failed to execute pkg-config: {err}"),
            Self::CommandFailed(stderr) => write!(f, "pkg-config failed: {stderr}"),
            Self::InvalidUtf8(err) => write!(f, "pkg-config output was not valid UTF-8: {err}"),
        }
    }
}

pub async fn gtk4_layer_shell() -> Result<String, PkgConfigError> {
    if !is_in_path("pkg-config") {
        return Err(PkgConfigError::NotInPath);
    }

    let output = tokio::process::Command::new("pkg-config")
        .args(["--variable=libdir", "gtk4-layer-shell-0"])
        .output()
        .await
        .map_err(PkgConfigError::Io)?;

    if !output.status.success() {
        return Err(PkgConfigError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ));
    }

    String::from_utf8(output.stdout)
        .map(|s| format!("{}/libgtk4-layer-shell.so", s.trim().to_owned()))
        .map_err(PkgConfigError::InvalidUtf8)
}
