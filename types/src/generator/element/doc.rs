use super::gtype;
use crate::grammar;
use regex::Regex;
use std::sync::LazyLock;

static TEMPLATE: &'static str = include_str!("../templates/doc.jinja");
static DOC_AT_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:^|\s)@(\w+)").unwrap());

// TODO: format gi-docgen links
// e.g `[method@NS.Class.method]` -> `{@link NS.Class.prototype.method}`
fn fmt(text: &str) -> String {
    DOC_AT_RE
        .replace_all(text, r" `$1`")
        .into_owned()
        .replace('\n', " ")
}

#[derive(serde::Serialize)]
struct DocParameter<'a> {
    name: &'a str,
    text: String,
}

#[derive(serde::Serialize)]
pub struct Doc<'a> {
    pub doc: &'a grammar::InfoElements,
    pub info: &'a grammar::InfoAttrs,
    pub parameters: Option<&'a grammar::Parameters>,
    pub returns: Option<&'a grammar::ReturnValue>,
    pub throws: bool,
    pub overrides: bool,
    pub default_value: Option<&'a str>,
}

pub fn jsdoc(doc: &grammar::InfoElements, info: &grammar::InfoAttrs) -> Result<String, String> {
    let doc = Doc {
        doc,
        info,
        parameters: None,
        returns: None,
        throws: false,
        overrides: false,
        default_value: None,
    };

    doc.render()
}

impl Doc<'_> {
    pub fn is_empty(&self) -> bool {
        self.doc.doc_text.is_none()
            && self.parameters.is_none()
            && !self.throws
            && !self.overrides
            && self.default_value.is_none()
    }

    pub fn render(&self) -> Result<String, String> {
        if self.is_empty() {
            return Ok("".to_owned());
        }

        let text_lines: Vec<String> = self
            .doc
            .doc_text
            .as_ref()
            .map_or_else(Vec::new, |text| text.lines().map(fmt).collect());

        let deprecated_text: Option<String> = self.doc.doc_deprecated.as_deref().map(fmt);

        let parameters = gtype::filter_parameters(self.parameters, self.returns);

        let in_parameters: Vec<DocParameter> = parameters
            .iter()
            .filter(|p| matches!(p.direction.as_deref(), None | Some("in")))
            .map(|p| DocParameter {
                name: &p.name,
                text: p.doc.doc_text.as_deref().map(fmt).unwrap_or_default(),
            })
            .collect();

        let out_parameters: Vec<String> = self
            .returns
            .as_ref()
            .and_then(|ret| ret.doc.doc_text.as_deref())
            .into_iter()
            .chain(
                parameters
                    .iter()
                    .filter(|p| matches!(p.direction.as_deref(), Some("out" | "inout")))
                    .filter_map(|p| p.doc.doc_text.as_deref()),
            )
            .map(fmt)
            .collect();

        let experimental = matches!(self.info.stability.as_deref(), Some("Unstable"));

        let env = minijinja::Environment::new();

        let ctx = minijinja::context! {
            text_lines => text_lines,
            throws => self.throws,
            overrides => self.overrides,
            since => self.info.version,
            deprecated => &self.info.deprecated,
            deprecated_since => &self.info.deprecated_version,
            deprecated_text => deprecated_text,
            experimental => experimental,
            default_value => &self.default_value,
            parameters => in_parameters,
            returns => out_parameters.join(", "),
        };

        env.render_str(TEMPLATE, ctx)
            .map_err(|err| format!("failed to render jsdoc: error: {:?}", err))
    }
}
