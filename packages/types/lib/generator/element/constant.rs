use super::super::render;
use super::gtype;
use crate::grammar;

impl render::Renderable for grammar::Constant {
    const KIND: &'static str = "constant";
    const TEMPLATE: &'static str = "const {{ name }}: {{ value }}";

    fn name(&self, _: &render::Context) -> &str {
        &self.name
    }

    fn introspectable(&self, _: &render::Context) -> bool {
        self.info.introspectable
    }

    fn ctx(&self, _: &render::Context) -> Result<minijinja::Value, String> {
        let anytype = self.gtype.as_ref().ok_or("Missing type")?;
        let t = gtype::resolve_anytype(&anytype)?;

        let value = match t.as_str() {
            "boolean" | "number" => &self.value,
            "string" => &format!("\"{}\"", &self.value.replace('"', r#"\""#)),
            t => t,
        };

        Ok(minijinja::context! {
            name => &self.name,
            value => value,
        })
    }
}
