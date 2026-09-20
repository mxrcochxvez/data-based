import zlib from "node:zlib";

const BG = [230, 230, 227, 255];
const DOT = [176, 176, 170, 255];
const INK = [17, 17, 17, 255];
const MUTE = [74, 74, 70, 255];
const WHITE = [255, 255, 255, 255];
const LINE = [200, 200, 194, 255];
const NOTE = [243, 230, 166, 255];
const NOTE_LINE = [212, 192, 106, 255];
const SEL = [13, 153, 255, 255];

const KIND_LABEL = {
  note: "NOTE",
  mind: "IDEA",
  schema: "SQL",
  drizzle: "DRIZZLE",
  prisma: "PRISMA",
  logic: "EFFECT",
  ctrl: "CTRL",
  repo: "REPO",
  gql: "GRAPHQL",
};

// 3x5 glyphs, 15 bits, bit 14 = top-left, row-major left-to-right.
function pack(rows) {
  let bits = 0;
  for (const row of rows) {
    for (const ch of row) bits = (bits << 1) | (ch === "1" ? 1 : 0);
  }
  return bits;
}
const FONT = {
  " ": 0,
  "-": pack(["000", "000", "111", "000", "000"]),
  ".": pack(["000", "000", "000", "000", "010"]),
  "/": pack(["001", "001", "010", "100", "100"]),
  "0": pack(["111", "101", "101", "101", "111"]),
  "1": pack(["010", "110", "010", "010", "111"]),
  "2": pack(["111", "001", "111", "100", "111"]),
  "3": pack(["111", "001", "111", "001", "111"]),
  "4": pack(["101", "101", "111", "001", "001"]),
  "5": pack(["111", "100", "111", "001", "111"]),
  "6": pack(["111", "100", "111", "101", "111"]),
  "7": pack(["111", "001", "001", "001", "001"]),
  "8": pack(["111", "101", "111", "101", "111"]),
  "9": pack(["111", "101", "111", "001", "111"]),
  ":": pack(["000", "010", "000", "010", "000"]),
  "_": pack(["000", "000", "000", "000", "111"]),
  "A": pack(["010", "101", "111", "101", "101"]),
  "B": pack(["110", "101", "110", "101", "110"]),
  "C": pack(["011", "100", "100", "100", "011"]),
  "D": pack(["110", "101", "101", "101", "110"]),
  "E": pack(["111", "100", "110", "100", "111"]),
  "F": pack(["111", "100", "110", "100", "100"]),
  "G": pack(["011", "100", "101", "101", "011"]),
  "H": pack(["101", "101", "111", "101", "101"]),
  "I": pack(["111", "010", "010", "010", "111"]),
  "J": pack(["001", "001", "001", "101", "010"]),
  "K": pack(["101", "101", "110", "101", "101"]),
  "L": pack(["100", "100", "100", "100", "111"]),
  "M": pack(["101", "111", "111", "101", "101"]),
  "N": pack(["101", "111", "111", "111", "101"]),
  "O": pack(["010", "101", "101", "101", "010"]),
  "P": pack(["110", "101", "110", "100", "100"]),
  "Q": pack(["010", "101", "101", "111", "011"]),
  "R": pack(["110", "101", "110", "101", "101"]),
  "S": pack(["011", "100", "010", "001", "110"]),
  "T": pack(["111", "010", "010", "010", "010"]),
  "U": pack(["101", "101", "101", "101", "111"]),
  "V": pack(["101", "101", "101", "101", "010"]),
  "W": pack(["101", "101", "111", "111", "101"]),
  "X": pack(["101", "101", "010", "101", "101"]),
  "Y": pack(["101", "101", "010", "010", "010"]),
  "Z": pack(["111", "001", "010", "100", "111"]),
};

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function px(rgba, w, h, x, y, color) {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
  const i = (yi * w + xi) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function fillRect(rgba, w, h, x, y, rw, rh, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(w, Math.ceil(x + rw));
  const y1 = Math.min(h, Math.ceil(y + rh));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) px(rgba, w, h, xx, yy, color);
  }
}

