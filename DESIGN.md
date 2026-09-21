---
name: data-based
description: Cool gray board. Floating chrome. Vendor-native editors.
colors:
  ink: "#111111"
  black: "#000000"
  charcoal: "#1e1e1c"
  mute: "#4a4a46"
  subtle: "#8a8a84"
  field: "#e6e6e3"
  field-alt: "#f7f7f4"
  island: "#ffffff"
  line: "#d2d2cc"
  line-subtle: "#e2e2dc"
  border-soft: "#c8c8c2"
  border-dim: "#bdbdb6"
  border-tint: "#c4c4be"
  sel: "#0d99ff"
  sel-soft: "#eef6ff"
  sel-ghost: "#f4faff"
  sel-blue: "#3d7be6"
  err: "#9b1d1d"
  ok: "#107e3e"
  prisma: "#0c344b"
  drizzle: "#c5f74f"
  graphql: "#e10098"
  kysely: "#121212"
  convex: "#EE342F"
  zod: "#408AFF"
  proto: "#30638E"
  trpc: "#398CCB"
  hono: "#FF5B11"
  openapi: "#6BA539"
  sql: "#336791"
  effect: "#e88c30"
  tag-blue: "#7eb6ff"
  tag-green: "#8fe3c1"
  tag-amber: "#f0c56e"
  tag-pink: "#e6a0c8"
  tag-orange: "#f3b184"
typography:
  brand:
    fontFamily: "IBM Plex Sans Condensed, Arial Narrow, Helvetica Neue Condensed, ui-sans-serif, sans-serif"
    fontSize: "14px"
    fontWeight: 700
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(36px, 5vw, 56px)"
    fontWeight: 650
    lineHeight: 1.05
  h1:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.15
  h2:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
  h3:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
  lead:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 650
    letterSpacing: "0.04em"
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.5
  mono-sm:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "11px"
    lineHeight: 1.4
  scale:
    xs: "10px"
    sm: "11px"
    base: "12px"
    md: "13px"
    lg: "14px"
    sub: "15px"
    card: "16px"
    lead: "17px"
    h4: "18px"
    h3: "20px"
    h2: "24px"
    h1: "28px"
    title: "36px"
    hero: "56px"
rounded:
  xs: "4px"
  sm: "6px"
  base: "7px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  xxl: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.island}"
    rounded: "{rounded.base}"
    padding: "7px 11px"
  card:
    backgroundColor: "{colors.island}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
---

# Design System: data-based

## Overview

**Creative North Star: "The Cool Paper Board"**

A FigJam-like field of cool gray dots. White islands float. Selection blue touches only the live object. New marketplace or modal UI uses the primitives below. Do not invent a second chrome language.

**Key Characteristics:**
- One scroll per overlay
- Menus leave the scroll box
- Cards and notes sit on the dots. Instruction copy does not.

## Colors

Restrained ink on `#E6E6E3`. `#0D99FF` is selection and focus only.

**The One Accent Rule.** Selection blue never fills a resting surface.

## Typography

System sans. Mono only inside CodePane. No IBM Plex. No display face.

## Layout

20px dot grid. Chrome is `position: fixed`. Empty HUD is viewport-fixed. The board camera pans and zooms the world with no scroll edge. Pinch on a touch screen zooms the board. Re-center frames the cards.

**The One Scroll Rule.** A modal has one scrolling body. Head and foot stay put. The page behind does not scroll while the modal is open (`body.is-modal`). The board itself does not use overflow scroll.

## Elevation & Depth

Islands use `--shadow`. No zero-offset glow.

## Shapes

8px cards. 12px modal. 7px fields.

## Components

New element types add data and reuse these classes. They do not grow one-off CSS.

### Modal
`.modal` overflow visible. `.modal-form` overflow hidden. `.modal-body` is the only scroll. Combobox menus live in `#combo-pop` inside the dialog, `position: fixed`, so they are not clipped.

### SheetTable
`.sheet-table` / `.grid`. Spreadsheet rows. `+` adds a row without `scrollIntoView`. Preserve `modal-body.scrollTop`.

### Combobox
`.combo` is the field. `#combo-pop` is the menu. Type a custom value or pick. Arrow, Enter, Escape. Collision keeps the menu on screen.

### CodePane
`.code-pane` / `.code`. Highlighted pre under a transparent textarea. Scrolls stay in sync.

### Card
`.card`. Selection class `.is-sel`. Notes use `.card.note`. Pipeline `+` is `.card-next`.

### Rail
`.rail` / `.tools`. Vertical tool island. Do not restyle the brand island from this file. Header wordmark is owned elsewhere. On a phone the tools sit in a bottom island. Comments open as a sheet above that island. The Liveblocks badge stays below the header, never over the tools.

### Marketplace
`.market-grid` is a flat app launcher. `.offer` is icon then name. Vendor kinds fill `.offer-mark` with their brand color. Data-based kinds (note, mind, SQL table, effect, controller, repository) stay ink on `--field`. Rail filters dim other tiles (`.offer.is-dim`). Do not bring back list rows or section headings in this panel.

## Do's and Don'ts

### Do:
- **Do** put overlays in the dialog top layer (`#combo-pop` is a sibling of `.modal-form`).
- **Do** call `persist()` after canvas mutations. `Persist.schedule` writes if `js/persist.js` loaded.
- **Do** keep instructional copy in `.hud-empty`, never on the pannable grid.

### Don't:
- **Don't** nest `overflow: auto` inside `.modal-body`.
- **Don't** absolutely position a menu inside the sheet table.
- **Don't** persist on first paint. That wipes a saved document.
- **Don't** restyle `.brand` / `.wordmark` from editor or canvas work.
