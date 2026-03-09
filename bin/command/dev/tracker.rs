use std::collections::{HashMap, HashSet};

#[derive(Debug, Default)]
pub struct ModuleVersions(HashMap<String, u64>);

impl ModuleVersions {
    pub fn bump(&mut self, jsfile: &str) -> u64 {
        let version = self.0.entry(jsfile.to_string()).or_insert(0);
        *version += 1;
        *version
    }

    pub fn get(&self, jsfile: &str) -> u64 {
        self.0.get(jsfile).copied().unwrap_or(0)
    }
}

#[derive(Debug)]
pub struct ModuleTracker(HashSet<String>);

impl ModuleTracker {
    pub fn sync(&mut self, file: String) -> Vec<String> {
        self.0.insert(file);
        self.0.retain(|f| std::path::Path::new(f).exists());
        self.0.iter().cloned().collect()
    }

    pub fn new(set: HashSet<String>) -> Self {
        Self(set)
    }
}
