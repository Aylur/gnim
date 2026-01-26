mod types;

use clap::{Parser, Subcommand};
use std::process::ExitCode;

#[derive(Parser)]
#[command(version, about)]
pub struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate TypeScript types from gir files
    Types(types::Args),
    // TODO: to be implemented commands:
    // /// Create a new Gnim project from a template
    // Init,
    // /// Start a Gnim dev server for local development
    // Dev,
    // /// Execute a TypeScript file with GJS
    // Run,
    // /// Run unit tests
    // Test,
    // /// Bundle TypeScript and JavaScript code into a single file
    // Bundle,
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    match cli.command {
        Commands::Types(args) => types::types(&args),
    }
}
