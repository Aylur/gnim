use std::path::PathBuf;

pub fn dev_rundir() -> PathBuf {
    let dir = std::env::var("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
        .join("gnim");

    std::fs::create_dir_all(&dir).ok();
    dir
}
