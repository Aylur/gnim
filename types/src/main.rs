mod cli;
mod generator;
mod parser;

pub use parser::grammar;
use std::process::ExitCode;
use std::sync::OnceLock;

pub static VERBOSE: OnceLock<bool> = OnceLock::new();

#[inline(always)]
pub fn debug_enabled() -> bool {
    *VERBOSE.get().unwrap_or(&false)
}

#[macro_export]
macro_rules! log {
    ($($arg:tt)*) => {{
        if $crate::debug_enabled() {
            eprintln!($($arg)*);
        }
    }};
}

fn main() -> Result<ExitCode, Box<dyn std::error::Error>> {
    let cli = cli::cli_args();
    let res = cli::generate(&cli)?;
    Ok(res)
}
