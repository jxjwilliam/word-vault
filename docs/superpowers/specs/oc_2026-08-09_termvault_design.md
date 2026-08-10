# TermVault (术语库) — Design Spec

Date: 2026-08-09
Status: Approved (pending user spec review)
Tool: OpenCode (`oc_` prefix)
Base project: `word-vault` (reused as-is, no new project)

---

## 1. Background & Goals

The existing `translate-word-vault.vercel.app` works but is painful to use:

- **Entry is slow** — requires manually filling source + target text; no auto translation
- **UI is noisy** — cards + two-column layout; useless info everywhere ("imported from abbrs.md", direction pills, archive/duplicate/import/export buttons, stats bar)
- **Lookup is heavy** — full list load + scroll; no instant compact query
- **Vocabulary is thin** — built-in AI/programming terms are few; new terms must be hand-translated

The new app (working name **TermVault / 术语库**) fixes all four:

1. **One-field entry**: type the word (en or zh) → LLM auto-translates + generates synonyms/antonyms → one-click save
2. **Compact single-line table UI**: row = word | translation | category chip; hover reveals actions; click expands details
3. **Instant lookup**: same-page search over word/translation (client-side, existing mechanism)
4. **Rich built-in glossary**: abbrs.md expanded into multi-category AI/programming seed data

Two orthogonal references informed the direction (see §8 for roadmap):
- **qwerty-learner** — muscle-memory typing practice, chapter progression, error book
- **ai-vocabulary-builder** — AI-powered word capture from text, quiz/story modes

**Scope decision (user-approved):** MVP = 录入 + 查询 only. Review/practice features (FSRS, typing, quiz, story, Anki export, TTS, ⌘K palette) are P1/P2 roadmap, not in this build.

## 2. Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Base code | **word-vault, modified in place** (Vite + React + TS + custom Node server) | User rule: no new wheels; translate-plugin is a duplicate packaging and is retired |
| Framework | Vite React (stays) — **not Next.js** | word-vault already deploys to Vercel + has extension support + local SQLite↔Turso switching; rewrite would throw it away |
| DB client | `@libsql/client` (stays) — `file:` local SQLite in dev, `TURSO_DATABASE_URL` remote in prod | Already proven; zero code change between environments |
| ORM | None (raw `db.execute`, stays) | Consistent with existing single-file server; Drizzle unnecessary at this scale |
| Schema | **Evolve existing `entries` table via ALTER TABLE ADD COLUMN** — no data migration, no rename | Existing Turso data (all user words) survives untouched; import/export/seed code keeps working |
| LLM | OpenAI-compatible API — default **DeepSeek** (`LLM_BASE_URL` + `LLM_API_KEY` env) | Cheap, user-approved; any OpenAI-compatible provider swappable via env |
| LLM output | Strict JSON: `{translation, synonyms[≤3], antonyms[≤3], direction}` | Domain-aware prompt so AI/programming terms get real definitions (embedding → 向量嵌入), not literal translations |
| Extension | Reuse word-vault's existing Chrome extension packaging (MV3 side panel + context menu + prefill); rebuild picks up new UI | Already built; thin-shell (load remote URL) deferred — the existing mechanism is less work |
| Deployment | Redeploy to same Vercel project (`translate-word-vault.vercel.app`) | Extension + web + Turso stay in sync with zero config change |
| UI copy | Chinese (matches existing) | — |

## 3. Data Model (schema evolution)

Existing table (unchanged columns, data preserved):

```sql
entries (
  id          TEXT PRIMARY KEY,
  source_text TEXT NOT NULL,           -- the word (en or zh)
  target_text TEXT NOT NULL,           -- LLM-provided translation
  direction   TEXT CHECK ('en-to-zh','zh-to-en'),
  note        TEXT DEFAULT '',
  tags        TEXT DEFAULT '[]',       -- kept for legacy data; UI ignores
  archived    INTEGER DEFAULT 0,       -- kept for legacy data; UI ignores
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
)
```

New columns added at startup (idempotent `ALTER TABLE ... ADD COLUMN` guarded by PRAGMA table_info check):

```sql
ALTER TABLE entries ADD COLUMN synonyms TEXT NOT NULL DEFAULT '[]';  -- JSON array, ≤3
ALTER TABLE entries ADD COLUMN antonyms TEXT NOT NULL DEFAULT '[]';  -- JSON array, ≤3
ALTER TABLE entries ADD COLUMN category TEXT NOT NULL DEFAULT '';    -- 'ai' | 'programming' | 'general' | '' (empty = 未分类)
```

