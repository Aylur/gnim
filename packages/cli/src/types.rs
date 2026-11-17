use clap::Args;
use colored::Colorize;
use girgen::generator::{Error, Event, gjs};
use girgen::{default_dirs, girgen};
use std::sync::{Mutex, OnceLock};
use std::{fs, io, io::Write, path};

const GNIM_ENV: &str = r#"
declare module "*?file" {
  import Gio from "gi://Gio?version=2.0";
  const file: Gio.File;
  export default file;
}

declare module "*.css" {
  const css: string;
  export default css;
}

declare module "*.scss" {
  const css: string;
  export default css;
}
"#;

const GNIM_PACKAGE: &str = r#"{
  "name": "gnim",
  "type": "module",
  "types": "./env.d.ts"
}"#;

#[derive(Args)]
pub struct TypeArgs {
    /// Log debugging statements
    #[arg(short, long, default_value_t = false)]
    pub verbose: bool,
    /// Target directory to generate to
    #[arg(short, long, value_name = "PATH", default_value = "./.gnim/types")]
    pub outdir: String,
    /// Look in these directories for .gir files
    #[arg(short, long, value_name = "PATHS", default_values_os_t = default_dirs())]
    pub dirs: Vec<path::PathBuf>,
    /// Skip rendering by name and version, e.g. "Gtk-4.0"
    #[arg(short, long, value_name = "NAMESPACE")]
    pub ignore: Vec<String>,
    /// Generate non-versioned import aliases
    #[arg(long, default_value_t = false)]
    pub alias: bool,
}

static VERBOSE: OnceLock<bool> = OnceLock::new();

struct Progress {
    total: usize,
    done: usize,
}

static PROGRESS: Mutex<Progress> = Mutex::new(Progress {
    // 10 gjs lib files + index.d.ts + package.json
    total: 12,
    done: 0,
});

fn stem(path: &path::Path) -> &str {
    path.file_stem()
        .and_then(std::ffi::OsStr::to_str)
        .expect("valid utf8 file name")
}

fn on_verbose_event(event: Event) {
    match event {
        Event::Parsed { file_path } => {
            eprintln!(
                "{}: {} {}",
                "   parsed".green(),
                stem(file_path),
                file_path.display().to_string().black()
            );
        }
        Event::ParseFailed { file_path, err } => {
            eprintln!(
                "{}: could not parse {} {} {}",
                "   failed".red(),
                stem(file_path),
                file_path.display().to_string().black(),
                err,
            );
        }
        Event::Ignored { file_path, cause } => {
            eprintln!(
                "{}: {}{} {}",
                "  ignored".yellow(),
                cause,
                stem(file_path),
                file_path.display().to_string().black(),
            );
        }
        Event::Failed { repo, err } => match repo {
            Some(repo) => {
                eprintln!("{}: failed to render {} {}", "error".red(), repo, err);
            }
            None => {
                eprintln!("{}: {}", "error".red(), err);
            }
        },
        Event::Generated { repo, out_path } => {
            eprintln!("{}: {} {}", "generated".green(), repo, out_path.black());
        }
        Event::CacheHit { repo, out_path } => {
            eprintln!("{}: {} {}", "cache hit".green(), repo, out_path.black());
        }
        Event::Warning { warning } => {
            eprintln!("{}: {}", "warning".yellow(), warning);
        }
    }
}

// TODO: impl a progress bar
fn on_silent_event(event: Event) {
    let mut progress = PROGRESS.lock().unwrap_or_else(|err| err.into_inner());

    match event {
        Event::Parsed { file_path: _ } => {
            progress.total += 1;
        }
        Event::Failed { repo, err: _ } => {
            if repo.is_none() {
                return;
            }
            progress.total -= 1;
        }
        Event::Generated {
            repo: _,
            out_path: _,
        }
        | Event::CacheHit {
            repo: _,
            out_path: _,
        } => {
            progress.done += 1;
        }
        Event::Ignored {
            file_path: _,
            cause: _,
        }
        | Event::Warning { warning: _ }
        | Event::ParseFailed {
            file_path: _,
            err: _,
        } => return,
    }

    let mut out = io::stderr();
    write!(out, "\r{:>3}/{}\x1b[K", progress.done, progress.total).ok();
    out.flush().ok();
}

fn on_event(event: Event) {
    if *VERBOSE.get().unwrap_or(&false) {
        on_verbose_event(event);
    } else {
        on_silent_event(event);
    }
}

pub async fn types(args: &TypeArgs) -> Result<(), String> {
    VERBOSE.set(args.verbose).unwrap();

    let mut dirs = [default_dirs(), args.dirs.clone()].concat();
    dirs.sort();
    dirs.dedup();

    let girgen_args = girgen::Args {
        dirs,
        ignore: args.ignore.clone(),
        on_event,
        generator: gjs::TypeScript {
            alias: args.alias,
            outdir: format!("{}/gi", args.outdir),
        },
    };

    let result = girgen(girgen_args)
        .map_err(|err| match err {
            Error::Empty => "nothing to generate".to_string(),
            Error::FsError(error) => error.to_string(),
        })
        .and_then(|_| write_gnim_env(&args.outdir));

    if !args.verbose {
        eprintln!();
    }

    result
}

fn write_gnim_env(outdir: &str) -> Result<(), String> {
    let gnim_dir = path::Path::new(outdir).join("gnim");

    fs::create_dir_all(&gnim_dir)
        .map_err(|err| format!("Failed to create {}: {}", gnim_dir.display(), err))?;

    for (file, content) in [("env.d.ts", GNIM_ENV), ("package.json", GNIM_PACKAGE)] {
        let path = gnim_dir.join(file);
        fs::write(&path, content)
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
    }

    Ok(())
}
