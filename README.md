# Local Dictionary App

A small local dictionary app for managing English-to-Chinese and Chinese-to-English words or short phrases while reading on a MacBook. Data is stored in a local SQLite database via a built-in Node.js API server.

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

- **Backend:** Node.js 22+ (built-in `node:sqlite`, `node:http`)
- **Frontend:** Vite + React 18 + TypeScript
- **Icons:** lucide-react

## Getting Started

### Prerequisites

- **Node.js 22+** (required for built-in `node:sqlite`)

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
