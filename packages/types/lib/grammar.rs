// https://gitlab.gnome.org/GNOME/gobject-introspection/blob/main/docs/gir-1.2.rnc

use serde::Serialize;

pub struct Repository {
    pub includes: Vec<Include>,
    pub namespaces: Vec<Namespace>,
    // pub doc_format: Vec<DocFormat>,
}

pub struct Namespace {
    pub name: String,
    pub version: String,
    pub c_symbol_prefixes: Option<String>,
    pub aliases: Vec<Alias>,
    pub classes: Vec<Class>,
    pub interfaces: Vec<Interface>,
    pub records: Vec<Record>,
    pub enums: Vec<Enumeration>,
    pub functions: Vec<Function>,
    pub unions: Vec<Union>,
    pub bitfields: Vec<BitField>,
    pub callbacks: Vec<Callback>,
    pub constants: Vec<Constant>,
    pub annotations: Vec<Attribute>,
    pub doc_sections: Vec<DocSection>,
}

#[derive(Serialize, Clone)]
pub struct Attribute {
    pub name: String,
    pub value: String,
}

// pub struct DocFormat;

#[derive(Serialize, Clone)]
pub struct Include {
    pub name: String,
    pub version: String,
}

#[derive(Serialize, Clone)]
pub struct Alias {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: String,
    pub gtype: Option<AnyType>,
}

#[derive(Serialize, Clone)]
pub struct Interface {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: String,
    pub type_name: String,
    pub prerequisites: Vec<Prerequisite>,
    pub implements: Vec<Implements>,
    pub functions: Vec<Function>,
    pub constructors: Vec<Constructor>,
    pub methods: Vec<Method>,
    pub virtual_methods: Vec<VirtualMethod>,
    pub fields: Vec<Field>,
    pub properties: Vec<Property>,
    pub signals: Vec<Signal>,
    pub callbacks: Vec<Callback>,
    pub constants: Vec<Constant>,
}

#[derive(Serialize, Clone)]
pub struct Class {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: String,
    pub type_name: String,
    pub parent: Option<String>,
    pub is_abstract: bool,
    pub is_final: bool,
    pub fundamental: bool,
    pub implements: Vec<Implements>,
    pub constructors: Vec<Constructor>,
    pub methods: Vec<Method>,
    pub functions: Vec<Function>,
    pub virtual_methods: Vec<VirtualMethod>,
    pub fields: Vec<Field>,
    pub properties: Vec<Property>,
    pub signals: Vec<Signal>,
    pub constants: Vec<Constant>,
    pub callbacks: Vec<Callback>,
}

// TODO:
// pub struct Boxed;

#[derive(Serialize, Clone)]
pub struct Record {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: Option<String>,
    pub opaque: Option<bool>,
    pub pointer: Option<bool>,
    pub type_name: Option<String>,
    pub gtype_struct_for: Option<String>,
    pub fields: Vec<Field>,
    pub functions: Vec<Function>,
    pub methods: Vec<Method>,
    pub constructors: Vec<Constructor>,
}

#[derive(Serialize, Clone)]
pub struct InfoAttrs {
    pub introspectable: bool,
    pub deprecated: bool,
    pub deprecated_version: Option<String>,
    pub version: Option<String>,
    pub stability: Option<String>, // "Stable" | "Unstable" | "Private"
}

#[derive(Serialize, Clone)]
pub struct InfoElements {
    pub attributes: Vec<Attribute>,
    pub doc_text: Option<String>,
    pub doc_deprecated: Option<String>,
}

pub struct Doc {
    pub text: Option<String>,
}

