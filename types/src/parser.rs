use crate::grammar::*;
use quick_xml::events::{BytesStart, Event};
use std::{collections, error};

type Err = Box<dyn error::Error>;
type Attrs = collections::HashMap<String, String>;

fn attributes(e: &BytesStart) -> Result<Attrs, Err> {
    let mut map = collections::HashMap::new();

    for attr in e.attributes() {
        match attr {
            Err(_) => todo!(),
            Ok(a) => {
                let key = String::from_utf8(a.key.into_inner().to_vec())?;
                let value = a.unescape_value()?.into_owned();
                map.insert(key, value);
            }
        }
    }

    Ok(map)
}

fn get_attr(attrs: &Attrs, key: &str) -> Result<String, Err> {
    let res = attrs
        .get(key)
        .ok_or_else(|| format!("failed to read key '{key}'"))?
        .to_owned();
    Ok(res)
}

fn get_boolean_attr(attrs: &Attrs, key: &str) -> Option<bool> {
    match get_attr(attrs, key).ok() {
        Some(s) if s == "1" => Some(true),
        Some(s) if s == "0" => Some(false),
        _ => None,
    }
}

fn get_int_attr(attrs: &Attrs, key: &str) -> Option<Result<i32, std::num::ParseIntError>> {
    get_attr(attrs, key).ok().map(|s| s.parse::<i32>())
}

fn get_info(attrs: &Attrs) -> InfoAttrs {
    InfoAttrs {
        introspectable: get_boolean_attr(attrs, "introspectable").unwrap_or(true),
        deprecated: get_boolean_attr(attrs, "deprecated").unwrap_or(false),
        deprecated_version: get_attr(attrs, "deprecated-version").ok(),
        version: get_attr(attrs, "version").ok(),
        stability: get_attr(attrs, "stability").ok(),
    }
}

fn get_callable_attrs(attrs: &Attrs) -> Result<CallableAttrs, Err> {
    Ok(CallableAttrs {
        info: get_info(attrs),
        name: get_attr(attrs, "name")?,
        c_identifier: get_attr(attrs, "c:identifier").ok(),
        shadowed_by: get_attr(attrs, "shadowed-by").ok(),
        shadows: get_attr(attrs, "shadows").ok(),
        throws: get_boolean_attr(attrs, "throws").unwrap_or(false),
        sync_name: get_attr(attrs, "glib:sync-func").ok(),
        async_name: get_attr(attrs, "glib:async-func").ok(),
        finish_name: get_attr(attrs, "glib:finish-func").ok(),
    })
}

impl InfoElements {
    fn new() -> Self {
        InfoElements {
            attributes: Vec::new(),
            doc_text: None,
            doc_deprecated: None,
        }
    }
}

impl Repository {
    fn end(&mut self, element: Element) {
        match element {
            Element::Namespace(namespace) => self.namespaces.push(namespace),
            Element::Include(include) => self.includes.push(include),
            _ => (),
        }
    }
}

impl Namespace {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            name: get_attr(attrs, "name")?,
            version: get_attr(attrs, "version")?,
            c_symbol_prefixes: get_attr(attrs, "c:symbol-prefixes").ok(),
            aliases: Vec::new(),
            classes: Vec::new(),
            interfaces: Vec::new(),
            records: Vec::new(),
            enums: Vec::new(),
            functions: Vec::new(),
            unions: Vec::new(),
            bitfields: Vec::new(),
            callbacks: Vec::new(),
            constants: Vec::new(),
            annotations: Vec::new(),
            doc_sections: Vec::new(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Alias(alias) => self.aliases.push(alias),
            Element::Class(class) => self.classes.push(class),
            Element::Interface(interface) => self.interfaces.push(interface),
            Element::Record(record) => self.records.push(record),
            Element::Enumeration(enumeration) => self.enums.push(enumeration),
            Element::Function(function) => self.functions.push(function),
            Element::Union(union) => self.unions.push(union),
            Element::BitField(bitfield) => self.bitfields.push(bitfield),
            Element::Callback(cb) => self.callbacks.push(cb),
            Element::Constant(cnst) => self.constants.push(cnst),
            Element::Attribute(attr) => self.annotations.push(attr),
            Element::DocSection(section) => self.doc_sections.push(section),
            _ => (),
        }
    }
}

