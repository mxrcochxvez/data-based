# data-based

A browser board for planning software. The canvas is the page. Tools float. A house opens a marketplace of named elements. Cards place, move, and edit in the vendor’s own language.

The UI is HTML, CSS, and JavaScript. Bend stays for `board.bend` laws and proofs. There is no Next.js, and the native `App.run` window is not the product.

## How to run

Static + authed sync (serves `web/` and writes `web/data/store.json`):

```bash
node web/sync-server.mjs
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/). Default port is `8765` (`PORT` overrides).

### Access control (Clerk + Google)

Sign-in is **Clerk**, **Sign in with Google** only. There is no public self-signup and no homemade password table.

**Env (names only — never commit values)**

| Name | Where | Role |
| --- | --- | --- |
| `CLERK_PUBLISHABLE_KEY` | Client via `GET /api/config` | Clerk JS. Also accepted: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` |
| `CLERK_SECRET_KEY` | Server only | Verify session JWTs; create Clerk invitations |
| `SYSTEM_USER_EMAIL` | Server | Clerk email of the operator. Alias: `DATABSED_SYSTEM_EMAIL` |

Example operator: `SYSTEM_USER_EMAIL=marcode.chavez.jr@gmail.com`

After Google sign-in the client sends `Authorization: Bearer <Clerk session JWT>`. The server verifies it and uses the **JWT email** for ACL. It does not trust a client-supplied email header when Clerk is configured.

**Clerk dashboard checklist**

1. Create (or reuse) a Clerk application.
2. **Social connections → Google**: enable. Add your Google OAuth client ID/secret in Clerk (not in this repo).
3. **Restrictions**: turn **Allow new users to sign up** off, or set the app to **Restricted** and use **Invitations** so only invited emails can join.
4. Disable email/password if you want Google-only.
5. **Paths / allowed origins**: `http://127.0.0.1:8765` and the Vercel URL.
6. Copy the **publishable** key to `CLERK_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_…` from an old Next experiment). Copy the **secret** key to `CLERK_SECRET_KEY` on the server / Vercel only.
7. Invite `SYSTEM_USER_EMAIL` in Clerk (Users → Invitations) so that Google account can sign in the first time. After they sign in they are the system operator by email match.
8. Redeploy after adding env vars.

**How Google invite-only meets our ACL**

- Clerk invitations (dashboard or **Invite to app**) are what let someone complete Google sign-in.
- Our store still gates the product: even a signed-in Clerk user without app grant sees the full-page no-access screen (`marcode.chavez.jr@gmail.com`).
- **Invite to app** (`#/people`, system only): grants app access **and** calls Clerk `invitations.createInvitation`.
- **Invite to this board** (`#/invite/:id`, any peer on the board): email on the board only. No Clerk account. They still cannot use the app until the system user grants app access and they sign in with Google.

| Action | Who | Effect |
| --- | --- | --- |
| Invite to app | System user only | ACL grant + Clerk invitation |
| Invite to this board | Anyone who can open that board | Board grant list only |
| Revoke app access | System user only | Signed-in users get the no-access screen |

**What each role sees**

- **Normal user:** only boards they own or were invited to. No global user directory (`GET /api/access/users` and `/api/access/boards` are 403). MCP keys are per-user and see only those boards.
- **System user:** all users (emails), revoke app access, browse everyone’s boards grouped by user, open any board. Their MCP key sees all boards. `GET /api/sync` returns the full store.

The server store is the source of truth. A normal user’s `PUT` cannot overwrite boards they cannot access.

Do not commit `.env.local` or tokens. See `.env.example`.

While signed in, the client PUTs the full `databased.v1` blob to `/api/sync` every 20s, and again on `visibilitychange` (hidden) and `beforeunload`. On load it GETs `/api/sync` and takes the server copy only if `updatedAt` is newer. Last-write-wins: a newer local draft is not replaced. Concurrent edits can drop the older write.

