use super::ModuleVersions;
use oxc::allocator::Allocator;
use oxc::ast::AstBuilder;
use oxc::ast::ast::*;
use oxc::codegen::{Codegen, CodegenOptions};
use oxc::parser::Parser;
use oxc::span::{Atom, SPAN, SourceType};

fn is_component_name(name: &str) -> bool {
    name.chars().next().is_some_and(|c| c.is_ascii_uppercase())
}

use std::path::Path;

/// Check if an import source is a relative JS path
fn is_relative_js_import(source: &str) -> bool {
    (source.starts_with("./") || source.starts_with("../")) && source.ends_with(".js")
}

/// Resolve a relative import path to an output filename
/// e.g., chunk_filename="test/Comp/index.js", import_source="./Test.js" -> "test/Comp/Test.js"
fn resolve_import_path(chunk_filename: &str, import_source: &str) -> Option<String> {
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

/// Add version query parameter to import source
fn add_version_query(source: &str, version: u64) -> String {
    if source.contains('?') {
        format!("{}&v={}", source, version)
    } else {
        format!("{}?v={}", source, version)
    }
}

/// Creates `$$register(import.meta.url, "name", expr)`
fn wrap_with_register<'a>(
    ast: AstBuilder<'a>,
    name: Atom<'a>,
    expr: Expression<'a>,
) -> Expression<'a> {
    // $$register
    let callee = ast.expression_identifier(SPAN, "$$registerComponent");

    // import.meta
    let import_meta = ast.expression_meta_property(
        SPAN,
        ast.identifier_name(SPAN, "import"),
        ast.identifier_name(SPAN, "meta"),
    );

    // import.meta.url
    let import_meta_url = Expression::StaticMemberExpression(ast.alloc_static_member_expression(
        SPAN,
        import_meta,
        ast.identifier_name(SPAN, "url"),
        false,
    ));

    // "name"
    let name_str = ast.expression_string_literal(SPAN, name, None);

    // arguments: [import.meta.url, "name", expr]
    let args = ast.vec_from_array([
        Argument::from(import_meta_url),
        Argument::from(name_str),
        Argument::from(expr),
    ]);

    ast.expression_call(
        SPAN,
        callee,
        None::<TSTypeParameterInstantiation>,
        args,
        false,
    )
}

pub fn transform_code(source: &str, id: &str) -> Result<String, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(id).map_err(|err| err.to_string())?;

    let ret = Parser::new(&allocator, source, source_type).parse();

    if !ret.errors.is_empty() {
        return Err(format!("parse errors: {}", ret.errors.len()));
    }

    let mut program = ret.program;
    let ast = AstBuilder::new(&allocator);

    for statement in program.body.iter_mut() {
        match statement {
            Statement::ExportNamedDeclaration(export_decl) => {
                // `export const Name = () => {}` -> `export const Name = $$register(...)`
                if let Some(Declaration::VariableDeclaration(var_decl)) =
                    &mut export_decl.declaration
                {
                    for declarator in var_decl.declarations.iter_mut() {
                        if let BindingPattern::BindingIdentifier(ident) = &declarator.id
                            && is_component_name(ident.name.as_str())
                            && let Some(init) = declarator.init.take()
                        {
                            declarator.init =
                                Some(wrap_with_register(ast, ident.name.into(), init));
                        }
                    }
                }

                // `export function Name() {}` -> `export const Name = $$register(...)`
                if let Some(Declaration::FunctionDeclaration(func)) = &export_decl.declaration
                    && let Some(id) = &func.id
                {
                    let name = id.name;
                    if is_component_name(name.as_str()) {
                        let func = match export_decl.declaration.take() {
                            Some(Declaration::FunctionDeclaration(f)) => f,
                            _ => unreachable!(),
                        };

                        let func_expr = Expression::FunctionExpression(ast.alloc(func.unbox()));
                        let wrapped = wrap_with_register(ast, name.into(), func_expr);

                        let binding = BindingPattern::BindingIdentifier(
                            ast.alloc_binding_identifier(SPAN, name),
                        );

                        let declarator = ast.variable_declarator(
                            SPAN,
                            VariableDeclarationKind::Const,
                            binding,
                            None::<TSTypeAnnotation>,
                            Some(wrapped),
                            false,
                        );

                        let var_decl = ast.variable_declaration(
                            SPAN,
                            VariableDeclarationKind::Const,
                            ast.vec1(declarator),
                            false,
                        );

                        export_decl.declaration =
                            Some(Declaration::VariableDeclaration(ast.alloc(var_decl)));
                    }
                }
            }

            // `export default function Name() {}` -> `export default $$register(...)`
            Statement::ExportDefaultDeclaration(export_default) => {
                if let ExportDefaultDeclarationKind::FunctionDeclaration(func) =
                    &export_default.declaration
                {
                    let has_component_name = func
                        .id
                        .as_ref()
                        .is_some_and(|id| is_component_name(id.name.as_str()));

                    if has_component_name {
                        let func = std::mem::replace(
                            &mut export_default.declaration,
                            ExportDefaultDeclarationKind::NullLiteral(ast.alloc_null_literal(SPAN)),
                        );

                        if let ExportDefaultDeclarationKind::FunctionDeclaration(func) = func {
                            let func_expr = Expression::FunctionExpression(ast.alloc(func.unbox()));
                            let wrapped = wrap_with_register(ast, Atom::from("default"), func_expr);
                            export_default.declaration =
                                ExportDefaultDeclarationKind::from(wrapped);
                        }
                    }
                }
            }

            _ => (),
        }
    }

    let printed = Codegen::new()
        .with_options(CodegenOptions::default())
        .build(&program);

    Ok(printed.code)
}

