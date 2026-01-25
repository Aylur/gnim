mod element;
mod lib;
mod overrides;
mod render;

use super::grammar;
pub use lib::GJS_LIBS;
use rayon::prelude::*;
use render::render_namespace;

impl grammar::Repository {
    fn find_imports(&self, repos: &[grammar::Repository]) -> Vec<grammar::Include> {
        let mut includes = self.find_includes(repos);

        let has_gobject = includes
            .iter()
            .any(|inc| inc.name == "GObject" && inc.version == "2.0");

        if self.file_stem != "GObject-2.0" && !has_gobject {
            includes.push(grammar::Include {
                name: String::from("GObject"),
                version: String::from("2.0"),
            });
        }

        let has_glib = includes
            .iter()
            .any(|inc| inc.name == "GLib" && inc.version == "2.0");

        if self.file_stem != "GLib-2.0" && !has_glib {
            includes.push(grammar::Include {
                name: String::from("GLib"),
                version: String::from("2.0"),
            });
        }

        includes
    }

    pub fn generate_dts(&self, repos: &[grammar::Repository]) -> Result<String, String> {
        let namespaces = self
            .namespaces
            .par_iter()
            .map(render_namespace)
            .collect::<Vec<_>>();

        let imports = self.find_imports(repos);

        let res = minijinja::Environment::new().render_str(
            include_str!("templates/repository.jinja"),
            minijinja::context! { imports, namespaces },
        );

        match res {
            Ok(res) => Ok(res),
            Err(err) => Err(format!("{:?}", err).into()),
        }
    }
}
