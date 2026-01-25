use crate::generator::overrides::OVERRIDES;
use crate::log;

use super::super::element::gtype::resolve_anytype;
use super::super::grammar;
use super::super::render::Renderable;
use super::callable;
use super::doc;
use colored::Colorize;
use stringcase::camel_case;

fn iter_signals(parent: &str, signals: &[grammar::Signal]) -> Vec<String> {
    signals
        .iter()
        .filter(|s| s.info.introspectable)
        .filter_map(|s| {
            let detail_suffix = if s.detailed { "::{}" } else { "" };

            let signal = callable::Callable {
                doc: &s.doc,
                info: &s.info,
                throws: false,
                overrides: false,
                prefix: None,
                name: Some(&format!("\"{}{}\"", s.name, detail_suffix)),
                parameters: s.parameters.as_ref(),
                returns: s.returns.as_ref(),
            };

            match signal.render() {
                Ok(res) => Some(res),
                Err(err) => {
                    log!(
                        "{}: rendering signal {}.{}: {}",
                        "error".red(),
                        parent,
                        s.name,
                        err
                    );
                    None
                }
            }
        })
        .collect()
}

fn iter_properties(parent: &str, properties: &[grammar::Property]) -> Vec<minijinja::Value> {
    properties
        .iter()
        .filter(|p| p.info.introspectable)
        .filter_map(|p| {
            let res: Result<minijinja::Value, String> = (|| {
                let jsdoc = doc::Doc {
                    doc: &p.doc,
                    info: &p.info,
                    parameters: None,
                    returns: None,
                    throws: false,
                    overrides: false,
                    default_value: p.default_value.as_deref(),
                }
                .render()?;

                let gtype = match &p.gtype {
                    Some(t) => resolve_anytype(t),
                    None => Err("Missing type".to_owned()),
                }?;

                Ok(minijinja::context! {
                    jsdoc,
                    name => &p.name,
                    type => gtype,
                    readable => p.readable,
                    writable => p.writable,
                    construct_only => p.construct_only,
                })
            })();

            match res {
                Ok(res) => Some(res),
                Err(err) => {
                    log!(
                        "{}: rendering property {}.{}: {}",
                        "error".red(),
                        parent,
                        p.name,
                        err
                    );
                    None
                }
            }
        })
        .collect()
}

impl Renderable for grammar::Class {
    const KIND: &'static str = "class";
    const TEMPLATE: &'static str = include_str!("../templates/class.jinja");

    fn name(&self) -> &str {
        &self.name
    }

    fn introspectable(&self, _: &grammar::Namespace) -> bool {
        self.info.introspectable
    }

    fn env(&self) -> minijinja::Environment<'_> {
        let mut env = minijinja::Environment::new();
        env.add_template(
            "introspection",
            include_str!("../templates/introspection.jinja"),
        )
        .unwrap();
        env.add_filter("camel_case", camel_case);
        env
    }

    fn ctx(&self, namespace: &grammar::Namespace) -> Result<minijinja::Value, String> {
        let extends: Vec<&String> = self
            .parent
            .iter()
            .chain(self.implements.iter().map(|i| &i.name))
            .collect();

        let this = format!("{}.{}", namespace.name, self.name);
        let signals: Vec<String> = iter_signals(&this, &self.signals);
        let properties: Vec<minijinja::Value> = iter_properties(&this, &self.properties);

        let overrides = OVERRIDES
            .iter()
            .find(|o| o.namespace == namespace.name && o.version == namespace.version)
            .and_then(|o| o.classes.iter().find(|c| c.name == &self.name));

        let methods = callable::render_callable_elements(
            &this,
            "",
            &self
                .methods
                .iter()
                .filter(|m| overrides.is_none_or(|o| !o.methods.iter().any(|o| o == &m.attrs.name)))
                .map(callable::CallableElement::Method)
                .collect::<Vec<_>>(),
        );

        // TODO: consider overriding return value with self.name
        // example: currently `Adw.AboutDialog.new` returns `Adw.Dialog`
        let constructors = callable::render_callable_elements(
            &this,
            "",
            &self
                .constructors
                .iter()
                .map(callable::CallableElement::Constructor)
                .collect::<Vec<_>>(),
        );

        let functions = callable::render_callable_elements(
            &this,
            "",
            &self
                .functions
                .iter()
                .map(callable::CallableElement::Function)
                .collect::<Vec<_>>(),
        );

        let virtual_methods = callable::render_callable_elements(
            &this,
            "vfunc_",
            &self
                .virtual_methods
                .iter()
                .map(callable::CallableElement::VirtualMethod)
                .collect::<Vec<_>>(),
        );

        let name_class = namespace
            .records
            .iter()
            .find(|rec| {
                rec.gtype_struct_for
                    .as_ref()
                    .is_some_and(|name| name == &self.name)
            })
            .and_then(|rec| rec.name.clone())
            // TODO: check for name collision
            // Class suffix is only convention, so it might conflict with another symbol
            .unwrap_or_else(|| format!("{}Class", &self.name));

        let parent_class = self.parent.as_ref().map(|parent| {
            namespace
                .records
                .iter()
                .find(|rec| {
                    rec.gtype_struct_for
                        .as_ref()
                        .is_some_and(|name| name == parent)
                })
                .and_then(|rec| rec.name.clone())
                // TODO: check for name collision
                // Class suffix is only convention, so it might conflict with another symbol
                .unwrap_or_else(|| format!("{}Class", parent))
        });

        Ok(minijinja::context! {
            jsdoc => doc::jsdoc(&self.doc, &self.info).unwrap(),
            is_abstarct => self.is_abstract,
            name => &self.name,
            name_class,
            parent => self.parent,
            parent_class,
            extends,
            signals,
            properties,
            methods,
            constructors,
            functions,
            virtual_methods,
        })
    }
}

