use super::super::element::doc;
use super::super::element::gtype::resolve_anytype;
use super::super::render::Renderable;
use super::callable;
use crate::grammar;
use stringcase::snake_case;

const TEMPLATE: &'static str = include_str!("../templates/record.jinja");

macro_rules! ctx {
    ($self:expr, $namespace:expr, $ctor:expr) => {{
        let this = format!("{}.{}", $namespace.name, $self.name.as_ref().unwrap());
        let jsdoc = doc::jsdoc(&$self.doc, &$self.info)?;

        let fields: Vec<minijinja::Value> = $self
            .fields
            .iter()
            .filter(|f| f.info.introspectable && f.private.is_none_or(|p| !p))
            .filter_map(|f| {
                let gtype = match &f.gtype {
                    None => return None,
                    Some(t) => match resolve_anytype(t) {
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
            &this,
            "",
            &$self
                .methods
                .iter()
                .map(callable::CallableElement::Method)
                .collect::<Vec<_>>(),
        );

        let constructors = callable::render_callable_elements(
            &this,
            "static ",
            &$self
                .constructors
                .iter()
                .map(callable::CallableElement::Constructor)
                .collect::<Vec<_>>(),
        );

        let functions = callable::render_callable_elements(
            &this,
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

impl Renderable for grammar::Record {
    const KIND: &'static str = "record";
    const TEMPLATE: &'static str = TEMPLATE;

    fn name(&self) -> &str {
        match &self.name {
            Some(name) => name,
            None => "",
        }
    }

    fn introspectable(&self, namespace: &grammar::Namespace) -> bool {
        // I'm not entirely sure, but maybe we can skip iteration and simply
        // return false if it *is* a gtype_struct_for?
        let class_struct = namespace.classes.iter().any(|class| {
            self.gtype_struct_for
                .as_ref()
                .is_some_and(|name| name == &class.name)
        });

        let iface_struct = namespace.interfaces.iter().any(|iface| {
            self.gtype_struct_for
                .as_ref()
                .is_some_and(|name| name == &iface.name)
        });

        !class_struct && !iface_struct && self.info.introspectable && self.name.is_some()
    }

    fn ctx(&self, namespace: &grammar::Namespace) -> Result<minijinja::Value, String> {
        // TODO: generate a constructor for non opaque records
        let constructor = Option::<&str>::None;

        match &self.gtype_struct_for {
            Some(type_for) => Ok(minijinja::context! { name => self.name, type_for }),
            None => ctx!(self, namespace, constructor),
        }
    }
}

impl Renderable for grammar::Union {
    const KIND: &'static str = "union";
    const TEMPLATE: &'static str = TEMPLATE;

    fn name(&self) -> &str {
        match &self.name {
            Some(name) => name,
            None => "",
        }
    }

    fn introspectable(&self, _: &grammar::Namespace) -> bool {
        self.info.introspectable && self.name.is_some()
    }

    fn ctx(&self, namespace: &grammar::Namespace) -> Result<minijinja::Value, String> {
        ctx!(self, namespace, Option::<&str>::None)
    }
}