pub struct DocDeprecated {
    pub text: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct Constant {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: String,
    pub value: String,
    pub gtype: Option<AnyType>,
}

#[derive(Serialize, Clone)]
pub struct Property {
    pub info: InfoAttrs,
    pub name: String,
    pub writable: bool,
    pub readable: bool,
    pub construct: bool,
    pub construct_only: bool,
    pub default_value: Option<String>,
    pub getter: Option<String>,
    pub setter: Option<String>,
    pub doc: InfoElements,
    pub gtype: Option<AnyType>,
}

#[derive(Serialize, Clone)]
pub struct Signal {
    pub info: InfoAttrs,
    pub name: String,
    pub doc: InfoElements,
    pub detailed: bool,
    pub when: Option<String>, // "first" | "last" | "cleanup"
    pub action: bool,
    pub no_hooks: Option<bool>,
    pub no_recurse: Option<bool>,
    pub parameters: Option<Parameters>,
    pub returns: Option<ReturnValue>,
}

#[derive(Serialize, Clone)]
pub struct Field {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: String,
    pub writable: Option<bool>,
    pub readable: Option<bool>,
    pub private: Option<bool>,
    pub bits: Option<i32>,
    pub gtype: Option<AnyType>,
    pub callback: Option<Callback>,
}

#[derive(Serialize, Clone)]
pub struct Callback {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: String,
    pub throws: bool,
    pub parameters: Option<Parameters>,
    pub returns: Option<ReturnValue>,
}

#[derive(Serialize, Clone)]
pub struct Implements {
    pub name: String,
}

#[derive(Serialize, Clone)]
pub struct Prerequisite {
    pub name: String,
}

#[derive(Serialize, Clone)]
pub struct Type {
    pub name: Option<String>,
    pub introspectable: bool,
    pub doc: InfoElements,
    pub elements: Vec<Box<AnyType>>,
}

#[derive(Serialize, Clone)]
pub struct ArrayType {
    pub name: Option<String>,
    pub introspectable: bool,
    pub zero_terminated: Option<bool>,
    pub fixed_size: Option<i32>,
    pub length: Option<i32>,
    pub elements: Vec<Box<AnyType>>,
}

#[derive(Serialize, Clone)]
pub struct Constructor {
    pub attrs: CallableAttrs,
    pub doc: InfoElements,
    pub parameters: Option<Parameters>,
    pub returns: Option<ReturnValue>,
}

#[derive(Serialize, Clone)]
pub struct CallableAttrs {
    pub info: InfoAttrs,
    pub name: String,
    pub c_identifier: Option<String>,
    pub shadowed_by: Option<String>,
    pub shadows: Option<String>,
    pub throws: bool,
    pub sync_name: Option<String>,
    pub async_name: Option<String>,
    pub finish_name: Option<String>,
}

pub struct VarArgs {
    // empty
}

#[derive(Serialize, Clone)]
pub struct Parameters {
    pub instance: Option<InstanceParameter>,
    pub parameters: Vec<Parameter>,
}

#[derive(Serialize, Clone)]
pub enum AnyType {
    Type(Type),
    Array(ArrayType),
}

#[derive(Serialize, Clone)]
pub struct Parameter {
    pub name: String,
    pub nullable: bool,
    pub introspectable: bool,
    pub closure: Option<i32>,
    pub destroy: Option<i32>,
    pub scope: Option<String>, // "notified" | "async" | "call" | "forever"
    pub direction: Option<String>, // "out" | "in" | "inout"
    pub caller_allocates: Option<bool>,
    pub optional: bool,
    pub skip: bool,
    pub doc: InfoElements,
    pub variadic: bool,
    pub gtype: Option<AnyType>,
}

#[derive(Serialize, Clone)]
pub struct InstanceParameter {
    pub doc: InfoElements,
    pub name: String,
    pub nullable: bool,
    pub direction: Option<String>, // "out" | "in" | "inout"
    pub caller_allocates: Option<bool>,
    pub gtype: Option<Type>,
}

#[derive(Serialize, Clone)]
pub struct ReturnValue {
    pub doc: InfoElements,
    pub gtype: Option<AnyType>,
    pub introspectable: bool,
    pub nullable: bool,
    pub closure: Option<i32>,
    pub destroy: Option<i32>,
    pub scope: Option<String>, // "notified" | "async" | "call" | "forever"
}

#[derive(Serialize, Clone)]
pub struct Function {
    pub attrs: CallableAttrs,
    pub doc: InfoElements,
    pub parameters: Option<Parameters>,
    pub returns: Option<ReturnValue>,
}

// not introspectable
// pub struct FunctionInline;

// not introspectable
// pub struct FunctionMacro;

#[derive(Serialize, Clone)]
pub struct Method {
    pub attrs: CallableAttrs,
    pub doc: InfoElements,
    pub set_property: Option<String>,
    pub get_property: Option<String>,
    pub parameters: Option<Parameters>,
    pub returns: Option<ReturnValue>,
}

// not introspectable
// pub struct MethodInline;

#[derive(Serialize, Clone)]
pub struct VirtualMethod {
    pub attrs: CallableAttrs,
    pub doc: InfoElements,
    pub parameters: Option<Parameters>,
    pub returns: Option<ReturnValue>,
}

#[derive(Serialize, Clone)]
pub struct Union {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: Option<String>,
    pub type_name: Option<String>,
    pub opaque: Option<bool>,
    pub pointer: Option<bool>,
    pub fields: Vec<Field>,
    pub functions: Vec<Function>,
    pub methods: Vec<Method>,
    pub constructors: Vec<Constructor>,
}

#[derive(Serialize, Clone)]
pub struct BitField {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: String,
    pub type_name: Option<String>,
    pub members: Vec<Member>,
    pub functions: Vec<Function>,
}

#[derive(Serialize, Clone)]
pub struct Enumeration {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: String,
    pub type_name: Option<String>,
    pub error_domain: Option<String>,
    pub members: Vec<Member>,
    pub functions: Vec<Function>,
}

#[derive(Serialize, Clone)]
pub struct Member {
    pub info: InfoAttrs,
    pub doc: InfoElements,
    pub name: String,
    pub value: String,
}

#[derive(Serialize, Clone)]
pub struct DocSection {
    pub name: String,
    pub doc: InfoElements,
}
