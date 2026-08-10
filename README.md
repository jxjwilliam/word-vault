# Local Dictionary App

A small dictionary app for managing English-to-Chinese and Chinese-to-English words or short phrases while reading on a MacBook. The API server uses local SQLite by default, but this workspace's `.env.local` is configured for Turso, so the running service will connect to the remote database unless those vars are removed. The app is also deployable to Vercel with Turso (edge SQLite).

## Features

- **One-field add**: type an English or Chinese word → AI 翻译 fills in the translation,
  synonyms, and antonyms → one-click 保存
- **Empty-state auto-add**: searching a word that isn't in the dictionary shows
  「X」不在词库中 + 自动添加（AI 翻译）, which LLM-translates the word and lets you save it
- **Bilingual-correct LLM translations**: English input always yields Chinese text; brand
  names keep the English name with a Chinese explanation (e.g. Terraform →
  Terraform（基础设施即代码工具）). If the model echoes the input instead of translating,
  the UI falls back to the first meaning's text
- Strict substring search across source text, translation, notes, tags, synonyms,
  and antonyms
- Sort by input time or word (ascending/descending), with starred (常用) entries pinned first
- Star (常用标记), edit, copy translation, and delete entries
- Expand a row for more meanings, synonyms, antonyms, and examples from the LLM
- Autocomplete suggestions while adding (from existing entries)
- **Whiteboard (白板便签)**: standalone notepad opened from the topbar (own `wb_notes`
  table + `/api/whiteboard/*` routes; removable)
- **Chrome Extension** (Manifest V3): side panel + right-click "添加到术语库" / "查询"
- Auto-seed the bundled `abbrs.md` vocabulary on first server start; markdown bold
  markers are stripped while importing so stored terms stay clean
- Persist data in local SQLite (`data/dictionary.sqlite`) when Turso env vars are not set; otherwise use the configured Turso database

## Tech Stack

- **Backend:** Node.js 18+ (`node:http`, `@libsql/client`)
- **Frontend:** Vite + React 18 + TypeScript
- **Icons:** lucide-react
- **LLM translation:** OpenAI-compatible chat API (default DeepSeek) — see below

## LLM Translation

Auto-translation (`POST /api/lookup`) uses an OpenAI-compatible chat API. The prompt is
domain-aware (AI/programming terms get established Chinese forms, e.g. RAG →
检索增强生成) and requires English input to produce Chinese text; proper nouns and brand
names keep the English name with a short Chinese explanation in parentheses
(e.g. Terraform → Terraform（基础设施即代码工具）).

| Env var | Default | Purpose |
|---|---|---|
| `LLM_API_KEY` | — (required) | API key for the LLM provider |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | OpenAI-compatible base URL |
| `LLM_MODEL` | `deepseek-chat` | Model name |

Without `LLM_API_KEY`, `/api/lookup` returns an explicit error and the UI degrades to
manual entry — the app remains fully usable as a dictionary.

## Getting Started

### Install

```bash
npm install
```

### Development (API + Vite)

```bash
node scripts/dev.mjs
```

This spawns both servers — the API on port 4174 and Vite on port 5173. Vite proxies `/api/*` requests to the API server automatically.

Open http://127.0.0.1:5173/ in your browser.

You can also run them in separate terminals:

```bash
npm run dev              # Vite dev server @ http://127.0.0.1:5173
node server/index.mjs    # API server @ http://127.0.0.1:4174
```

### Production build

```bash
npm run build        # tsc && vite build
npm run preview      # Vite preview (requires built dist/)
```

In production, the API server (`server/index.mjs`) serves the built `dist/` folder directly alongside its REST endpoints — no separate Vite server needed.

## Data

Dictionary entries are stored in local SQLite at `data/dictionary.sqlite` when Turso is not configured. If `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are present, the server uses Turso instead and will not create a local `dictionary.sqlite` file. The included `abbrs.md` vocabulary is seeded automatically into the active database on first server start.

The glossary importer strips markdown bold markers from table cells and bullet entries before saving, so words like `**cosine similarity**` are stored and displayed as `cosine similarity`.

Use the app's JSON export feature for portable backups.

## Deployment Options

The app uses `@libsql/client` which can connect to either a local file or a remote Turso database. This makes it flexible for different deployment targets.

> **⚠️ Vercel / serverless deployment requires Turso.** Serverless functions have a read-only filesystem — the local `file:` SQLite fallback will fail and your data will not persist. You must set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` environment variables for Vercel to work.

| Option | Storage | Persistence | Setup Effort | Best For |
|---|---|---|---|---|
| **Local SQLite** (fallback) | `data/dictionary.sqlite` on disk | ✅ Filesystem | Zero — auto-created | Local dev when Turso is not configured |
| **Turso (edge SQLite)** | Turso distributed DB | ✅ Cloud-persisted | Sign up + set 2 env vars | **Vercel / serverless deployment** |
| **Neon Postgres** | Serverless Postgres | ✅ Cloud-persisted | Schema migration + rewrite queries | If you prefer Postgres |

### Local SQLite (fallback — no config needed)

The server auto-creates `data/dictionary.sqlite` using the `file:` protocol of `@libsql/client` when `TURSO_DATABASE_URL` is not set. No additional environment variables are needed for local SQLite.

```bash
node server/index.mjs
# Database at data/dictionary.sqlite
```

### Turso (for Vercel or any serverless host)

1. Sign up at [turso.tech](https://turso.tech) and install the CLI:
   ```bash
   npm install -g turso
   turso auth login
   ```

2. Create a database:
   ```bash
   turso db create vocab-keep
   ```

3. Get the connection URL and auth token:
   ```bash
   turso db show vocab-keep --url
   turso db tokens create vocab-keep
   ```

4. Set environment variables in `.env.local` (auto-loaded by `dotenv`):
   ```bash
   TURSO_DATABASE_URL="libsql://vocab-keep-<org>.turso.io"
   TURSO_AUTH_TOKEN="<token>"
   ```
   Or export them directly:
   ```bash
   export TURSO_DATABASE_URL="libsql://vocab-keep-<org>.turso.io"
   export TURSO_AUTH_TOKEN="<token>"
   ```

5. Run locally with Turso:
   ```bash
   node server/index.mjs
   ```

6. Deploy to Vercel:
   ```bash
   vercel --prod
   ```
   Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as environment variables in the Vercel dashboard (or `vercel env add`).

   The `vercel.json` config handles the API routing — build output in `dist/`, API requests handled by `api/index.mjs`.

   **Without Turso env vars, the deployment will fail at runtime** — serverless functions cannot write to the filesystem, so the local SQLite fallback cannot create `data/dictionary.sqlite`.

### Neon Postgres (alternative)

If you prefer Postgres, you'd need to:
- Replace `@libsql/client` with `@neondatabase/serverless`
- Adapt the SQL schema (minor dialect differences)
- Update queries to use `$1` param style

The API route structure and frontend stay the same.
