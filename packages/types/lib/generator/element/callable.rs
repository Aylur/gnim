use super::super::{generate, render};
use super::{doc, gtype};
use crate::grammar;

static TEMPLATE: &'static str = include_str!("../templates/callable.jinja");

#[derive(serde::Serialize)]
struct Parameter<'a> {
    name: &'a str,
    tstype: String,
}

// https://gitlab.gnome.org/GNOME/gjs/-/blob/master/doc/Mapping.md#gtype-objects
fn override_parameter_type(name: &str) -> String {
    match name {
        "GObject.GType" => "(GObject.GType | { $gtype: GObject.GType })".to_owned(),
        _ => name.to_owned(),
    }
}

fn filter_keyword<'a>(name: &'a str) -> &'a str {
    match name {
        "in" => "in_",
        "break" => "break_",
        "function" => "func",
        _ => name,
    }
}

#[derive(serde::Serialize)]
pub struct Callable<'a> {
    pub doc: &'a grammar::InfoElements,
    pub info: &'a grammar::InfoAttrs,
    pub throws: bool,
    pub overrides: bool,
    pub prefix: Option<&'a str>,
    pub name: Option<&'a str>,
    pub parameters: Option<&'a grammar::Parameters>,
    pub returns: Option<&'a grammar::ReturnValue>,
}

impl Callable<'_> {
    pub fn render(&self) -> Result<String, String> {
        let env = minijinja::Environment::new();

        let (p_returns, p_parameters): (Vec<_>, Vec<_>) =
            gtype::filter_parameters(self.parameters, self.returns)
                .into_iter()
                .partition(|p| matches!(p.direction.as_deref(), Some("inout" | "out")));

        let parameter_results: Vec<Result<Parameter, String>> = p_parameters
            .into_iter()
            .map(|p| -> Result<Parameter, String> {
                let t = gtype::tstype(p.gtype.as_ref(), p.nullable)?;
                Ok(Parameter {
                    name: filter_keyword(&p.name),
                    tstype: override_parameter_type(t.as_str()),
                })
            })
            .collect();

        let return_results: Vec<Result<String, String>> = self
            .returns
            .filter(|r| {
                r.gtype.as_ref().is_some_and(|t| {
                    matches!(t, grammar::AnyType::Type(t) if t.name.as_deref() != Some("none"))
                        || matches!(t, grammar::AnyType::Array(_))
                })
            })
            .into_iter()
            .map(|r| gtype::tstype(r.gtype.as_ref(), r.nullable))
            .chain(
                p_returns
                    .into_iter()
                    .filter(|p| !p.optional)
                    .map(|p| gtype::tstype(p.gtype.as_ref(), p.nullable)),
            )
            .collect();

        let return_errs = return_results.iter().filter_map(|r| {
            r.as_ref()
                .err()
                .map(|err| format!("failed to render callable 'return': {}", err))
        });

        let param_errs = parameter_results.iter().filter_map(|p| {
            p.as_ref()
                .err()
                .map(|err| format!("failed to render callable 'parameter': {}", err))
        });

        let errs: Vec<String> = return_errs.chain(param_errs).collect();

        if !errs.is_empty() {
            return Err(errs.join(","));
        }

        let returns: Vec<String> = return_results.into_iter().map(|r| r.unwrap()).collect();

        let parameters: Vec<Parameter> =
            parameter_results.into_iter().map(|p| p.unwrap()).collect();

        let jsdoc = {
            let jsdoc = doc::Doc {
                doc: self.doc,
                info: self.info,
                parameters: self.parameters,
                returns: self.returns,
                throws: self.throws,
                overrides: self.overrides,
                default_value: None,
            };
            jsdoc.render()?
        };

        let name = self.name.map(|name| match name {
            "new" => "\"new\"",
            n => n,
        });

        let ctx = minijinja::context! {
            jsdoc,
            prefix => self.prefix,
            name,
            parameters,
            returns,
        };

        match env.render_str(TEMPLATE, ctx) {
            Ok(res) => Ok(res),
            Err(err) => Err(format!("failed to render callable: {:?}", err).into()),
        }
    }
}

macro_rules! callable {
    ($callable:expr, $prefix:expr) => {
        Callable {
            doc: &$callable.doc,
            info: &$callable.attrs.info,
            throws: $callable.attrs.throws,
            overrides: $callable.attrs.shadows.is_some(),
            prefix: Some($prefix),
            name: Some(&$callable.attrs.name),
            parameters: $callable.parameters.as_ref(),
            returns: $callable.returns.as_ref(),
        }
    };
}

pub enum CallableElement<'a> {
    Constructor(&'a grammar::Constructor),
    Function(&'a grammar::Function),
    Method(&'a grammar::Method),
    VirtualMethod(&'a grammar::VirtualMethod),
}

pub fn render_callable_elements(
    ctx: &render::Context,
    prefix: &str,
    elements: &[CallableElement<'_>],
) -> Vec<String> {
    elements
        .iter()
        .filter(|i| match i {
            CallableElement::Constructor(i) => i.attrs.info.introspectable,
            CallableElement::Function(i) => i.attrs.info.introspectable,
            CallableElement::Method(i) => i.attrs.info.introspectable,
            CallableElement::VirtualMethod(i) => i.attrs.info.introspectable,
        })
        .filter_map(|i| {
            let elem = match i {
                CallableElement::Constructor(i) => callable!(i, prefix),
                CallableElement::Function(i) => callable!(i, prefix),
                CallableElement::Method(i) => callable!(i, prefix),
                CallableElement::VirtualMethod(i) => callable!(i, prefix),
            };

            let kind = match i {
                CallableElement::Constructor(_) => "constructor",
                CallableElement::Function(_) => "function",
                CallableElement::Method(_) => "method",
                CallableElement::VirtualMethod(_) => "virtual method",
            };

            let name = match i {
                CallableElement::Constructor(i) => &i.attrs.name,
                CallableElement::Function(i) => &i.attrs.name,
                CallableElement::Method(i) => &i.attrs.name,
                CallableElement::VirtualMethod(i) => &i.attrs.name,
            };

            match elem.render() {
                Ok(res) => Some(res),
                Err(err) => {
                    (ctx.event)(generate::Event::Failed {
                        repo: None,
                        err: &format!(
                            "failed to render {} {}-{}.{}: {}",
                            kind, ctx.namespace.name, ctx.namespace.version, name, err
                        ),
                    });
                    None
                }
            }
        })
        .collect()
}
