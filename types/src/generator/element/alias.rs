use super::super::element::doc;
use super::super::element::gtype::resolve_anytype;
use super::super::render::Renderable;
use crate::grammar;

impl Renderable for grammar::Alias {
    const KIND: &'static str = "alias";
    const TEMPLATE: &'static str = "{{ jsdoc if jsdoc}}\ntype {{ name }} = {{ type }}";

    fn name(&self) -> &str {
        &self.name
    }

    fn ctx(&self, _: &grammar::Namespace) -> Result<minijinja::Value, String> {
        let gtype = match &self.gtype {
            Some(t) => resolve_anytype(t),
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
