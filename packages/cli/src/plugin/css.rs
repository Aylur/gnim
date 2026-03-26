use lightningcss::{bundler, stylesheet, targets};
use rolldown::ModuleType;
use std::borrow::Cow;
use std::future::Future;

const GTK3_PROVIDER: &str = r#"
import Gtk from "gi://Gtk?version=3.0"
import Gdk from "gi://Gdk?version=3.0"

Gtk.init()
const encoder = new TextEncoder()
const provider = Gtk.CssProvider.new()
provider.load_from_data(encoder.encode(stylesheet))
Gtk.StyleContext.add_provider_for_screen(
    Gdk.Screen.get_default(),
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
)
"#;

const GTK4_PROVIDER: &str = r#"
import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"

Gtk.init()
const provider = Gtk.CssProvider.new()
provider.load_from_string(stylesheet)
Gtk.StyleContext.add_provider_for_display(
    Gdk.Display.get_default(),
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
)
"#;

#[derive(Debug, Default)]
pub struct GnimCssPlugin {
    gtk_version: Option<String>,
}

impl GnimCssPlugin {
    pub fn new(gtk_version: Option<String>) -> Self {
        Self { gtk_version }
    }

    pub fn js_module(&self, css: &str) -> String {
        match self.gtk_version.as_deref() {
            Some("4.0") => format!(
                "const stylesheet = {:?} {} export default stylesheet",
                css, GTK4_PROVIDER,
            ),
            Some("3.0") => format!(
                "const stylesheet = {:?} {} export default stylesheet",
                css, GTK3_PROVIDER,
            ),
            _ => format!("export default {:?}", css),
        }
    }
}

impl rolldown_plugin::Plugin for GnimCssPlugin {
    fn name(&self) -> Cow<'static, str> {
        Cow::from("gnim:css")
    }

    fn register_hook_usage(&self) -> rolldown_plugin::HookUsage {
        rolldown_plugin::HookUsage::Transform
    }

    fn transform(
        &self,
        _: rolldown_plugin::SharedTransformPluginContext,
        args: &rolldown_plugin::HookTransformArgs<'_>,
    ) -> impl Future<Output = rolldown_plugin::HookTransformReturn> + Send {
        let id = args.id.to_string();

        async move {
            if id.ends_with(".scss") || id.ends_with(".sass") {
                let css = grass::from_path(&id, &Default::default())?;

                return Ok(Some(rolldown_plugin::HookTransformOutput {
                    module_type: Some(ModuleType::Js),
                    code: Some(self.js_module(&css)),
                    ..Default::default()
                }));
            }

            if id.ends_with(".css") {
                let fs = bundler::FileProvider::new();
                let mut bundler = bundler::Bundler::new(
                    &fs,
                    None,
                    stylesheet::ParserOptions {
                        filename: id.clone(),
                        ..Default::default()
                    },
                );
                let stylesheet = bundler.bundle(std::path::Path::new(&id)).map_err(|e| {
                    std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())
                })?;

                let result = stylesheet.to_css(stylesheet::PrinterOptions {
                    minify: false,
                    targets: targets::Targets {
                        browsers: Some(targets::Browsers {
                            firefox: Some(88 << 16),
                            ..Default::default()
                        }),
                        ..Default::default()
                    },
                    ..Default::default()
                })?;

                return Ok(Some(rolldown_plugin::HookTransformOutput {
                    module_type: Some(ModuleType::Js),
                    code: Some(self.js_module(&result.code)),
                    ..Default::default()
                }));
            }

            Ok(None)
        }
    }
}
