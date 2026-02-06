use clap::{Parser, Subcommand};
use gnim_types;
use std::process;

#[derive(Parser)]
#[command(version, about)]
pub struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generete TypeScript types
    Types {
        /// Log debugging statements
        #[arg(short, long, default_value_t = false)]
        verbose: bool,

        /// Target directory to generate to
        #[arg(short, long, value_name = "PATH", default_value = "./.types/gi")]
        outdir: String,

        /// Lookup these directories for .gir files
        #[arg(short, long, value_name = "PATHS", default_value_t = gnim_types::default_dirs())]
        dirs: String,

        /// Skip rendering by name and version, e.g "Gtk-4.0"
        #[arg(short, long, value_name = "GIRS")]
        ignore: Vec<String>,
    },
}

fn main() -> process::ExitCode {
    let cli = Cli::parse();

    match cli.command {
        Commands::Types {
            verbose,
            outdir,
            dirs,
            ignore,
        } => gnim_types::cli(&gnim_types::Args {
            verbose,
            outdir,
            dirs,
            ignore,
        }),
    }
}
