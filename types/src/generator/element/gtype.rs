use crate::grammar::{AnyType, Parameter, Parameters, ReturnValue};

pub fn filter_parameters<'a>(
    params: Option<&'a Parameters>,
    returns: Option<&'a ReturnValue>,
) -> Vec<&'a Parameter> {
    let params = match params {
        Some(p) => &p.parameters,
        None => return Vec::new(),
    };

    let mut remove = vec![false; params.len()];
    let mut result = Vec::new();

    if let Some(ret) = returns
        && let Some(AnyType::Array(t)) = &ret.gtype
        && let Some(length) = t.length
        && let Ok(i) = usize::try_from(length)
    {
        remove[i] = true;
    }

    for param in params.iter() {
        if let Some(destroy) = param.destroy
            && let Ok(i) = usize::try_from(destroy)
        {
            remove[i] = true;
        }
        if let Some(closure) = param.closure
            && let Ok(i) = usize::try_from(closure)
        {
            remove[i] = true;
        }
        if let Some(AnyType::Array(t)) = &param.gtype
            && let Some(length) = t.length
            && let Ok(i) = usize::try_from(length)
        {
            remove[i] = true;
        }
    }

    for (i, param) in params.iter().enumerate() {
        if !remove[i] {
            result.push(param);
        }
    }

    result
}

fn resolve_primitive(name: &str) -> Result<String, String> {
    match name {
        "GType" => Ok("GObject.GType".to_string()),
        "gunichar" | "filename" | "utf8" => Ok("string".to_string()),
        "void" | "none" => Ok("void".to_string()),
        "uint" | "int" | "uint8" | "int8" | "uint16" | "int16" | "uint32" | "int32" | "int64"
        | "uint64" | "double" | "long" | "long double" | "float" | "gshort" | "guint32"
        | "guint16" | "gint16" | "gint8" | "gint32" | "gushort" | "gfloat" | "gchar" | "guint"
        | "glong" | "gulong" | "gint" | "guint8" | "guint64" | "gint64" | "gdouble" | "gssize"
        | "gsize" | "time_t" | "uid_t" | "pid_t" | "ulong" => Ok("number".to_string()),
        "gboolean" => Ok("boolean".to_string()),
        "object" => Ok("object".to_string()),
        "gpointer" | "gintptr" | "guintptr" => Ok("never".to_string()),
        t if t.chars().next().is_some_and(|c| c.is_ascii_digit()) => {
            // TODO:
            Ok(format!("_{t}"))
        }
        t if t.chars().next().is_some_and(|c| c.is_uppercase()) || t.contains(".") => {
            Ok(t.to_string())
        }
        t => {
            // TODO:
            if t.ends_with("_t") || t.starts_with("_") {
                Ok("never".to_string())
            } else {
                Err(format!("failed to resolve type '{t}'").into())
            }
        }
    }
}

pub fn resolve_anytype(input: &AnyType) -> Result<String, String> {
    match input {
        AnyType::Type(t) => {
            let name = t.name.as_ref().ok_or("missing type name")?;

            // NOTE: I'm not entirely sure if this is correct
            match name.as_str() {
                "GLib.List" | "GLib.SList" => {
                    if let Some(g) = t.elements.first() {
                        Ok(format!("{}[]", resolve_anytype(g)?))
                    } else {
                        Ok(name.clone())
                    }
                }
                "GLib.HashTable" => {
                    let mut i = t.elements.iter();
                    if let Some(k) = i.next()
                        && let Some(v) = i.next()
                    {
                        Ok(format!(
                            "Record<{}, {}>",
                            resolve_anytype(k)?,
                            resolve_anytype(v)?
                        ))
                    } else {
                        Ok(name.clone())
                    }
                }
                _ if !t.elements.is_empty() => {
                    Err(format!("unhandled generic type: {}", name).into())
                }
                _ => resolve_primitive(&name),
            }
        }
        AnyType::Array(arr) => {
            let ele = arr.elements.first().ok_or("missing array element")?;

            if arr.elements.len() > 1 {
                return Err(format!("unhandled second element of array type").into());
            }

            if let AnyType::Type(item) = &**ele
                && let Some(name) = item.name.as_ref()
            {
                match name.as_str() {
                    "gint8" | "guint8" => return Ok("Uint8Array".to_string()),
                    "gunichar" => return Ok("string".to_string()),
                    _ => (),
                }
            }

            Ok(format!("{}[]", resolve_anytype(ele)?))
        }
    }
}

pub fn tstype(anytype: Option<&AnyType>, nullable: bool) -> Result<String, String> {
    let tstype = resolve_anytype(anytype.ok_or("Missing type".to_owned())?)?;
    if nullable {
        Ok(format!("{tstype} | null"))
    } else {
        Ok(tstype)
    }
}