- Unique index on `(lower(trim(source_text)), lower(trim(target_text)))` stays as-is.
- `category` is a **single** tag (replaces multi-tag output for new entries); legacy `tags[0]` is displayed as fallback category.
- Future FSRS fields (`due`, `stability`, `difficulty`, `reps`, `lapses`, `state`) land in P1 as more ALTERs — no schema redesign needed.

## 4. API

Existing routes unchanged (same shapes, now carrying the new columns):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/entries` | lists all (client-side filter for search — volumes are small) |
| POST | `/api/entries` | create; accepts optional `synonyms`/`antonyms`/`category` |
| PUT/PATCH | `/api/entries/:id` | edit; PATCH keeps `archived` toggle for legacy ext code |
| DELETE | `/api/entries/:id` | delete |
| POST | `/api/import/abbrs` | reseeds expanded glossary; section headers become categories |
| POST | `/api/import/json` | unchanged |

New route:

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/lookup` | `{ word: string }` | `{ translation, synonyms, antonyms, direction }` |

`/api/lookup` behavior:
- Detects direction by script (CJK → zh-to-en).
- Calls LLM (OpenAI-compatible chat completions, `LLM_BASE_URL` default `https://api.deepseek.com/v1`, model `deepseek-chat`) with a **domain-aware prompt**: "You are a technical translator for AI/programming terms. For terms like RAG, embedding, backpressure, quantization, give the domain-correct Chinese term, not a literal translation. Return strict JSON: {translation: string, synonyms: string[≤3], antonyms: string[≤3]}."
- `temperature: 0.2`, response_format `json_object` when supported (DeepSeek supports it).
- On LLM failure → `500 { error }`; frontend shows manual-entry fallback (word only, user types translation).

Env vars added: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` (optional). `.env.example` documents them. Vercel: set both + `maxDuration` bumped to 30s for the function if needed (`vercel.json`).

## 5. UI — compact single-line table (the core deliverable)

Layout (no two-column split, no cards):

```
┌──────────────────────────────────────────────────────────┐
│  🔍 搜索单词或译文…     [分类 ▾]                 [+ 添加]  │
├──────────────────────────────────────────────────────────┤
│  agent             智能体                 AI      ⚡ ⋯     │
│  inference         推断                   AI      ⚡ ⋯     │
│  RAG               检索增强生成             RAG    ⚡ ⋯     │
│  quantization      量化                    AI      ⚡ ⋯     │
└──────────────────────────────────────────────────────────┘
```

**Row anatomy** (single line, dense):
- `sourceText` (bold) | `targetText` | `category` chip (colored: AI=blue, 编程=green, 通用=gray) | hover-only actions: 复制 / ✏️ / 🗑
- Rows are `<div>` grid rows (3 columns + actions), not cards; zebra striping; compact 36px height
- Click row → inline expand: synonyms (clickable → searches that synonym) / antonyms / note / edit form
- Hidden entirely from UI: stats bar, direction pills, archived display, import/export toolbar, duplicate button, status message line (replaced by a transient inline message near the add input)

**Top bar:**
- Search input (existing `entryMatches` logic — matches word, translation, note, tags)
- Category `<select>`: 全部 / AI / 编程 / 通用 (filters `category` OR legacy `tags[0]`)
- `+ 添加` button → focuses the add input row (inline at top, no side panel)

**Add flow (one field, LLM fills the rest):**

```
[ add input: "embedding" ]  →  [翻译]  →  preview card (inline under input):
  embedding  向量嵌入 (en→zh)
  ⟡ 同义: vector representation   ⚡ 反义: —
  [保存] [编辑] [取消]
```

- Save → POST /api/entries → row appears at top, input clears, placeholder shows "已保存，可继续输入下一个"
- Editing an existing row uses the same inline form + LLM re-lookup button
- If LLM fails: inline "手动填写译文/同义词/反义词" fields appear instead (no dead end)

**Files touched in `src/`:**
- `types.ts` — add `synonyms: string[]`, `antonyms: string[]`, `category: string` to `DictionaryEntry`
- `api.ts` — add `lookupWord(word)`; extend create/update payloads
- `dictionary.ts` — add `categoryOf(entry)` helper (category || tags[0]), keep `entryMatches`
- `App.tsx` — rewrite the view layer (table + inline expand + add flow) around existing state handlers
- `styles.css` — rewrite for density (no framework, per repo convention)

## 6. Seed glossary expansion (abbrs.md)

Current: 2-column markdown table, ~130 terms, single flat list. New structure — section headers become categories:

```markdown
### AI (ai)
| English Term | Chinese Translation |
|---|---|
| agent | 智能体 |
...