impl Renderable for grammar::Interface {
    const KIND: &'static str = "interface";
    const TEMPLATE: &'static str = include_str!("../templates/interface.jinja");

    fn name(&self) -> &str {
        &self.name
    }

    fn env(&self) -> minijinja::Environment<'_> {
        let mut env = minijinja::Environment::new();
        env.add_template(
            "introspection",
            include_str!("../templates/introspection.jinja"),
        )
        .unwrap();
        env.add_filter("camel_case", camel_case);
        env
    }

    fn introspectable(&self, _: &grammar::Namespace) -> bool {
        self.info.introspectable
    }

    fn ctx(&self, namespace: &grammar::Namespace) -> Result<minijinja::Value, String> {
        let extends: Vec<&String> = self
            .prerequisites
            .iter()
            .map(|p| &p.name)
            .chain(self.implements.iter().map(|i| &i.name))
            .collect();

        let this = format!("{}.{}", namespace.name, self.name);
        let signals: Vec<String> = iter_signals(&this, &self.signals);
        let properties: Vec<minijinja::Value> = iter_properties(&this, &self.properties);

        let overrides = OVERRIDES
            .iter()
            .find(|o| o.namespace == namespace.name && o.version == namespace.version)
            .and_then(|o| o.classes.iter().find(|c| c.name == &self.name));

        let methods = callable::render_callable_elements(
            &this,
            "",
            &self
                .methods
                .iter()
                .filter(|m| overrides.is_none_or(|o| !o.methods.iter().any(|o| o == &m.attrs.name)))
                .map(callable::CallableElement::Method)
                .collect::<Vec<_>>(),
        );

        let constructors = callable::render_callable_elements(
            &this,
            "",
            &self
                .constructors
                .iter()
                .map(callable::CallableElement::Constructor)
                .collect::<Vec<_>>(),
        );

        let functions = callable::render_callable_elements(
            &this,
            "",
            &self
                .functions
                .iter()
                .map(callable::CallableElement::Function)
                .collect::<Vec<_>>(),
        );

        let virtual_methods = callable::render_callable_elements(
            &this,
            "vfunc_",
            &self
                .virtual_methods
                .iter()
                .map(callable::CallableElement::VirtualMethod)
                .collect::<Vec<_>>(),
        );

        let name_iface = namespace
            .records
            .iter()
            .find(|rec| {
                rec.gtype_struct_for
                    .as_ref()
                    .is_some_and(|name| name == &self.name)
            })
            .and_then(|rec| rec.name.clone())
            // TODO: check for name collision
            // Iface suffix is only convention, so it might conflict with another symbol
            .unwrap_or_else(|| format!("{}Iface", &self.name));

        Ok(minijinja::context! {
            jsdoc => doc::jsdoc(&self.doc, &self.info).unwrap(),
            name => &self.name,
            name_iface,
            extends,
            signals,
            properties,
            methods,
            constructors,
            functions,
            virtual_methods,
        })
    }
}