function strokeRect(rgba, w, h, x, y, rw, rh, color) {
  fillRect(rgba, w, h, x, y, rw, 1, color);
  fillRect(rgba, w, h, x, y + rh - 1, rw, 1, color);
  fillRect(rgba, w, h, x, y, 1, rh, color);
  fillRect(rgba, w, h, x + rw - 1, y, 1, rh, color);
}

function line(rgba, w, h, x0, y0, x1, y1, color) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0 | 0;
  let y = y0 | 0;
  const max = dx + dy + 2;
  for (let n = 0; n < max; n++) {
    px(rgba, w, h, x, y, color);
    if (x === (x1 | 0) && y === (y1 | 0)) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

function glyph(ch) {
  const up = ch.toUpperCase();
  return FONT[up] != null ? FONT[up] : FONT["-"];
}

function drawText(rgba, w, h, x, y, text, color, scale) {
  const s = scale || 2;
  let cx = x;
  for (const ch of String(text || "")) {
    const bits = glyph(ch);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        const on = bits & (1 << (14 - (row * 3 + col)));
        if (on) fillRect(rgba, w, h, cx + col * s, y + row * s, s, s, color);
      }
    }
    cx += 4 * s;
  }
}

function clipText(s, max) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + ".";
}

function collectEdges(board) {
  const out = [];
  const seen = new Set();
  function add(from, to) {
    if (from == null || to == null || String(from) === String(to)) return;
    const key = String(from) + ">" + String(to);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ from, to });
  }
  (board.edges || []).forEach((e) => add(e.from, e.to));
  (board.cards || []).forEach((c) => {
    if (c.next != null) add(c.id, c.next);
    (c.links || []).forEach((to) => add(c.id, to));
  });
  return out;
}

