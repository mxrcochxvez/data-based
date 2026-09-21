(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  const PRESETS = {
    auth: {
      name: "auth-core.board",
      chip: "auth-core",
      cards: [
        {
          id: "card-user",
          kind: "prisma",
          kindLabel: "PRISMA",
          title: "User",
          codeLang: "prisma",
          schemaItems: [
            { name: "id", type: "String", tag: "@id @default(cuid())" },
            { name: "email", type: "String", tag: "@unique" },
            { name: "name", type: "String?" },
            { name: "orgId", type: "String", tag: "@index" },
            { name: "role", type: "Role", tag: "@default(MEMBER)" },
            { name: "createdAt", type: "DateTime", tag: "@default(now())" }
          ],
          code: `model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  orgId     String
  role      Role     @default(MEMBER)
  createdAt DateTime @default(now())
  org       Org      @relation(fields: [orgId], references: [id])
}`
        },
        {
          id: "card-org",
          kind: "sql",
          kindLabel: "POSTGRES",
          title: "organizations",
          codeLang: "sql",
          schemaItems: [
            { name: "id", type: "uuid", tag: "PRIMARY KEY" },
            { name: "slug", type: "text", tag: "UNIQUE NOT NULL" },
            { name: "name", type: "text", tag: "NOT NULL" },
            { name: "plan", type: "text", tag: "DEFAULT 'team'" },
            { name: "max_seats", type: "integer", tag: "DEFAULT 10" }
          ],
          code: `CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'team',
  max_seats INT DEFAULT 10
);`
        },
        {
          id: "card-gql",
          kind: "graphql",
          kindLabel: "GRAPHQL",
          title: "ViewerQuery",
          codeLang: "graphql",
          schemaItems: [
            { name: "viewer", type: "User!" },
            { name: "organization", type: "Org(slug: String!)" },
            { name: "membership", type: "OrgMembership" }
          ],
          code: `type Query {
  viewer: User!
  organization(slug: String!): Org
  membership: OrgMembership
}

type User {
  id: ID!
  email: String!
  org: Org!
}`
        }
      ],
      wires: [
        { from: "card-user", to: "card-gql", fromSide: "right", toSide: "left" },
        { from: "card-org", to: "card-gql", fromSide: "right", toSide: "left" }
      ]
    },
    billing: {
      name: "billing-pipeline.board",
      chip: "billing-pipeline",
      cards: [
        {
          id: "card-user",
          kind: "drizzle",
          kindLabel: "DRIZZLE",
          title: "subscriptions",
          codeLang: "typescript",
          schemaItems: [
            { name: "id", type: "serial", tag: "primaryKey()" },
            { name: "customerId", type: "text", tag: "notNull()" },
            { name: "status", type: "text", tag: "'active' | 'past_due'" },
            { name: "tier", type: "text", tag: "'starter' | 'pro'" },
            { name: "currentPeriodEnd", type: "timestamp", tag: "notNull()" }
          ],
          code: `export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  status: text("status").$type<"active" | "past_due">(),
  tier: text("tier").$type<"starter" | "pro">(),
  currentPeriodEnd: timestamp("current_period_end").notNull()
});`
        },
        {
          id: "card-org",
          kind: "sql",
          kindLabel: "POSTGRES",
          title: "invoices",
          codeLang: "sql",
          schemaItems: [
            { name: "id", type: "uuid", tag: "PRIMARY KEY" },
            { name: "sub_id", type: "integer", tag: "REFERENCES subscriptions(id)" },
            { name: "amount_cents", type: "integer", tag: "NOT NULL" },
            { name: "paid_at", type: "timestamptz" }
          ],
          code: `CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_id INT REFERENCES subscriptions(id),
  amount_cents INT NOT NULL,
  paid_at TIMESTAMPTZ
);`
        },
        {
          id: "card-gql",
          kind: "effect",
          kindLabel: "EFFECT",
          title: "onStripeWebhook",
          codeLang: "typescript",
          schemaItems: [
            { name: "event", type: "Stripe.Event" },
            { name: "handler", type: "syncSubscriptionTier(cust, tier)" },
            { name: "output", type: "Result<Invoice, BillingError>" }
          ],
          code: `export async function onStripeWebhook(event: Stripe.Event) {
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    await syncSubscriptionTier(sub.customer, sub.items.data[0].price.id);
  }
}`
        }
      ],
      wires: [
        { from: "card-user", to: "card-gql", fromSide: "right", toSide: "left" },
        { from: "card-org", to: "card-gql", fromSide: "right", toSide: "left" }
      ]
    },
    events: {
      name: "event-stream.board",
      chip: "event-stream",
      cards: [
        {
          id: "card-user",
          kind: "prisma",
          kindLabel: "PRISMA",
          title: "AuditEvent",
          codeLang: "prisma",
          schemaItems: [
            { name: "id", type: "String", tag: "@id @default(uuid())" },
            { name: "actorId", type: "String", tag: "@index" },
            { name: "action", type: "String" },
            { name: "resource", type: "String" },
            { name: "metadata", type: "Json" },
            { name: "occurredAt", type: "DateTime", tag: "@default(now())" }
          ],
          code: `model AuditEvent {
  id         String   @id @default(uuid())
  actorId    String
  action     String
  resource   String
  metadata   Json
  occurredAt DateTime @default(now())
}`
        },
        {
          id: "card-org",
          kind: "drizzle",
          kindLabel: "DRIZZLE",
          title: "webhooks",
          codeLang: "typescript",
          schemaItems: [
            { name: "id", type: "uuid", tag: "defaultRandom()" },
            { name: "targetUrl", type: "text", tag: "notNull()" },
            { name: "events", type: "text[]" },
            { name: "secret", type: "text", tag: "notNull()" }
          ],
          code: `export const webhooks = pgTable("webhooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  targetUrl: text("target_url").notNull(),
  events: text("events").array(),
  secret: text("secret").notNull()
});`
        },
        {
          id: "card-gql",
          kind: "effect",
          kindLabel: "EFFECT",
          title: "dispatchWebhook",
          codeLang: "typescript",
          schemaItems: [
            { name: "trigger", type: "AuditEvent" },
            { name: "fanout", type: "Queue.enqueueBatch(webhooks)" },
            { name: "retry", type: "ExponentialBackoff(max: 5)" }
          ],
          code: `export async function dispatchWebhook(event: AuditEvent) {
  const subscribers = await findSubscribersFor(event.action);
  for (const hook of subscribers) {
    await Queue.enqueue("deliver-hook", { hookId: hook.id, event });
  }
}`
        }
      ],
      wires: [
        { from: "card-user", to: "card-gql", fromSide: "right", toSide: "left" },
        { from: "card-org", to: "card-gql", fromSide: "right", toSide: "left" }
      ]
    }
  };

  let currentPreset = "auth";
  let activeCardId = "card-user";
  let activeViewMode = "schema"; // "schema" | "code"

  function renderPreset(presetKey) {
    const data = PRESETS[presetKey];
    if (!data) return;
    currentPreset = presetKey;

    const boardchip = $("splash-boardchip");
    if (boardchip) boardchip.textContent = data.chip;

    data.cards.forEach((c) => {
      const el = $(c.id);
      if (!el) return;

      const kindEl = el.querySelector(".card-kind");
      if (kindEl) {
        kindEl.textContent = c.kindLabel;
        kindEl.className = "card-kind card-kind--" + c.kind;
      }
      const titleEl = el.querySelector(".card-title");
      if (titleEl) titleEl.textContent = c.title;

      const bodyEl = el.querySelector(".card-body");
      if (bodyEl) {
        if (activeViewMode === "code" && c.id === activeCardId) {
          bodyEl.innerHTML = `<pre class="splash-code-pane"><code>${escapeHtml(c.code)}</code></pre>`;
        } else {
          let html = '<ul class="splash-schema-list">';
          c.schemaItems.forEach((item) => {
            html += `<li><code>${item.name}</code> <span class="type-tok">${item.type}</span>${
              item.tag ? ` <span class="tag-tok">${item.tag}</span>` : ""
            }</li>`;
          });
          html += "</ul>";
          bodyEl.innerHTML = html;
        }
      }
    });

    updateSelection();
    updateWires();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function updateSelection() {
    ["card-user", "card-org", "card-gql"].forEach((id) => {
      const el = $(id);
      if (el) {
        el.classList.toggle("is-sel", id === activeCardId);
      }
    });
  }

  function updateWires() {
    const svg = $("splash-wires");
    const world = $("splash-world");
    if (!svg || !world) return;

    const rectWorld = world.getBoundingClientRect();
    if (rectWorld.width === 0 || rectWorld.height === 0) return;

    const data = PRESETS[currentPreset];
    if (!data) return;

    let paths = "";
    data.wires.forEach((w) => {
      const fromEl = $(w.from);
      const toEl = $(w.to);
      if (!fromEl || !toEl) return;

      const rf = fromEl.getBoundingClientRect();
      const rt = toEl.getBoundingClientRect();

      const x1 = (rf.right - rectWorld.left);
      const y1 = (rf.top + rf.height / 2 - rectWorld.top);
      const x2 = (rt.left - rectWorld.left);
      const y2 = (rt.top + rt.height / 2 - rectWorld.top);

      const dx = Math.max(30, (x2 - x1) * 0.55);
      const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;

      paths += `<path class="wire-base" d="${d}" />`;
      paths += `<path class="wire-pulse" d="${d}" />`;
    });

    svg.innerHTML = paths;
  }

  function initTabs() {
    const tabs = document.querySelectorAll("[data-preset-tab]");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        renderPreset(tab.getAttribute("data-preset-tab"));
      });
    });
  }

  function initCardClicks() {
    ["card-user", "card-org", "card-gql"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", () => {
        activeCardId = id;
        updateSelection();
        renderPreset(currentPreset);
      });
    });
  }

  function initViewToggle() {
    const btn = $("splash-view-toggle");
    if (!btn) return;

    btn.addEventListener("click", () => {
      activeViewMode = activeViewMode === "schema" ? "code" : "schema";
      btn.textContent = activeViewMode === "schema" ? "View Vendor Code" : "View Visual Schema";
      btn.setAttribute("aria-pressed", activeViewMode === "code");
      renderPreset(currentPreset);
    });
  }

  function initCopyMcp() {
    const btn = $("copy-mcp-btn");
    const code = $("mcp-config-code");
    if (!btn || !code) return;

    btn.addEventListener("click", () => {
      const text = code.innerText || code.textContent;
      navigator.clipboard.writeText(text.trim()).then(() => {
        const orig = btn.textContent;
        btn.textContent = "Copied to clipboard!";
        btn.classList.add("is-copied");
        setTimeout(() => {
          btn.textContent = orig;
          btn.classList.remove("is-copied");
        }, 2000);
      }).catch(() => {});
    });
  }

  function initNavScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");
        if (href === "#" || href.startsWith("#/")) return;
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) cancelAnimationFrame(resizeTimer);
    resizeTimer = requestAnimationFrame(updateWires);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  function boot() {
    initTabs();
    initCardClicks();
    initViewToggle();
    initCopyMcp();
    initNavScroll();
    renderPreset("auth");
    setTimeout(updateWires, 150);
  }
})();
