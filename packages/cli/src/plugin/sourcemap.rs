use rolldown_common::Output;
use std::borrow::Cow;
use std::future::Future;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

const SOURCE_MAPPING_URL: &str = "//# sourceMappingURL=";
const ROLLDOWN_DATA_URL: &str = "data:application/json;charset=utf-8;base64,";
// GJS only reads inline source maps with exactly this prefix
const GJS_DATA_URL: &str = "data:application/json;base64,";

/// Rewrites inline source map URLs to the form GJS can read.
#[derive(Debug, Default)]
pub struct GnimSourceMapPlugin;

impl rolldown_plugin::Plugin for GnimSourceMapPlugin {
    fn name(&self) -> Cow<'static, str> {
        Cow::from("gnim:sourcemap")
    }

    fn register_hook_usage(&self) -> rolldown_plugin::HookUsage {
        rolldown_plugin::HookUsage::GenerateBundle
    }

    fn generate_bundle(
        &self,
        _: &rolldown_plugin::PluginContext,
        args: &mut rolldown_plugin::HookGenerateBundleArgs<'_>,
    ) -> impl Future<Output = rolldown_plugin::HookNoopReturn> + Send {
        for output in args.bundle.iter_mut() {
            if let Output::Chunk(chunk) = output
                && let Some(code) = gjs_data_url(&chunk.code)
            {
                Arc::make_mut(chunk).code = code;
            }
        }

        async { Ok(()) }
    }
}

fn gjs_data_url(code: &str) -> Option<String> {
    let start = code.rfind(SOURCE_MAPPING_URL)? + SOURCE_MAPPING_URL.len();
    let data = code[start..].strip_prefix(ROLLDOWN_DATA_URL)?;
    Some(format!("{}{GJS_DATA_URL}{data}", &code[..start]))
}

/// Source map paths are relative to the output file by default, which is somewhere in the
/// dev rundir. This makes them relative to the working directory, or absolute when outside of it.
pub fn source_path_transform() -> rolldown::SourceMapPathTransform {
    rolldown::SourceMapPathTransform::new(Arc::new(|source: &str, map_path: &str| {
        let path = display_path(source, map_path);
        Box::pin(async move { Ok(path) })
    }))
}

fn display_path(source: &str, map_path: &str) -> String {
    let dir = Path::new(map_path).parent().unwrap_or(Path::new("/"));
    let path = normalize(&dir.join(source));

    // virtual modules, e.g. bundler runtime helpers
    if !path.exists() {
        return source.to_owned();
    }

    let relative = std::env::current_dir()
        .ok()
        .and_then(|cwd| path.strip_prefix(cwd).ok().map(Path::to_path_buf));

    relative.unwrap_or(path).to_string_lossy().into_owned()
}

fn normalize(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                normalized.pop();
            }
            Component::CurDir => {}
            component => normalized.push(component),
        }
    }
    normalized
}

#[cfg(test)]
mod tests {
    use super::{display_path, gjs_data_url};

    #[test]
    fn rewrites_inline_source_map_prefix() {
        let code =
            "print(1);\n\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ9";
        assert_eq!(
            gjs_data_url(code).as_deref(),
            Some("print(1);\n\n//# sourceMappingURL=data:application/json;base64,eyJ9"),
        );
    }

    #[test]
    fn ignores_code_without_inline_source_map() {
        assert_eq!(
            gjs_data_url("print(1);\n//# sourceMappingURL=main.js.map"),
            None
        );
        assert_eq!(gjs_data_url("print(1);"), None);
    }

    #[test]
    fn makes_source_paths_relative_to_cwd() {
        let cwd = std::env::current_dir().unwrap();
        let map_path = cwd.join("target/some/dir/main.js.map");
        let source = "../../../src/lib.rs";
        assert_eq!(
            display_path(source, &map_path.to_string_lossy()),
            "src/lib.rs"
        );
    }

    #[test]
    fn keeps_virtual_sources() {
        let source = "\0rolldown/runtime.js";
        assert_eq!(display_path(source, "/tmp/out/main.js.map"), source);
    }
}
