mod command;

use clap::{Parser, Subcommand};
use command::types::{TypeArgs, types};
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
    /// Generate annotations for TypeScript
    Types(TypeArgs),
    // TODO:
    // Init,
    // Dev,
    // Bundle,
}

fn main() -> process::ExitCode {
    let cli = Cli::parse();

    match cli.command {
        Command::Types(args) => types(&args),
    }
}
