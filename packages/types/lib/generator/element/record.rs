use super::super::render;
use super::{callable, doc, gtype};
use crate::grammar;
use stringcase::snake_case;

const TEMPLATE: &'static str = include_str!("../templates/record.jinja");

macro_rules! ctx {
    ($self:expr, $ctx:expr, $ctor:expr) => {{
        let jsdoc = doc::jsdoc(&$self.doc, &$self.info)?;

        let fields: Vec<minijinja::Value> = $self
            .fields
            .iter()
            .filter(|f| f.info.introspectable && f.private.is_none_or(|p| !p))
            .filter_map(|f| {
                let gtype = match &f.gtype {
                    None => return None,
                    Some(t) => match gtype::resolve_anytype(t) {
                        Err(_) => return None,
                        Ok(t) => t,
                    },
                };

                let jsdoc = doc::jsdoc(&f.doc, &f.info).unwrap();

                Some(minijinja::context! {
                    jsdoc,
                    name => snake_case(&f.name),
                    type => gtype,
                    readable => f.readable,
                    writable => f.writable,
                })
            })
            .collect();

        let methods = callable::render_callable_elements(
            $ctx,
            "",
            &$self
                .methods
                .iter()
                .map(callable::CallableElement::Method)
                .collect::<Vec<_>>(),
        );

        let constructors = callable::render_callable_elements(
            $ctx,
            "static ",
            &$self
                .constructors
                .iter()
                .map(callable::CallableElement::Constructor)
                .collect::<Vec<_>>(),
        );

        let functions = callable::render_callable_elements(
            $ctx,
            "static ",
            &$self
                .functions
                .iter()
                .map(callable::CallableElement::Function)
                .collect::<Vec<_>>(),
        );

        Ok(minijinja::context! {
            jsdoc,
            name => $self.name,
            constructor => $ctor,
            fields,
            methods,
            constructors,
            functions,
        })
    }};
}

impl render::Renderable for grammar::Record {
    const KIND: &'static str = "record";
    const TEMPLATE: &'static str = TEMPLATE;

    fn name(&self, _: &render::Context) -> &str {
        match &self.name {
            Some(name) => name,
            None => "",
        }
    }

    fn introspectable(&self, _: &render::Context) -> bool {
        // gtype structs are rendered in classes/interfaces
        self.gtype_struct_for.is_none() && self.info.introspectable && self.name.is_some()
    }

    fn ctx(&self, ctx: &render::Context) -> Result<minijinja::Value, String> {
        // TODO: generate a constructor for non opaque records
        let constructor = Option::<&str>::None;

        match &self.gtype_struct_for {
            Some(type_for) => Ok(minijinja::context! { name => self.name, type_for }),
            None => ctx!(self, ctx, constructor),
        }
    }
}

impl render::Renderable for grammar::Union {
    const KIND: &'static str = "union";
    const TEMPLATE: &'static str = TEMPLATE;

    fn name(&self, _: &render::Context) -> &str {
        match &self.name {
            Some(name) => name,
            None => "",
        }
    }

    fn introspectable(&self, _: &render::Context) -> bool {
        self.info.introspectable && self.name.is_some()
    }

    fn ctx(&self, ctx: &render::Context) -> Result<minijinja::Value, String> {
        ctx!(self, ctx, Option::<&str>::None)
    }
}
