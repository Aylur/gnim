use super::super::render;
use super::{doc, gtype};
use crate::grammar;

impl render::Renderable for grammar::Alias {
    const KIND: &'static str = "alias";
    const TEMPLATE: &'static str = "{{ jsdoc if jsdoc}}\ntype {{ name }} = {{ type }}";

    fn name(&self, _: &render::Context) -> &str {
        &self.name
    }

    fn ctx(&self, _: &render::Context) -> Result<minijinja::Value, String> {
        let gtype = match &self.gtype {
            Some(t) => gtype::resolve_anytype(t),
            None => Err("Missing type".to_owned()),
        }?;

        let jsdoc = doc::jsdoc(&self.doc, &self.info).unwrap();

        Ok(minijinja::context! {
            jsdoc,
            name => self.name,
            type => gtype
        })
    }
}
