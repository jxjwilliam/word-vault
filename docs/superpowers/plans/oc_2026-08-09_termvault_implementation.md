# TermVault (术语库) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the `word-vault` app into TermVault — a compact single-line vocabulary app with LLM-powered one-field entry (auto translation + synonyms/antonyms), categorized AI/programming glossary, unchanged local-SQLite/Turso persistence, and the existing Chrome extension repackaged.

**Architecture:** Keep the existing Vite + React frontend and single-file Node server (`server/index.mjs`). Evolve the `entries` table by adding columns (no data migration). Add one new API route `/api/lookup` that calls an OpenAI-compatible LLM (default DeepSeek) for domain-aware translation. Rewrite the frontend view layer into a dense single-line table with inline add flow. Works identically on local `file:` SQLite and remote Turso via `@libsql/client`.

**Tech Stack:** React 18 + TypeScript (strict) + Vite, `@libsql/client`, Node 18+ built-in `fetch`, lucide-react icons, plain CSS (no framework), custom Node HTTP server.

## Global Constraints

(From spec `docs/superpowers/specs/oc_2026-08-09_termvault_design.md` and `word-vault/AGENTS.md` — every task implicitly includes these.)

1. **No test framework, no linter/formatter** — do not add them. Verification = `npm run build` (tsc strict + vite) + server smoke tests via curl.
2. **TypeScript strict mode**; never use `as any` / `@ts-ignore` / `@ts-expect-error`.
3. **UI copy in Chinese.** Icons from `lucide-react` only.
4. **DB:** `@libsql/client`; dev = `data/dictionary.sqlite` (auto-created), prod = `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`. Override via `DICTIONARY_DB_PATH`, port via `PORT`.
5. **Legacy columns** `archived`/`tags` stay in schema and seed/import code; the new UI must not display them.
6. **New fields:** `synonyms`/`antonyms` are JSON arrays, **max 3 items each**; `category` ∈ `'' | 'ai' | 'programming' | 'general'`.
7. **API base:** extension context → absolute `https://translate-word-vault.vercel.app`; web context → relative `/api` (existing auto-detection in `src/api.ts` stays).
8. **Keep single-file server** (`server/index.mjs`) — do not split into new server files.
9. **Seed gate:** first-run marker is metadata key `abbrs_seeded` — bump to `abbrs_seeded_v2` so existing installs receive the expanded glossary; dedupe by `(lower(trim(source_text)), lower(trim(target_text)))` prevents duplicates.
10. Message strings in Chinese; `async/await` + try/catch; grouped imports (React hooks → lucide-react → local modules).

---

### Task 1: Server — schema evolution + CRUD with new fields

**Files:**
- Modify: `server/index.mjs`

**Interfaces:**
- Consumes: existing `getDb()`, `initSchema()`, `rowToEntry()`, `insertEntry()`, `updateEntry()`, `normalizeEntryInput()`, `listEntries()`, `getEntry()`.
- Produces: `entries` rows now include `synonyms: string[]`, `antonyms: string[]`, `category: string` in all API responses; `POST /api/entries` accepts optional `synonyms`, `antonyms`, `category`.

- [ ] **Step 1: Add idempotent column migration to `initSchema()`**

Add after the existing `CREATE TABLE`/`CREATE UNIQUE INDEX` statements inside `initSchema()`:

