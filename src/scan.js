import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

// Recursively collect source files under root, honoring the ignore list.
export function collectFiles(root, config) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (config.ignore.includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (config.extensions.includes(extname(entry.name))) {
        files.push({
          path: full,
          rel: relative(root, full),
          content: readFileSync(full, "utf8"),
        });
      }
    }
  };
  walk(root);
  return files;
}

export function isTestFile(rel) {
  return /(\.test|\.spec)\.[^.]+$/.test(rel) || /(^|\/)(tests|__tests__)\//.test(rel);
}
