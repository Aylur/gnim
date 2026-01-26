mod args;

pub use args::cli_args;

use super::generator::GJS_LIBS;
use super::parser;
use crate::{cli::args::Cli, log};
use colored::Colorize;
use rayon::prelude::*;
use std::{collections::HashSet, fs, path, process::ExitCode};

pub fn generate(cli: &Cli) -> Result<ExitCode, Box<dyn std::error::Error>> {
    let mut repo_paths = cli
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

    let mut uniq = HashSet::new();

    repo_paths.retain(|path| {
        path.file_stem().is_some_and(|name| {
            let skip = uniq.insert(name.to_owned());
            if skip {
                log!(
                    "{}: {} {}",
                    "skipping duplicate".yellow(),
                    name.to_str().expect("valid utf8 file name"),
                    path.to_str().expect("valid utf8 file name").black(),
                )
            }
            skip
        })
    });

    repo_paths.retain(|path| {
        path.file_stem().is_some_and(|name| {
            let ignore = cli.ignore.iter().any(|ignore| **ignore == *name);
            if ignore {
                log!(
                    "{}: {} {}",
                    "ignored".blue(),
                    name.to_str().expect("valid utf8 file name"),
                    path.to_str().expect("valid utf8 file name").black(),
                )
            }
            !ignore
        })
    });

    let repos = repo_paths
        .par_iter()
        .filter_map(|p| match parser::parse(p.as_path()) {
            Ok(repo) => {
                log!(
                    "{}: {} {}",
                    "parsed".green(),
                    repo.file_stem,
                    p.to_str().expect("path to be valid utf8").black()
                );
                Some(repo)
            }
            Err(err) => {
                log!(
                    "{}: could not parse file {:?}:\n\t {:#?}",
                    "failed".red(),
                    p,
                    err
                );
                None
            }
        })
        .collect::<Vec<_>>();

    if repos.is_empty() {
        eprintln!("{}: {}", "warning".yellow(), "no gir files, nothing to do");
        return Ok(ExitCode::FAILURE);
    }

    if let Err(err) = fs::create_dir_all(&cli.outdir) {
        log!("{}: could not create dir {:#?}", "failed".red(), err);
        return Ok(ExitCode::FAILURE);
    }

    let index = repos
        .par_iter()
        .filter_map(|repo| {
            let str = match repo.generate_dts(&repos) {
                Ok(str) => str,
                Err(err) => {
                    log!(
                        "{}: to generate types for {}: {:?}",
                        "failed".red(),
                        repo.file_stem,
                        err
                    );
                    return None;
                }
            };
            let path = format!("{}/{}.d.ts", cli.outdir, repo.file_stem);
            if let Err(err) = fs::write(&path, str) {
                log!("{}: to write types {:#?}", "failed".red(), err);
                None
            } else {
                log!(
                    "{}: {} {}",
                    "generated".green(),
                    repo.file_stem,
                    &path.black()
                );
                Some(format!("import \"./{}.d.ts\"", repo.file_stem))
            }
        })
        .chain(GJS_LIBS.par_iter().filter_map(|lib| {
            let path = format!("{}/{}.d.ts", cli.outdir, lib.name);
            if let Err(err) = fs::write(&path, lib.content) {
                log!("{}: {:#?}", "failed".red(), err);
                None
            } else {
                log!("{}: {} {}", "generated".green(), lib.name, &path.black());
                Some(format!("import \"./{}.d.ts\"", lib.name))
            }
        }))
        .collect::<Vec<_>>()
        .join("\n");

    fs::write(&format!("{}/index.d.ts", cli.outdir), index)?;
    fs::write(
        &format!("{}/package.json", cli.outdir),
        include_str!("../generator/lib/package.json"),
    )?;

    Ok(ExitCode::SUCCESS)
}
