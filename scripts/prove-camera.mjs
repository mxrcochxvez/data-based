import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const cameraJs = read("web/js/camera.js");
const selectJs = read("web/js/select.js");
const appCss = read("web/app.css");
const appJs = read("web/app.js");
const menuJs = read("web/js/menu.js");
const indexHtml = read("web/index.html");
const appHtml = read("web/app.html");
const appIndex = read("web/app/index.html");

const must = [
  [cameraJs, "pinch tracks two pointers", /pointers\.size === 2/],
  [cameraJs, "pinch zooms toward the finger midpoint", /focusWorld\(pinch\.world\.x, pinch\.world\.y/],
  [cameraJs, "camera paints with translate and scale", /translate\(" \+ \(-\p\.x \* z\)/],
  [cameraJs, "recenter frames card bounds", /function recenter\(/],
  [cameraJs, "camera does not pan via scrollLeft", /scrollLeft/],
  [selectJs, "select pan uses Camera.setPan", /Camera\.setPan/],
  [selectJs, "card drag has no origin clamp", /card\.x = o\.left \+ dx \/ z/],
  [selectJs, "pinch aborts select", /Camera\.isPinching/],
  [appCss, "board has no overflow scroll", /\.board \{[\s\S]*?overflow:\s*hidden/],
  [appCss, "touch-action none on the board", /touch-action:\s*none/],
  [appCss, "dot grid lives on the board", /\.board \{[\s\S]*?radial-gradient/],
  [appJs, "wires recenter button into the camera", /home: \$\("recenter"\)/],
  [menuJs, "board menu offers re-center", /addItem\("Re-center", "recenter"\)/],
  [indexHtml, "index has re-center tool", /id="recenter"/],
  [appHtml, "app.html has re-center tool", /id="recenter"/],
  [appIndex, "app/index.html has re-center tool", /id="recenter"/],
];

let failed = 0;
for (const [src, label, re] of must) {
  const inverted = label.includes("does not");
  const hit = re.test(src);
  const ok = inverted ? !hit : hit;
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}

function fakeEl(box) {
  const listeners = [];
  return {
    style: {},
    clientWidth: box.width,
    clientHeight: box.height,
    getBoundingClientRect() {
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    },
    addEventListener(type, fn) {
      listeners.push({ type, fn });
    },
    listeners,
  };
}

const canvas = fakeEl({ left: 0, top: 0, width: 3600, height: 2600 });
const scroller = fakeEl({ left: 0, top: 0, width: 800, height: 600 });
const state = { camera: { pan: { x: 0, y: 0 }, zoom: 1 }, cards: [] };
const sandbox = {
  window: {},
  globalThis: null,
  Math,
  Number,
  Boolean,
  Map,
  console,
  addEventListener() {},
  setTimeout,
  clearTimeout,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(cameraJs, sandbox);

const cam = sandbox.attachCamera({
  canvas,
  scroller,
  state,
  persist() {},
  label: { textContent: "", addEventListener() {} },
  home: { addEventListener() {} },
});

function check(label, cond) {
  console.log(cond ? "pass" : "fail", label);
  if (!cond) failed += 1;
}

cam.setPan(-400, 250, false);
check("negative pan is allowed", state.camera.pan.x === -400 && state.camera.pan.y === 250);
check(
  "transform follows unbounded pan",
  canvas.style.transform === "translate(400px,-250px) scale(1)"
);

state.cards = [{ x: 200, y: 100, w: 100, h: 100 }];
cam.recenter();
check("recenter puts card block in the viewport middle", Math.abs(state.camera.pan.x - -150) < 0.001 && Math.abs(state.camera.pan.y - -150) < 0.001);

const start = canvas.style.transform;
cam.setPan(state.camera.pan.x - 80, state.camera.pan.y + 40, false);
check("pan can keep going past the last edge", canvas.style.transform !== start);

cam.setPan(0, 0, false);
state.camera.zoom = 1;
cam.apply();
const down = scroller.listeners.filter((l) => l.type === "pointerdown");
const move = scroller.listeners.filter((l) => l.type === "pointermove");
down.forEach((l) => l.fn({ pointerId: 1, pointerType: "touch", button: 0, clientX: 200, clientY: 200 }));
down.forEach((l) => l.fn({ pointerId: 2, pointerType: "touch", button: 0, clientX: 280, clientY: 200 }));
const before = state.camera.zoom;
move.forEach((l) => l.fn({ pointerId: 2, pointerType: "touch", clientX: 360, clientY: 200, preventDefault() {} }));
check("spreading two fingers zooms in", state.camera.zoom > before);

if (failed) process.exit(1);
console.log("pass unbounded camera, pinch zoom, and re-center");
