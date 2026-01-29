use super::super::render;
use super::callable;
use crate::grammar;

impl render::Renderable for grammar::Callback {
    const KIND: &'static str = "callback";
    const TEMPLATE: &'static str = "{{ callback }}";

    fn name(&self, _: &render::Context) -> &str {
        &self.name
    }

    fn introspectable(&self, _: &render::Context) -> bool {
        self.returns.as_ref().is_none_or(|r| r.introspectable)
            && self.parameters.as_ref().is_none_or(|ps| {
                ps.parameters
                    .iter()
                    .all(|p| p.introspectable && !p.variadic)
            })
            && self.info.introspectable
    }

    fn ctx(&self, _: &render::Context) -> Result<minijinja::Value, String> {
        let function = callable::Callable {
            doc: &self.doc,
            info: &self.info,
            throws: self.throws,
            overrides: false,
            prefix: Some(&format!("type {} = ", self.name)),
            name: None,
            parameters: self.parameters.as_ref(),
            returns: self.returns.as_ref(),
        };

        Ok(minijinja::context! {
            callback => function.render()?,
        })
    }
}
