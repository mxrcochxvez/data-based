import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function apply(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 1) continue;
      const key = line.slice(0, i).trim();
      if (!/^[A-Z0-9_]+$/.test(key)) continue;
      if (process.env[key]) continue;
      let val = line.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch (_) {}
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
apply(path.join(root, ".env"));
apply(path.join(root, ".env.local"));
