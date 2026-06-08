# Local Dictionary App

A small local dictionary app for managing English-to-Chinese and Chinese-to-English words or short phrases while reading on a MacBook. Data is stored in a local SQLite database via a built-in Node.js API server. Also deployable to Vercel with Turso (edge SQLite).

## Features

- Add and edit dictionary entries
- Translate/manage English to Chinese or Chinese to English entries
- Search source text, translation, notes, tags, and direction
- Sort by recent update, creation time, source text, or translation
- Archive and restore entries
- Delete entries with confirmation
- Automatically seed `abbrs.md` vocabulary into SQLite on first run
- Re-import the bundled `abbrs.md` vocabulary from inside the app if needed
- Export and import dictionary data as JSON
- Persist data in a local SQLite database (`data/dictionary.sqlite`)

## Tech Stack

- **Backend:** Node.js 18+ (`node:http`, `@libsql/client`)
- **Frontend:** Vite + React 18 + TypeScript
- **Icons:** lucide-react

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

Dictionary entries are stored in a local SQLite database at `data/dictionary.sqlite` (auto-created on first run). The included `abbrs.md` vocabulary is seeded automatically into the database on first server start.

Use the app's JSON export feature for portable backups.

## Deployment Options

The app uses `@libsql/client` which can connect to either a local file or a remote Turso database. This makes it flexible for different deployment targets.

> **⚠️ Vercel / serverless deployment requires Turso.** Serverless functions have a read-only filesystem — the local `file:` SQLite fallback will fail and your data will not persist. You must set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` environment variables for Vercel to work.

| Option | Storage | Persistence | Setup Effort | Best For |
|---|---|---|---|---|
| **Local SQLite** (default) | `data/dictionary.sqlite` on disk | ✅ Filesystem | Zero — auto-created | Local dev, personal use |
| **Turso (edge SQLite)** | Turso distributed DB | ✅ Cloud-persisted | Sign up + set 2 env vars | **Vercel / serverless deployment** |
| **Neon Postgres** | Serverless Postgres | ✅ Cloud-persisted | Schema migration + rewrite queries | If you prefer Postgres |

### Local SQLite (default — no config needed)

The server auto-creates `data/dictionary.sqlite` using the `file:` protocol of `@libsql/client`. No environment variables needed.

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

4. Set environment variables in `.env` (auto-loaded by `dotenv`):
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
