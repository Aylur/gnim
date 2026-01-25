use super::super::grammar;
use super::super::render::Renderable;
use super::doc;
use colored::Colorize;

const TEMPLATE: &'static str = include_str!("../templates/enumeration.jinja");

fn remove_prefix(fn_name: &str, prefixes: &Vec<&str>) -> String {
    for prefix in prefixes {
        if let Some(name) = fn_name.strip_prefix(prefix) {
            return name.to_string();
        }
    }
    fn_name.to_string()
}

macro_rules! ctx {
    ($self:expr, $namespace:expr) => {{
        let jsdoc = doc::jsdoc(&$self.doc, &$self.info)?;

        let functions = if $self.functions.is_empty() {
            Vec::new()
        } else {
            match $namespace.c_symbol_prefixes.as_ref() {
                None => {
                    eprintln!(
                        "{}: failed to render {}.{} functions: Missing namespace c:symbol-prefix",
                        "error".red(),
                        $namespace.name,
                        $self.name
                    );
                    Vec::new()
                }
                Some(prefixes) => {
                    let ns_prefixes: Vec<_> = prefixes.split(',').collect();

                    $self
                        .functions
                        .iter()
                        .filter_map(|f| {
                            let mut func = f.clone();
                            func.attrs.name = remove_prefix(&func.attrs.name, &ns_prefixes);
                            match func.render($namespace) {
                                Ok(res) => Some(res.content),
                                Err(err) => {
                                    eprintln!(
                                        "{}: failed to render {}.{}.{} function: {}",
                                        "error".red(),
                                        $namespace.name,
                                        $self.name,
                                        f.attrs.name,
                                        err
                                    );
                                    None
                                }
                            }
                        })
                        .collect()
                }
            }
        };

        let members: Vec<minijinja::Value> = $self
            .members
            .iter()
            .map(|m| {
                minijinja::context! {
                    jsdoc => doc::jsdoc(&m.doc, &m.info).unwrap(),
                    name => m.name.to_uppercase(),
                    value => m.value,
                }
            })
            .collect();

        Ok(minijinja::context! {
            name => &$self.name,
            jsdoc,
            functions,
            members,
        })
    }};
}

impl Renderable for grammar::Enumeration {
    const KIND: &'static str = "enum";
    const TEMPLATE: &'static str = TEMPLATE;

    fn name(&self) -> &str {
        &self.name
    }

    fn introspectable(&self, _: &grammar::Namespace) -> bool {
        self.info.introspectable
    }

    fn ctx(&self, namespace: &grammar::Namespace) -> Result<minijinja::Value, String> {
        ctx!(self, namespace)
    }
}

impl Renderable for grammar::BitField {
    const KIND: &'static str = "bitfield";
    const TEMPLATE: &'static str = TEMPLATE;

    fn name(&self) -> &str {
        &self.name
    }

    fn introspectable(&self, _: &grammar::Namespace) -> bool {
        self.info.introspectable
    }

    fn ctx(&self, namespace: &grammar::Namespace) -> Result<minijinja::Value, String> {
        ctx!(self, namespace)
    }
}