export function boardSvg(board) {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  let minX = 0, minY = 0, maxX = 640, maxY = 400;
  for (const c of cards) {
    minX = Math.min(minX, c.x || 0);
    minY = Math.min(minY, c.y || 0);
    maxX = Math.max(maxX, (c.x || 0) + (c.w || 248));
    maxY = Math.max(maxY, (c.y || 0) + (c.h || 164));
  }
  const pad = 40;
  const w = Math.ceil(maxX - minX + pad * 2);
  const h = Math.ceil(maxY - minY + pad * 2);
  const ox = pad - minX;
  const oy = pad - minY;
  const edges = collectEdges(board);
  const byId = new Map(cards.map((c) => [String(c.id), c]));
  const nodes = cards.map((c) => {
    const x = (c.x || 0) + ox;
    const y = (c.y || 0) + oy;
    const fill = c.kind === "note" || c.kind === "mind" ? "#f3e6a6" : "#fff";
    const stroke = c.kind === "note" || c.kind === "mind" ? "#d4c06a" : "#c8c8c2";
    const title = (c.body && c.body.title) || c.kind;
    return `<rect x="${x}" y="${y}" width="${c.w || 248}" height="${c.h || 164}" rx="8" fill="${fill}" stroke="${stroke}"/>
      <text x="${x + 10}" y="${y + 18}" font-size="10" fill="#4a4a46">${esc(KIND_LABEL[c.kind] || c.kind)}</text>
      <text x="${x + 10}" y="${y + 38}" font-size="13" fill="#111">${esc(title)}</text>`;
  });
  const wires = edges.map((e) => {
    const a = byId.get(String(e.from));
    const b = byId.get(String(e.to));
    if (!a || !b) return "";
    const x1 = (a.x || 0) + (a.w || 248) + ox;
    const y1 = (a.y || 0) + (a.h || 164) / 2 + oy;
    const x2 = (b.x || 0) + ox;
    const y2 = (b.y || 0) + (b.h || 164) / 2 + oy;
    const mx = (x1 + x2) / 2;
    return `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="#111" stroke-width="1.6"/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#e6e6e3"/>
  ${wires.join("\n")}
  ${nodes.join("\n")}
</svg>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function boardPng(board, opts) {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  let minX = 0, minY = 0, maxX = 720, maxY = 420;
  for (const c of cards) {
    minX = Math.min(minX, c.x || 0);
    minY = Math.min(minY, c.y || 0);
    maxX = Math.max(maxX, (c.x || 0) + (c.w || 248));
    maxY = Math.max(maxY, (c.y || 0) + (c.h || 164));
  }
  const pad = 48;
  const srcW = maxX - minX + pad * 2;
  const srcH = maxY - minY + pad * 2;
  const maxDim = (opts && opts.max) || 1600;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(320, Math.round(srcW * scale));
  const h = Math.max(220, Math.round(srcH * scale));
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = BG[0];
    rgba[i * 4 + 1] = BG[1];
    rgba[i * 4 + 2] = BG[2];
    rgba[i * 4 + 3] = 255;
  }
  const step = Math.max(8, Math.round(20 * scale));
  for (let y = 6; y < h; y += step) {
    for (let x = 6; x < w; x += step) px(rgba, w, h, x, y, DOT);
  }

  const ox = (pad - minX) * scale;
  const oy = (pad - minY) * scale;
  const byId = new Map(cards.map((c) => [String(c.id), c]));
  const edges = collectEdges(board);

  for (const e of edges) {
    const a = byId.get(String(e.from));
    const b = byId.get(String(e.to));
    if (!a || !b) continue;
    const x1 = (a.x || 0) * scale + (a.w || 248) * scale + ox;
    const y1 = (a.y || 0) * scale + ((a.h || 164) / 2) * scale + oy;
    const x2 = (b.x || 0) * scale + ox;
    const y2 = (b.y || 0) * scale + ((b.h || 164) / 2) * scale + oy;
    const mx = (x1 + x2) / 2;
    line(rgba, w, h, x1, y1, mx, y1, INK);
    line(rgba, w, h, mx, y1, mx, y2, INK);
    line(rgba, w, h, mx, y2, x2, y2, INK);
    line(rgba, w, h, x2 - 6, y2 - 4, x2, y2, INK);
    line(rgba, w, h, x2 - 6, y2 + 4, x2, y2, INK);
  }

  for (const c of cards) {
    const x = Math.round((c.x || 0) * scale + ox);
    const y = Math.round((c.y || 0) * scale + oy);
    const cw = Math.round((c.w || 248) * scale);
    const ch = Math.round((c.h || 164) * scale);
    const note = c.kind === "note" || c.kind === "mind";
    fillRect(rgba, w, h, x + 2, y + 3, cw, ch, [17, 17, 17, 28]);
    fillRect(rgba, w, h, x, y, cw, ch, note ? NOTE : WHITE);
    strokeRect(rgba, w, h, x, y, cw, ch, note ? NOTE_LINE : LINE);
    const ts = scale >= 0.65 ? 2 : 1;
    const maxCh = Math.max(1, Math.floor((cw - 16) / (4 * ts)));
    drawText(rgba, w, h, x + 8, y + 8, clipText(KIND_LABEL[c.kind] || c.kind, maxCh), MUTE, ts);
    const title = (c.body && c.body.title) || "";
    drawText(rgba, w, h, x + 8, y + 8 + 8 * ts, clipText(title, maxCh), INK, ts);
    if (note && c.body && c.body.note) {
      drawText(rgba, w, h, x + 8, y + 8 + 16 * ts, clipText(c.body.note, maxCh), MUTE, 1);
    }
  }

  drawText(rgba, w, h, 12, 10, clipText((board && board.name) || "Board", 40), SEL, 2);
  return encodePng(w, h, rgba);
}
