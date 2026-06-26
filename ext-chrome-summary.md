# Chrome Extension Implementation Summary

将 Word Vault 从普通 Web 应用打包为 Chrome 扩展（Manifest V3），使用 **Side Panel** 作为 UI 容器，直接连接 Vercel 远程 API，并支持右键菜单快速添加/查询生词。

---

## Architecture

```
用户选中文字 → 右键菜单
        ↓
 background.js (Service Worker)
        ↓  chrome.storage.session + runtime.sendMessage
 src/App.tsx (Side Panel - index.html)
        ↓  fetch()
 translate-word-vault.vercel.app/api/*
```

扩展内不包含 API 服务器。所有数据操作通过 `fetch()` 调用 Vercel 上的远程 API，无需在本地运行 Node.js。

---

## Files Changed

### New Files

| File | Purpose |
|---|---|
| `public/manifest.json` | Extension manifest — side panel, context menus, host permissions for Vercel API |
| `public/background.js` | Service worker — side panel lifecycle, right-click context menu handlers, runtime message relay |
| `scripts/generate-icons.mjs` | Auto-generates 16/48/128px PNG icons via `sharp` (WV lettermark on gradient background) |

### Modified Files

| File | What changed |
|---|---|
| `server/index.mjs` | Added `Access-Control-Allow-Origin: *` to all responses + `OPTIONS` preflight handler |
| `src/api.ts` | Auto-detects extension context (`chrome.runtime?.id`) → uses absolute Vercel URL instead of relative `/api` path |
| `src/App.tsx` | On mount: sends `get-prefill` message to background → reads selected text → pre-fills form or search bar. Shows "扩展" badge in topbar |
| `src/styles.css` | Added `.extension-badge` pill styles |
| `package.json` | New scripts: `icons`, `ext` (icons+build), `ext:dev` (icons+dev build) |
| `AGENTS.md` | Added Chrome Extension section with file table, build steps, and feature list |
| `.gitignore` | Added `data/` to gitignore |
| `tsconfig.json` | Added `@types/chrome` (dev dependency) |

---

## Key Design Decisions

### 1. Remote API only, no local server

Since the app is already deployed to Vercel (`translate-word-vault.vercel.app`), the extension bypasses the local Node.js server entirely. `src/api.ts` detects whether it's running inside a Chrome extension and switches the base URL:

```ts
const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;
const BASE_URL = isExtension ? "https://translate-word-vault.vercel.app" : "";
```

### 2. Side Panel over Popup

Uses `chrome.sidePanel` API (Chrome 116+) — the panel lives in the browser's right sidebar, persists across tab switches, and feels more like a native dictionary tool.

### 3. Context Menu → Storage → Panel communication flow

The background script stores selected text in `chrome.storage.session` (in-memory, cleared on browser restart). When the side panel opens, it sends a `get-prefill` message to retrieve the pending data. This avoids URL hacks or DOM injection.

```
Right-click → background.js → storage.session → runtime.sendMessage → App.tsx
```

### 4. CORS support in server

The Node.js server (used by Vercel) now returns CORS headers on all responses, which is required because the extension fetches from a different origin.

---

## Build & Load

```bash
# One-command build
npm run ext

# Load in Chrome
# chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → select dist/
```

`dist/` contains everything Chrome needs:

```
dist/
  manifest.json       # Extension manifest
  background.js       # Service worker (copied from public/)
  index.html          # Built React app
  assets/index-*.js   # Bundled JS
  assets/index-*.css  # Bundled CSS
  icon16.png          # Extension icon (generated)
  icon48.png          #
  icon128.png         #
```

---

## User Features

| Feature | How |
|---|---|
| **Open side panel** | Click extension toolbar icon |
| **Add word from any page** | Select text → right-click → **"添加 "%s" 到生词库"** |
| **Quick lookup** | Select text → right-click → **"查询 "%s""** → search auto-filled |
| **Full dictionary CRUD** | Add, edit, archive, delete, search, sort, import/export — same as web app |
| **Data sync** | All operations hit the shared Vercel API — data is consistent across devices |
