use super::generate;
use super::overrides;
use crate::grammar;
use rayon::prelude::*;
use rayon::scope;

pub struct Context<'a> {
    pub namespace: &'a grammar::Namespace,
    pub event: fn(generate::Event),
}

#[derive(serde::Serialize)]
pub struct RenderedElement {
    pub name: String,
    pub content: Option<String>,
}

pub trait Renderable {
    const KIND: &'static str;
    const TEMPLATE: &'static str;

    fn ctx(&self, _ctx: &Context) -> Result<minijinja::Value, String> {
        Ok(minijinja::context! {})
    }

    fn introspectable(&self, _ctx: &Context) -> bool {
        true
    }

    fn env(&self, _ctx: &Context) -> minijinja::Environment<'_> {
        minijinja::Environment::new()
    }

    fn name(&self, _ctx: &Context) -> &str;

    fn render(&self, ctx: &Context) -> Result<RenderedElement, String> {
        if !self.introspectable(ctx) {
            return Ok(RenderedElement {
                name: self.name(ctx).to_string(),
                content: None,
            });
        }

        let jinja_ctx = match self.ctx(ctx) {
            Ok(ctx) => ctx,
            Err(err) => {
                return Err(format!(
                    "rendering {} {}-{}.{}: {}",
                    Self::KIND,
                    ctx.namespace.name,
                    ctx.namespace.version,
                    self.name(ctx),
                    err
                ));
            }
        };

        match self.env(ctx).render_str(Self::TEMPLATE, jinja_ctx) {
            Err(err) => Err(format!(
                "rendering {} {}-{}.{}: {:?}",
                Self::KIND,
                ctx.namespace.name,
                ctx.namespace.version,
                self.name(ctx),
                err
            )),
            Ok(res) => Ok(RenderedElement {
                name: self.name(ctx).to_string(),
                content: Some(res),
            }),
        }
    }
}

fn render<T: Renderable + Sync>(items: &[T], ctx: &Context) -> Vec<RenderedElement> {
    let overrides = overrides::OVERRIDES
        .iter()
        .find(|o| o.namespace == ctx.namespace.name && o.version == ctx.namespace.version);

    items
        .par_iter()
        .filter_map(|elem| {
            if overrides.is_some_and(|o| o.toplevel.iter().any(|n| *n == elem.name(ctx))) {
                return None;
            }

            match elem.render(ctx) {
                Err(err) => {
                    (ctx.event)(generate::Event::Failed {
                        repo: None,
                        err: err.as_str(),
                    });
                    None
                }
                Ok(elem) => {
                    if elem.content.is_none() {
                        return None;
                    }

                    match elem.name.as_str() {
                        "enum" | "function" | "false" | "true" | "break" | "void" => {
                            (ctx.event)(generate::Event::Failed {
                                repo: None,
                                err: &format!(
                                    "failed to include {}-{}.{} due to invalid name",
                                    ctx.namespace.name, ctx.namespace.version, elem.name,
                                ),
                            });
                            None
                        }
                        _ => Some(elem),
                    }
                }
            }
        })
        .collect()
}

#[derive(serde::Serialize)]
struct RenderedNamespace<'a> {
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

fn render_namespace<'a>(ctx: Context<'a>) -> RenderedNamespace<'a> {
    let overrides = overrides::OVERRIDES
        .iter()
        .find(|o| o.namespace == ctx.namespace.name && o.version == ctx.namespace.version);

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
        s.spawn(|_| aliases = Some(render(&ctx.namespace.aliases, &ctx)));
        s.spawn(|_| classes = Some(render(&ctx.namespace.classes, &ctx)));
        s.spawn(|_| interfaces = Some(render(&ctx.namespace.interfaces, &ctx)));
        s.spawn(|_| records = Some(render(&ctx.namespace.records, &ctx)));
        s.spawn(|_| enums_ = Some(render(&ctx.namespace.enums, &ctx)));
        s.spawn(|_| functions = Some(render(&ctx.namespace.functions, &ctx)));
        s.spawn(|_| unions = Some(render(&ctx.namespace.unions, &ctx)));
        s.spawn(|_| bitfields = Some(render(&ctx.namespace.bitfields, &ctx)));
        s.spawn(|_| callbacks = Some(render(&ctx.namespace.callbacks, &ctx)));
        s.spawn(|_| constants = Some(render(&ctx.namespace.constants, &ctx)));
    });

    RenderedNamespace {
        name: &ctx.namespace.name,
        version: &ctx.namespace.version,
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

impl grammar::Repository {
    fn find_imports(&self, repos: &[&grammar::Repository]) -> Vec<grammar::Include> {
        let mut includes = self.find_includes(&repos);

        let namespace = self
            .namespaces
            .first()
            .map(|ns| format!("{}-{}", ns.name, ns.version))
            .unwrap();

        let has_gobject = includes
            .iter()
            .any(|inc| inc.name == "GObject" && inc.version == "2.0");

        if namespace != "GObject-2.0" && !has_gobject {
            includes.push(grammar::Include {
                name: String::from("GObject"),
                version: String::from("2.0"),
            });
        }

        let has_glib = includes
            .iter()
            .any(|inc| inc.name == "GLib" && inc.version == "2.0");

        if namespace != "GLib-2.0" && !has_glib {
            includes.push(grammar::Include {
                name: String::from("GLib"),
                version: String::from("2.0"),
            });
        }

        includes
    }

    pub fn generate_dts(
        &self,
        repos: &[&grammar::Repository],
        event: fn(generate::Event),
    ) -> Result<String, String> {
        let namespaces = self
            .namespaces
            .par_iter()
            .map(|ns| {
                render_namespace(Context {
                    namespace: &ns,
                    event: event,
                })
            })
            .collect::<Vec<_>>();

        let imports = self.find_imports(&repos);

        let res = minijinja::Environment::new().render_str(
            include_str!("templates/repository.jinja"),
            minijinja::context! { imports, namespaces },
        );

        match res {
            Ok(res) => Ok(res),
            Err(err) => Err(format!("{:?}", err).into()),
        }
    }
}
