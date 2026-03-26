use clap::Args;
use colored::Colorize;
use girgen::generator::{Error, Event, typescript};
use girgen::{default_dirs, girgen};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicUsize, Ordering};
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
    /// Lookup these directories for .gir files
    #[arg(short, long, value_name = "PATHS", default_value_t = default_dirs())]
    pub dirs: String,
    /// Skip rendering by name and version, e.g "Gtk-4.0"
    #[arg(short, long, value_name = "NAME")]
    pub ignore: Vec<String>,
    /// Generate non versioned imports
    #[arg(long, default_value_t = false)]
    pub short_imports: bool,
    /// Generate legacy imports
    #[arg(long, default_value_t = false)]
    pub legacy_imports: bool,
}

static VERBOSE: OnceLock<bool> = OnceLock::new();

// 9 lib files + index.d.ts + package.json
static N_GIRS: AtomicUsize = AtomicUsize::new(11);
static N_GENERATED: AtomicUsize = AtomicUsize::new(0);

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

fn on_silent_event(event: Event) {
    let mut out = io::stderr();

    match event {
        Event::Parsed { file_path: _ } => {
            let girs = N_GIRS.fetch_add(1, Ordering::Relaxed) + 1;
            write!(out, "\r  0/{}\x1b[K", girs).unwrap();
        }
        Event::Failed { repo, err: _ } => {
            if repo.is_some() {
                let girs = N_GIRS.fetch_sub(1, Ordering::Relaxed) + 1;
                write!(out, "\r  0/{}\x1b[K", girs).unwrap();
            }
        }
        Event::Generated {
            repo: _,
            out_path: _,
        }
        | Event::CacheHit {
            repo: _,
            out_path: _,
        } => {
            let girs = N_GIRS.load(Ordering::Relaxed);
            let gens = N_GENERATED.fetch_add(1, Ordering::Relaxed) + 1;
            write!(out, "\r{:>n$}/{}\x1b[K", gens, girs, n = 3).unwrap();
        }
        Event::Ignored {
            file_path: _,
            cause: _,
        }
        | Event::Warning { warning: _ }
        | Event::ParseFailed {
            file_path: _,
            err: _,
        } => (),
    }

    out.flush().unwrap();
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

    let dir_paths: Vec<path::PathBuf> = args.dirs.split(":").map(path::PathBuf::from).collect();
    let dirs = &dir_paths.iter().map(|p| p.as_path()).collect::<Vec<_>>();
    let ignore = &args.ignore.iter().map(|i| i.as_ref()).collect::<Vec<_>>();

    let opts = typescript::Opts {
        short_paths: args.short_imports,
        legacy_imports: args.legacy_imports,
    };

    let girgen_args = girgen::Args {
        dirs,
        ignore,
        outdir: &format!("{}/gi", &args.outdir),
        event: on_event,
        generator: typescript::generate,
    };

    girgen(&opts, &girgen_args).map_err(|err| match err {
        Error::Empty => "nothing to generate".to_string(),
        Error::FsError(error) => error.to_string(),
    })?;

    fs::create_dir_all(format!("{}/gnim", &args.outdir)).unwrap();

    fs::write(format!("{}/gnim/env.d.ts", &args.outdir), GNIM_ENV)
        .expect("Failed to write gnim/env.d.ts");

    fs::write(format!("{}/gnim/package.json", &args.outdir), GNIM_PACKAGE)
        .expect("Failed to write gnim/package.json");

    Ok(())
}
