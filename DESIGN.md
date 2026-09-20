---
name: data-based
description: Cool gray board. Floating chrome. Vendor-native editors.
colors:
  ink: "#111111"
  mute: "#4a4a46"
  field: "#e6e6e3"
  island: "#ffffff"
  line: "#d2d2cc"
  sel: "#0d99ff"
  err: "#9b1d1d"
typography:
  body:
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
rounded:
  sm: "7px"
  md: "8px"
  lg: "12px"
spacing:
  sm: "8px"
  md: "14px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.island}"
    rounded: "{rounded.sm}"
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

20px dot grid. Chrome is `position: fixed`. Empty HUD is viewport-fixed. The board scroller is the only world pan.

**The One Scroll Rule.** A modal has one scrolling body. Head and foot stay put. The page behind does not scroll while the modal is open (`body.is-modal`).

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
`.rail` / `.tools`. Vertical tool island. Do not restyle the brand island from this file. Header wordmark is owned elsewhere.

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
