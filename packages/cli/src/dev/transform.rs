use super::ModuleTracker;
use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc::parser::Parser;
use oxc::span::{GetSpan, SourceType, Span};
use std::path::Path;
use string_wizard::MagicString;

fn is_component_name(name: &str) -> bool {
    name.chars().next().is_some_and(|c| c.is_ascii_uppercase())
}

fn resolve_import_path(chunk_filename: &str, import_source: &str) -> Option<String> {
    if !import_source.starts_with("./") && !import_source.starts_with("../")
        || !import_source.ends_with(".js")
    {
        return None;
    }

    let chunk_path = Path::new(chunk_filename);
    let chunk_dir = chunk_path.parent()?;
    let resolved = chunk_dir.join(import_source);

    // Normalize the path (resolve . and ..)
    let mut parts: Vec<&str> = Vec::new();
    for component in resolved.components() {
        match component {
            std::path::Component::ParentDir => {
                parts.pop();
            }
            std::path::Component::CurDir => {}
            std::path::Component::Normal(s) => {
                parts.push(s.to_str()?);
            }
            _ => {}
        }
    }

    Some(parts.join("/"))
}

fn add_version_query(source: &str, version: u64) -> String {
    if version > 0 {
        if source.contains('?') {
            format!("{}&v={}", source, version)
        } else {
            format!("{}?v={}", source, version)
        }
    } else {
        source.to_string()
    }
}

/// Wraps exported components with `$$registerComponent(import.meta.url, "Name", ...)`.
///
/// The wrappers are inserted into the original source instead of reprinting the AST,
/// so that positions stay intact and a source map can be generated for the edits.
/// Returns `None` when there is nothing to wrap.
pub fn transform_code<'a>(source: &'a str, id: &str) -> Result<Option<MagicString<'a>>, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(id).map_err(|err| err.to_string())?;

    let ret = Parser::new(&allocator, source, source_type).parse();

    if !ret.diagnostics.is_empty() {
        return Err(format!("parse errors: {}", ret.diagnostics.len()));
    }

    let mut code = MagicString::new(source);
    let mut wrap = |name: &str, span: Span, prefix: String| -> Result<(), String> {
        code.prepend_right(
            span.start,
            format!("{prefix}$$registerComponent(import.meta.url, \"{name}\", "),
        )?;
        code.append_left(span.end, ")")?;
        Ok(())
    };

    for statement in ret.program.body.iter() {
        match statement {
            Statement::ExportDeclaration(export_decl) => match &export_decl.declaration {
                // `export const Name = () => {}` -> `export const Name = $$register(...)`
                Declaration::VariableDeclaration(var_decl) => {
                    for declarator in var_decl.declarations.iter() {
                        if let BindingPattern::BindingIdentifier(ident) = &declarator.id
                            && is_component_name(ident.name.as_str())
                            && let Some(init) = &declarator.init
                        {
                            wrap(ident.name.as_str(), init.span(), String::new())?;
                        }
                    }
                }

                // `export function Name() {}` -> `export const Name = $$register(...)`
                Declaration::FunctionDeclaration(func) => {
                    if let Some(id) = &func.id
                        && is_component_name(id.name.as_str())
                    {
                        let name = id.name.as_str();
                        wrap(name, func.span, format!("const {name} = "))?;
                    }
                }

                _ => (),
            },

            // `export default function Name() {}` -> `export default $$register(...)`
            Statement::ExportDefaultDeclaration(export_default) => {
                if let ExportDefaultDeclarationKind::FunctionDeclaration(func) =
                    &export_default.declaration
                    && func
                        .id
                        .as_ref()
                        .is_some_and(|id| is_component_name(id.name.as_str()))
                {
                    wrap("default", func.span, String::new())?;
                }
            }

            _ => (),
        }
    }

    Ok(code.has_changed().then_some(code))
}

/// Transform import statements in bundled JS to include version query parameters.
/// This runs on the final JS output after rolldown has resolved all modules.
/// `chunk_filename` is the output path of the current chunk (e.g., "test/Comp/index.js")
/// Returns `None` when no import has to change.
pub fn transform_imports<'a>(
    source: &'a str,
    chunk_filename: &str,
    tracker: &ModuleTracker,
) -> Result<Option<MagicString<'a>>, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::mjs();

    let ret = Parser::new(&allocator, source, source_type).parse();

    if !ret.diagnostics.is_empty() {
        return Err(format!("parse errors: {}", ret.diagnostics.len()));
    }

    let mut code = MagicString::new(source);

    for statement in ret.program.body.iter() {
        let literal = match statement {
            Statement::ImportDeclaration(import_decl) => &import_decl.source,
            Statement::ExportFromDeclaration(export_decl) => &export_decl.source,
            Statement::ExportAllDeclaration(export_all) => &export_all.source,
            _ => continue,
        };

        let import_source = literal.value.as_str();
        if let Some(resolved) = resolve_import_path(chunk_filename, import_source) {
            let versioned = add_version_query(import_source, tracker.get_version(&resolved));
            if versioned != import_source {
                // keep the quotes of the string literal
                code.update(literal.span.start + 1, literal.span.end - 1, versioned)?;
            }
        }
    }

    Ok(code.has_changed().then_some(code))
}

#[cfg(test)]
mod tests {
    use super::transform_code;

    #[test]
    fn wraps_exported_components() {
        let source = "export const App = () => <box />\n\
            export function Counter() {\n    return <box />\n}\n\
            export default function Main() {}\n\
            export const helper = () => 1\n";

        let code = transform_code(source, "app.tsx")
            .unwrap()
            .unwrap()
            .to_string();

        assert_eq!(
            code,
            "export const App = $$registerComponent(import.meta.url, \"App\", () => <box />)\n\
            export const Counter = $$registerComponent(import.meta.url, \"Counter\", function Counter() {\n    return <box />\n})\n\
            export default $$registerComponent(import.meta.url, \"default\", function Main() {})\n\
            export const helper = () => 1\n"
        );
    }

    #[test]
    fn keeps_line_numbers() {
        let source = "import { x } from \"./x\"\n\n\
            // comment\n\
            export function App(): JSX.Element {\n\n    return (\n        <box>\n            <Broken />\n        </box>\n    )\n}\n";

        let code = transform_code(source, "app.tsx")
            .unwrap()
            .unwrap()
            .to_string();
        let line_of = |code: &str, needle: &str| code.lines().position(|l| l.contains(needle));

        assert_eq!(code.lines().count(), source.lines().count());
        assert_eq!(line_of(&code, "<Broken />"), line_of(source, "<Broken />"));
    }

    #[test]
    fn skips_modules_without_components() {
        let source = "export const helper = () => 1\n";
        assert!(transform_code(source, "util.ts").unwrap().is_none());
    }
}
