# data-based

A browser board for planning software. The canvas is the page. Tools float. A house opens a marketplace of named elements. Cards place, move, and edit in the vendor’s own language.

The UI is HTML, CSS, and JavaScript. Bend stays for `board.bend` laws and proofs. There is no Next.js, and the native `App.run` window is not the product.

## How to run

Static + authed sync (serves `web/` and writes `web/data/store.json`):

```bash
node web/sync-server.mjs
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/). Default port is `8765` (`PORT` overrides).

### Access control

The system operator is **not** a hardcoded `ghost` user. Set one of:

- `SYSTEM_USER_EMAIL` (preferred)
- `DATABSED_SYSTEM_EMAIL` (alias)

Example: `SYSTEM_USER_EMAIL=marcode.chavez.jr@gmail.com`

That email is the only person who can **invite people into the product** (grant app access) or **revoke app access**. Everyone else is a normal user.

**App invite vs board invite**

| Action | Who | Effect |
| --- | --- | --- |
| Invite to app (`#/people`) | System user only | Creates/restores a granted account. Required to open the product. |
| Invite to this board (`#/invite/:id`) | Anyone who can open that board | Adds an email to the board grant list. Does **not** grant app access. |

If a peer board-invites an email that has no app access, that person still gets the full-page no-access screen until the system user grants app access. Revoked users see the same screen and are asked to reach out to the operator (the system email, or `marcode.chavez.jr@gmail.com` if unset).

**What each role sees**

- **Normal user:** only boards they own or were invited to. No global user directory (`GET /api/access/users` and `/api/access/boards` are 403). MCP keys are per-user and see only those boards.
- **System user:** all users (emails), revoke app access, browse everyone’s boards grouped by user, open any board. Their MCP key sees all boards. `GET /api/sync` returns the full store.

The server store (local `web/data/store.json` or Vercel KV/Blob) is the source of truth. `GET /api/sync` is filtered for the authenticated email (`X-DataBased-User`). A normal user’s `PUT` cannot delete or overwrite boards they cannot access. Do not trust the client’s board list.

Local without `SYSTEM_USER_EMAIL` stays open (fs backend) so you can work offline. On Vercel, ACL is on even if the env is missing — nobody is system, so nobody can grant app access until you set it and redeploy. Identity is the email header (or Clerk email if Clerk is on the page). This is invite-only behind your deployment, not a public IdP.

Do not commit `.env.local` or tokens. See `.env.example`.

While signed in, the client PUTs the full `databased.v1` blob to `/api/sync` every 20s, and again on `visibilitychange` (hidden) and `beforeunload`. On load it GETs `/api/sync` and takes the server copy only if `updatedAt` is newer. Last-write-wins: a newer local draft is not replaced. Concurrent edits can drop the older write.

Auth gate (`web/js/sync.js`): if Clerk is on the page, require `Clerk.user` / `Clerk.session`. Else a `databased.token` or `DB.authToken` counts. Else the local email in `databased.user` counts when the server says you have app access. Set `localStorage.databased.user` to `signed-out` (or `DB.user = null`) for local-only; no network, no console errors.

## MCP (Cursor / Claude)

Every invite user gets a secret MCP key. Hashes live in `web/data/mcp-keys.json` (gitignored). The raw key is shown once on create or reset.

1. Run `node web/sync-server.mjs` (MCP is on the same port as the app).
2. Open [Invite to board](http://127.0.0.1:8765/#/invite) or the **MCP** nav link.
3. **Create MCP key**, copy it. If you think it leaked, **Reset key** (confirm). The old key 401s immediately. We do not email keys.

Cursor `~/.cursor/mcp.json` (or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "data-based": {
      "url": "http://127.0.0.1:8765/mcp",
      "headers": {
        "Authorization": "Bearer dbk_<your-key>"
      }
    }
  }
}
```

Query form also works: `http://127.0.0.1:8765/mcp?key=dbk_<your-key>`.

stdio (same store, needs the key in the environment):

```bash
MCP_KEY='dbk_<your-key>' node web/mcp-server.mjs --stdio
```

```json
{
  "mcpServers": {
    "data-based": {
      "command": "node",
      "args": ["/absolute/path/to/ghost-ai/web/mcp-server.mjs", "--stdio"],
      "env": { "MCP_KEY": "dbk_<your-key>" }
    }
  }
}
```

### Tools

- `list_boards` / `get_board` — boards the key’s user owns or was invited to (system key sees all)
- `create_board` / `delete_board` / `update_board` — CRUD; delete is owner-only
- `list_cards` / `upsert_note`
- `export_agent_prompt` — same Markdown as **Export agent prompt** (`web/js/export.js`)
- `get_board_image` — PNG from board JSON (cards + arrows). Same image at `GET /mcp/boards/:id/image` with the key
- `ingest_codebase` — push extracted architecture (`tables[]`, `modules[]`, `effects[]`, `routers[]`, `edges[]`, `notes[]`, optional `files[]`). This server does not clone git
- `create_board_from_ingest` — new board the key’s user owns, laid out table → repo → effect → controller

Unauthorized boards return an error. Wrong key → HTTP 401.

### Agent prompt (map a repo)

