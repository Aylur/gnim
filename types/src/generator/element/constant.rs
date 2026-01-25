use crate::generator::element::gtype::resolve_anytype;

use super::super::grammar;
use super::super::render::Renderable;

impl Renderable for grammar::Constant {
    const KIND: &'static str = "constant";
    const TEMPLATE: &'static str = "const {{ name }}: {{ value }}";

    fn name(&self) -> &str {
        &self.name
    }

    fn introspectable(&self, _: &grammar::Namespace) -> bool {
        self.info.introspectable
    }

    fn ctx(&self, _: &grammar::Namespace) -> Result<minijinja::Value, String> {
        let anytype = self.gtype.as_ref().ok_or("Missing type")?;
        let t = resolve_anytype(&anytype)?;

        let value = match t.as_str() {
            "boolean" => &self.value,
            "string" => &format!("\"{}\"", &self.value.replace('"', r#"\""#)),
            "number" => {
                if self.value.contains(".") {
                    &self.value
                } else {
                    const LIMIT: i128 = 1i128 << 53; // 2^53
                    let v: i128 = match self.value.parse() {
                        Ok(v) => v,
                        Err(_) => {
                            return Err(format!("failed to parse number '{}'", self.value));
                        }
                    };
                    if v.abs() > LIMIT {
                        &format!("{}n", self.value)
                    } else {
                        &self.value
                    }
                }
            }
            t => t,
        };

        Ok(minijinja::context! {
            name => &self.name,
            value => value,
        })
    }
}
