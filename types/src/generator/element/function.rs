use super::super::render::Renderable;
use super::callable;
use crate::grammar;

impl Renderable for grammar::Function {
    const KIND: &'static str = "function";
    const TEMPLATE: &'static str = "{{ function }}";

    fn name(&self) -> &str {
        &self.attrs.name
    }

    fn introspectable(&self, _: &grammar::Namespace) -> bool {
        self.returns.as_ref().is_none_or(|r| r.introspectable)
            && self.parameters.as_ref().is_none_or(|ps| {
                ps.parameters
                    .iter()
                    .all(|p| p.introspectable && !p.variadic)
            })
            && self.attrs.info.introspectable
    }

    fn ctx(&self, _: &grammar::Namespace) -> Result<minijinja::Value, String> {
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
