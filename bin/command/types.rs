use clap::Args;
use colored::Colorize;
use girgen::generator::{Error, Event};
use girgen::{default_dirs, girgen};
use std::{
    io::{self, Write},
    path, process,
    sync::{self, atomic},
};

#[derive(Args)]
pub struct TypeArgs {
    /// Log debugging statements
    #[arg(short, long, default_value_t = false)]
    verbose: bool,

    /// Target directory to generate to
    #[arg(short, long, value_name = "PATH", default_value = "./.types/gi")]
    outdir: String,

    /// Lookup these directories for .gir files
    #[arg(short, long, value_name = "PATHS", default_value_t = default_dirs())]
    dirs: String,

    /// Skip rendering by name and version, e.g "Gtk-4.0"
    #[arg(short, long, value_name = "GIRS")]
    ignore: Vec<String>,
}

static VERBOSE: sync::OnceLock<bool> = sync::OnceLock::new();

// 9 lib files + index.d.ts + package.json
static N_GIRS: atomic::AtomicUsize = atomic::AtomicUsize::new(11);
static N_GENERATED: atomic::AtomicUsize = atomic::AtomicUsize::new(0);

fn stem(path: &path::Path) -> &str {
    path.file_stem()
        .and_then(std::ffi::OsStr::to_str)
        .expect("valid utf8 file name")
}

fn on_event(event: Event) {
    if *VERBOSE.get().unwrap_or(&false) {
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
    } else {
        let mut out = io::stderr();

        match event {
            Event::Parsed { file_path: _ } => {
                let girs = N_GIRS.fetch_add(1, atomic::Ordering::Relaxed) + 1;
                write!(out, "\r  0/{}\x1b[K", girs).unwrap();
            }
            Event::Failed { repo, err: _ } => {
                if repo.is_some() {
                    let girs = N_GIRS.fetch_sub(1, atomic::Ordering::Relaxed) + 1;
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
                let girs = N_GIRS.load(atomic::Ordering::Relaxed);
                let gens = N_GENERATED.fetch_add(1, atomic::Ordering::Relaxed) + 1;
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
}

pub fn types(args: &TypeArgs) -> process::ExitCode {
    VERBOSE.set(args.verbose).unwrap();

    let dirs: Vec<path::PathBuf> = args.dirs.split(":").map(path::PathBuf::from).collect();

    let args = girgen::Args {
        dirs: &dirs.iter().map(|p| p.as_path()).collect::<Vec<_>>(),
        outdir: &args.outdir,
        ignore: &args.ignore.iter().map(|i| i.as_ref()).collect::<Vec<_>>(),
        event: on_event,
        generator: girgen::generator::typescript,
    };

    match girgen(&args) {
        Ok(_) => process::ExitCode::SUCCESS,
        Err(Error::Empty) => {
            eprintln!("nothing to generate");
            process::ExitCode::FAILURE
        }
        Err(Error::FsError(err)) => {
            eprintln!("{}", err);
            process::ExitCode::FAILURE
        }
    }
}
