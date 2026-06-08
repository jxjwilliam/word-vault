import { createReadStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const dataDir = resolve(rootDir, "data");
const dbPath = process.env.DICTIONARY_DB_PATH || resolve(dataDir, "dictionary.sqlite");
const port = Number(process.env.PORT || 4174);

mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;

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
  );

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS entries_text_pair_idx
    ON entries (lower(trim(source_text)), lower(trim(target_text)));
`);

seedDefaultDictionary();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Dictionary API ready at http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${dbPath}`);
});

async function handleApi(request, response, url) {
  const method = request.method || "GET";
  const entryId = decodeURIComponent(url.pathname.replace(/^\/api\/entries\/?/, ""));

  if (method === "GET" && url.pathname === "/api/entries") {
    sendJson(response, 200, { entries: listEntries() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/entries") {
    const body = await readJson(request);
    const entry = insertEntry(normalizeEntryInput(body));
    sendJson(response, 201, { entry });
    return;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/entries/") && entryId) {
    const body = await readJson(request);
    const entry = updateEntry(entryId, normalizeEntryInput(body, true));
    sendJson(response, 200, { entry });
    return;
  }

  if (method === "PATCH" && url.pathname.startsWith("/api/entries/") && entryId) {
    const body = await readJson(request);
    const entry = patchEntry(entryId, body);
    sendJson(response, 200, { entry });
    return;
  }

  if (method === "DELETE" && url.pathname.startsWith("/api/entries/") && entryId) {
    deleteEntry(entryId);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/api/import/abbrs") {
    const incoming = parseMarkdownDictionary(readFileSync(resolve(rootDir, "abbrs.md"), "utf8"));
    const added = mergeEntriesByTextPair(incoming);
    sendJson(response, 200, { added, entries: listEntries() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/import/json") {
    const body = await readJson(request);
    const incoming = Array.isArray(body) ? body : Array.isArray(body.entries) ? body.entries : [];
    const added = mergeEntriesById(incoming.map((entry) => normalizeEntryInput(entry)));
    sendJson(response, 200, { added, entries: listEntries() });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function seedDefaultDictionary() {
  const seeded = db.prepare("SELECT value FROM metadata WHERE key = ?").get("abbrs_seeded");
  if (seeded?.value === "true") return;

  const count = db.prepare("SELECT COUNT(*) AS count FROM entries").get().count;
  if (count > 0) {
    db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run("abbrs_seeded", "true");
    return;
  }

  const incoming = parseMarkdownDictionary(readFileSync(resolve(rootDir, "abbrs.md"), "utf8"));
  mergeEntriesByTextPair(incoming);
  db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run("abbrs_seeded", "true");
}

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

function listEntries() {
  return db
    .prepare(
      `SELECT
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
      ORDER BY datetime(updated_at) DESC`,
    )
    .all()
    .map(rowToEntry);
}

function insertEntry(entry) {
  db.prepare(
    `INSERT INTO entries (
      id, source_text, target_text, direction, note, tags, archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.sourceText,
    entry.targetText,
    entry.direction,
    entry.note,
    JSON.stringify(entry.tags),
    entry.archived ? 1 : 0,
    entry.createdAt,
    entry.updatedAt,
  );

  return getEntry(entry.id);
}

function updateEntry(id, input) {
  const existing = getEntry(id);
  const next = {
    ...existing,
    ...input,
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE entries
      SET source_text = ?, target_text = ?, direction = ?, note = ?, tags = ?, archived = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    next.sourceText,
    next.targetText,
    next.direction,
    next.note,
    JSON.stringify(next.tags),
    next.archived ? 1 : 0,
    next.updatedAt,
    id,
  );

  return getEntry(id);
}

function patchEntry(id, body) {
  const existing = getEntry(id);
  const next = {
    ...existing,
    archived: typeof body.archived === "boolean" ? body.archived : existing.archived,
    updatedAt: new Date().toISOString(),
  };

  db.prepare("UPDATE entries SET archived = ?, updated_at = ? WHERE id = ?").run(
    next.archived ? 1 : 0,
    next.updatedAt,
    id,
  );

  return getEntry(id);
}

function deleteEntry(id) {
  getEntry(id);
  db.prepare("DELETE FROM entries WHERE id = ?").run(id);
}

function getEntry(id) {
  const row = db
    .prepare(
      `SELECT
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
      WHERE id = ?`,
    )
    .get(id);

  if (!row) {
    const error = new Error("Entry not found");
    error.statusCode = 404;
    throw error;
  }

  return rowToEntry(row);
}

function mergeEntriesByTextPair(entries) {
  let added = 0;

  for (const entry of entries) {
    const existing = db
      .prepare("SELECT id FROM entries WHERE lower(trim(source_text)) = lower(trim(?)) AND lower(trim(target_text)) = lower(trim(?))")
      .get(entry.sourceText, entry.targetText);

    if (existing) continue;
    insertEntry(entry);
    added += 1;
  }

  return added;
}

function mergeEntriesById(entries) {
  let added = 0;

  for (const entry of entries) {
    const existing = db.prepare("SELECT id FROM entries WHERE id = ?").get(entry.id);
    if (existing) {
      updateEntry(entry.id, entry);
      continue;
    }

    insertEntry(entry);
    added += 1;
  }

  return added;
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

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function serveStatic(response, pathname) {
  const distDir = resolve(rootDir, "dist");
  const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(distDir, safePath);
  const target = filePath.startsWith(distDir) && existsSync(filePath) ? filePath : join(distDir, "index.html");

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
