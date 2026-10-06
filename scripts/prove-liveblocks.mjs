import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const appHtml = fs.readFileSync(path.join(root, "web/app.html"), "utf8");
const appIndexHtml = fs.readFileSync(path.join(root, "web/app/index.html"), "utf8");
const homeHtml = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
const syncServer = fs.readFileSync(path.join(root, "web/sync-server.mjs"), "utf8");
const apiAuth = fs.readFileSync(path.join(root, "api/liveblocks-auth.mjs"), "utf8");
const apiComment = fs.readFileSync(path.join(root, "api/liveblocks-comment.mjs"), "utf8");
const clientJs = fs.readFileSync(path.join(root, "web/js/liveblocks.js"), "utf8");
const selectJs = fs.readFileSync(path.join(root, "web/js/select.js"), "utf8");
const boardsJs = fs.readFileSync(path.join(root, "web/js/boards.js"), "utf8");
const persistJs = fs.readFileSync(path.join(root, "web/js/persist.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const menuJs = fs.readFileSync(path.join(root, "web/js/menu.js"), "utf8");

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

const fillCanvas = sliceFn(menuJs, "fillCanvas");
const fillCard = sliceFn(menuJs, "fillCard");
const fillMulti = sliceFn(menuJs, "fillMulti");

const must = [
  [homeHtml, "canvas at / has live-cursors element", /id="live-cursors"/],
  [homeHtml, "canvas at / loads liveblocks.js module", /src="\/js\/liveblocks\.js"/],
  [appHtml, "app.html has live-cursors element", /id="live-cursors"/],
  [appHtml, "app.html has presence-bar element", /id="presence-bar"/],
  [appHtml, "app.html loads liveblocks.js module", /src="\/js\/liveblocks\.js"/],
  [appIndexHtml, "app/index.html has live-cursors element", /id="live-cursors"/],
  [appIndexHtml, "app/index.html has presence-bar element", /id="presence-bar"/],
  [appIndexHtml, "app/index.html loads liveblocks.js module", /src="\/js\/liveblocks\.js"/],
  [vercel, "vercel.json defines api/liveblocks-auth.mjs function", /"api\/liveblocks-auth\.mjs"/],
  [syncServer, "sync-server exports handleLiveblocksAuth", /export async function handleLiveblocksAuth/],
  [syncServer, "sync-server routes /api/liveblocks-auth", /url === "\/api\/liveblocks-auth"/],
  [syncServer, "sync-server config includes liveblocksKey", /liveblocksKey:/],
  [apiAuth, "api/liveblocks-auth imports handleLiveblocksAuth", /handleLiveblocksAuth/],
  [clientJs, "liveblocks.js exposes DataBasedLiveblocks", /window\.DataBasedLiveblocks\s*=/],
  [clientJs, "liveblocks.js handles enterBoard", /enterBoard/],
  [clientJs, "liveblocks.js handles live cursors", /renderPeerCursors/],
  [clientJs, "liveblocks.js handles presence avatars", /renderPresenceAvatars/],
  [clientJs, "liveblocks.js handles peer selection highlight", /renderPeerSelections/],
  [clientJs, "liveblocks.js broadcasts sync kicks", /broadcastSync/],
  [selectJs, "select.js notifies cursor updates", /DataBasedLiveblocks\.updateCursor/],
  [selectJs, "select.js clears cursor on pointerleave", /DataBasedLiveblocks\.clearCursor/],
  [selectJs, "select.js broadcasts card drag", /DataBasedLiveblocks\.broadcastDrag/],
  [selectJs, "select.js updates selection", /DataBasedLiveblocks\.updateSelection/],
  [boardsJs, "boards.js enters room on hydrateBoard", /DataBasedLiveblocks\.enterBoard/],
  [persistJs, "persist.js broadcasts sync kicks", /DataBasedLiveblocks\.broadcastSync/],
  [appJs, "app.js updates Liveblocks on setSelection", /DataBasedLiveblocks\.updateSelection/],
  [fillCanvas, "Add comment in fillCanvas", /Add comment/],
  [fillCard, "Add comment in fillCard", /Add comment/],
  [fillMulti, "Add comment in fillMulti", /Add comment/],
  [menuJs, "act add-comment", /add-comment/],
  [clientJs, "DataBasedLiveblocks.startComment", /startComment/],
  [clientJs, "DataBasedLiveblocks.toggleComments", /toggleComments/],
  [clientJs, "DataBasedLiveblocks.showComments", /showComments/],
  [clientJs, "DataBasedLiveblocks.hideComments", /hideComments/],
  [homeHtml, "comments-panel in index.html", /id="comments-panel"/],
  [appHtml, "comments-panel in app.html", /id="comments-panel"/],
  [appIndexHtml, "comments-panel in app/index.html", /id="comments-panel"/],
  [homeHtml, "comments-tool in index.html", /id="comments-tool"/],
  [appHtml, "comments-tool in app.html", /id="comments-tool"/],
  [appIndexHtml, "comments-tool in app/index.html", /id="comments-tool"/],
  [homeHtml, "comment-pins in canvas at /", /id="canvas"[\s\S]*id="comment-pins"/],
  [appHtml, "comment-pins in canvas in app.html", /id="canvas"[\s\S]*id="comment-pins"/],
  [appIndexHtml, "comment-pins in canvas in app/index.html", /id="canvas"[\s\S]*id="comment-pins"/],
  [clientJs, "createThread in liveblocks.js", /createThread/],
  [clientJs, "createComment in liveblocks.js", /createComment/],
  [clientJs, "getThreads in liveblocks.js", /getThreads/],
  [clientJs, "localStorage databased-comments-open", /databased-comments-open/],
  [selectJs, "select.js ignores comments-panel", /comments-panel/],
  [clientJs, "badge lives top-right", /badgeLocation:\s*"top-right"/],
  [clientJs, "sendReply posts createComment", /async function sendReply/],
  [clientJs, "editComment in liveblocks.js", /editComment/],
  [clientJs, "deleteComment in liveblocks.js", /deleteComment/],
  [vercel, "vercel.json defines api/liveblocks-comment.mjs function", /"api\/liveblocks-comment\.mjs"/],
  [syncServer, "sync-server routes /api/liveblocks-comment", /url === "\/api\/liveblocks-comment"/],
  [apiComment, "api/liveblocks-comment imports handleLiveblocksComment", /handleLiveblocksComment/],
];

let failed = 0;
for (const [src, label, re] of must) {
  const ok = typeof re === "string" ? src.includes(re) : re.test(src);
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}

console.log("skip Liveblocks token minting (no network, no secrets in prove)");

if (failed) process.exit(1);
console.log("pass liveblocks multiplayer collaboration");
