# translate-app — Agent Guide

## Quick start

```bash
npm install
# Run BOTH API server and Vite:
node scripts/dev.mjs
# Or run them in separate terminals:
npm run dev          # Vite dev server @ http://127.0.0.1:5173
node server/index.mjs # API server @ http://127.0.0.1:4174
```

Build (typecheck + bundle):
```bash
npm run build        # tsc && vite build
npm run preview      # Vite preview (requires built dist/)
```

## Architecture

Single-page dictionary app (English ↔ Chinese). Persistence via **Node.js built-in `node:sqlite`**, no external database.

```
scripts/dev.mjs      # spawns both servers concurrently
server/index.mjs     # Node.js HTTP API server, serves static dist/
src/                 # Vite React frontend
abbrs.md             # bundled seed vocabulary
data/dictionary.sqlite # auto-created SQLite DB
```

| Dir | Purpose |
|---|---|
| `src/` | React app — 4 source files + styles.css |
| `server/` | Single-file Node.js HTTP + SQLite API |
| `scripts/` | Dev orchestrator (spawns both processes) |
| `dist/` | Build output (gitignored) |
| `data/` | SQLite database (auto-created) |

## Source files

| File | Responsibility |
|---|---|
| `src/types.ts` | `DictionaryEntry`, `Direction`, `SortKey`, `ArchiveFilter`, `ExportPayload` |
| `src/api.ts` | REST client: `fetchEntries`, `createEntry`, `updateEntry`, `patchEntry`, `deleteEntryById`, `importAbbrs`, `importEntries` |
| `src/dictionary.ts` | Pure functions: `sortEntries`, `entryMatches`, `normalizeTags`, `tagsToInput`, `createExportPayload`, `parseImportPayload` |
| `src/App.tsx` | All UI state and rendering — single 493-line component |
| `src/styles.css` | All styles (no CSS framework) |
| `server/index.mjs` | Full API server — CRUD routes, SQLite schema, seed logic, static file serving |

## API routes

All routes are prefixed with `/api/`:

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/entries` | — | `{ entries: [...] }` |
| POST | `/api/entries` | `{ sourceText, targetText, direction, note, tags }` | `{ entry: {...} }` |
| PUT | `/api/entries/:id` | full entry fields | `{ entry: {...} }` |
| PATCH | `/api/entries/:id` | `{ archived: bool }` (partial) | `{ entry: {...} }` |
| DELETE | `/api/entries/:id` | — | `{ ok: true }` |
| POST | `/api/import/abbrs` | `{}` | `{ added: N, entries: [...] }` |
| POST | `/api/import/json` | `{ entries: [...] }` | `{ added: N, entries: [...] }` |

## Key facts

- **No linter, no formatter, no test framework** — don't add them without discussion
- **TypeScript strict mode** is on; prefer avoiding `as any` and `@ts-ignore`
- **Tags** are stored as JSON array strings in SQLite (`tags TEXT DEFAULT '[]'`); parsed on read
- **Entries have a unique constraint** on `(lower(trim(source_text)), lower(trim(target_text)))`
- **Direction** is `"en-to-zh"` or `"zh-to-en"` (SQLite CHECK constraint)
- **Import merges by text pair** — if source+target match, the entry is skipped (not duplicated)
- **Database path** is `data/dictionary.sqlite`; override via `DICTIONARY_DB_PATH` env var
- **Port** defaults to 4174 for API, 5173 for Vite; override via `PORT` env var (API server only)
- **Auto-seed**: `abbrs.md` is imported automatically on first server start (tracked in `metadata` table)
- **No SSR, no routing** — single-page app, all state in React component
- `node:sqlite` requires **Node.js 22+** (built-in, not a package dependency)
- **Vite proxies `/api/*`** to port 4174 in dev mode (configured in `vite.config.ts`). In production, the API server serves static `dist/` directly on the API port, no proxy needed.
- **`data/` is gitignored** — the SQLite database is auto-created and should not be committed.

## Style conventions

- Custom CSS via `styles.css` (no Tailwind, no CSS-in-JS)
- Import icons from `lucide-react` by name
- API calls: async/await, try/catch, message strings in Chinese
- Import pattern: type imports via `import type`, grouped: React hooks → lucide-react → local modules
- Prefer single-file approach unless a module clearly warrants extraction
