use super::{cache, gjs_lib};
use crate::{grammar, parser};
use rayon::prelude::*;
use std::{fs, io, path};

struct Gir<'a> {
    name: &'a str,
    contents: String,
    repo: grammar::Repository,
}

pub enum Event<'a> {
    Parsed {
        file_path: &'a path::Path,
    },
    ParseFailed {
        file_path: &'a path::Path,
        err: &'a str,
    },
    Warning {
        warning: &'a str,
    },
    Failed {
        repo: Option<&'a str>,
        err: &'a str,
    },
    Generated {
        repo: &'a str,
        out_path: &'a str,
    },
    CacheHit {
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

pub fn generate(gir_paths: &[&path::Path], outdir: &str, event: fn(Event)) -> Result<(), Error> {
    let girs: Vec<Gir> = gir_paths
        .par_iter()
        .filter(|gir| matches!(gir.extension().and_then(|ext| ext.to_str()), Some("gir")))
        .filter_map(|path| {
            let contents = match fs::read_to_string(path) {
                Ok(ok) => ok,
                Err(err) => {
                    event(Event::ParseFailed {
                        file_path: path,
                        err: err.to_string().as_str(),
                    });
                    return None;
                }
            };

            match parser::parse(&contents) {
                Ok(repo) => {
                    event(Event::Parsed { file_path: path });
                    Some(Gir {
                        name: path.file_stem().and_then(|f| f.to_str()).unwrap(),
                        repo,
                        contents,
                    })
                }
                Err(err) => {
                    event(Event::ParseFailed {
                        file_path: path,
                        err: err.to_string().as_str(),
                    });
                    None
                }
            }
        })
        .collect::<Vec<_>>();

    if girs.is_empty() {
        return Err(Error::Empty);
    }

    fs::create_dir_all(&outdir)?;

    let repos = girs.iter().map(|gir| &gir.repo).collect::<Vec<_>>();

    let index = girs
        .par_iter()
        .filter_map(|gir| {
            let (hash, cache_path) = cache::lookup_cache(gir.name, &gir.contents);
            let out_path = format!("{}/{}.d.ts", outdir, gir.name);
            let import = format!("import \"./{}.d.ts\"", gir.name);

            if let Some(path) = cache_path {
                match fs::read_to_string(path) {
                    Err(err) => event(Event::Warning {
                        warning: err.to_string().as_str(),
                    }),
                    Ok(result) => match fs::write(&out_path, result) {
                        Err(err) => event(Event::Warning {
                            warning: err.to_string().as_str(),
                        }),
                        Ok(_) => {
                            event(Event::CacheHit {
                                repo: gir.name,
                                out_path: &out_path,
                            });
                            return Some(import);
                        }
                    },
                }
            }

            let result = match gir.repo.generate_dts(&repos, event) {
                Ok(result) => result,
                Err(err) => {
                    event(Event::Failed {
                        repo: Some(gir.name),
                        err: err.as_str(),
                    });
                    return None;
                }
            };

            if let Err(err) = cache::cache(&hash, &result) {
                event(Event::Warning {
                    warning: err.to_string().as_str(),
                })
            }

            match fs::write(&out_path, &result) {
                Err(err) => {
                    event(Event::Failed {
                        repo: Some(gir.name),
                        err: err.to_string().as_str(),
                    });
                    None
                }
                Ok(_) => {
                    event(Event::Generated {
                        repo: gir.name,
                        out_path: &out_path,
                    });
                    Some(import)
                }
            }
        })
        .chain(gjs_lib::GJS_LIBS.par_iter().filter_map(|lib| {
            let path = format!("{}/{}.d.ts", outdir, lib.name);
            if let Err(err) = fs::write(&path, lib.content) {
                event(Event::Failed {
                    repo: Some(&lib.name),
                    err: err.to_string().as_str(),
                });
                None
            } else {
                event(Event::CacheHit {
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
    fs::write(
        &package_path,
        include_str!("../generator/gjs_lib/package.json"),
    )?;
    event(Event::Generated {
        repo: "package",
        out_path: package_path.as_str(),
    });

    Ok(())
}