Auth gate (`web/js/sync.js`): require a Clerk session (Google). Sync/MCP key APIs send that session JWT. MCP tool calls still use the per-user `dbk_` key.

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

**Production deploys via Vercel ↔ GitHub** (dashboard Git connection on push to `main`). That is the only automated path. A second GitHub Actions workflow was redundant and is not used — you do not need `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` as Actions secrets.

Connect the GitHub repo in the Vercel dashboard (root directory = repo root, framework = Other). `vercel.json` copies browser assets from `web/` into `.vercel-public` (server `.mjs` files are not published) and maps:

| Browser path | Function |
| --- | --- |
| `/api/sync` | `api/sync.mjs` |
| `/api/config` | `api/config.mjs` (Clerk publishable key only) |
| `/mcp`, `/sse`, `/mcp/*`, `/api/mcp/*` | `api/mcp.mjs` |

### Persistence (required on Vercel)

Vercel has **no durable local disk**. Local `node web/sync-server.mjs` still writes `web/data/store.json`. On Vercel, writes **503** unless a store is configured — the app will not silently empty boards.

**Preferred:** Vercel dashboard → Storage → create **Upstash Redis**. That sets:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

(or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`)

**Fallback:** Blob (`BLOB_READ_WRITE_TOKEN`). Same JSON documents, less atomic than Redis. Last-write-wins still applies.

Optional `STORE_BACKEND=kv|blob|fs`. `fs` is for local only.

Set `SYSTEM_USER_EMAIL` (or `DATABSED_SYSTEM_EMAIL`), `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY` on the Vercel project. Redeploy after adding env vars. See `.env.example`. Never commit secret values.

### Open Graph / share image

`web/index.html` sets `og:image` to `/og.png` (`web/og.png`, 1200×630 wordmark on the cool-gray board). Path-relative URLs work on a Vercel deploy. Some crawlers need an absolute URL: set `PUBLIC_ORIGIN` to the production origin (no trailing slash), e.g. `https://your-deployment.vercel.app`. Do not invent a live domain. The static prepare step (`scripts/prepare-vercel-static.mjs`) prefixes `og:url` and `og:image` when that env is present at build.

MCP keys and ingest snapshots use the same backend (`mcp-keys` / `ingests` keys), not a gitignored file on the serverless filesystem.

### MCP on Vercel

Point Cursor at `https://<your-deployment>/mcp` with `Authorization: Bearer dbk_...`.

Transport is **streamable HTTP**: **POST** JSON-RPC. **GET** `/mcp` returns immediately (`{"transport":"streamable-http"}`). If `Accept: text/event-stream`, GET writes one `endpoint` event and **closes** the stream. Vercel functions cannot hold a classic long-lived SSE GET.

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
- `web/og.png`, `web/favicon.svg`, `web/favicon.png`, `web/apple-touch-icon.png`: share image and icons
- `web/js/persist.js`, `web/js/sync.js`, `web/js/access.js`, `web/sync-server.mjs`: localStorage blob + authed `/api/sync` + app-access ACL
- `api/sync.mjs`, `api/mcp.mjs`, `api/access.mjs`, `api/config.mjs`, `vercel.json`: Vercel static + serverless
- `web/mcp-server.mjs`, `web/mcp/`, `web/js/mcp-keys.js`: per-user MCP keys + HTTP/stdio tools
- `board.bend`: `Stamp`, `Body`, `Board`, `Cmd`, `Board.apply`
- `LAWS.bend`, `PROOF.bend`: `add_zero`, `stamp_eq_refl`, `empty_elems_len`
- `auth.bend`, `collab.bend`, `ai.bend`: Bend stubs (invite name, TCP wire, `Ai.parse`)
- `catalog.bend`, `view.bend`, `tick.bend`, `main.bend`: leftover native shell

## Stubs

- Auth: Clerk + Google. System operator is `SYSTEM_USER_EMAIL`. The Bend stub is not the allowlist.
- Live presence and AI chat: not in the browser yet. Same TCP/string limits as before
- Multi-select and snap-to-grid: not shipped
