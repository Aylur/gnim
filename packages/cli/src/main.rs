use clap::{Parser, Subcommand};
use gnim::dev::{DevArgs, dev};
use gnim::run::{RunArgs, run};
use gnim::schemas::{SchemasArgs, schemas};
use gnim::types::{TypeArgs, types};
use rolldown_utils::indexmap::FxIndexMap;
use std::process;

#[derive(Parser)]
#[command(version)]
#[command(about)]
struct Cli {
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
    // TODO:
    // Init,
    // Bundle,
}

fn map(kv: &[(String, String)]) -> FxIndexMap<String, String> {
    kv.iter().cloned().collect()
}

#[tokio::main]
async fn main() -> process::ExitCode {
    let cli = Cli::parse();

    gnim::init(gnim::GlobalOptions {
        define: match &cli.command {
            Command::Types(_) => None,
            Command::Schemas(args) => Some(map(&args.define)),
            Command::Run(args) => Some(map(&args.define)),
            Command::Dev(args) => Some(map(&args.define)),
        },
        alias: None,
    });

    match cli.command {
        Command::Types(args) => types(&args).await,
        Command::Schemas(args) => schemas(&args).await,
        Command::Run(args) => run(&args).await,
        Command::Dev(args) => dev(&args).await,
    }
}
