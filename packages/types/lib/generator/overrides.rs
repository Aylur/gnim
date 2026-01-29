pub struct ClassOverride<'a> {
    pub name: &'a str,
    pub methods: &'a [&'a str],
}

pub struct Override<'a> {
    pub namespace: &'a str,
    pub version: &'a str,
    pub content: Option<&'a str>,
    pub toplevel: &'a [&'a str],
    pub classes: &'a [ClassOverride<'a>], // class and interface
}

pub const OVERRIDES: &[Override] = &[
    Override {
        namespace: "GObject",
        version: "2.0",
        content: Some(include_str!("overrides/GObject-2.0.d.ts")),
        toplevel: &[
            "signal_handler_find",
            "signal_handlers_block_matched",
            "signal_handlers_unblock_matched",
            "signal_handlers_disconnect_matched",
            "ParamSpec",
            "Value",
        ],
        classes: &[ClassOverride {
            name: "Object",
            methods: &[
                "get_data",
                "get_qdata",
                "set_data",
                "set_qdata",
                "steal_data",
                "steal_qdata",
                "force_floating",
                "ref",
                "ref_sink",
                "unref",
            ],
        }],
    },
    Override {
        namespace: "Gio",
        version: "2.0",
        content: Some(include_str!("overrides/Gio-2.0.d.ts")),
        toplevel: &[],
        classes: &[ClassOverride {
            name: "ActionMap",
            methods: &["add_action_entries"],
        }],
    },
    Override {
        namespace: "GLib",
        version: "2.0",
        content: Some(include_str!("overrides/GLib-2.0.d.ts")),
        classes: &[],
        toplevel: &["Variant", "VariantType", "VariantBuilder", "VariantDict"],
    },
    Override {
        namespace: "Gtk",
        version: "3.0",
        content: Some(include_str!("overrides/Gtk.d.ts")),
        classes: &[],
        toplevel: &[],
    },
    Override {
        namespace: "Gtk",
        version: "4.0",
        content: Some(include_str!("overrides/Gtk.d.ts")),
        classes: &[],
        toplevel: &[],
    },
];
