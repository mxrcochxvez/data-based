import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const appJs = read("web/app.js");
const boardsJs = read("web/js/boards.js");
const indexHtml = read("web/index.html");
const appHtml = read("web/app.html");
const appIndex = read("web/app/index.html");

function sliceFn(src, name) {
  const re = new RegExp("function " + name + "\\s*\\(");
  const start = src.search(re);
  if (start < 0) return "";
  const from = src.indexOf("{", start);
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

const must = [
  [appJs, "commitSchemaBody exists", /function commitSchemaBody\(/],
  [appJs, "saveEdit uses commitSchemaBody", /commitSchemaBody\(/],
  [appJs, "readFields walks fname inputs", /querySelectorAll\('\[name="fname"\]'\)/],
  [appJs, "appendGridRow uses a real table parse", /function rowFromHtml\(/],
  [appJs, "add-row appends via appendGridRow", /appendGridRow\(tbody/],
  [appJs, "field sync force-writes the SQL pane", /setTa\([\s\S]*generate\([\s\S]*\),\s*true\)/],
  [appJs, "hydrate keeps the open editor", /keepEdit/],
  [boardsJs, "board hydrate keeps the open editor", /keepEdit/],
  [indexHtml, "index Save has edit-save", /id="edit-save"/],
  [appHtml, "app.html Save has edit-save", /id="edit-save"/],
  [appIndex, "app/index.html Save has edit-save", /id="edit-save"/],
];

let failed = 0;
for (const [src, label, re] of must) {
  const ok = re.test(src);
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}

const commitSrc = sliceFn(appJs, "commitSchemaBody");
if (!commitSrc) {
  console.log("fail", "slice commitSchemaBody");
  failed += 1;
} else {
  const lang = {
    generate(title, fields) {
      return "create table " + title + " (" + fields.map((f) => f.name + " " + (f.type || "text")).join(", ") + ");";
    },
    parse(src) {
      const m = String(src || "").match(/create table (\w+) \((.*)\);/);
      if (!m) return { ok: false, error: "bad" };
      const fields = m[2]
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const bits = part.split(/\s+/);
          return { name: bits[0], type: bits[1] || "text" };
        });
      return { ok: true, title: m[1], fields };
    },
  };
  const commit = vm.runInNewContext(commitSrc + "\ncommitSchemaBody");
  const two = [{ name: "id", type: "uuid" }, { name: "email", type: "text" }];
  const three = two.concat([{ name: "status", type: "text" }]);
  const stale = lang.generate("users", two);
  const cases = [
    ["fields side keeps a new grid column", commit(lang, "users", three, stale, "fields"), (got) => got.fields.some((f) => f.name === "status") && /status/.test(got.source)],
    ["stale source cannot drop a longer grid", commit(lang, "users", three, stale, "source"), (got) => got.fields.some((f) => f.name === "status")],
    ["source side can add a SQL column", commit(lang, "users", two, lang.generate("users", three), "source"), (got) => got.fields.some((f) => f.name === "status")],
    ["fields side keeps a grid delete", commit(lang, "users", two, lang.generate("users", three), "fields"), (got) => got.fields.length === 2 && !got.fields.some((f) => f.name === "status")],
    ["broken SQL falls back to the grid", commit(lang, "users", three, "not sql", "source"), (got) => got.fields.some((f) => f.name === "status")],
  ];
  for (const [label, got, ok] of cases) {
    const pass = ok(got);
    console.log(pass ? "pass" : "fail", label);
    if (!pass) failed += 1;
  }
}

if (failed) {
  console.error(failed + " checks failed");
  process.exit(1);
}
console.log("ok");
