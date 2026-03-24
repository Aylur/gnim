use lightningcss::{stylesheet, targets};
use rolldown::ModuleType;
use std::borrow::Cow;
use std::future::Future;

#[derive(Debug)]
pub struct GnimCssPlugin;

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
        let code = args.code.to_string();

        async move {
            if id.ends_with(".scss") || id.ends_with(".sass") {
                let css = grass::from_string(&code, &Default::default())?;

                return Ok(Some(rolldown_plugin::HookTransformOutput {
                    module_type: Some(ModuleType::Js),
                    code: Some(format!("export default {:?}", css)),
                    ..Default::default()
                }));
            }

            if id.ends_with(".css") {
                let stylesheet = stylesheet::StyleSheet::parse(
                    &code,
                    stylesheet::ParserOptions {
                        filename: id.clone(),
                        ..Default::default()
                    },
                )
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))?;

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
                    code: Some(format!("export default {:?}", result.code)),
                    ..Default::default()
                }));
            }

            Ok(None)
        }
    }
}
