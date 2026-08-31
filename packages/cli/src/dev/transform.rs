use super::ModuleTracker;
use oxc::allocator::{Allocator, ArenaVec, TakeIn};
use oxc::ast::ast::*;
use oxc::ast::builder::AstBuilder;
use oxc::codegen::{Codegen, CodegenOptions};
use oxc::parser::Parser;
use oxc::span::{SPAN, SourceType};
use oxc::str::Ident;
use std::path::Path;

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

/// Creates `$$register(import.meta.url, "name", expr)`
fn wrap_with_register<'a>(
    ast: &AstBuilder<'a>,
    name: Ident<'a>,
    expr: Expression<'a>,
) -> Expression<'a> {
    // $$register
    let callee = Expression::new_identifier(SPAN, "$$registerComponent", ast);

    // import.meta
    let import_meta = Expression::new_import_meta(SPAN, ast);

    // import.meta.url
    let import_meta_url = Expression::new_static_member_expression(
        SPAN,
        import_meta,
        IdentifierName::new(SPAN, "url", ast),
        false,
        ast,
    );

    // "name"
    let name_str = Expression::new_string_literal(SPAN, name, None, ast);

    // arguments: [import.meta.url, "name", expr]
    let args = ArenaVec::from_array_in(
        [
            Argument::from(import_meta_url),
            Argument::from(name_str),
            Argument::from(expr),
        ],
        ast,
    );

    Expression::new_call_expression(SPAN, callee, None, args, false, ast)
}

pub fn transform_code(source: &str, id: &str) -> Result<String, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(id).map_err(|err| err.to_string())?;

    let ret = Parser::new(&allocator, source, source_type).parse();

    if !ret.diagnostics.is_empty() {
        return Err(format!("parse errors: {}", ret.diagnostics.len()));
    }

    let mut program = ret.program;
    let ast = AstBuilder::new(&allocator);

    for statement in program.body.iter_mut() {
        match statement {
            Statement::ExportDeclaration(export_decl) => {
                // `export const Name = () => {}` -> `export const Name = $$register(...)`
                if let Declaration::VariableDeclaration(var_decl) = &mut export_decl.declaration {
                    for declarator in var_decl.declarations.iter_mut() {
                        if let BindingPattern::BindingIdentifier(ident) = &declarator.id
                            && is_component_name(ident.name.as_str())
                            && let name = ident.name
                            && let Some(init) = declarator.init.take()
                        {
                            declarator.init = Some(wrap_with_register(&ast, name, init));
                        }
                    }
                }

                // `export function Name() {}` -> `export const Name = $$register(...)`
                if let Declaration::FunctionDeclaration(func) = &export_decl.declaration
                    && let Some(id) = &func.id
                {
                    let name = id.name;
                    if is_component_name(name.as_str()) {
                        let func = match export_decl.declaration.take_in(&ast) {
                            Declaration::FunctionDeclaration(f) => f,
                            _ => unreachable!(),
                        };

                        let func_expr = Expression::FunctionExpression(func);
                        let wrapped = wrap_with_register(&ast, name, func_expr);

                        let binding = BindingPattern::new_binding_identifier(SPAN, name, &ast);

                        let declarator =
                            VariableDeclarator::new(SPAN, binding, None, Some(wrapped), false, &ast);

                        export_decl.declaration = Declaration::new_variable_declaration(
                            SPAN,
                            VariableDeclarationKind::Const,
                            ArenaVec::from_array_in([declarator], &ast),
                            false,
                            &ast,
                        );
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
                        let func = export_default.declaration.take_in(&ast);

                        if let ExportDefaultDeclarationKind::FunctionDeclaration(func) = func {
                            let func_expr = Expression::FunctionExpression(func);
                            let wrapped =
                                wrap_with_register(&ast, Ident::from("default"), func_expr);
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
    tracker: &ModuleTracker,
) -> Result<String, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::mjs();

    let ret = Parser::new(&allocator, source, source_type).parse();

    if !ret.diagnostics.is_empty() {
        return Err(format!("parse errors: {}", ret.diagnostics.len()));
    }

    let mut program = ret.program;
    let ast = AstBuilder::new(&allocator);

    // Collect transforms first to handle lifetime issues
    let mut transforms: Vec<(usize, String)> = Vec::new();

    for (idx, statement) in program.body.iter().enumerate() {
        match statement {
            Statement::ImportDeclaration(import_decl) => {
                let import_source = import_decl.source.value.as_str();
                if let Some(resolved) = resolve_import_path(chunk_filename, import_source) {
                    transforms.push((
                        idx,
                        add_version_query(import_source, tracker.get_version(&resolved)),
                    ));
                }
            }
            Statement::ExportFromDeclaration(export_decl) => {
                let import_source = export_decl.source.value.as_str();
                if let Some(resolved) = resolve_import_path(chunk_filename, import_source) {
                    transforms.push((
                        idx,
                        add_version_query(import_source, tracker.get_version(&resolved)),
                    ));
                }
            }
            Statement::ExportAllDeclaration(export_all) => {
                let import_source = export_all.source.value.as_str();
                if let Some(resolved) = resolve_import_path(chunk_filename, import_source) {
                    transforms.push((
                        idx,
                        add_version_query(import_source, tracker.get_version(&resolved)),
                    ));
                }
            }
            _ => {}
        }
    }

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
                import_decl.source = StringLiteral::new(SPAN, versioned, None, &ast);
            }
            Statement::ExportFromDeclaration(export_decl) => {
                export_decl.source = StringLiteral::new(SPAN, versioned, None, &ast);
            }
            Statement::ExportAllDeclaration(export_all) => {
                export_all.source = StringLiteral::new(SPAN, versioned, None, &ast);
            }
            _ => {}
        }
    }

    let printed = Codegen::new()
        .with_options(CodegenOptions::default())
        .build(&program);

    Ok(printed.code)
}
