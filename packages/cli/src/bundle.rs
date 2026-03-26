use crate::plugin::{css::GnimCssPlugin, resource::GnimResourcePlugin};
use crate::{dev_rundir, rolldown_config};
use clap::Args;
use std::sync::Arc;

#[derive(Args)]
pub struct BundleArgs {
    /// Entry module
    pub entry: String,
    /// Target gresource bundle
    pub outfile: String,
    /// Replace global identifiers with constant expressions
    #[arg(short, long, value_name = "KEY=VALUE", value_parser = crate::parse_key_val)]
    pub define: Vec<(String, String)>,
    /// Alias used in the gresource for the main js module
    #[arg(short, long, value_name = "NAME", default_value_t = String::from("main.js"))]
    pub main_alias: String,
    /// Path prefix used in the gresource
    #[arg(short, long, value_name = "PATH", default_value_t = String::from("/"))]
    pub prefix: String,
}

pub async fn bundle(args: &BundleArgs) -> Result<(), String> {
    let resources = Arc::new(GnimResourcePlugin::new(Some(args.prefix.clone())));

    let js_bundle_target = dev_rundir()
        .join(&args.main_alias)
        .to_string_lossy()
        .to_string();

    let mut bundler = rolldown::Bundler::with_plugins(
        rolldown::BundlerOptions {
            input: Some(vec![args.entry.to_owned().into()]),
            file: Some(js_bundle_target.clone()),
            ..rolldown_config()
        },
        vec![Arc::new(GnimCssPlugin::default()), resources.clone()],
    )
    .expect("Failed to create bundler");

    bundler.write().await.map_err(|err| {
        err.iter()
            .map(|d| d.to_diagnostic().to_color_string())
            .collect::<Vec<_>>()
            .join("\n")
    })?;

    resources.generate_gresource(&js_bundle_target, &args.main_alias, &args.outfile)?;
    Ok(())
}
