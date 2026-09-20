# data-based

A browser board for planning software. The canvas is the page. Tools float. A house opens a marketplace of named elements. Cards place, move, and edit in the vendor’s own language.

The UI is HTML, CSS, and JavaScript. Bend stays for `board.bend` laws and proofs. There is no Next.js, and the native `App.run` window is not the product.

## How to run

Static + authed sync (serves `web/` and writes `web/data/store.json`):

```bash
node web/sync-server.mjs
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/). Default port is `8765` (`PORT` overrides).

While signed in, the client PUTs the full `databased.v1` blob to `/api/sync` every 20s, and again on `visibilitychange` (hidden) and `beforeunload`. On load it GETs `/api/sync` and takes the server copy only if `updatedAt` is newer. Last-write-wins: a newer local draft is not replaced. Concurrent edits can drop the older write.

Auth gate (`web/js/sync.js`): if Clerk is on the page, require `Clerk.user` / `Clerk.session`. Else a `databased.token` or `DB.authToken` counts. Else the local “signed in as you” stub is authed. Set `localStorage.databased.user` to `signed-out` (or `DB.user = null`) for local-only; no network, no console errors.

Static only (localStorage, no sync endpoint):

```bash
cd web
python3 -m http.server 8765
```

Or open `web/index.html` from disk. A local server is the reliable path. Without the sync server, authed push/pull fail quietly.

Bend 2 is optional unless you are changing laws:

```bash
brew install bend
bend PROOF.bend
```

## What you can do

- House on the floating tools, or `H`: marketplace with headings and named elements
- Click an element to place a card
- Drag a card to move it. A drag does not open edit. Double-click, Edit, or `E` does
- Prisma, Drizzle, GraphQL, and SQL each edit in that language. Spreadsheet fields and the highlighted source stay in sync. Types are a combobox: pick or type a custom value
- Effect cards have Input type, Output type, and Effects in the box
- Table cards carry a `+` that adds the next layer (repo → effects → controller) and draws an arrow. Notes are not in that chain
- Note cards: toolstrip sticky, or marketplace. Click into the card to write. Resize from the corner
- Empty-state copy is a viewport HUD. Panning the dots does not move it
- `#/boards` creates and switches boards. `#/invite/:id` grants access by email or handle. No public signup. Boards persist in `localStorage` (`databased.v1`, legacy `data-based.v1`). Authed sessions also sync the same blob to the local server.
- `V` select, Space pan, `N` note, `Esc` close, `⌫` delete the selected card

## Native path

Abandoned. `main.bend` / `view.bend` / `tick.bend` still typecheck as a Bend `App.run` experiment, but they draw a 1024 image without real text. Do not run `./ghost` or `./data-based`. Bend's JS host cannot open a window. `bend page.html -o dist` can import non-IO `.bend` into a page; this app does not need that.

## Files

- `web/index.html`, `web/app.css`, `web/app.js`, `web/highlight.js`: the product
- `web/js/persist.js`, `web/js/sync.js`, `web/sync-server.mjs`: localStorage blob + authed `/api/sync`
- `board.bend`: `Stamp`, `Body`, `Board`, `Cmd`, `Board.apply`
- `LAWS.bend`, `PROOF.bend`: `add_zero`, `stamp_eq_refl`, `empty_elems_len`
- `auth.bend`, `collab.bend`, `ai.bend`: Bend stubs (invite name, TCP wire, `Ai.parse`)
- `catalog.bend`, `view.bend`, `tick.bend`, `main.bend`: leftover native shell

## Stubs

- Auth: one allowlist name in Bend (`ghost`). The web chrome is a static “signed in as you” invite line
- Live presence and AI chat: not in the browser yet. Same TCP/string limits as before
- Multi-select and snap-to-grid: not shipped