impl Alias {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name")?,
            gtype: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Array(t) => self.gtype = Some(AnyType::Array(t)),
            Element::Type(t) => self.gtype = Some(AnyType::Type(t)),
            _ => (),
        }
    }
}

impl Interface {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name")?,
            type_name: get_attr(attrs, "glib:type-name")?,
            prerequisites: Vec::new(),
            implements: Vec::new(),
            functions: Vec::new(),
            constructors: Vec::new(),
            methods: Vec::new(),
            virtual_methods: Vec::new(),
            fields: Vec::new(),
            properties: Vec::new(),
            signals: Vec::new(),
            callbacks: Vec::new(),
            constants: Vec::new(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Implements(implements) => self.implements.push(implements),
            Element::Property(prop) => self.properties.push(prop),
            Element::Signal(signal) => self.signals.push(signal),
            Element::Prerequisite(preq) => self.prerequisites.push(preq),
            Element::Method(method) => self.methods.push(method),
            Element::Function(function) => self.functions.push(function),
            Element::Constructor(ctor) => self.constructors.push(ctor),
            Element::VirtualMethod(vfunc) => self.virtual_methods.push(vfunc),
            _ => (),
        }
    }
}

impl Class {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name")?,
            type_name: get_attr(attrs, "glib:type-name")?,
            parent: get_attr(attrs, "parent").ok(),
            is_abstract: get_boolean_attr(attrs, "abstract").unwrap_or(false),
            is_final: get_boolean_attr(attrs, "final").unwrap_or(false),
            fundamental: get_boolean_attr(attrs, "glib:fundamental").unwrap_or(false),
            implements: Vec::new(),
            constructors: Vec::new(),
            methods: Vec::new(),
            functions: Vec::new(),
            virtual_methods: Vec::new(),
            fields: Vec::new(),
            properties: Vec::new(),
            signals: Vec::new(),
            constants: Vec::new(),
            callbacks: Vec::new(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Implements(implements) => self.implements.push(implements),
            Element::Constructor(ctor) => self.constructors.push(ctor),
            Element::Property(prop) => self.properties.push(prop),
            Element::Signal(signal) => self.signals.push(signal),
            Element::Method(method) => self.methods.push(method),
            Element::Function(function) => self.functions.push(function),
            Element::VirtualMethod(vfunc) => self.virtual_methods.push(vfunc),
            _ => (),
        }
    }
}

impl Record {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name").ok(),
            gtype_struct_for: get_attr(attrs, "glib:is-gtype-struct-for").ok(),
            type_name: get_attr(attrs, "glib:type-name").ok(),
            opaque: get_boolean_attr(attrs, "opaque"),
            pointer: get_boolean_attr(attrs, "pointer"),
            fields: Vec::new(),
            functions: Vec::new(),
            methods: Vec::new(),
            constructors: Vec::new(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Field(field) => self.fields.push(field),
            Element::Function(function) => self.functions.push(function),
            Element::Method(method) => self.methods.push(method),
            Element::Constructor(ctor) => self.constructors.push(ctor),
            _ => (),
        }
    }
}

impl Constant {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name")?,
            value: get_attr(attrs, "value")?,
            gtype: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Array(t) => self.gtype = Some(AnyType::Array(t)),
            Element::Type(t) => self.gtype = Some(AnyType::Type(t)),
            _ => (),
        }
    }
}

impl Property {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            name: get_attr(attrs, "name")?,
            writable: get_boolean_attr(attrs, "writable").unwrap_or(false),
            readable: get_boolean_attr(attrs, "readable").unwrap_or(true),
            construct: get_boolean_attr(attrs, "construct").unwrap_or(false),
            construct_only: get_boolean_attr(attrs, "construct-only").unwrap_or(false),
            default_value: get_attr(attrs, "default-value").ok(),
            setter: get_attr(attrs, "setter").ok(),
            getter: get_attr(attrs, "getter").ok(),
            doc: InfoElements::new(),
            gtype: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Array(t) => self.gtype = Some(AnyType::Array(t)),
            Element::Type(t) => self.gtype = Some(AnyType::Type(t)),
            _ => (),
        }
    }
}

