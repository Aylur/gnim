use super::lib;
use crate::parser;
use rayon::prelude::*;
use std::{fs, io, path};

pub enum Event<'a> {
    Parsed {
        file_path: &'a path::Path,
    },
    ParseFailed {
        file_path: &'a path::Path,
        err: &'a str,
    },
    Failed {
        repo: Option<&'a str>,
        err: &'a str,
    },
    Generated {
        repo: &'a str,
        out_path: &'a str,
    },
}

pub enum Error {
    Empty,
    FsError(io::Error),
}

impl From<io::Error> for Error {
    fn from(value: io::Error) -> Self {
        Self::FsError(value)
    }
}

pub fn generate(girs: &[path::PathBuf], outdir: &str, event: fn(Event)) -> Result<(), Error> {
    let repo_paths = girs
        .iter()
        .filter(|gir| matches!(gir.extension().and_then(|ext| ext.to_str()), Some("gir")))
        .collect::<Vec<_>>();

    let repos = repo_paths
        .par_iter()
        .filter_map(|p| match parser::parse(p) {
            Ok(repo) => {
                event(Event::Parsed { file_path: p });
                Some(repo)
            }
            Err(err) => {
                event(Event::ParseFailed {
                    file_path: p,
                    err: err.to_string().as_str(),
                });
                None
            }
        })
        .collect::<Vec<_>>();

    if repos.is_empty() {
        return Err(Error::Empty);
    }

    fs::create_dir_all(&outdir)?;

    let index = repos
        .par_iter()
        .filter_map(|repo| {
            let str = match repo.generate_dts(&repos, event) {
                Ok(str) => str,
                Err(err) => {
                    event(Event::Failed {
                        repo: Some(repo.file_stem.as_str()),
                        err: err.as_str(),
                    });
                    return None;
                }
            };
            let path = format!("{}/{}.d.ts", outdir, repo.file_stem);
            if let Err(err) = fs::write(&path, str) {
                event(Event::Failed {
                    repo: Some(repo.file_stem.as_str()),
                    err: err.to_string().as_str(),
                });
                None
            } else {
                event(Event::Generated {
                    repo: repo.file_stem.as_str(),
                    out_path: &path,
                });
                Some(format!("import \"./{}.d.ts\"", repo.file_stem))
            }
        })
        .chain(lib::GJS_LIBS.par_iter().filter_map(|lib| {
            let path = format!("{}/{}.d.ts", outdir, lib.name);
            if let Err(err) = fs::write(&path, lib.content) {
                event(Event::Failed {
                    repo: Some(&lib.name),
                    err: err.to_string().as_str(),
                });
                None
            } else {
                event(Event::Generated {
                    repo: &lib.name,
                    out_path: &path,
                });
                Some(format!("import \"./{}.d.ts\"", lib.name))
            }
        }))
        .collect::<Vec<_>>()
        .join("\n");

    let index_path = format!("{}/index.d.ts", outdir);
    fs::write(&index_path, index)?;
    event(Event::Generated {
        repo: "index",
        out_path: index_path.as_str(),
    });

    let package_path = format!("{}/package.json", outdir);
    fs::write(&package_path, include_str!("../generator/lib/package.json"))?;
    event(Event::Generated {
        repo: "package",
        out_path: package_path.as_str(),
    });

    Ok(())
}
