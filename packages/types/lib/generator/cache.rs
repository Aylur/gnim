use std::{collections, env, fs, io, path, sync};
use twox_hash::XxHash64;

type Cache = collections::HashMap<String, path::PathBuf>;
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

static CACHE_DIR: sync::OnceLock<Option<path::PathBuf>> = sync::OnceLock::new();
static CACHE: sync::OnceLock<Cache> = sync::OnceLock::new();

fn get_cache_dir() -> Option<path::PathBuf> {
    if let Ok(p) = env::var("XDG_CACHE_HOME") {
        return Some(path::PathBuf::from(p).join("gnim"));
    }

    if let Ok(p) = env::var("HOME") {
        return Some(path::PathBuf::from(p).join(".cache").join("gnim"));
    }

    match env::current_dir() {
        Err(err) => {
            eprintln!("{:?}", err);
            None
        }
        Ok(dir) => Some(dir.join(".cache").join("gnim")),
    }
}

fn get_cache() -> Cache {
    CACHE_DIR
        .get_or_init(get_cache_dir)
        .as_ref()
        .and_then(|dir| fs::read_dir(dir).ok())
        .map(|dir| {
            dir.filter_map(Result::ok)
                .filter_map(|e| {
                    let path = e.path();
                    let stem = path.file_name()?.to_str()?.to_owned();
                    Some((stem, path))
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn cache(hash: &str, result: &str) -> Result<(), io::Error> {
    if let Some(dir) = CACHE_DIR.get_or_init(get_cache_dir) {
        fs::create_dir_all(dir)?;
        fs::write(path::PathBuf::from(dir).join(hash), result)?;
    }
    Ok(())
}

pub fn lookup_cache<'a>(name: &str, contents: &str) -> (String, Option<&'a path::Path>) {
    let cache = CACHE.get_or_init(get_cache);
    let hash = XxHash64::oneshot(0, contents.as_bytes());
    let key = format!("{}_{}_{}", name, hash, VERSION);
    let file = cache.get(&key).map(|buf| buf.as_path());

    (key, file)
}
