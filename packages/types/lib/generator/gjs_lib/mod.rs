pub struct GjsLib {
    pub name: &'static str,
    pub content: &'static str,
}

pub const GJS_LIBS: &[GjsLib] = &[
    GjsLib {
        name: "cairo",
        content: include_str!("cairo.d.ts"),
    },
    GjsLib {
        name: "console",
        content: include_str!("console.d.ts"),
    },
    GjsLib {
        name: "encoding",
        content: include_str!("encoding.d.ts"),
    },
    GjsLib {
        name: "format",
        content: include_str!("format.d.ts"),
    },
    GjsLib {
        name: "gettext",
        content: include_str!("gettext.d.ts"),
    },
    GjsLib {
        name: "gjs",
        content: include_str!("gjs.d.ts"),
    },
    GjsLib {
        name: "logging",
        content: include_str!("logging.d.ts"),
    },
    GjsLib {
        name: "system",
        content: include_str!("system.d.ts"),
    },
    GjsLib {
        name: "timers",
        content: include_str!("timers.d.ts"),
    },
];