Read the repo yourself (`prisma/schema.prisma`, Drizzle tables, SQL, routes, services, module folders). Call `ingest_codebase` with only facts that exist, then `create_board_from_ingest` with the returned `ingest_id` (or the same payload). Do not invent tables, endpoints, or edges that are not in the repo. Many-to-many arrows are allowed. Notes are constraints, not decoration.

Static only (localStorage, no sync endpoint):

```bash
cd web
python3 -m http.server 8765
```

Or open `web/index.html` from disk. A local server is the reliable path. Without the sync server, authed push/pull fail quietly.

## Vercel (production)

This is a static site plus two Node serverless functions. There is no Next.js.

```bash
npm install
npx vercel login
npx vercel link --yes
npx vercel env pull .env.local --yes   # after storage is attached
npx vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard (root directory = repo root, framework = Other). `vercel.json` copies browser assets from `web/` into `.vercel-public` (server `.mjs` files are not published) and maps:

| Browser path | Function |
| --- | --- |
| `/api/sync` | `api/sync.mjs` |
| `/mcp`, `/sse`, `/mcp/*`, `/api/mcp/*` | `api/mcp.mjs` |

### Persistence (required on Vercel)

Vercel has **no durable local disk**. Local `node web/sync-server.mjs` still writes `web/data/store.json`. On Vercel, writes **503** unless a store is configured — the app will not silently empty boards.

**Preferred:** Vercel dashboard → Storage → create **Upstash Redis**. That sets:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

(or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`)

**Fallback:** Blob (`BLOB_READ_WRITE_TOKEN`). Same JSON documents, less atomic than Redis. Last-write-wins still applies.

Optional `STORE_BACKEND=kv|blob|fs`. `fs` is for local only.

Set `SYSTEM_USER_EMAIL` (or `DATABSED_SYSTEM_EMAIL`) on the Vercel project so production has an operator. Redeploy after adding env vars (they are applied at deploy time). See `.env.example`.

MCP keys and ingest snapshots use the same backend (`mcp-keys` / `ingests` keys), not a gitignored file on the serverless filesystem.

### MCP on Vercel

Point Cursor at `https://<your-deployment>/mcp` with `Authorization: Bearer dbk_...`.

Transport is **streamable HTTP**: **POST** JSON-RPC. **GET** `/mcp` returns immediately (`{"transport":"streamable-http"}`). If `Accept: text/event-stream`, GET writes one `endpoint` event and **closes** the stream. Vercel functions cannot hold a classic long-lived SSE GET.

### GitHub Actions

Workflow: `.github/workflows/vercel.yml` (push to `main`). Secrets:

- `VERCEL_TOKEN` — [account tokens](https://vercel.com/account/tokens)
- `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` — from `.vercel/project.json` after `npx vercel link`

Do not commit `.env.local` or token files.

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
- Table cards carry a `+` that adds a next-kind card and one arrow. The same card can grow many arrows. Drag a port onto another card to share a module. Notes are not in that helper.
- Note cards: toolstrip sticky, or marketplace. Click into the card to write. Resize from the corner
- Empty-state copy is a viewport HUD. Panning the dots does not move it
- `#/boards` creates and switches boards. `#/invite/:id` invites an email **to that board**. `#/people` (system user) invites **into the product**. No public signup. Boards persist in `localStorage` (`databased.v1`, legacy `data-based.v1`). Authed sessions also sync the same blob to the server; the server filters by user.
- `V` select, Space pan, `N` note, `Esc` close, `⌫` delete the selected card

## Native path

Abandoned. `main.bend` / `view.bend` / `tick.bend` still typecheck as a Bend `App.run` experiment, but they draw a 1024 image without real text. Do not run `./ghost` or `./data-based`. Bend's JS host cannot open a window. `bend page.html -o dist` can import non-IO `.bend` into a page; this app does not need that.

## Files

- `web/index.html`, `web/app.css`, `web/app.js`, `web/highlight.js`: the product
- `web/js/persist.js`, `web/js/sync.js`, `web/js/access.js`, `web/sync-server.mjs`: localStorage blob + authed `/api/sync` + app-access ACL
- `api/sync.mjs`, `api/mcp.mjs`, `api/access.mjs`, `vercel.json`: Vercel static + serverless
- `web/mcp-server.mjs`, `web/mcp/`, `web/js/mcp-keys.js`: per-user MCP keys + HTTP/stdio tools
- `board.bend`: `Stamp`, `Body`, `Board`, `Cmd`, `Board.apply`
- `LAWS.bend`, `PROOF.bend`: `add_zero`, `stamp_eq_refl`, `empty_elems_len`
- `auth.bend`, `collab.bend`, `ai.bend`: Bend stubs (invite name, TCP wire, `Ai.parse`)
- `catalog.bend`, `view.bend`, `tick.bend`, `main.bend`: leftover native shell

## Stubs

- Auth: system operator is `SYSTEM_USER_EMAIL` / `DATABSED_SYSTEM_EMAIL`. The Bend stub is not the allowlist. Enter your email in the who-are-you screen; Clerk email is used if Clerk is on the page.
- Live presence and AI chat: not in the browser yet. Same TCP/string limits as before
- Multi-select and snap-to-grid: not shipped