impl Signal {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            name: get_attr(attrs, "name")?,
            doc: InfoElements::new(),
            detailed: get_boolean_attr(attrs, "detailed").unwrap_or(false),
            when: get_attr(attrs, "when").ok(),
            action: get_boolean_attr(attrs, "action").unwrap_or(false),
            no_hooks: get_boolean_attr(attrs, "no-hooks"),
            no_recurse: get_boolean_attr(attrs, "no-recurse"),
            parameters: None,
            returns: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Parameters(params) => self.parameters = Some(params),
            Element::ReturnValue(ret) => self.returns = Some(ret),
            _ => (),
        }
    }
}

impl Field {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name")?,
            writable: get_boolean_attr(attrs, "writable"),
            readable: get_boolean_attr(attrs, "readable"),
            private: get_boolean_attr(attrs, "private"),
            bits: get_int_attr(attrs, "bits").and_then(|i| i.ok()),
            gtype: None,
            callback: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Array(t) => self.gtype = Some(AnyType::Array(t)),
            Element::Type(t) => self.gtype = Some(AnyType::Type(t)),
            _ => (),
        }
    }
}

impl Callback {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name")?,
            throws: get_boolean_attr(attrs, "throws").unwrap_or(false),
            parameters: None,
            returns: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Parameters(params) => self.parameters = Some(params),
            Element::ReturnValue(ret) => self.returns = Some(ret),
            _ => (),
        }
    }
}

impl Type {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            name: get_attr(attrs, "name").ok(),
            introspectable: get_boolean_attr(attrs, "introspectable").unwrap_or(true),
            doc: InfoElements::new(),
            elements: Vec::new(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Array(t) => self.elements.push(Box::new(AnyType::Array(t))),
            Element::Type(t) => self.elements.push(Box::new(AnyType::Type(t))),
            _ => (),
        }
    }
}

impl ArrayType {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            name: get_attr(attrs, "name").ok(),
            introspectable: get_boolean_attr(attrs, "introspectable").unwrap_or(true),
            zero_terminated: get_boolean_attr(attrs, "zero-terminated"),
            fixed_size: get_int_attr(attrs, "fixed-size").and_then(|r| r.ok()),
            length: get_int_attr(attrs, "length").and_then(|r| r.ok()),
            elements: Vec::new(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Array(t) => self.elements.push(Box::new(AnyType::Array(t))),
            Element::Type(t) => self.elements.push(Box::new(AnyType::Type(t))),
            _ => (),
        }
    }
}

impl Constructor {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            attrs: get_callable_attrs(attrs)?,
            doc: InfoElements::new(),
            parameters: None,
            returns: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Parameters(params) => self.parameters = Some(params),
            Element::ReturnValue(ret) => self.returns = Some(ret),
            _ => (),
        }
    }
}

impl Parameters {
    fn new() -> Result<Self, Err> {
        Ok(Self {
            instance: None,
            parameters: Vec::new(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::InstanceParameter(param) => self.instance = Some(param),
            Element::Parameter(param) => self.parameters.push(param),
            _ => (),
        }
    }
}

impl Parameter {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            name: get_attr(attrs, "name")?,
            nullable: get_boolean_attr(attrs, "nullable").unwrap_or(false),
            introspectable: get_boolean_attr(attrs, "introspectable").unwrap_or(true),
            closure: get_int_attr(attrs, "closure").and_then(|r| r.ok()),
            destroy: get_int_attr(attrs, "destroy").and_then(|r| r.ok()),
            scope: get_attr(attrs, "scope").ok(),
            direction: get_attr(attrs, "direction").ok(),
            caller_allocates: get_boolean_attr(attrs, "caller-allocates"),
            optional: get_boolean_attr(attrs, "optional").unwrap_or(false),
            skip: get_boolean_attr(attrs, "skip").unwrap_or(false),
            doc: InfoElements::new(),
            gtype: None,
            variadic: false,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::VarArgs(_) => self.variadic = true,
            Element::Array(t) => self.gtype = Some(AnyType::Array(t)),
            Element::Type(t) => self.gtype = Some(AnyType::Type(t)),
            _ => (),
        }
    }
}

