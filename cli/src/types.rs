use colored::Colorize;
use gnim_types::{Event, default_dirs, generate};
use std::process::ExitCode;
use std::sync::OnceLock;
use std::{collections, ffi, path};

#[derive(clap::Args)]
pub struct Args {
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

static VERBOSE: OnceLock<bool> = OnceLock::new();

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
                    "parsed".green(),
                    stem(&file_path),
                    file_path.display().to_string().black()
                )
            }
            Event::ParseFailed { file_path, err } => {
                eprintln!(
                    "{}: could not parse {} {} {}",
                    "failed".red(),
                    stem(&file_path),
                    file_path.display().to_string().black(),
                    err,
                )
            }
            Event::Failed { repo, err } => match repo {
                Some(repo) => eprintln!("{}: failed to render {} {}", "error".red(), repo, err),
                None => eprintln!("{}: {}", "error".red(), err),
            },
            Event::Generated { repo, out_path } => {
                eprintln!("{}: {} {}", "generated".green(), repo, out_path.black())
            }
        }
    }
}

pub fn types(args: &Args) -> ExitCode {
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

    let mut uniq = collections::HashSet::new();

    girs.retain(|path| {
        path.file_stem().is_some_and(|name| {
            let skip = uniq.insert(name.to_owned());
            if skip {
                if *VERBOSE.get().unwrap_or(&false) {
                    eprintln!(
                        "{}: {} {} {}",
                        "ignored".yellow(),
                        "duplicate".black(),
                        name.to_str().expect("valid utf8 file name"),
                        path.to_str().expect("valid utf8 file name").black(),
                    )
                }
            }
            skip
        })
    });

    girs.retain(|path| {
        path.file_stem().is_some_and(|name| {
            let ignore = args.ignore.iter().any(|ignore| **ignore == *name);
            if ignore {
                if *VERBOSE.get().unwrap_or(&false) {
                    eprintln!(
                        "{}: {} {}",
                        "ignored".blue(),
                        name.to_str().expect("valid utf8 file name"),
                        path.to_str().expect("valid utf8 file name").black(),
                    )
                }
            }
            !ignore
        })
    });

    match generate(&girs, &args.outdir, on_event) {
        Ok(_) => ExitCode::SUCCESS,
        Err(err) => {
            match err {
                gnim_types::Error::Empty => {
                    println!("nothing to generate");
                }
                gnim_types::Error::FsError(error) => {
                    eprintln!("{}", error);
                }
            };
            ExitCode::FAILURE
        }
    }
}
