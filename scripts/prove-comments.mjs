import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const appHtml = fs.readFileSync(path.join(root, "web/app.html"), "utf8");
const appIndexHtml = fs.readFileSync(path.join(root, "web/app/index.html"), "utf8");
const homeHtml = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const clientJs = fs.readFileSync(path.join(root, "web/js/liveblocks.js"), "utf8");
const menuJs = fs.readFileSync(path.join(root, "web/js/menu.js"), "utf8");
const selectJs = fs.readFileSync(path.join(root, "web/js/select.js"), "utf8");
const appCss = fs.readFileSync(path.join(root, "web/app.css"), "utf8");

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

const menuCss = fs.readFileSync(path.join(root, "web/css/menu.css"), "utf8");
const fillCanvas = sliceFn(menuJs, "fillCanvas");
const fillCard = sliceFn(menuJs, "fillCard");
const fillMulti = sliceFn(menuJs, "fillMulti");
const runItem = sliceFn(menuJs, "runItem");
const paintThreadList = sliceFn(clientJs, "paintThreadList");
const sendReply = sliceFn(clientJs, "sendReply");
const canManage = sliceFn(clientJs, "canManageComment");
const openMenu = sliceFn(clientJs, "openCommentMenu");
const onHold = sliceFn(clientJs, "onCommentHoldDown");
const mutate = sliceFn(clientJs, "mutateComment");
const syncServer = fs.readFileSync(path.join(root, "web/sync-server.mjs"), "utf8");
const apiComment = fs.readFileSync(path.join(root, "api/liveblocks-comment.mjs"), "utf8");
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");

const must = [
  [fillCanvas, "Add comment in fillCanvas", /Add comment/],
  [fillCard, "Add comment in fillCard", /Add comment/],
  [fillMulti, "Add comment in fillMulti", /Add comment/],
  [runItem, "act add-comment", /add-comment/],
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
  [selectJs, "select.js ignores comment-menu", /comment-menu/],
  [clientJs, "body.is-comments while sidebar is open", /classList\.toggle\("is-comments"/],
  [appCss, "gated view hides comments-panel", /is-gated \.comments-panel/],
  [clientJs, "badge lives top-right", /badgeLocation:\s*"top-right"/],
  [clientJs, "resolveUsers maps comment authors", /resolveUsers:/],
  [clientJs, "replies skip poll while focused", /replyFocused/],
  [clientJs, "sendReply posts createComment", /async function sendReply/],
  [homeHtml, "stable reply composer in index.html", /id="comment-reply"/],
  [appHtml, "stable reply composer in app.html", /id="comment-reply"/],
  [appIndexHtml, "stable reply composer in app/index.html", /id="comment-reply"/],
  [homeHtml, "comments back in index.html", /id="comments-back"/],
  [appHtml, "comments back in app.html", /id="comments-back"/],
  [appIndexHtml, "comments back in app/index.html", /id="comments-back"/],
  [appCss, "badge stays under chrome", /#liveblocks-badge/],
  [menuCss, "phone comments sit above the tools", /bottom:\s*calc\(66px \+ env\(safe-area-inset-bottom\)\)/],
  [paintThreadList, "list paint does not rebuild the reply form", /comment-reply/],
  [sendReply, "sendReply calls createComment", /createComment/],
  [clientJs, "editComment in liveblocks.js", /editComment/],
  [clientJs, "deleteComment in liveblocks.js", /deleteComment/],
  [clientJs, "right-click opens comment menu", /function onCommentContext/],
  [clientJs, "hold click opens comment menu", /function onCommentHoldDown/],
  [clientJs, "comment menu includes Edit", /act: "edit"/],
  [clientJs, "comment menu includes Delete", /act: "delete"/],
  [canManage, "authors can manage their comment", /isSelfAuthor/],
  [canManage, "system administrator can manage any comment", /isSystemAdmin/],
  [openMenu, "menu requires data-can-manage", /data-can-manage/],
  [onHold, "mobile hold uses touch or pen", /pointerType !== "touch"/],
  [mutate, "author uses room.editComment", /editComment/],
  [mutate, "admin can fall back to server", /serverComment/],
  [paintThreadList, "thread comments mark can-manage", /data-can-manage/],
  [menuCss, "coarse pointer skips selecting comment text", /pointer:\s*coarse[\s\S]*\.comment-note/],
  [syncServer, "sync-server routes /api/liveblocks-comment", /url === "\/api\/liveblocks-comment"/],
  [syncServer, "server allows author or system handle", /isSystemHandle\(handle\)/],
  [apiComment, "api/liveblocks-comment imports handleLiveblocksComment", /handleLiveblocksComment/],
  [vercel, "vercel.json defines api/liveblocks-comment.mjs function", /"api\/liveblocks-comment\.mjs"/],
];

let failed = 0;
for (const [src, label, re] of must) {
  const inverted = label.includes("does not");
  const hit = re.test(src);
  const ok = inverted ? !hit : hit;
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
console.log("pass liveblocks comments");
