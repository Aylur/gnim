use super::super::render;
use super::callable;
use crate::grammar;

impl render::Renderable for grammar::Function {
    const KIND: &'static str = "function";
    const TEMPLATE: &'static str = "{{ function }}";

    fn name(&self, _: &render::Context) -> &str {
        &self.attrs.name
    }

    fn introspectable(&self, _: &render::Context) -> bool {
        self.returns.as_ref().is_none_or(|r| r.introspectable)
            && self.parameters.as_ref().is_none_or(|ps| {
                ps.parameters
                    .iter()
                    .all(|p| p.introspectable && !p.variadic)
            })
            && self.attrs.info.introspectable
    }

    fn ctx(&self, _: &render::Context) -> Result<minijinja::Value, String> {
        let function = callable::Callable {
            doc: &self.doc,
            info: &self.attrs.info,
            throws: self.attrs.throws,
            overrides: self.attrs.shadows.is_some(),
            prefix: Some("function "),
            name: Some(&self.attrs.name),
            parameters: self.parameters.as_ref(),
            returns: self.returns.as_ref(),
        };

        Ok(minijinja::context! {
            function => function.render()?,
        })
    }
}