### 编程 (programming)
| Term | Translation |
| backpressure | 背压 |
...

### 通用 (general)
...
```

- Server `parseMarkdownDictionary` extended: track current `###` header → category (default `general`); category written into new column.
- Expanded content: merge existing abbrs.md + new curated sections — AI agent/LLM terms, RAG & data, programming languages & concepts (async, idempotent, namespace, etc.), frontend/backend/DevOps, database. Target ~300–500 entries at first pass; all imported via existing dedupe-by-text-pair logic (metadata `abbrs_seeded` gate — bump to `abbrs_seeded_v2` so existing installs get the new batch; dedupe prevents duplicates).
- Seed also writes `category` from section header for every row.

## 7. Extension (unchanged mechanism, new UI)

- Keep `public/manifest.json` + `public/background.js` (side panel, context menu "添加到术语库" / right-click lookup).
- `src/api.ts` keeps auto-detection: extension context → absolute `https://translate-word-vault.vercel.app` (same deploy), web → relative `/api`.
- Rebuild (`npm run ext`) → extension UI automatically becomes the new compact table. No prefill/context-menu code changes needed (it pre-fills `sourceText` — still the add input).

## 8. Out of scope (P1/P2 roadmap — from qwerty-learner + ai-vocabulary-builder references)

- **P1**: FSRS spaced repetition (`ts-fsrs`) with keyboard-driven review (1-4), typing practice mode (qwerty-learner interaction), ⌘K command palette (paste sentence → AI extract + save)
- **P2**: quiz/story mode, Anki `.apkg`/CSV export, TTS pronunciation + IPA display
- Data model already accommodates: `note` holds context/example; future ALTERs add FSRS fields.

## 9. Validation gates

- `npm run build` (tsc strict + vite build) must pass — project has no linter/test framework; not adding any
- Manual verification checklist (local, against `file:` SQLite):
  1. first boot seeds expanded glossary with categories; no duplicates on re-seed
  2. search matches word/translation; category filter works; legacy rows show fallback category
  3. add "embedding" → LLM returns domain-correct translation + synonyms/antonyms → save → row appears
  4. LLM down → manual-fill fallback still saves
  5. edit/delete/copy-synonym-search work
  6. `npm run ext` → extension: right-click add pre-fills; side panel shows new UI; data shared with web
  7. with `TURSO_DATABASE_URL` set: remote read/write works (prod-equivalent)
- Ship: redeploy to existing `translate-word-vault.vercel.app` project.

## 10. Risks / notes

- LLM latency on Vercel: mitigate with `maxDuration: 30` + streaming not required for MVP (single word lookups are fast)
- Existing Turso DB keeps `archived`/`tags` columns — harmless legacy, UI ignores them
- DeepSeek requires a valid key; without `LLM_API_KEY`, `/api/lookup` returns explicit error and UI degrades to manual entry (app still fully usable as a dictionary)
- translate-plugin repo is retired — no changes there; README at repo root should note the retirement

## 11. Amendment (2026-08-10) — search strictness + translation guarantee

Two behavior decisions were locked in after real-world testing:

1. **Search is strict substring matching** (source text, translation, note, tags,
   synonyms, antonyms, direction). A brief fuzzy subsequence search was tried and
   reverted: it made short queries like "EDD" match unrelated entries (redundancy,
   reward model, …), so the empty-state add flow never appeared. With strict matching,
   a non-existent query shows 「X」不在词库中 + 自动添加（AI 翻译）, which runs the LLM
   lookup and offers one-click 保存 (see the plan's Task 6 amendment).
2. **LLM translation must be bilingual-correct**: the `/api/lookup` prompt requires
   Chinese text for English input, and proper nouns/brand names keep the English name
   with a Chinese explanation in parentheses (Terraform → Terraform（基础设施即代码工具）).
   As a safety net, the frontend `translationFor` helper falls back to `meanings[0].text`
   whenever the model echoes the input in the same language (used by the preview flow
   and AI 重译).