impl InstanceParameter {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            doc: InfoElements::new(),
            name: get_attr(attrs, "name")?,
            nullable: get_boolean_attr(attrs, "nullable").unwrap_or(false),
            direction: get_attr(attrs, "direction").ok(),
            caller_allocates: get_boolean_attr(attrs, "caller-allocates"),
            gtype: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            _ => (),
        }
    }
}

impl ReturnValue {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            doc: InfoElements::new(),
            gtype: None,
            introspectable: get_boolean_attr(attrs, "introspectable").unwrap_or(true),
            nullable: get_boolean_attr(attrs, "nullable").unwrap_or(false),
            closure: get_int_attr(attrs, "destroy").and_then(|r| r.ok()),
            destroy: get_int_attr(attrs, "destroy").and_then(|r| r.ok()),
            scope: get_attr(attrs, "scope").ok(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Array(t) => self.gtype = Some(AnyType::Array(t)),
            Element::Type(t) => self.gtype = Some(AnyType::Type(t)),
            _ => (),
        }
    }
}

impl Function {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            attrs: get_callable_attrs(attrs)?,
            doc: InfoElements::new(),
            parameters: None,
            returns: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Parameters(params) => self.parameters = Some(params),
            Element::ReturnValue(ret) => self.returns = Some(ret),
            _ => (),
        }
    }
}

impl Method {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            attrs: get_callable_attrs(attrs)?,
            doc: InfoElements::new(),
            get_property: get_attr(attrs, "glib:get-property").ok(),
            set_property: get_attr(attrs, "glib:set-property").ok(),
            parameters: None,
            returns: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Parameters(params) => self.parameters = Some(params),
            Element::ReturnValue(ret) => self.returns = Some(ret),
            _ => (),
        }
    }
}

impl VirtualMethod {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            attrs: get_callable_attrs(attrs)?,
            doc: InfoElements::new(),
            parameters: None,
            returns: None,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Parameters(params) => self.parameters = Some(params),
            Element::ReturnValue(ret) => self.returns = Some(ret),
            _ => (),
        }
    }
}

impl Union {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name").ok(),
            type_name: get_attr(attrs, "glib:type-name").ok(),
            opaque: get_boolean_attr(attrs, "opaque"),
            pointer: get_boolean_attr(attrs, "pointer"),
            fields: Vec::new(),
            functions: Vec::new(),
            methods: Vec::new(),
            constructors: Vec::new(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Field(field) => self.fields.push(field),
            Element::Function(function) => self.functions.push(function),
            Element::Method(method) => self.methods.push(method),
            Element::Constructor(ctor) => self.constructors.push(ctor),
            _ => (),
        }
    }
}

impl BitField {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name")?,
            type_name: get_attr(attrs, "glib:type-name").ok(),
            members: Vec::new(),
            functions: Vec::new(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Member(member) => self.members.push(member),
            Element::Function(function) => self.functions.push(function),
            _ => (),
        }
    }
}

impl Enumeration {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name")?,
            type_name: get_attr(attrs, "glib:type-name").ok(),
            error_domain: get_attr(attrs, "glib:error-domain").ok(),
            members: Vec::new(),
            functions: Vec::new(),
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            Element::Member(member) => self.members.push(member),
            Element::Function(function) => self.functions.push(function),
            _ => (),
        }
    }
}

impl Member {
    fn new(attrs: &Attrs) -> Result<Self, Err> {
        Ok(Self {
            info: get_info(attrs),
            doc: InfoElements::new(),
            name: get_attr(attrs, "name")?,
            value: get_attr(attrs, "value")?,
        })
    }

    fn end(&mut self, element: Element) {
        match element {
            Element::Attribute(attr) => self.doc.attributes.push(attr),
            Element::Doc(Doc { text }) => self.doc.doc_text = text,
            Element::DocDeprecated(DocDeprecated { text }) => self.doc.doc_deprecated = text,
            _ => (),
        }
    }
}

