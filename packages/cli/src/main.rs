use clap::{Parser, Subcommand};
use gnim::bundle::{BundleArgs, bundle};
use gnim::dev::{DevArgs, dev};
use gnim::dev_rundir;
use gnim::run::{RunArgs, run};
use gnim::schemas::{SchemasArgs, schemas};
use gnim::types::{TypeArgs, types};
use rolldown_utils::indexmap::FxIndexMap;
use std::{fs, process};

#[derive(Parser)]
#[command(version)]
#[command(about)]
struct Cli {
    /// Keep temporary and runtime files on exit
    #[arg(short, long, default_value_t = false)]
    pub keep_tmp: bool,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run a GJS script as a module
    Run(RunArgs),
    /// Generate annotations for TypeScript
    Types(TypeArgs),
    /// Compile gschema.ts files into xml and gschema files
    Schemas(SchemasArgs),
    /// Startup the Gnim development server
    Dev(DevArgs),
    /// Bundle TypeScript and asset files into a gresource bundle
    Bundle(BundleArgs),
}

fn map(kv: &[(String, String)]) -> FxIndexMap<String, String> {
    kv.iter().cloned().collect()
}

#[tokio::main]
async fn main() -> std::process::ExitCode {
    let cli = Cli::parse();

    gnim::init(gnim::GlobalOptions {
        define: match &cli.command {
            Command::Types(_) => None,
            Command::Schemas(args) => Some(map(&args.define)),
            Command::Run(args) => Some(map(&args.define)),
            Command::Dev(args) => Some(map(&args.define)),
            Command::Bundle(args) => Some(map(&args.define)),
        },
        alias: gnim::GNIM_LIBDIR.map(|dir| {
            rolldown::PathsOutputOption::Fn(std::sync::Arc::new(move |id| {
                // synced with package.json exports
                let prefix = format!("file://{dir}/lib");
                let alias = match id {
                    "gnim" => format!("{prefix}/index.js"),
                    "gnim/dbus" => format!("{prefix}/decorators/dbus.js"),
                    "gnim/fetch" => format!("{prefix}/polyfill/fetch.js"),
                    "gnim/gobject" => format!("{prefix}/decorators/gobject.js"),
                    "gnim/schema" => format!("{prefix}/schema/index.js"),
                    "gnim/jsx-runtime" => format!("{prefix}/jsx-runtime.js"),
                    "gnim/jsx-dev-runtime" => format!("{prefix}/jsx-dev-runtime.js"),
                    "gnim/gtk4" => format!("{prefix}/renderer/gtk4.js"),
                    _ => id.to_string(),
                };

                Box::pin(async move { Ok(alias) })
            }))
        }),
    });

    let result = match cli.command {
        Command::Types(args) => types(&args).await,
        Command::Schemas(args) => schemas(&args).await,
        Command::Run(args) => run(&args).await,
        Command::Dev(args) => dev(&args).await,
        Command::Bundle(args) => bundle(&args).await,
    };

    if !cli.keep_tmp {
        fs::remove_dir_all(dev_rundir()).ok();
    }

    match result {
        Ok(_) => process::ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("{}", err);
            process::ExitCode::FAILURE
        }
    }
}
