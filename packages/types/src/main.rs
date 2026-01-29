use clap::Parser;
use gnim_types;
use std::process;

#[derive(Parser)]
#[command(version, about)]
pub struct Cli {
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
}

fn main() -> process::ExitCode {
    let cli = Cli::parse();

    let args = gnim_types::Args {
        verbose: cli.verbose,
        outdir: cli.outdir,
        dirs: cli.dirs,
        ignore: cli.ignore,
    };

    gnim_types::cli(&args)
}
