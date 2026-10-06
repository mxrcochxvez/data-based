(function (root) {
  const WORDS = {
    sql: {
      keyword: "create table primary key not null unique references default constraint index on",
      type: "uuid text integer int boolean timestamptz timestamp varchar numeric serial",
    },
    prisma: {
      keyword: "model enum datasource generator type view",
      type: "String Int Boolean DateTime Json Decimal Bytes Float BigInt",
    },
    typescript: {
      keyword: "export const type import from interface return",
      type: "string number boolean Date unknown Generated",
      fn: "pgTable mysqlTable sqliteTable uuid text varchar serial integer boolean timestamp jsonb notNull unique primaryKey defaultRandom defaultNow z object optional nullable email router publicProcedure mutation query defineTable defineSchema Hono app",
    },
    protobuf: {
      keyword: "syntax package message enum import option repeated optional required reserved",
      type: "string int32 int64 uint32 uint64 bool bytes float double",
    },
    yaml: {
      keyword: "paths get post put patch delete parameters responses content schema summary description",
      type: "string integer boolean number array object",
    },
    http: {
      keyword: "GET POST PUT PATCH DELETE HTTP Status",
      type: "200 201 204 400 404 500",
    },
    markdown: {
      keyword: "",
      type: "",
    },
    graphql: {
      keyword: "type interface enum input extend schema query mutation scalar",
      type: "ID String Int Float Boolean",
    },
    effects: {
      keyword: "if else match when type db.read db.write http log queue throw assign call",
      type: "string number boolean Date unknown",
    },
  };

  function setOf(s) {
    return new Set(String(s || "").split(/\s+/).filter(Boolean));
  }

  function tokenize(lang, src) {
    const pack = WORDS[lang] || WORDS.typescript;
    const kw = setOf(pack.keyword);
    const ty = setOf(pack.type);
    const fn = setOf(pack.fn);
    const out = [];
    let i = 0;
    const text = String(src);
    const n = text.length;

    function push(kind, value) {
      out.push({ kind, value });
    }

    while (i < n) {
      const ch = text[i];
      if (ch === "/" && text[i + 1] === "/") {
        const j = text.indexOf("\n", i);
        const end = j < 0 ? n : j;
        push("comment", text.slice(i, end));
        i = end;
        continue;
      }
      if (ch === "#") {
        const j = text.indexOf("\n", i);
        const end = j < 0 ? n : j;
        push("comment", text.slice(i, end));
        i = end;
        continue;
      }
      if (ch === "'" || ch === '"') {
        let j = i + 1;
        while (j < n && text[j] !== ch) {
          if (text[j] === "\\") j += 1;
          j += 1;
        }
        push("string", text.slice(i, Math.min(n, j + 1)));
        i = Math.min(n, j + 1);
        continue;
      }
      if (ch === "@") {
        let j = i + 1;
        while (j < n && /[A-Za-z0-9_]/.test(text[j])) j += 1;
        push("attr", text.slice(i, j));
        i = j;
        continue;
      }
      if (/[A-Za-z_.]/.test(ch)) {
        let j = i + 1;
        while (j < n && /[A-Za-z0-9_.]/.test(text[j])) j += 1;
        const word = text.slice(i, j);
        if (kw.has(word)) push("keyword", word);
        else if (ty.has(word)) push("type", word);
        else if (fn.has(word)) push("fn", word);
        else push("plain", word);
        i = j;
        continue;
      }
      push("plain", ch);
      i += 1;
    }
    return out;
  }

  function toHtml(lang, src) {
    return tokenize(lang, src).map((tok) => {
      if (tok.kind === "plain") return esc(tok.value);
      return `<span class="tok-${tok.kind}">${esc(tok.value)}</span>`;
    }).join("");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  root.Highlight = { tokenize, toHtml };
})(window);
