import { createClient } from "@libsql/client";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Database — supports Turso (remote) and local file-based SQLite
// ---------------------------------------------------------------------------

let db;

async function getDb() {
  if (db) return db;

  if (process.env.TURSO_DATABASE_URL) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    const { mkdirSync } = await import("node:fs");
    const dataDir = resolve(process.cwd(), "data");
    mkdirSync(dataDir, { recursive: true });
    const dbPath = process.env.DICTIONARY_DB_PATH || resolve(dataDir, "dictionary.sqlite");
    db = createClient({ url: `file:${dbPath}` });
  }

  await initSchema();
  await seedDefaultDictionary();

  return db;
}

async function initSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      source_text TEXT NOT NULL,
      target_text TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('en-to-zh', 'zh-to-en')),
      note TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  try {
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS entries_text_pair_idx
        ON entries (lower(trim(source_text)), lower(trim(target_text)))
    `);
  } catch {
    // Index already exists — safe to ignore
  }
}

async function seedDefaultDictionary() {
  const seeded = await db.execute({
    sql: "SELECT value FROM metadata WHERE key = ?",
    args: ["abbrs_seeded"],
  });
  if (seeded.rows.length > 0 && seeded.rows[0].value === "true") return;

  const count = await db.execute("SELECT COUNT(*) AS count FROM entries");
  if (Number(count.rows[0].count) > 0) {
    await db.execute({
      sql: "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      args: ["abbrs_seeded", "true"],
    });
    return;
  }

  const rootDir = resolve(new URL("..", import.meta.url).pathname);
  const markdown = readFileSync(resolve(rootDir, "abbrs.md"), "utf8");
  const entries = parseMarkdownDictionary(markdown);

  for (const entry of entries) {
    const existing = await db.execute({
      sql: "SELECT id FROM entries WHERE lower(trim(source_text)) = lower(trim(?)) AND lower(trim(target_text)) = lower(trim(?))",
      args: [entry.sourceText, entry.targetText],
    });
    if (existing.rows.length > 0) continue;
    await insertEntry(entry);
  }

  await db.execute({
    sql: "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
    args: ["abbrs_seeded", "true"],
  });
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

async function listEntries() {
  const result = await db.execute(`
    SELECT
      id,
      source_text AS sourceText,
      target_text AS targetText,
      direction,
      note,
      tags,
      archived,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM entries
    ORDER BY datetime(updated_at) DESC
  `);
  return result.rows.map(rowToEntry);
}

async function getEntry(id) {
  const result = await db.execute({
    sql: `SELECT
      id,
      source_text AS sourceText,
      target_text AS targetText,
      direction,
      note,
      tags,
      archived,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM entries WHERE id = ?`,
    args: [id],
  });

  if (result.rows.length === 0) {
    const error = new Error("Entry not found");
    error.statusCode = 404;
    throw error;
  }

  return rowToEntry(result.rows[0]);
}

async function insertEntry(entry) {
  await db.execute({
    sql: `INSERT INTO entries (
      id, source_text, target_text, direction, note, tags, archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      entry.id,
      entry.sourceText,
      entry.targetText,
      entry.direction,
      entry.note,
      JSON.stringify(entry.tags),
      entry.archived ? 1 : 0,
      entry.createdAt,
      entry.updatedAt,
    ],
  });
  return getEntry(entry.id);
}

