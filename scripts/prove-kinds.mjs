import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const kindsJs = read("web/js/kinds.js");
const appJs = read("web/app.js");
const indexHtml = read("web/index.html");
const appHtml = read("web/app.html");
const appIndex = read("web/app/index.html");
const appCss = read("web/app.css");

const sandbox = {
  console,
  Map,
  Object,
  String,
  Array,
  Error,
  Math,
  Number,
  Boolean,
  JSON,
  Set,
  globalThis: null,
  window: null,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(kindsJs, sandbox);
const Kinds = sandbox.DataBasedKinds;
assert.ok(Kinds, "DataBasedKinds is defined");

const all = Kinds.all();
assert.ok(all.length >= 16, "at least 16 kinds, got " + all.length);

const errors = Kinds.check();
if (errors.length) {
  throw new Error("blank round-trips:\n" + errors.join("\n"));
}

const ctrl = Kinds.hydrate("ctrl", { title: "CreateUser", note: "POST /users → create user, return 201" });
assert.equal(ctrl.routes.length, 1);
assert.equal(ctrl.routes[0].method, "POST");
assert.equal(ctrl.routes[0].path, "/users");
assert.ok(ctrl.source.includes("POST /users"));

const repo = Kinds.hydrate("repo", { title: "UserRepo", note: "findById, save, list" });
assert.equal(repo.entries.length, 3);
assert.equal(repo.entries[0].name, "findById");
assert.ok(repo.source.includes("findById"));

const mind = Kinds.hydrate("mind", { title: "Untitled idea", note: "ship it" });
assert.equal(mind.source, "ship it");

const unknown = Kinds.spec("zzz");
assert.equal(unknown.family, "note");
assert.equal(unknown.label, "zzz");

const zodHits = Kinds.search("zod").map((s) => s.kind);
assert.ok(zodHits.includes("zod"), "search zod");
const prismaHits = Kinds.search("prisma").map((s) => s.kind);
assert.ok(prismaHits.includes("prisma"), "search prisma");

const vendorMarks = all.filter((s) => /is-(prisma|drizzle|gql)/.test(s.mark)).map((s) => s.kind).sort();
assert.equal(vendorMarks.join(","), "drizzle,gql,prisma");

assert.ok(!/const CATALOG/.test(appJs), "app.js no longer owns CATALOG");
for (const html of [indexHtml, appHtml, appIndex]) {
  assert.ok(html.includes("/js/kinds.js"), "html loads kinds.js");
  assert.ok(html.includes('id="market-search"'), "html has market search");
}
assert.ok(appCss.includes(".market-search"), "css styles market search");

const schema = Kinds.blank("schema");
const parsed = Kinds.parse("schema", schema.source);
assert.ok(parsed.ok, parsed.error);
assert.equal(parsed.fields[0].name, "id");

console.log("pass kinds", all.map((s) => s.kind).join(", "));