/// Transform import statements in bundled JS to include version query parameters.
/// This runs on the final JS output after rolldown has resolved all modules.
/// `chunk_filename` is the output path of the current chunk (e.g., "test/Comp/index.js")
pub fn transform_imports(
    source: &str,
    chunk_filename: &str,
    versions: &ModuleVersions,
) -> Result<String, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::mjs();

    let ret = Parser::new(&allocator, source, source_type).parse();

    if !ret.errors.is_empty() {
        return Err(format!("parse errors: {}", ret.errors.len()));
    }

    let mut program = ret.program;
    let ast = AstBuilder::new(&allocator);

    // Collect transforms first to handle lifetime issues
    let mut transforms: Vec<(usize, String)> = Vec::new();

    for (idx, statement) in program.body.iter().enumerate() {
        match statement {
            Statement::ImportDeclaration(import_decl) => {
                let import_source = import_decl.source.value.as_str();
                if is_relative_js_import(import_source)
                    && let Some(resolved) = resolve_import_path(chunk_filename, import_source)
                {
                    let version = versions.get(&resolved);
                    if version > 0 {
                        transforms.push((idx, add_version_query(import_source, version)));
                    }
                }
            }
            Statement::ExportNamedDeclaration(export_decl) => {
                if let Some(ref src) = export_decl.source {
                    let import_source = src.value.as_str();
                    if is_relative_js_import(import_source)
                        && let Some(resolved) = resolve_import_path(chunk_filename, import_source)
                    {
                        let version = versions.get(&resolved);
                        if version > 0 {
                            transforms.push((idx, add_version_query(import_source, version)));
                        }
                    }
                }
            }
            Statement::ExportAllDeclaration(export_all) => {
                let import_source = export_all.source.value.as_str();
                if is_relative_js_import(import_source)
                    && let Some(resolved) = resolve_import_path(chunk_filename, import_source)
                {
                    let version = versions.get(&resolved);
                    if version > 0 {
                        transforms.push((idx, add_version_query(import_source, version)));
                    }
                }
            }
            _ => {}
        }
    }

    // If no transforms needed, return original
    if transforms.is_empty() {
        return Ok(source.to_string());
    }

    // Allocate versioned strings in arena
    let versioned_strings: Vec<&str> = transforms
        .iter()
        .map(|(_, s)| allocator.alloc_str(s) as &str)
        .collect();

    // Apply transforms
    for (i, (idx, _)) in transforms.iter().enumerate() {
        let versioned = versioned_strings[i];
        match &mut program.body[*idx] {
            Statement::ImportDeclaration(import_decl) => {
                import_decl.source = ast.string_literal(SPAN, versioned, None);
            }
            Statement::ExportNamedDeclaration(export_decl) => {
                if let Some(ref mut src) = export_decl.source {
                    *src = ast.string_literal(SPAN, versioned, None);
                }
            }
            Statement::ExportAllDeclaration(export_all) => {
                export_all.source = ast.string_literal(SPAN, versioned, None);
            }
            _ => {}
        }
    }

    let printed = Codegen::new()
        .with_options(CodegenOptions::default())
        .build(&program);

    Ok(printed.code)
}
