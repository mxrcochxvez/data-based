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

const fillCanvas = sliceFn(menuJs, "fillCanvas");
const fillCard = sliceFn(menuJs, "fillCard");
const fillMulti = sliceFn(menuJs, "fillMulti");
const runItem = sliceFn(menuJs, "runItem");

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
  [clientJs, "getThreads in liveblocks.js", /getThreads/],
  [clientJs, "localStorage databased-comments-open", /databased-comments-open/],
  [selectJs, "select.js ignores comments-panel", /comments-panel/],
  [clientJs, "body.is-comments while sidebar is open", /classList\.toggle\("is-comments"/],
  [appCss, "gated view hides comments-panel", /is-gated \.comments-panel/],
];

let failed = 0;
for (const [src, label, re] of must) {
  const ok = re.test(src);
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
console.log("pass liveblocks comments");
