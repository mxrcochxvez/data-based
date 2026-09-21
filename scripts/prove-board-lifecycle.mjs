import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const boardsJs = read("web/js/boards.js");
const syncJs = read("web/js/sync.js");
const appJs = read("web/app.js");
const storeMjs = read("web/mcp/store.mjs");

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

const canManage = sliceFn(boardsJs, "canManage");
const renameBoard = sliceFn(boardsJs, "renameBoard");
const deleteBoard = sliceFn(boardsJs, "deleteBoard");
const isVirgin = sliceFn(syncJs, "isVirginDoc");
const pull = sliceFn(syncJs, "pull");
const boot = sliceFn(syncJs, "boot");
const loadStore = sliceFn(boardsJs, "loadStore");
const appLoad = sliceFn(appJs, "loadStore");

const must = [
  [canManage, "system admin can manage any board", /isSystem\(\)/],
  [canManage, "board owner can manage", /role === "owner"/],
  [renameBoard, "rename is gated by canManage", /canManage\(b\)/],
  [deleteBoard, "delete is gated by canManage", /canManage\(b\)/],
  [boardsJs, "board list has Rename", /data-rename/],
  [boardsJs, "board list has Delete", /data-delete/],
  [isVirgin, "virgin doc is empty default Board", /name === "Board"/],
  [pull, "virgin local yields to remote boards", /isVirginDoc\(local\) && remote\.boards\.length/],
  [boot, "boot does not PUT a virgin seed", /!isVirginDoc\(readDoc\(false\)\)/],
  [loadStore, "boards seed stamp is 0", /updatedAt: 0/],
  [appLoad, "app seed stamp is 0", /updatedAt: 0/],
  [storeMjs, "server canOwn includes system admin", /if \(isSystemHandle\(handle\)\) return true/],
];

let failed = 0;
for (const [src, label, re] of must) {
  const ok = re.test(src);
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
console.log("pass board lifecycle owner and system admin");