async function updateEntry(id, input) {
  const existing = await getEntry(id);
  const next = {
    ...existing,
    ...input,
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await db.execute({
    sql: `UPDATE entries
      SET source_text = ?, target_text = ?, direction = ?, note = ?, tags = ?, archived = ?, updated_at = ?
      WHERE id = ?`,
    args: [
      next.sourceText,
      next.targetText,
      next.direction,
      next.note,
      JSON.stringify(next.tags),
      next.archived ? 1 : 0,
      next.updatedAt,
      id,
    ],
  });

  return getEntry(id);
}

async function patchEntry(id, body) {
  const existing = await getEntry(id);
  const archived = typeof body.archived === "boolean" ? body.archived : existing.archived;
  const updatedAt = new Date().toISOString();

  await db.execute({
    sql: "UPDATE entries SET archived = ?, updated_at = ? WHERE id = ?",
    args: [archived ? 1 : 0, updatedAt, id],
  });

  return getEntry(id);
}

async function deleteEntry(id) {
  await getEntry(id);
  await db.execute({ sql: "DELETE FROM entries WHERE id = ?", args: [id] });
}

// ---------------------------------------------------------------------------
// Import logic
// ---------------------------------------------------------------------------

async function mergeEntriesByTextPair(entries) {
  let added = 0;

  for (const entry of entries) {
    const existing = await db.execute({
      sql: "SELECT id FROM entries WHERE lower(trim(source_text)) = lower(trim(?)) AND lower(trim(target_text)) = lower(trim(?))",
      args: [entry.sourceText, entry.targetText],
    });
    if (existing.rows.length > 0) continue;
    await insertEntry(entry);
    added += 1;
  }

  return added;
}

async function mergeEntriesById(entries) {
  let added = 0;

  for (const entry of entries) {
    const existing = await db.execute({
      sql: "SELECT id FROM entries WHERE id = ?",
      args: [entry.id],
    });
    if (existing.rows.length > 0) {
      await updateEntry(entry.id, entry);
      continue;
    }
    await insertEntry(entry);
    added += 1;
  }

  return added;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMarkdownDictionary(markdown) {
  const now = new Date().toISOString();
  const entries = [];

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
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
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  return entries;
}

function normalizeEntryInput(value, partial = false) {
  const now = new Date().toISOString();
  const input = value && typeof value === "object" ? value : {};
  const sourceText = String(input.sourceText ?? "").trim();
  const targetText = String(input.targetText ?? "").trim();
  const direction = input.direction === "zh-to-en" ? "zh-to-en" : "en-to-zh";

  if (!partial && (!sourceText || !targetText)) {
    const error = new Error("sourceText and targetText are required");
    error.statusCode = 400;
    throw error;
  }

  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
    sourceText,
    targetText,
    direction,
    note: String(input.note ?? "").trim(),
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    archived: Boolean(input.archived),
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
  };
}

function rowToEntry(row) {
  return {
    ...row,
    tags: parseTags(row.tags),
    archived: Boolean(row.archived),
  };
}

function parseTags(value) {
  try {
    const tags = JSON.parse(value);
    return Array.isArray(tags) ? tags.map((tag) => String(tag)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function handleApi(request, response, url) {
  const method = request.method || "GET";
  const entryId = decodeURIComponent(url.pathname.replace(/^\/api\/entries\/?/, ""));

  if (method === "GET" && url.pathname === "/api/entries") {
    sendJson(response, 200, { entries: await listEntries() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/entries") {
    const body = await readJson(request);
    const entry = await insertEntry(normalizeEntryInput(body));
    sendJson(response, 201, { entry });
    return;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/entries/") && entryId) {
    const body = await readJson(request);
    const entry = await updateEntry(entryId, normalizeEntryInput(body, true));
    sendJson(response, 200, { entry });
    return;
  }

  if (method === "PATCH" && url.pathname.startsWith("/api/entries/") && entryId) {
    const body = await readJson(request);
    const entry = await patchEntry(entryId, body);
    sendJson(response, 200, { entry });
    return;
  }

  if (method === "DELETE" && url.pathname.startsWith("/api/entries/") && entryId) {
    await deleteEntry(entryId);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/api/import/abbrs") {
    const rootDir = resolve(new URL("..", import.meta.url).pathname);
    const incoming = parseMarkdownDictionary(readFileSync(resolve(rootDir, "abbrs.md"), "utf8"));
    const added = await mergeEntriesByTextPair(incoming);
    sendJson(response, 200, { added, entries: await listEntries() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/import/json") {
    const body = await readJson(request);
    const incoming = Array.isArray(body) ? body : Array.isArray(body.entries) ? body.entries : [];
    const added = await mergeEntriesById(incoming.map((entry) => normalizeEntryInput(entry)));
    sendJson(response, 200, { added, entries: await listEntries() });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

// ---------------------------------------------------------------------------
// Request handler — exported for Vercel, also used by local server
// ---------------------------------------------------------------------------

async function handler(request, response) {
  try {
    await getDb(); // ensure DB is initialized

    const host = request.headers.host || "127.0.0.1";
    const url = new URL(request.url || "/", `http://${host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    // On Vercel, non-API routes are served by Vercel's static file serving
    // Locally, fall through to static file serving from dist/
    serveStatic(response, url.pathname);
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, status, { error: error instanceof Error ? error.message : "Unknown server error" });
  }
}

export default handler;

// ---------------------------------------------------------------------------
// Static file serving (local dev only)
// ---------------------------------------------------------------------------

function serveStatic(response, pathname) {
  const rootDir = resolve(new URL("..", import.meta.url).pathname);
  const distDir = resolve(rootDir, "dist");
  const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(distDir, safePath);
  const target = filePath.startsWith(distDir) && existsSync(filePath) ? filePath : resolve(distDir, "index.html");

  if (!existsSync(target)) {
    sendJson(response, 404, { error: "Build output not found. Run npm run build first." });
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypeFor(target),
  });
  createReadStream(target).pipe(response);
}

function contentTypeFor(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  };

  return types[extname(filePath)] || "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Local server — only starts when run directly (not on Vercel)
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 4174);

  const server = createServer(handler);

  server.listen(port, "127.0.0.1", () => {
    getDb().then(() => {
      const dbPath = process.env.DICTIONARY_DB_PATH || "data/dictionary.sqlite";
      console.log(`Dictionary API ready at http://127.0.0.1:${port}`);
      console.log(process.env.TURSO_DATABASE_URL ? `Turso database: ${process.env.TURSO_DATABASE_URL}` : `SQLite database: ${dbPath}`);
    });
  });
}

// ---------------------------------------------------------------------------
// Body reader
// ---------------------------------------------------------------------------

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