#[allow(clippy::large_enum_variant)]
pub enum Element {
    Placeholder,
    Repository(Repository),
    Namespace(Namespace),
    Attribute(Attribute),
    Include(Include),
    Alias(Alias),
    Interface(Interface),
    Class(Class),
    Record(Record),
    Doc(Doc),
    DocDeprecated(DocDeprecated),
    Constant(Constant),
    Property(Property),
    Signal(Signal),
    Field(Field),
    Callback(Callback),
    Implements(Implements),
    Prerequisite(Prerequisite),
    Type(Type),
    Array(ArrayType),
    Constructor(Constructor),
    VarArgs(VarArgs),
    Parameters(Parameters),
    Parameter(Parameter),
    InstanceParameter(InstanceParameter),
    ReturnValue(ReturnValue),
    Function(Function),
    Method(Method),
    VirtualMethod(VirtualMethod),
    Union(Union),
    BitField(BitField),
    Enumeration(Enumeration),
    Member(Member),
    DocSection(DocSection),
}

impl Element {
    fn push(&mut self, e: &BytesStart) -> Result<Self, Err> {
        let attrs = attributes(e)?;

        let element: Self = match e.name().as_ref() {
            b"namespace" => Self::Namespace(Namespace::new(&attrs)?),
            b"attribute" => Self::Attribute(Attribute {
                name: get_attr(&attrs, "name")?,
                value: get_attr(&attrs, "value")?,
            }),
            b"c:include" => Self::Placeholder,
            b"doc:format" => Self::Placeholder,
            b"include" => Self::Include(Include {
                name: get_attr(&attrs, "name")?,
                version: get_attr(&attrs, "version")?,
            }),
            b"package" => Self::Placeholder,
            b"alias" => Self::Alias(Alias::new(&attrs)?),
            b"interface" => Self::Interface(Interface::new(&attrs)?),
            b"class" => Self::Class(Class::new(&attrs)?),
            b"glib:boxed" => Self::Placeholder,
            b"record" => Self::Record(Record::new(&attrs)?),
            b"doc" => Self::Doc(Doc { text: None }),
            b"doc-deprecated" => Self::DocDeprecated(DocDeprecated { text: None }),
            b"doc-stability" => Self::Placeholder,
            b"doc-version" => Self::Placeholder,
            b"source-position" => Self::Placeholder,
            b"constant" => Self::Constant(Constant::new(&attrs)?),
            b"property" => Self::Property(Property::new(&attrs)?),
            b"glib:signal" => Self::Signal(Signal::new(&attrs)?),
            b"field" => Self::Field(Field::new(&attrs)?),
            b"callback" => Self::Callback(Callback::new(&attrs)?),
            b"implements" => Self::Implements(Implements {
                name: get_attr(&attrs, "name")?,
            }),
            b"prerequisite" => Self::Prerequisite(Prerequisite {
                name: get_attr(&attrs, "name")?,
            }),
            b"type" => Self::Type(Type::new(&attrs)?),
            b"array" => Self::Array(ArrayType::new(&attrs)?),
            b"constructor" => Self::Constructor(Constructor::new(&attrs)?),
            b"varargs" => Self::VarArgs(VarArgs {}),
            b"parameters" => Self::Parameters(Parameters::new()?),
            b"parameter" => Self::Parameter(Parameter::new(&attrs)?),
            b"instance-parameter" => Self::InstanceParameter(InstanceParameter::new(&attrs)?),
            b"return-value" => Self::ReturnValue(ReturnValue::new(&attrs)?),
            b"function" => Self::Function(Function::new(&attrs)?),
            b"function-inline" => Self::Placeholder,
            b"function-macro" => Self::Placeholder,
            b"method" => Self::Method(Method::new(&attrs)?),
            b"method-inline" => Self::Placeholder,
            b"virtual-method" => Self::VirtualMethod(VirtualMethod::new(&attrs)?),
            b"union" => Self::Union(Union::new(&attrs)?),
            b"bitfield" => Self::BitField(BitField::new(&attrs)?),
            b"enumeration" => Self::Enumeration(Enumeration::new(&attrs)?),
            b"member" => Self::Member(Member::new(&attrs)?),
            b"docsection" => Self::DocSection(DocSection {
                name: get_attr(&attrs, "name")?,
                doc: InfoElements::new(),
            }),
            tag => panic!("unhandled xml tag '{}'", str::from_utf8(tag)?),
        };

        Ok(element)
    }

