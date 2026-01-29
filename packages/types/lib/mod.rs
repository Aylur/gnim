mod generator;
mod grammar;
mod parser;

use colored::Colorize;
pub use generator::generate::{Error, Event, generate};
use generator::gjs_lib::GJS_LIBS;
use std::{
    collections, env, ffi,
    io::{self, Write},
    path, process,
    sync::{self, atomic},
};

pub fn default_dirs() -> String {
    let data_dirs = match env::var("XDG_DATA_DIRS") {
        Ok(dirs) => dirs,
        Err(_) => return "".to_string(),
    };

    let mut dirs = data_dirs
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
        .collect::<Vec<_>>();

    dirs.sort();
    dirs.dedup();
    dirs.join(":")
}

pub struct Args {
    pub verbose: bool,
    pub outdir: String,
    pub dirs: String,
    pub ignore: Vec<String>,
}

static VERBOSE: sync::OnceLock<bool> = sync::OnceLock::new();

// +2 is index.d.ts and package.json
static N_GIRS: atomic::AtomicUsize = atomic::AtomicUsize::new(GJS_LIBS.len() + 2);
static N_GENERATED: atomic::AtomicUsize = atomic::AtomicUsize::new(0);

fn stem(path: &path::Path) -> &str {
    path.file_stem()
        .and_then(ffi::OsStr::to_str)
        .expect("valid utf8 file name")
}

fn on_event(event: Event) {
    if *VERBOSE.get().unwrap_or(&false) {
        match event {
            Event::Parsed { file_path } => {
                eprintln!(
                    "{}: {} {}",
                    "   parsed".green(),
                    stem(&file_path),
                    file_path.display().to_string().black()
                );
            }
            Event::ParseFailed { file_path, err } => {
                eprintln!(
                    "{}: could not parse {} {} {}",
                    "   failed".red(),
                    stem(&file_path),
                    file_path.display().to_string().black(),
                    err,
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
            Event::Warning { warning: _ }
            | Event::ParseFailed {
                file_path: _,
                err: _,
            } => (),
        }

        out.flush().unwrap();
    }
}

pub fn cli(args: &Args) -> process::ExitCode {
    VERBOSE.set(args.verbose).unwrap();

    let mut girs = args
        .dirs
        .split(":")
        .filter_map(|path| {
            let gir_path = path::Path::new(&path).to_owned();
            if gir_path.exists() && gir_path.is_dir() {
                gir_path.read_dir().ok()
            } else {
                None
            }
        })
        .flat_map(|dir| {
            dir.filter_map(Result::ok)
                .map(|file| file.path())
                .filter(|path| matches!(path.extension().and_then(|ext| ext.to_str()), Some("gir")))
        })
        .collect::<Vec<_>>();

    girs.sort();
    girs.dedup();

    girs.retain({
        let mut uniq = collections::HashSet::new();

        move |path| {
            path.file_stem().is_some_and(|name| {
                let is_new = uniq.insert(name.to_owned());
                let ignore = args.ignore.iter().any(|ignore| **ignore == *name);
                let keep = is_new && !ignore;
                if !keep && *VERBOSE.get().unwrap_or(&false) {
                    eprintln!(
                        "{}: {}{} {}",
                        "  ignored".yellow(),
                        (if !is_new { "duplicate " } else { "" }).black(),
                        name.to_str().expect("valid utf8 file name"),
                        path.to_str().expect("valid utf8 file name").black(),
                    )
                }
                keep
            })
        }
    });

    match generate(
        &girs.iter().map(|p| p.as_path()).collect::<Vec<_>>(),
        &args.outdir,
        on_event,
    ) {
        Ok(_) => process::ExitCode::SUCCESS,
        Err(err) => {
            match err {
                Error::Empty => {
                    println!("nothing to generate");
                }
                Error::FsError(error) => {
                    eprintln!("{}", error);
                }
            };
            process::ExitCode::FAILURE
        }
    }
}
