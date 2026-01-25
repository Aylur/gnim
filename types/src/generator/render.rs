use crate::log;

use super::grammar;
use super::overrides::OVERRIDES;
use colored::Colorize;
use rayon::prelude::*;
use rayon::scope;

#[derive(serde::Serialize)]
pub struct RenderedElement {
    pub name: String,
    pub content: Option<String>,
}

pub trait Renderable {
    const KIND: &'static str;
    const TEMPLATE: &'static str;

    fn ctx(&self, _namespace: &grammar::Namespace) -> Result<minijinja::Value, String> {
        Ok(minijinja::context! {})
    }

    fn introspectable(&self, _namespace: &grammar::Namespace) -> bool {
        true
    }

    fn env(&self) -> minijinja::Environment<'_> {
        minijinja::Environment::new()
    }

    fn name(&self) -> &str;

    fn render(&self, namespace: &grammar::Namespace) -> Result<RenderedElement, String> {
        if !self.introspectable(namespace) {
            return Ok(RenderedElement {
                name: self.name().to_string(),
                content: None,
            });
        }

        let ctx = match self.ctx(namespace) {
            Ok(ctx) => ctx,
            Err(err) => {
                return Err(format!(
                    "rendering {} {}.{}: {}",
                    Self::KIND,
                    namespace.name,
                    self.name(),
                    err
                ));
            }
        };

        match self.env().render_str(Self::TEMPLATE, ctx) {
            Err(err) => Err(format!(
                "rendering {} {}.{}: {:?}",
                Self::KIND,
                namespace.name,
                self.name(),
                err
            )),
            Ok(res) => Ok(RenderedElement {
                name: self.name().to_string(),
                content: Some(res),
            }),
        }
    }
}

fn render<T: Renderable + Sync>(items: &[T], ns: &grammar::Namespace) -> Vec<RenderedElement> {
    let overrides = OVERRIDES
        .iter()
        .find(|o| o.namespace == ns.name && o.version == ns.version);

    items
        .par_iter()
        .filter_map(|elem| {
            if overrides.is_some_and(|o| o.toplevel.iter().any(|n| *n == elem.name())) {
                return None;
            }

            match elem.render(ns) {
                Err(err) => {
                    log!("{}: {}", "error".red(), err);
                    None
                }
                Ok(elem) => match elem.content {
                    Some(_) => Some(elem),
                    None => None,
                },
            }
        })
        .collect()
}

#[derive(serde::Serialize)]
pub struct RenderedNamespace<'a> {
    name: &'a str,
    version: &'a str,
    content: Option<&'a str>,
    aliases: Vec<RenderedElement>,
    classes: Vec<RenderedElement>,
    interfaces: Vec<RenderedElement>,
    records: Vec<RenderedElement>,
    enums: Vec<RenderedElement>,
    functions: Vec<RenderedElement>,
    unions: Vec<RenderedElement>,
    bitfields: Vec<RenderedElement>,
    callbacks: Vec<RenderedElement>,
    constants: Vec<RenderedElement>,
}

pub fn render_namespace<'a>(ns: &'a grammar::Namespace) -> RenderedNamespace<'a> {
    let overrides = OVERRIDES
        .iter()
        .find(|o| o.namespace == ns.name && o.version == ns.version);

    let mut aliases = None;
    let mut classes = None;
    let mut interfaces = None;
    let mut records = None;
    let mut enums_ = None;
    let mut functions = None;
    let mut unions = None;
    let mut bitfields = None;
    let mut callbacks = None;
    let mut constants = None;

    scope(|s| {
        s.spawn(|_| aliases = Some(render(&ns.aliases, ns)));
        s.spawn(|_| classes = Some(render(&ns.classes, ns)));
        s.spawn(|_| interfaces = Some(render(&ns.interfaces, ns)));
        s.spawn(|_| records = Some(render(&ns.records, ns)));
        s.spawn(|_| enums_ = Some(render(&ns.enums, ns)));
        s.spawn(|_| functions = Some(render(&ns.functions, ns)));
        s.spawn(|_| unions = Some(render(&ns.unions, ns)));
        s.spawn(|_| bitfields = Some(render(&ns.bitfields, ns)));
        s.spawn(|_| callbacks = Some(render(&ns.callbacks, ns)));
        s.spawn(|_| constants = Some(render(&ns.constants, ns)));
    });

    RenderedNamespace {
        name: &ns.name,
        version: &ns.version,
        content: overrides.map(|o| o.content).unwrap_or_default(),
        aliases: aliases.unwrap(),
        classes: classes.unwrap(),
        interfaces: interfaces.unwrap(),
        records: records.unwrap(),
        enums: enums_.unwrap(),
        functions: functions.unwrap(),
        unions: unions.unwrap(),
        bitfields: bitfields.unwrap(),
        callbacks: callbacks.unwrap(),
        constants: constants.unwrap(),
    }
}