    fn end(&mut self, e: Element) {
        match self {
            Self::Repository(i) => i.end(e),
            Self::Namespace(i) => i.end(e),
            Self::Alias(i) => i.end(e),
            Self::Interface(i) => i.end(e),
            Self::Class(i) => i.end(e),
            Self::Record(i) => i.end(e),
            Self::Constant(i) => i.end(e),
            Self::Property(i) => i.end(e),
            Self::Signal(i) => i.end(e),
            Self::Field(i) => i.end(e),
            Self::Callback(i) => i.end(e),
            Self::Type(i) => i.end(e),
            Self::Array(i) => i.end(e),
            Self::Constructor(i) => i.end(e),
            Self::Parameters(i) => i.end(e),
            Self::Parameter(i) => i.end(e),
            Self::InstanceParameter(i) => i.end(e),
            Self::ReturnValue(i) => i.end(e),
            Self::Function(i) => i.end(e),
            Self::Method(i) => i.end(e),
            Self::VirtualMethod(i) => i.end(e),
            Self::Union(i) => i.end(e),
            Self::BitField(i) => i.end(e),
            Self::Enumeration(i) => i.end(e),
            Self::Member(i) => i.end(e),
            _ => (),
        }
    }

    fn text(&mut self, str: &str) -> Result<(), String> {
        match self {
            Self::Doc(d) => {
                let text = d.text.as_deref().unwrap_or("");
                d.text = Some(format!("{text}{str}"));
            }
            Self::DocDeprecated(d) => {
                let text = d.text.as_deref().unwrap_or("");
                d.text = Some(format!("{text}{str}"));
            }
            _ => (),
        };
        Ok(())
    }
}

impl Repository {
    pub fn find_includes(&self, repos: &[&Repository]) -> Vec<Include> {
        let mut result = self
            .includes
            .iter()
            .filter_map(|i| {
                repos.iter().find(|r| {
                    r.namespaces
                        .iter()
                        .any(|ns| ns.name == i.name && ns.version == i.version)
                })
            })
            .flat_map(|r| r.find_includes(repos))
            .collect::<Vec<_>>();

        for inc in &self.includes {
            result.push(Include {
                name: inc.name.clone(),
                version: inc.version.clone(),
            });
        }

        let mut seen = collections::HashSet::new();
        result.retain(|inc| seen.insert((inc.name.clone(), inc.version.clone())));
        result
    }
}

pub fn parse(gir_contents: &str) -> Result<Repository, Err> {
    let mut reader = quick_xml::Reader::from_str(gir_contents);

    let mut repo: Option<Repository> = None;
    let mut stack: Vec<Element> = Vec::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"repository" => {
                    stack.push(Element::Repository(Repository {
                        includes: Vec::new(),
                        namespaces: Vec::new(),
                    }));
                }
                _ => {
                    let top = stack.last_mut().ok_or("push error: 1")?;

                    match top.push(&e) {
                        Ok(ele) => stack.push(ele),
                        Err(err) => return Err(format!("{}: {:?}", err, e).into()),
                    };
                }
            },
            Ok(Event::End(e)) => match e.name().as_ref() {
                b"repository" => {
                    if let Element::Repository(r) = stack
                        .pop()
                        .ok_or("root element expected to be repository")?
                    {
                        repo = Some(r);
                    }
                }
                _ => {
                    let top = stack.pop().ok_or("pop error: 1")?;
                    let second = stack.last_mut().ok_or("pop error: 2")?;
                    second.end(top);
                }
            },
            Ok(Event::Empty(e)) => {
                let top = stack.last_mut().ok_or("empty error: 1")?;
                let new = top.push(&e)?;
                top.end(new);
            }
            Ok(Event::Text(e)) => {
                if let Some(top) = stack.last_mut() {
                    let content = e.xml_content()?;
                    top.text(content.as_ref())?;
                }
            }
            Ok(Event::GeneralRef(e)) => {
                let top = stack.last_mut().ok_or("text error: 2")?;
                let ch = match e.xml_content()?.as_ref() {
                    "lt" => "<",
                    "gt" => ">",
                    "amp" => "'",
                    c => todo!("write ref event {}", c),
                };
                top.text(ch)?;
            }
            Ok(Event::CData(_)) => {
                todo!()
            }
            Ok(Event::Eof) => break,
            Ok(_) => (),
            Err(err) => return Err(err.into()),
        }
    }

    Ok(repo.ok_or("missing repository".to_owned())?)
}
