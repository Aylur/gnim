use clap::{ArgAction, Parser, Subcommand};
use gnim::bundle::{BundleArgs, bundle};
use gnim::dev::{DevArgs, dev};
use gnim::dev_rundir;
use gnim::exe::{ExeArgs, exe};
use gnim::schemas::{SchemasArgs, schemas};
use gnim::types::{TypeArgs, types};
use rolldown_utils::indexmap::FxIndexMap;
use std::{fs, process};

#[derive(Parser)]
#[command(version, disable_version_flag = true)]
#[command(about)]
struct Cli {
    /// Keep temporary and runtime files on exit
    #[arg(short, long, default_value_t = false)]
    pub keep_tmp: bool,

    /// Print version
    #[arg(short = 'v', long = "version", action = ArgAction::Version)]
    version: (),

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Generate annotations for TypeScript
    Types(TypeArgs),
    /// Compile gschema.ts files into xml and gschema files
    Schemas(SchemasArgs),
    /// Start the Gnim development server
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
        alias: None,
        define: match &cli.command {
            Command::Types(_) => None,
            Command::Schemas(args) => Some(map(&args.define)),
            Command::Dev(args) => Some(map(&args.define)),
            Command::Bundle(args) => Some(map(&args.define)),
            Command::Exe(_) => None,
        },
    });

    let result = tokio::spawn(async move {
        match cli.command {
            Command::Types(args) => types(&args).await,
            Command::Schemas(args) => schemas(&args).await,
            Command::Dev(args) => dev(&args).await,
            Command::Bundle(args) => bundle(&args).await,
            Command::Exe(args) => exe(&args).await,
        }
    })
    .await;

    if !cli.keep_tmp {
        fs::remove_dir_all(dev_rundir()).ok();
    }

    let result = match result {
        Ok(result) => result,
        Err(err) => std::panic::resume_unwind(err.into_panic()),
    };

    match result {
        Ok(_) => process::ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("{}", err);
            process::ExitCode::FAILURE
        }
    }
}
