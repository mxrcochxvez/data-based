import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import vm from "node:vm";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientJs = fs.readFileSync(path.join(root, "web/js/liveblocks.js"), "utf8");

function sliceFn(src, name) {
  const start = src.search(new RegExp("function " + name + "\\s*\\("));
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

function loadCommentsStore() {
  const threads = new Map();
  const sandbox = {
    threads,
    pendingIds: new Set(),
    commentsSince: null,
    Date,
    Map,
    Object,
    Array,
    String,
    Number,
    Boolean,
    console,
  };
  const src = [
    sliceFn(clientJs, "toMs"),
    sliceFn(clientJs, "liveComments"),
    sliceFn(clientJs, "unionComments"),
    sliceFn(clientJs, "mergeThread"),
    sliceFn(clientJs, "mergeLocalThread"),
    sliceFn(clientJs, "mergeLocalComment"),
    sliceFn(clientJs, "applyFullThreads"),
    sliceFn(clientJs, "applySinceThreads"),
  ].filter(Boolean).join("\n");
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox;
}

const created = {
  id: "th_new",
  createdAt: new Date("2026-09-21T08:00:00.000Z"),
  updatedAt: new Date("2026-09-21T08:00:00.000Z"),
  metadata: { x: 12, y: 40, cardId: "" },
  comments: [{
    id: "cm_new",
    threadId: "th_new",
    createdAt: new Date("2026-09-21T08:00:00.000Z"),
    body: {
      version: 1,
      content: [{ type: "paragraph", children: [{ text: "newest on mobile" }] }],
    },
  }],
};
const older = {
  id: "th_old",
  createdAt: new Date("2026-09-21T07:00:00.000Z"),
  updatedAt: new Date("2026-09-21T07:00:00.000Z"),
  comments: [{
    id: "cm_old",
    threadId: "th_old",
    createdAt: new Date("2026-09-21T07:00:00.000Z"),
    body: {
      version: 1,
      content: [{ type: "paragraph", children: [{ text: "older" }] }],
    },
  }],
};

const store = loadCommentsStore();
assert.equal(typeof store.applyFullThreads, "function", "applyFullThreads exists");
assert.equal(typeof store.mergeLocalThread, "function", "mergeLocalThread exists");
store.mergeLocalThread(created);
store.applyFullThreads({
  threads: [older],
  requestedAt: new Date("2026-09-21T08:00:01.000Z"),
});
assert.ok(store.threads.has("th_new"), "stale getThreads must keep the thread just created");
assert.equal(
  store.threads.get("th_new").comments[0].id,
  "cm_new",
  "created comment body stays until Liveblocks catches up",
);
assert.equal(
  store.commentsSince,
  null,
  "stale snapshot must not advance commentsSince past the missing thread",
);

store.mergeLocalComment("th_old", {
  id: "cm_reply",
  threadId: "th_old",
  createdAt: new Date("2026-09-21T08:00:02.000Z"),
  body: {
    version: 1,
    content: [{ type: "paragraph", children: [{ text: "reply newest" }] }],
  },
});
store.applyFullThreads({
  threads: [older],
  requestedAt: new Date("2026-09-21T08:00:03.000Z"),
});
const oldNotes = (store.threads.get("th_old").comments || []).map((c) => c.id);
assert.ok(oldNotes.includes("cm_reply"), "stale getThreads must keep a just-added reply");

assert.match(
  clientJs,
  /const\s+thread\s*=\s*await currentRoom\.createThread/,
  "submit keeps the createThread result",
);
assert.match(
  clientJs,
  /mergeLocalThread\(thread/,
  "submit inserts the created thread before refresh",
);
assert.match(
  sliceFn(clientJs, "paintThreadList"),
  /revealLatest|scrollIntoView/,
  "thread paint reveals the newest note on the phone sheet",
);

console.log("pass comments latest stays visible");