```js
  // TermVault: add columns for LLM-generated synonyms/antonyms/category (idempotent)
  const tableInfo = await db.execute("PRAGMA table_info(entries)");
  const existingColumns = new Set(tableInfo.rows.map((row) => String(row.name)));
  if (!existingColumns.has("synonyms")) {
    await db.execute(`ALTER TABLE entries ADD COLUMN synonyms TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!existingColumns.has("antonyms")) {
    await db.execute(`ALTER TABLE entries ADD COLUMN antonyms TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!existingColumns.has("category")) {
    await db.execute(`ALTER TABLE entries ADD COLUMN category TEXT NOT NULL DEFAULT ''`);
  }
```

- [ ] **Step 2: Include new columns in every SELECT**

In `listEntries()` and `getEntry()`, extend the SELECT lists — append `synonyms, antonyms, category,` after the `tags,` line:

```sql
      synonyms,
      antonyms,
      category,
```

- [ ] **Step 3: Parse new fields in `rowToEntry()`**

`rowToEntry` currently spreads the row and parses `tags`. Change the returned object to:

```js
function rowToEntry(row) {
  return {
    ...row,
    tags: parseTags(row.tags),
    synonyms: parseTags(row.synonyms),
    antonyms: parseTags(row.antonyms),
    category: typeof row.category === "string" ? row.category : "",
    archived: Boolean(row.archived),
  };
}
```

(`parseTags` already handles JSON arrays — reuse it.)

- [ ] **Step 4: Accept new fields in `normalizeEntryInput()`**

Add after the existing `tags` line:

```js
    synonyms: Array.isArray(input.synonyms)
      ? input.synonyms.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [],
    antonyms: Array.isArray(input.antonyms)
      ? input.antonyms.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [],
    category: String(input.category ?? "").trim().slice(0, 30),
```

- [ ] **Step 5: Persist new fields in `insertEntry()` and `updateEntry()`**

`insertEntry` — extend the SQL and args:

```js
    sql: `INSERT INTO entries (
      id, source_text, target_text, direction, note, tags, archived, synonyms, antonyms, category, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      entry.id,
      entry.sourceText,
      entry.targetText,
      entry.direction,
      entry.note,
      JSON.stringify(entry.tags),
      entry.archived ? 1 : 0,
      JSON.stringify(entry.synonyms),
      JSON.stringify(entry.antonyms),
      entry.category,
      entry.createdAt,
      entry.updatedAt,
    ],
```

`updateEntry` — same column additions:

```js
    sql: `UPDATE entries
      SET source_text = ?, target_text = ?, direction = ?, note = ?, tags = ?, archived = ?, synonyms = ?, antonyms = ?, category = ?, updated_at = ?
      WHERE id = ?`,
    args: [
      next.sourceText,
      next.targetText,
      next.direction,
      next.note,
      JSON.stringify(next.tags),
      next.archived ? 1 : 0,
      JSON.stringify(next.synonyms),
      JSON.stringify(next.antonyms),
      next.category,
      next.updatedAt,
      id,
    ],
```

- [ ] **Step 6: Smoke-test the API**

Run: `npm install` (first time only), then start the server: `node server/index.mjs` (expect: `Dictionary API ready at http://127.0.0.1:4174`).

In a second terminal:

```bash
curl -s http://127.0.0.1:4174/api/entries | head -c 600
# Expect: every entry object now has "synonyms":[], "antonyms":[], "category":""
curl -s -X POST http://127.0.0.1:4174/api/entries -H 'Content-Type: application/json' \
  -d '{"sourceText":"smoke-test","targetText":"冒烟测试","synonyms":["a","b","c","d"],"antonyms":["x"],"category":"ai"}'
# Expect: entry returned with "synonyms":["a","b","c"] (sliced to 3), "antonyms":["x"], "category":"ai"
curl -s -X DELETE "http://127.0.0.1:4174/api/entries/<id-from-above>"
# Expect: { "ok": true }
```

- [ ] **Step 7: Commit**

```bash
git add server/index.mjs
git commit -m "feat: add synonyms/antonyms/category columns and CRUD support (TermVault)"
```

---

### Task 2: Server — `/api/lookup` LLM route

**Files:**
- Modify: `server/index.mjs`

**Interfaces:**
- Consumes: `readJson()`, `sendJson()`, route dispatch in `handleApi()`.
- Produces: `POST /api/lookup { word: string }` → `200 { translation: string, synonyms: string[], antonyms: string[], direction: "en-to-zh"|"zh-to-en" }`; `400` when `word` missing; `500` when `LLM_API_KEY` unset; `502` on LLM/parse failure.

- [ ] **Step 1: Add the `lookupWord(word)` async function**

Place it after the `mergeEntriesById` function (before "Helpers"):

```js
// ---------------------------------------------------------------------------
// LLM lookup (TermVault)
// ---------------------------------------------------------------------------

async function lookupWord(word) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    const error = new Error("LLM_API_KEY not configured — set it in the environment");
    error.statusCode = 500;
    throw error;
  }

  const base = (process.env.LLM_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL || "deepseek-chat";
  const direction = /[\u4e00-\u9fff]/.test(word) ? "zh-to-en" : "en-to-zh";

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a technical translator for AI and programming terms. " +
            "Give domain-correct Chinese translations, never literal ones " +
            "(e.g. RAG → 检索增强生成, embedding → 向量嵌入, backpressure → 背压). " +
            'Respond ONLY with a JSON object: {"translation": string, "synonyms": string[], "antonyms": string[]} ' +
            "with at most 3 items in each array (empty arrays allowed when none exist).",
        },
        { role: "user", content: `Translate this term: ${word}` },
      ],
    }),
  });

  if (!response.ok) {
    const error = new Error(`LLM request failed: ${response.status}`);
    error.statusCode = 502;
    throw error;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    const error = new Error("LLM returned empty response");
    error.statusCode = 502;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const error = new Error("LLM returned invalid JSON");
    error.statusCode = 502;
    throw error;
  }

  return {
    translation: String(parsed.translation ?? "").trim(),
    synonyms: Array.isArray(parsed.synonyms)
      ? parsed.synonyms.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [],
    antonyms: Array.isArray(parsed.antonyms)
      ? parsed.antonyms.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [],
    direction,
  };
}
```

- [ ] **Step 2: Register the route in `handleApi()`**

Add before the final `sendJson(response, 404, ...)` line:

```js
  if (method === "POST" && url.pathname === "/api/lookup") {
    const body = await readJson(request);
    const word = String(body.word ?? "").trim();
    if (!word) {
      sendJson(response, 400, { error: "word is required" });
      return;
    }
    sendJson(response, 200, await lookupWord(word));
    return;
  }
```

- [ ] **Step 3: Smoke-test without a key and with a key**

Restart the server: `node server/index.mjs`.

```bash
# Without LLM_API_KEY set:
curl -s -X POST http://127.0.0.1:4174/api/lookup -H 'Content-Type: application/json' -d '{"word":"embedding"}'
# Expect: 500 {"error":"LLM_API_KEY not configured ..."}
curl -s -X POST http://127.0.0.1:4174/api/lookup -H 'Content-Type: application/json' -d '{}'
# Expect: 400 {"error":"word is required"}
```

Then with a real key (deepseek): `LLM_API_KEY=<your-key> node server/index.mjs` and:

```bash
curl -s -X POST http://127.0.0.1:4174/api/lookup -H 'Content-Type: application/json' -d '{"word":"embedding"}'
# Expect: {"translation":"向量嵌入","synonyms":[...≤3],"antonyms":[...≤3],"direction":"en-to-zh"}
curl -s -X POST http://127.0.0.1:4174/api/lookup -H 'Content-Type: application/json' -d '{"word":"智能体"}'
# Expect: {"translation":...,"direction":"zh-to-en"}
```

- [ ] **Step 4: Commit**

```bash
git add server/index.mjs
git commit -m "feat: add /api/lookup LLM translation route (TermVault)"
```

---

### Task 3: Frontend types + API client + helpers

**Files:**
- Modify: `src/types.ts`
- Modify: `src/api.ts`
- Modify: `src/dictionary.ts`

**Interfaces:**
- Consumes: nothing new (uses existing `DictionaryEntry`, `requestJson`).
- Produces: `DictionaryEntry` gains `synonyms: string[]`, `antonyms: string[]`, `category: Category`; new `LookupResult` type; `lookupWord(word: string): Promise<LookupResult>`; `categoryOf(entry)` and `categoryLabels` helpers; `entryMatches` now also searches synonyms/antonyms.

- [ ] **Step 1: Extend `src/types.ts`**

Add type aliases and extend `DictionaryEntry`:

```ts
export type Category = "" | "ai" | "programming" | "general";
export type CategoryFilter = "all" | Category;
export type LookupResult = {
  translation: string;
  synonyms: string[];
  antonyms: string[];
  direction: Direction;
};

export type DictionaryEntry = {
  id: string;
  sourceText: string;
  targetText: string;
  direction: Direction;
  note: string;
  tags: string[];
  archived: boolean;
  synonyms: string[];
  antonyms: string[];
  category: Category;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Add `lookupWord` to `src/api.ts`**

Append after `importEntries`:

```ts
export const lookupWord = async (word: string) => {
  return requestJson<LookupResult>(api("/api/lookup"), {
    method: "POST",
    body: JSON.stringify({ word }),
  });
};
```

And extend the create/update payload types where `tags` is picked (`Pick<DictionaryEntry, "sourceText" | "targetText" | "direction" | "note" | "tags" | "synonyms" | "antonyms" | "category">` and the update variant adds `"archived"`).

- [ ] **Step 3: Add helpers to `src/dictionary.ts`**

Append:

```ts
export const categoryLabels: Record<Exclude<Category, "">, string> = {
  ai: "AI",
  programming: "编程",
  general: "通用",
};

export const categoryOf = (entry: Pick<DictionaryEntry, "category" | "tags">): Category => {
  if (entry.category) return entry.category;
  const legacy = entry.tags[0];
  return legacy === "ai" || legacy === "programming" || legacy === "general" ? legacy : "";
};
```

Also extend `entryMatches` so the searchable string includes synonyms/antonyms:

```ts
  return [
    entry.sourceText,
    entry.targetText,
    entry.note,
    entry.direction,
    entry.tags.join(" "),
    entry.synonyms.join(" "),
    entry.antonyms.join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
```

Also add `detectDirection` (Task 6 imports it from this module; word-vault does not have it yet):

```ts
export const detectDirection = (text: string): Direction =>
  /[\u4e00-\u9fff]/.test(text) ? "zh-to-en" : "en-to-zh";
```

- [ ] **Step 4: Verify**

Run: `npm run build` — expect exit 0 and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/api.ts src/dictionary.ts
git commit -m "feat: frontend types, lookupWord API client, category helpers (TermVault)"
```

---

### Task 4: Seed glossary — multi-category `abbrs.md` + parser + gate bump

**Files:**
- Modify: `abbrs.md` (full rewrite — keep every existing row, reorganize under category headers)
- Modify: `server/index.mjs` (`parseMarkdownDictionary`, `seedDefaultDictionary`)

**Interfaces:**
- Consumes: existing `parseMarkdownDictionary(markdown)`, `insertEntry()`, metadata gate.
- Produces: seeded entries carry `category` (`ai` | `programming` | `general`); gate key renamed to `abbrs_seeded_v2`; `POST /api/import/abbrs` returns entries with categories.

- [ ] **Step 1: Rewrite `abbrs.md` with category headers**

Structure (keep ALL existing rows from the current file, moving them under the matching header; headers use `### 标题 (分类)` — the parenthetical is the category value):

```markdown
### 🔤 AI 核心术语 (ai)
| English Term | Chinese Translation |
| --- | --- |
<!-- existing rows from "AI Frequently Used Terms" section go here, verbatim -->

### 📚 RAG 与数据 (ai)
| English Term | Chinese Translation |
| --- | --- |
<!-- existing rows from "RAG & Data-Related Terms" + remaining RAG rows go here, verbatim -->

### 🤖 LLM 与 Agent 进阶 (ai)
| English Term | Chinese Translation |
| --- | --- |
| tool use | 工具使用 |
| function calling | 函数调用 |
| token | 词元 |
| tokenizer | 分词器 |
| temperature | 温度参数 |
| sampling | 采样 |
| streaming | 流式输出 |
| fine-tuning | 微调 |
| RLHF | 人类反馈强化学习 |
| distillation | 知识蒸馏 |
| quantization | 量化 |
| chain-of-thought | 思维链 |
| latent space | 潜空间 |
| multi-agent | 多智能体系统 |
| guardrails | 安全护栏 |

### 💻 编程概念 (programming)
| English Term | Chinese Translation |
| --- | --- |
| idempotent | 幂等 |
| async / await | 异步 / 等待 |
| callback | 回调 |
| closure | 闭包 |
| recursion | 递归 |
| memoization | 记忆化 |
| concurrency | 并发 |
| parallelism | 并行 |
| race condition | 竞态条件 |
| deadlock | 死锁 |
| serialization | 序列化 |
| sharding | 分片 |
| cursor | 游标 |
| namespace | 命名空间 |
| polymorphism | 多态 |
| encapsulation | 封装 |

### ⚙️ 开发流程与工具 (programming)
| English Term | Chinese Translation |
| --- | --- |
| linter | 静态检查器 |
| bundler | 打包器 |
| transpiler | 转译器 |
| polyfill | 垫片 |
| monorepo | 单体仓库 |
| CI / CD | 持续集成 / 持续部署 |
| regression | 回归 |
| smoke test | 冒烟测试 |
| unit test | 单元测试 |
| integration test | 集成测试 |
| code review | 代码评审 |
| hotfix | 热修复 |
| canary release | 金丝雀发布 |
| feature flag | 特性开关 |
| revert | 回滚 |
| pull request | 拉取请求 |

### 🗄️ 数据库与运维 (programming)
| English Term | Chinese Translation |
| --- | --- |
| migration | 数据迁移 |
| index | 索引 |
| transaction | 事务 |
| replication | 复制 |
| failover | 故障转移 |
| schema | 模式 / 架构 |
| cache invalidation | 缓存失效 |
| rate limiting | 限流 |
| circuit breaker | 熔断器 |
| backoff | 退避 |
| health check | 健康检查 |
| load balancer | 负载均衡 |
| zero-downtime | 零停机 |
| observability | 可观测性 |
| tracing | 链路追踪 |

### 🌍 通用阅读 (general)
| English Term | Chinese Translation |
| --- | --- |
| albeit | 尽管 |
| notwithstanding | 尽管 / 仍然 |
| prerequisite | 前提条件 |
| counterpart | 对应物 |
| leverage | 利用 / 杠杆作用 |
| streamline | 精简流程 |
| mitigate | 缓解 |
| assess | 评估 |
| substantial | 大量的 |
| ambiguous | 模糊的 |
| robust | 健壮的 |
| granular | 细粒度的 |
| bottleneck | 瓶颈 |
| overhead | 开销 |
| trade-off | 权衡 |
```

- [ ] **Step 2: Teach `parseMarkdownDictionary` about headers**

Replace the function body so it tracks the current `### 标题 (category)` header:

```js
function parseMarkdownDictionary(markdown) {
  const now = new Date().toISOString();
  const entries = [];
  let category = "general";

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();

    const header = trimmed.match(/^###\s+(.+)$/);
    if (header) {
      const label = header[1].trim();
      const paren = label.match(/\(([^)]+)\)\s*$/);
      const raw = paren ? paren[1].trim().toLowerCase() : label.toLowerCase();
      category = ["ai", "programming", "general"].includes(raw) ? raw : "general";
      continue;
    }

    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    if (/^\|\s*-+/.test(trimmed) || /English Term/i.test(trimmed)) continue;

    const cells = trimmed
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());

    if (cells.length < 2) continue;

    const [sourceText, targetText] = cells;
    if (!sourceText || !targetText) continue;

    entries.push({
      id: randomUUID(),
      sourceText,
      targetText,
      direction: "en-to-zh",
      note: "Imported from abbrs.md",
      tags: ["abbrs"],
      category,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  return entries;
}
```

- [ ] **Step 3: Bump the seed gate in `seedDefaultDictionary()`**

Replace both occurrences of the key `"abbrs_seeded"` (SELECT and INSERT) with `"abbrs_seeded_v2"`. Keep the `COUNT(*) > 0` short-circuit logic unchanged — on a fresh DB the glossary seeds; on an existing DB the v2 key is absent so it re-runs the loop, but dedupe (by text pair) skips already-present words and only adds new ones.

- [ ] **Step 4: Verify seeding + dedupe**

Start the server fresh: `node server/index.mjs` (if `data/dictionary.sqlite` already exists, the v2 gate triggers the merge; to test a truly fresh install, temporarily run with `DICTIONARY_DB_PATH=/tmp/termvault-test.sqlite`).

```bash
curl -s http://127.0.0.1:4174/api/entries | python3 -c "
import json,sys
entries = json.load(sys.stdin)['entries']
print('total:', len(entries))
from collections import Counter
print(Counter(e['category'] for e in entries))
"
# Expect: total grows by the new rows; categories are only ai/programming/general
# Restart the server and re-run — total must NOT change (dedupe works)
```

- [ ] **Step 5: Commit**

```bash
git add abbrs.md server/index.mjs
git commit -m "feat: expand seed glossary into categorized sections (TermVault)"
```

---

### Task 5: Frontend — complete `styles.css` rewrite (dense table design)

**Files:**
- Modify: `src/styles.css` (full replace)

**Interfaces:**
- Consumes: nothing (pure CSS).
- Produces: every class name used by the new `App.tsx` (Task 6), listed below. Do not rename classes without updating Task 6.

- [x] **Step 1: Replace `src/styles.css` with the following**

**Amendment (2026-08-09):** implemented as a design pass over the baseline block below — same class contract (verified against App.tsx), token-based palette, refined chips/buttons/table, `:focus-visible` a11y, plus a `@media (max-width: 560px)` narrow layout for the Chrome extension side panel. Commit `0e31849`.

```css
/* TermVault — compact single-line vocabulary table */

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  color: #111827;
  background: #f6f7f9;
}

.app-shell { max-width: 860px; margin: 0 auto; padding: 16px 20px 48px; }

/* ---- top bar ---- */
.topbar { display: flex; align-items: center; gap: 12px; padding: 4px 0 14px; }
.brand { margin-right: 8px; }
.brand .eyebrow { margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; }
.brand h1 { margin: 0; font-size: 18px; font-weight: 700; }

.search-field {
  flex: 1; display: flex; align-items: center; gap: 8px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 0 10px; height: 36px;
}
.search-field:focus-within { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
.search-field input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 14px; color: #111827; }

.select-field select {
  height: 36px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff;
  padding: 0 8px; font-size: 13px; color: #374151; outline: 0; cursor: pointer;
}

/* ---- buttons ---- */
.btn {
  display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px;
  border-radius: 8px; border: 1px solid transparent; font-size: 13px; font-weight: 500;
  cursor: pointer; white-space: nowrap;
}
.btn:disabled { opacity: 0.6; cursor: wait; }
.btn-primary { background: #2563eb; color: #fff; }
.btn-primary:hover { background: #1d4ed8; }
.btn-secondary { background: #fff; color: #374151; border-color: #e5e7eb; }
.btn-secondary:hover { border-color: #d1d5db; background: #f9fafb; }
.btn-ghost { background: transparent; color: #6b7280; border-color: transparent; }
.btn-ghost:hover { background: #f3f4f6; color: #111827; }

.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent;
  color: #6b7280; cursor: pointer; padding: 0;
}
.icon-btn:hover { background: #eef2ff; color: #2563eb; }

/* ---- add flow ---- */
.add-bar {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 12px; margin-bottom: 12px;
}
.add-input-row { display: flex; align-items: center; gap: 8px; }
.add-input {
  flex: 1; height: 36px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0 12px;
  font-size: 14px; outline: 0;
}
.add-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
.manual-link { font-size: 12px; color: #6b7280; background: none; border: 0; cursor: pointer; text-decoration: underline; }

.preview-card { margin-top: 10px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
.preview-main { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.preview-main h3 { margin: 0; font-size: 16px; }
.direction-pill {
  font-size: 11px; color: #2563eb; background: #dbeafe; border-radius: 99px; padding: 1px 8px;
}
.preview-main .translation { margin: 4px 0 0; font-size: 15px; color: #374151; }

.syn-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.syn-label { font-size: 12px; color: #6b7280; }
.syn-chip {
  font-size: 12px; color: #1d4ed8; background: #dbeafe; border: 0; border-radius: 99px;
  padding: 2px 10px; cursor: pointer;
}
.syn-chip:hover { background: #bfdbfe; }
.syn-chip.antonym { color: #b91c1c; background: #fee2e2; }
.syn-chip.antonym:hover { background: #fecaca; }

.preview-actions { display: flex; gap: 8px; margin-top: 12px; }

/* ---- inline form (manual add / edit) ---- */
.inline-form { display: grid; gap: 10px; margin-top: 10px; }
.inline-form .field { display: grid; gap: 4px; }
.inline-form .field span { font-size: 12px; color: #6b7280; }
.inline-form input,
.inline-form textarea {
  border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; font-size: 14px; outline: 0;
  font-family: inherit;
}
.inline-form input:focus, .inline-form textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
.form-actions { display: flex; gap: 8px; }

/* ---- table ---- */
.table { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
.table-header, .tbl-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) 84px 88px;
  align-items: center; gap: 8px; padding: 0 14px;
}
.table-header {
  height: 32px; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;
  background: #fafafa; border-bottom: 1px solid #e5e7eb;
}
.tbl-row { min-height: 38px; border-bottom: 1px solid #f1f2f4; cursor: pointer; }
.tbl-row:last-child { border-bottom: 0; }
.tbl-row:hover { background: #f8fafc; }
.tbl-row.selected { background: #eff6ff; }

.row-word { font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-trans { color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.row-actions { display: flex; gap: 2px; justify-content: flex-end; opacity: 0; transition: opacity 0.12s; }
.tbl-row:hover .row-actions, .row-actions:focus-within { opacity: 1; }

/* ---- category chips ---- */
.chip { font-size: 11px; border-radius: 99px; padding: 2px 10px; white-space: nowrap; }
.chip-ai { color: #1d4ed8; background: #dbeafe; }
.chip-programming { color: #15803d; background: #dcfce7; }
.chip-general { color: #374151; background: #f3f4f6; }

/* ---- expanded detail ---- */
.row-expand {
  border-bottom: 1px solid #eef0f2; background: #fcfcfd; padding: 10px 14px 12px;
}
.row-expand .expand-meta { display: grid; gap: 4px; }
.row-expand .note { margin: 8px 0 0; font-size: 13px; color: #6b7280; }

/* ---- misc ---- */
.empty-state { padding: 40px 16px; text-align: center; color: #6b7280; }
.empty-state p { margin: 0 0 4px; font-size: 14px; color: #374151; }
.empty-state span { font-size: 12px; }

.status {
  margin: 10px 0 0; font-size: 12px; color: #6b7280; text-align: center;
}
```

- [x] **Step 2: Verify build**

Run: `npm run build` — expect exit 0.

- [x] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: rewrite styles.css for compact single-line table (TermVault)"
```

---

### Task 6: Frontend — rewrite `App.tsx` (compact table + LLM add flow)

**Files:**
- Modify: `src/App.tsx` (full replace)

**Interfaces:**
- Consumes: `categoryLabels`, `categoryOf`, `detectDirection`, `entryMatches`, `sortEntries` from `src/dictionary.ts`; `createEntry`, `deleteEntryById`, `fetchEntries`, `lookupWord`, `updateEntry` from `src/api.ts`; types `Category`, `CategoryFilter`, `DictionaryEntry`, `LookupResult` from `src/types.ts`; all CSS class names from Task 5.
- Produces: the complete new UI. No exports change.

**Amendment (2026-08-09):** search empty-state auto-add flow — when the filter yields 0 results and `query` is non-empty, the empty state shows 「X」不在词库中 + 自动添加（AI 翻译） button that opens the add panel pre-filled with the query and auto-runs the LLM lookup (`addFromSearch` in Step 1; `runLookup` gained an optional `overrideWord` param). On LLM failure it falls back to the existing 手动填写 form. No API/type/CSS changes (reuses `btn btn-primary` + imported `Sparkles`). Verified in Step 4 item 10.

**Amendment (2026-08-10):**

- **Search reverted to strict substring matching.** The fuzzy subsequence matcher added
  with 自动补全/高亮 made short queries like "EDD" match unrelated entries (redundancy,
  reward model, …), hiding the empty-state add flow. `entryMatches` in `src/dictionary.ts`
  is back to the pre-fuzzy implementation (lowercased `includes` over source/target/note/
  tags/synonyms/antonyms/direction); `fuzzyMatchText` was removed. Non-existent queries
  now reliably show 「X」不在词库中 + 自动添加（AI 翻译）.
- **LLM translation guarantee.** `/api/lookup` prompt now requires Chinese text for
  English input and instructs proper nouns/brand names to keep the English name with a
  Chinese explanation in parentheses (Terraform → Terraform（基础设施即代码工具）). The
  frontend gained `translationFor` in `src/App.tsx`: if `translation` is empty, echoes
  the input, or stays in the input's language, it falls back to `meanings[0].text`. Used
  by `normalizePreview` (preview + save) and `retranslate` (AI 重译).

- [ ] **Step 1: Replace `src/App.tsx` — Part 1 (imports, state, handlers)**

```tsx
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import {
  categoryLabels,
  categoryOf,
  detectDirection,
  entryMatches,
  sortEntries,
} from "./dictionary";
import { createEntry, deleteEntryById, fetchEntries, lookupWord, updateEntry } from "./api";
import type { Category, CategoryFilter, DictionaryEntry, LookupResult } from "./types";

type EditForm = {
  sourceText: string;
  targetText: string;
  synonyms: string;
  antonyms: string;
  category: Category;
  note: string;
};

const emptyEditForm: EditForm = {
  sourceText: "",
  targetText: "",
  synonyms: "",
  antonyms: "",
  category: "",
  note: "",
};

const splitList = (value: string): string[] =>
  value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

const listToInput = (list: string[]): string => list.join(", ");

export function App() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [isLoading, setIsLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [preview, setPreview] = useState<LookupResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [status, setStatus] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshEntries("已载入词库。");
  }, []);

  // Chrome extension integration: prefill add input / search from context menu
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return;

    const loadPending = async () => {
      try {
        const data = await chrome.runtime.sendMessage({ type: "get-prefill" });
        if (data?.wordVaultPrefill?.sourceText) {
          setEditingId(null);
          setEditForm(emptyEditForm);
          setAddOpen(true);
          setAddText(data.wordVaultPrefill.sourceText);
          setManualMode(false);
          setPreview(null);
          setStatus("");
        }
        if (data?.wordVaultLookup?.query) {
          setQuery(data.wordVaultLookup.query);
        }
        await chrome.runtime.sendMessage({ type: "clear-prefill" });
      } catch {
        // Background script not reachable — running as plain web app
      }
    };

    void loadPending();

    const handleMessage = (message: { type: string }) => {
      if (message.type === "prefill-updated" || message.type === "lookup-updated") {
        void loadPending();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const refreshEntries = async (successMessage?: string) => {
    try {
      setEntries(await fetchEntries());
      setStatus(successMessage || "已同步词库。");
    } catch {
      setStatus("无法连接词库 API。");
    } finally {
      setIsLoading(false);
    }
  };

  const visibleEntries = useMemo(() => {
    const filtered = entries.filter((entry) => {
      if (categoryFilter !== "all" && categoryOf(entry) !== categoryFilter) return false;
      return entryMatches(entry, query);
    });
    return sortEntries(filtered, "updatedAt");
  }, [entries, query, categoryFilter, categoryOf, entryMatches, sortEntries]);

  // ---- add / LLM flow ----

  const openAdd = () => {
    setEditingId(null);
    setEditForm(emptyEditForm);
    setAddOpen(true);
    setManualMode(false);
    setPreview(null);
    setStatus("");
    setTimeout(() => addInputRef.current?.focus(), 0);
  };

  const addFromSearch = () => {
    const word = query.trim();
    if (!word) return;
    setAddText(word);
    openAdd();
    void runLookup(word);
  };

  const startManual = () => {
    setManualMode(true);
    setEditForm((current) => ({ ...current, sourceText: addText }));
  };

  const resetAdd = () => {
    setAddOpen(false);
    setAddText("");
    setPreview(null);
    setManualMode(false);
    setEditingId(null);
    setEditForm(emptyEditForm);
  };

  const runLookup = async (overrideWord?: string) => {
    const word = (overrideWord ?? addText).trim();
    if (!word) return;
    setPreviewLoading(true);
    setPreview(null);
    setStatus("");
    try {
      setPreview(await lookupWord(word));
      setManualMode(false);
    } catch (error) {
      setStatus(error instanceof Error ? `翻译失败：${error.message}` : "翻译失败，请手动填写。");
      startManual();
    } finally {
      setPreviewLoading(false);
    }
  };

  const saveFromPreview = async () => {
    if (!preview) return;
    const sourceText = addText.trim();
    if (!sourceText) return;
    try {
      const entry = await createEntry({
        sourceText,
        targetText: preview.translation,
        direction: preview.direction,
        note: "",
        tags: [],
        synonyms: preview.synonyms,
        antonyms: preview.antonyms,
        category: "",
      });
      setEntries((current) => [entry, ...current]);
      setStatus(`已保存「${sourceText}」。`);
      resetAdd();
    } catch {
      setStatus("保存失败，请检查 API。");
    }
  };

  const retranslate = async () => {
    const word = editForm.sourceText.trim();
    if (!word) return;
    setStatus("AI 翻译中…");
    try {
      const result = await lookupWord(word);
      setEditForm((current) => ({
        ...current,
        targetText: result.translation,
        synonyms: listToInput(result.synonyms),
        antonyms: listToInput(result.antonyms),
      }));
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? `翻译失败：${error.message}` : "翻译失败。");
    }
  };

  const saveManual = async (event: FormEvent) => {
    event.preventDefault();
    const sourceText = editForm.sourceText.trim();
    const targetText = editForm.targetText.trim();
    if (!sourceText || !targetText) {
      setStatus("请填写单词和译文。");
      return;
    }
    const payload = {
      sourceText,
      targetText,
      direction: detectDirection(sourceText),
      note: editForm.note.trim(),
      tags: [],
      synonyms: splitList(editForm.synonyms),
      antonyms: splitList(editForm.antonyms),
      category: editForm.category,
    };
    try {
      if (editingId) {
        const updated = await updateEntry(editingId, { ...payload, archived: false });
        setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setStatus("已保存修改。");
      } else {
        const entry = await createEntry(payload);
        setEntries((current) => [entry, ...current]);
        setStatus(`已保存「${sourceText}」。`);
      }
      resetAdd();
    } catch {
      setStatus("保存失败，请检查 API。");
    }
  };

  // ---- row actions ----

  const startEdit = (entry: DictionaryEntry) => {
    setEditingId(entry.id);
    setEditForm({
      sourceText: entry.sourceText,
      targetText: entry.targetText,
      synonyms: listToInput(entry.synonyms),
      antonyms: listToInput(entry.antonyms),
      category: entry.category,
      note: entry.note,
    });
    setAddOpen(true);
    setManualMode(true);
    setPreview(null);
    setAddText(entry.sourceText);
    setExpandedId(null);
    setStatus("");
  };

  const removeEntry = async (entry: DictionaryEntry) => {
    if (!window.confirm(`删除「${entry.sourceText}」？此操作不可撤销。`)) return;
    try {
      await deleteEntryById(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (editingId === entry.id) resetAdd();
      setStatus("已删除。");
    } catch {
      setStatus("删除失败。");
    }
  };

  const copyTranslation = async (entry: DictionaryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.targetText);
      setStatus(`已复制译文：「${entry.targetText}」`);
    } catch {
      setStatus("复制失败。");
    }
  };
```

- [ ] **Step 2: Replace `src/App.tsx` — Part 2 (JSX return) — concatenate after Part 1**

```tsx
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">TermVault</p>
          <h1>术语库</h1>
        </div>

        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索单词 / 译文 / 同义词…"
          />
        </label>

        <label className="select-field">
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
          >
            <option value="all">全部分类</option>
            <option value="ai">AI</option>
            <option value="programming">编程</option>
            <option value="general">通用</option>
          </select>
        </label>

        <button className="btn btn-primary" onClick={openAdd} type="button">
          <Plus size={16} />
          <span>添加</span>
        </button>
      </header>

      {addOpen && (
        <section className="add-bar">
          {!preview && !manualMode && (
            <div className="add-input-row">
              <input
                ref={addInputRef}
                className="add-input"
                value={addText}
                onChange={(event) => setAddText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runLookup();
                }}
                placeholder="输入英文或中文单词，回车自动翻译…"
              />
              <button
                className="btn btn-secondary"
                onClick={() => void runLookup()}
                type="button"
                disabled={previewLoading}
              >
                <Sparkles size={15} />
                <span>{previewLoading ? "翻译中…" : "AI 翻译"}</span>
              </button>
              <button className="manual-link" onClick={startManual} type="button">
                手动填写
              </button>
              <button className="icon-btn" onClick={resetAdd} type="button" title="关闭">
                <X size={16} />
              </button>
            </div>
          )}

          {preview && !manualMode && (
            <div className="preview-card">
              <div className="preview-main">
                <h3>{addText}</h3>
                <span className="direction-pill">
                  {preview.direction === "en-to-zh" ? "英 → 中" : "中 → 英"}
                </span>
                <p className="translation">{preview.translation}</p>
              </div>

              {preview.synonyms.length > 0 && (
                <div className="syn-row">
                  <span className="syn-label">同义</span>
                  {preview.synonyms.map((item) => (
                    <button
                      key={item}
                      className="syn-chip"
                      type="button"
                      onClick={() => setAddText(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
              {preview.antonyms.length > 0 && (
                <div className="syn-row">
                  <span className="syn-label">反义</span>
                  {preview.antonyms.map((item) => (
                    <span key={item} className="syn-chip antonym">
                      {item}
                    </span>
                  ))}
                </div>
              )}

              <div className="preview-actions">
                <button className="btn btn-primary" onClick={() => void saveFromPreview()} type="button">
                  <Check size={15} />
                  <span>保存</span>
                </button>
                <button className="btn btn-secondary" onClick={startManual} type="button">
                  手动修改
                </button>
              </div>
            </div>
          )}

          {manualMode && (
            <form className="inline-form" onSubmit={saveManual}>
              <label className="field">
                <span>单词</span>
                <input
                  value={editForm.sourceText}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, sourceText: event.target.value }))
                  }
                  placeholder="agent"
                />
              </label>
              <label className="field">
                <span>译文</span>
                <input
                  value={editForm.targetText}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, targetText: event.target.value }))
                  }
                  placeholder="智能体"
                />
              </label>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => void retranslate()} type="button">
                  <Sparkles size={14} />
                  <span>AI 重译</span>
                </button>
              </div>
              <label className="field">
                <span>同义词（逗号分隔，最多 3 个）</span>
                <input
                  value={editForm.synonyms}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, synonyms: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>反义词（逗号分隔，最多 3 个）</span>
                <input
                  value={editForm.antonyms}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, antonyms: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>分类</span>
                <select
                  value={editForm.category}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      category: event.target.value as Category,
                    }))
                  }
                >
                  <option value="">未分类</option>
                  <option value="ai">AI</option>
                  <option value="programming">编程</option>
                  <option value="general">通用</option>
                </select>
              </label>
              <label className="field">
                <span>备注（可选）</span>
                <textarea
                  value={editForm.note}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, note: event.target.value }))
                  }
                  rows={2}
                />
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">
                  <Check size={15} />
                  <span>{editingId ? "保存修改" : "保存"}</span>
                </button>
                <button className="btn btn-ghost" onClick={resetAdd} type="button">
                  <X size={15} />
                  <span>取消</span>
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <div className="table">
        <div className="table-header">
          <span>单词</span>
          <span>译文</span>
          <span>分类</span>
          <span />
        </div>

        {isLoading ? (
          <div className="empty-state">
            <p>加载中…</p>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="empty-state">
            {query.trim() ? (
              <>
                <p>「{query.trim()}」不在词库中。</p>
                <button className="btn btn-primary" type="button" onClick={addFromSearch}>
                  <Sparkles size={15} />
                  <span>自动添加（AI 翻译）</span>
                </button>
              </>
            ) : (
              <>
                <p>没有匹配词条。</p>
                <span>点击右上角「添加」，输入一个词即可自动翻译建库。</span>
              </>
            )}
          </div>
        ) : (
          visibleEntries.map((entry) => {
            const expanded = expandedId === entry.id;
            const cat = categoryOf(entry);
            return (
              <div key={entry.id}>
                <div
                  className={`tbl-row ${expanded ? "selected" : ""}`}
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                >
                  <span className="row-word" title={entry.sourceText}>
                    {entry.sourceText}
                  </span>
                  <span className="row-trans" title={entry.targetText}>
                    {entry.targetText}
                  </span>
                  <span>
                    {cat ? <span className={`chip chip-${cat}`}>{categoryLabels[cat]}</span> : null}
                  </span>
                  <span className="row-actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      className="icon-btn"
                      type="button"
                      title="复制译文"
                      onClick={() => void copyTranslation(entry)}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      title="编辑"
                      onClick={() => startEdit(entry)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      title="删除"
                      onClick={() => void removeEntry(entry)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>

                {expanded && (
                  <div className="row-expand">
                    <div className="expand-meta">
                      {entry.synonyms.length > 0 && (
                        <div className="syn-row">
                          <span className="syn-label">同义</span>
                          {entry.synonyms.map((item) => (
                            <button
                              key={item}
                              className="syn-chip"
                              type="button"
                              onClick={() => {
                                setQuery(item);
                                setExpandedId(null);
                              }}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      )}
                      {entry.antonyms.length > 0 && (
                        <div className="syn-row">
                          <span className="syn-label">反义</span>
                          {entry.antonyms.map((item) => (
                            <span key={item} className="syn-chip antonym">
                              {item}
                            </span>
                          ))}
                        </div>
                      )}
                      {entry.note && <p className="note">{entry.note}</p>}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build` — expect exit 0, no type errors.

- [ ] **Step 4: Manual verification (dev servers: `node scripts/dev.mjs`)**

Open http://127.0.0.1:5173 and check:

1. Rows render single-line (word | translation | chip); no stats bar, no direction pills, no import/export buttons
2. Search "embedding" filters live; clearing restores
3. Category filter (AI / 编程 / 通用) filters live
4. Click a row → expands synonyms/antonyms; clicking a synonym chip searches it
5. Hover row → 3 icon actions appear; copy writes translation to clipboard; edit opens prefilled form; delete asks confirm
6. 「添加」→ type `embedding` → Enter → preview card shows LLM translation + 同义/反义 → 保存 → new row on top
7. With `LLM_API_KEY` unset: 「添加」→ type `agent` → 翻译 shows error message → 手动填写 form appears → fill 译文 → 保存 succeeds (fallback works)
8. Edit flow: pencil on a row → change 译文 → 「AI 重译」refills translation/synonyms/antonyms → 保存修改
9. Extension prefill: with `npm run ext` build loaded in Chrome, right-click a selection → 「添加到术语库」 → side panel opens with the add bar open and the selected text prefilled, ready for Enter → AI 翻译
10. Search a word not in the lib (e.g. `correlate`) → empty state shows 「correlate」不在词库中 + 自动添加（AI 翻译） button → click → add panel opens prefilled with `correlate` and the AI preview appears → 保存 → new row on top. With `LLM_API_KEY` unset the same flow falls back to 手动填写.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: rewrite UI as compact single-line table with LLM add flow (TermVault)"
```

---

### Task 7: Extension labels + Vercel/env config + docs

**Files:**
- Modify: `public/manifest.json`
- Modify: `public/background.js`
- Modify: `vercel.json`
- Create: `.env.example`
- Modify: `AGENTS.md`, `docs/README.md` (spec, moved into repo on 2026-08-09)

**Interfaces:**
- Consumes: nothing new.
- Produces: extension renamed to TermVault with updated context-menu label; Vercel function `maxDuration: 30`; LLM env vars documented; route table updated; spec README (`docs/README.md`) reflects retirement of translate-plugin.

- [ ] **Step 1: Rename the extension in `public/manifest.json`**

Read the file first, then change (keep everything else — action, side panel, host permissions):

```json
"name": "TermVault 术语库",
"short_name": "TermVault",
"description": "中英文术语库：AI / 编程单词一键自动翻译、同义词反义词、快速查询",
```

And in `action`, change:

```json
"default_title": "TermVault — 打开术语库"
```

- [ ] **Step 2: Update the context-menu labels in `public/background.js`**

Read the file first. The two context menus currently use `title: '添加 "%s" 到生词库'` (id `add-word`) and `title: '查询 "%s"'` (id `lookup-word`). Change only the first one to:

```js
title: '添加 "%s" 到术语库',
```

Leave the `lookup-word` item (`查询 "%s"`) unchanged. The existing prefill mechanism (`chrome.storage.session.set` → side panel reads it via message types `get-prefill` / `clear-prefill` / `prefill-updated` / `lookup-updated`) is already consumed by the new `App.tsx` (Task 6, extension integration effect) — no background.js logic changes needed.

- [ ] **Step 3: Bump `maxDuration` in `vercel.json`**

Read the file first, then merge this into the top-level object (do not duplicate existing keys):

```json
"functions": {
  "api/index.mjs": {
    "maxDuration": 30
  }
}
```

- [ ] **Step 4: Create `.env.example`**

```bash
# Database — leave empty for local file: SQLite; set both for Turso (Vercel prod)
# TURSO_DATABASE_URL=
# TURSO_AUTH_TOKEN=

# Ports (optional)
# PORT=4174
# DICTIONARY_DB_PATH=data/dictionary.sqlite

# LLM auto-translation — OpenAI-compatible endpoint (DeepSeek default)
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

- [ ] **Step 5: Update docs**

In `AGENTS.md`:
- Add to the API routes table: `| POST | /api/lookup | { word } | { translation, synonyms, antonyms, direction } |`
- In "Key facts", add: `LLM 自动翻译走 OpenAI 兼容接口：LLM_API_KEY (必填), LLM_BASE_URL (默认 https://api.deepseek.com/v1), LLM_MODEL (默认 deepseek-chat)`
- Update the Direction fact: `**Direction** is "en-to-zh" or "zh-to-en" (SQLite CHECK constraint)` → `**Direction** is "en-to-zh" or "zh-to-en" (SQLite CHECK constraint); the lookup route guesses it from the word's script` (entries are always saved with a concrete direction — `auto` is never stored)
- Update the source-files table row for App.tsx: `All UI state and rendering — single 493-line component` → `All UI state and rendering — main component (~700 lines, multi-column glossary/search layout)`
- Update the extension badge line: `The "扩展" badge appears in the topbar when running in extension context` → `The side panel auto-fills the query from the context menu (get-prefill / clear-prefill messages); the topbar shows no special badge`
- Update the right-click label mention: `"添加 "%s" 到生词库"` → `"添加 "%s" 到术语库"` (context-menu label was renamed in this task)

In `docs/README.md`: replace the `## TODO` section with:

```markdown
## Status

- `word-vault` → **TermVault (术语库)**: compact single-line UI, LLM auto-translation
  (synonyms/antonyms), categorized AI/programming glossary. Web + Chrome extension
  share one Turso-backed API on Vercel.
- `translate-plugin` retired — its functionality is built into word-vault's extension.
```

- [ ] **Step 6: Verify extension build**

Run: `npm run build` then `npm run ext` — expect exit 0 and `dist/` regenerated with icons + manifest.

Sanity check: `grep -r "TermVault" dist/manifest.json` shows the new name.

- [ ] **Step 7: Commit**

Note: `docs/README.md` is **inside** the repo (moved from the parent folder on 2026-08-09) — stage it with the other files below. `.gitignore` carries a user modification that appends `.env*` at line 38, which overrides the file's own `!.env.example` negation (git last-match-wins — verified `git check-ignore -v .env.example` → `.gitignore:38:.env*`). Never stage or modify `.gitignore`; instead force-add the example file. The commit is a `--only` pathspec commit so the pre-staged files (`.codegraph/.gitignore`, `.gitignore`, the plan doc) are NOT swept in — verify afterwards with `git show --stat HEAD` (must list exactly the 6 files):

```bash
git add public/manifest.json public/background.js vercel.json AGENTS.md docs/README.md
git add -f .env.example
git commit --only -m "chore: rename extension to TermVault, add LLM config and docs (TermVault)" -- public/manifest.json public/background.js vercel.json .env.example AGENTS.md docs/README.md
```

---

## Final Verification (whole app)

Before handing off:

```bash
npm run build          # tsc strict + vite — must exit 0
node scripts/dev.mjs   # both servers
```

Re-run the Task 6 checklist (steps 1–8) end-to-end, then with `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` set, confirm `POST /api/entries` writes to the remote DB (create a temp entry via curl and delete it).

Deployment: `vercel --prod` to the existing `translate-word-vault` project, with env vars `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `LLM_API_KEY` set in the Vercel dashboard. After deploy, reload the Chrome extension (`npm run ext` → Load unpacked → `dist/`).
