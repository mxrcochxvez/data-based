import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const menuCss = read("web/css/menu.css");
const menuJs = read("web/js/menu.js");
const boardsJs = read("web/js/boards.js");
const indexHtml = read("web/index.html");
const appHtml = read("web/app.html");
const appIndex = read("web/app/index.html");

const must = [
  [menuCss, "chrome-pop hugs height", /\.chrome-pop \{[\s\S]*?min-height:\s*0/],
  [menuCss, "does not pin chrome-pop to the viewport bottom", /chrome-pop \{[\s\S]*bottom:\s*max\(72px/],
  [menuJs, "anchors the More menu to its control", /function placePop\(pop, anchor\)/],
  [menuJs, "hosts chrome pops on document.body", /pop\.parentElement !== document\.body/],
  [indexHtml, "Share overlay is a dialog", /<dialog class="modal overlay-modal" id="screen-invite"/],
  [indexHtml, "People overlay is a dialog", /<dialog class="modal overlay-modal" id="screen-people"/],
  [indexHtml, "MCP overlay is a dialog", /<dialog class="modal overlay-modal" id="screen-mcp"/],
  [indexHtml, "Boards overlay is a dialog", /<dialog class="modal overlay-modal" id="screen-boards"/],
  [indexHtml, "MCP menu item is its own route", /href="#\/mcp" id="mcp-link"/],
  [boardsJs, "showView does not leave Liveblocks", /function showView[\s\S]*routing = false;/],
  [appHtml, "app.html matches overlay dialogs", /id="screen-invite"/],
  [appIndex, "app/index.html matches overlay dialogs", /id="screen-mcp"/],
];

let failed = 0;
for (const [src, label, re] of must) {
  const inverted = label.startsWith("does not ");
  const hit = re.test(src);
  const ok = inverted ? !hit : hit;
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}

const showView = boardsJs.match(/function showView[\s\S]*?\n  function /);
if (showView && /leaveBoard/.test(showView[0])) {
  console.log("fail", "showView must not call leaveBoard");
  failed += 1;
} else {
  console.log("pass", "showView must not call leaveBoard");
}

if (failed) process.exit(1);
console.log("pass chrome menu is a compact anchored panel over live board overlays");
