use clap::{Parser, Subcommand};
use gnim::bundle::{BundleArgs, bundle};
use gnim::dev::{DevArgs, dev};
use gnim::dev_rundir;
use gnim::exe::{ExeArgs, exe};
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
    /// Create an executable script for a gresource bundle
    Exe(ExeArgs),
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
            Command::Exe(_) => None,
        },
        alias: option_env!("GNIM_DATADIR").map(|dir| {
            rolldown::PathsOutputOption::Fn(std::sync::Arc::new(move |id| {
                if let Ok(path) = fs::canonicalize("node_modules/gnim")
                    && path.exists()
                {
                    let res = id.to_string();
                    return Box::pin(async move { Ok(res) });
                }

                // synced with package.json exports
                let gnim = format!("file://{dir}/gnim/dist/lib");

                let alias = match id {
                    "gnim" => format!("{gnim}/index.js"),
                    "gnim/dbus" => format!("{gnim}/decorators/dbus.js"),
                    "gnim/gobject" => format!("{gnim}/decorators/gobject.js"),
                    "gnim/i18n" => format!("{gnim}/i18n/index.js"),
                    "gnim/schema" => format!("{gnim}/schema/index.js"),
                    "gnim/fetch" => format!("{gnim}/polyfill/fetch.js"),
                    "gnim/jsx-runtime" => format!("{gnim}/jsx-runtime.js"),
                    "gnim/jsx-dev-runtime" => format!("{gnim}/jsx-dev-runtime.js"),
                    "gnim-gtk4" => format!("file://{dir}/gnim-gtk4/dist/index.js"),
                    "gnim-gtk3" => format!("file://{dir}/gnim-gtk3/dist/index.js"),
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
        Command::Exe(args) => exe(&args).await,
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
