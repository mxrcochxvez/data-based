import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const syncJs = fs.readFileSync(path.join(root, "web/js/sync.js"), "utf8");
const selectJs = fs.readFileSync(path.join(root, "web/js/select.js"), "utf8");
const liveJs = fs.readFileSync(path.join(root, "web/js/liveblocks.js"), "utf8");
const persistJs = fs.readFileSync(path.join(root, "web/js/persist.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const boardBend = fs.readFileSync(path.join(root, "board.bend"), "utf8");

const must = [
  [syncJs, "skips pull while a pointer-drag is live", /if \(pointerDragging\(\)\) return Promise\.resolve\(false\)/],
  [syncJs, "skips applyRemote while a pointer-drag is live", /function applyRemote\(doc\) \{\s*if \(pointerDragging\(\)\) return;/],
  [syncJs, "does not let an older GET beat a local or PUT stamp", /const localAt = Math\.max\(docUpdatedAt\(local\), lastPutAt\)/],
  [syncJs, "refuses remote when local updatedAt is newer", /if \(localAt > remoteAt\) return false/],
  [syncJs, "records lastPutAt after a successful PUT", /lastPutAt = Math\.max\(lastPutAt, docUpdatedAt\(doc\)\)/],
  [selectJs, "exposes isDragging during move/resize", /function isDragging\(\)/],
  [selectJs, "flushes persist on drop before the next GET", /persist\(\{\s*flush:\s*true\s*\}\)/],
  [selectJs, "notes the local stamp after drop", /DataBasedSync\.noteLocal/],
  [liveJs, "does not apply CARD_DRAG to a locally dragged card", /busy\.indexOf\(String\(cardId\)\) >= 0/],
  [liveJs, "writes remote drag into card state, not only DOM", /card\.x = x/],
  [liveJs, "skips KICK_SYNC pull during local drag", /if \(event\.type === "KICK_SYNC"\) \{\s*if \(localDragging\(\)\) return;/],
  [persistJs, "notes the local stamp before kicking sync", /sync\.noteLocal/],
  [appJs, "can flush persist immediately", /Persist\.flush\(persistDoc\)/],
  [appJs, "hydrateBoard refuses to rewind during drag", /DataBasedSelect\.isDragging/],
  [boardBend, "keep_local holds through a live drag", /def Board\.keep_local/],
];

let failed = 0;
for (const [src, label, re] of must) {
  const ok = re.test(src);
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
console.log("pass drag does not rewind from stale sync");
