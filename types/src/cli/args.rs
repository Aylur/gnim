use clap::Parser;
use std::{env, path};

fn default_dirs() -> String {
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

#[derive(Parser)]
#[command(version, about)]
pub struct Cli {
    /// Log debugging statements
    #[arg(short, long, default_value_t = false)]
    pub verbose: bool,

    /// Target directory to generate to
    #[arg(short, long, value_name = "PATH", default_value = "./.types/gi")]
    pub outdir: String,

    /// Lookup these directories for .gir files
    #[arg(short, long, value_name = "PATHS", default_value_t = default_dirs())]
    pub dirs: String,

    /// Skip rendering by name and version, e.g "Gtk-4.0"
    #[arg(short, long, value_name = "GIRS")]
    pub ignore: Vec<String>,
}

pub fn cli_args() -> Cli {
    let cli = Cli::parse();
    crate::VERBOSE.set(cli.verbose).unwrap();
    cli
}
