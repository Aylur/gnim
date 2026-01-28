mod generator;
mod grammar;
mod parser;

use std::{env, path};

pub fn default_dirs() -> String {
    let data_dirs = match env::var("XDG_DATA_DIRS") {
        Ok(dirs) => dirs,
        Err(_) => return "".to_string(),
    };

    data_dirs
        .split(":")
        .filter_map(|path| {
            // ignore nix path as this is a side effect
            if path == "/run/current-system/sw/share" {
                return None;
            }
            let name = format!("{}/gir-1.0", &path);
            let gir_path = path::Path::new(&name);
            match gir_path.exists() && gir_path.is_dir() {
                true => Some(name),
                false => None,
            }
        })
        .collect::<Vec<_>>()
        .join(":")
}

pub use generator::generate::{Error, Event, generate};
