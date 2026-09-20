import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "web");
const DEST = path.join(ROOT, ".vercel-public");

const SKIP_DIR = new Set(["mcp", "data"]);
const SKIP_FILE = new Set(["mcp-server.mjs", "sync-server.mjs"]);

function copyFiltered(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (name.startsWith(".")) continue;
    const src = path.join(from, name);
    const dest = path.join(to, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      copyFiltered(src, dest);
      continue;
    }
    if (SKIP_FILE.has(name)) continue;
    if (name.endsWith(".mjs")) continue;
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(DEST, { recursive: true, force: true });
copyFiltered(SRC, DEST);

const origin = String(process.env.PUBLIC_ORIGIN || "").replace(/\/+$/, "");
if (origin) {
  const htmlPath = path.join(DEST, "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");
  html = html.replace(
    /(<meta property="og:url" content=")\/(")/,
    `$1${origin}/$2`
  );
  html = html.replaceAll('content="/og.png"', `content="${origin}/og.png"`);
  fs.writeFileSync(htmlPath, html);
}

console.log("vercel static → " + DEST + (origin ? " · og origin " + origin : " · og paths /og.png"));
