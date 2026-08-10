// ---------------------------------------------------------------------------
// Whiteboard (便签/白板) — standalone feature module.
//
// Fully self-contained: own table (`wb_notes`), own routes under
// `/api/whiteboard/*`. To remove this feature entirely, delete this file,
// remove the two wiring lines in `server/index.mjs` (import + `initWhiteboardSchema`
// call), drop the `wb_notes` table, and delete `src/whiteboard/` + the mount
// point in `src/App.tsx`. Nothing else in TermVault depends on it.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

const NOTE_FIELDS = `
  id,
  title,
  content,
  position,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export async function initWhiteboardSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS wb_notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

async function listNotes(db) {
  const result = await db.execute(`
    SELECT ${NOTE_FIELDS}
    FROM wb_notes
    ORDER BY position ASC, datetime(created_at) ASC
  `);
  return result.rows.map(rowToNote);
}

async function getNote(db, id) {
  const result = await db.execute({
    sql: `SELECT ${NOTE_FIELDS} FROM wb_notes WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) {
    const error = new Error("Note not found");
    error.statusCode = 404;
    throw error;
  }
  return rowToNote(result.rows[0]);
}

async function insertNote(db, input) {
  const now = new Date().toISOString();
  const maxPosition = await db.execute("SELECT COALESCE(MAX(position), -1) AS maxPos FROM wb_notes");
  const note = {
    id: randomUUID(),
    title: String(input.title ?? "").trim(),
    content: String(input.content ?? "").trim(),
    position: Number(maxPosition.rows[0].maxPos) + 1,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute({
    sql: `INSERT INTO wb_notes (id, title, content, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    args: [note.id, note.title, note.content, note.position, note.createdAt, note.updatedAt],
  });
  return getNote(db, note.id);
}

async function updateNote(db, id, input) {
  const existing = await getNote(db, id);
  const next = {
    ...existing,
    title: typeof input.title === "string" ? input.title.trim() : existing.title,
    content: typeof input.content === "string" ? input.content.trim() : existing.content,
    updatedAt: new Date().toISOString(),
  };

  await db.execute({
    sql: "UPDATE wb_notes SET title = ?, content = ?, updated_at = ? WHERE id = ?",
    args: [next.title, next.content, next.updatedAt, id],
  });
  return getNote(db, id);
}

// Swap the note's position with the neighbor above/below it.
async function moveNote(db, id, direction) {
  await getNote(db, id);
  if (direction !== "up" && direction !== "down") {
    const error = new Error('move must be "up" or "down"');
    error.statusCode = 400;
    throw error;
  }

  const all = await db.execute(`
    SELECT id, position FROM wb_notes ORDER BY position ASC, datetime(created_at) ASC
  `);
  const ordered = all.rows;
  const index = ordered.findIndex((row) => row.id === id);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;

  if (neighborIndex < 0 || neighborIndex >= ordered.length) {
    return getNote(db, id); // Already at the edge — no-op
  }

  const current = ordered[index];
  const neighbor = ordered[neighborIndex];
  await db.execute({
    sql: "UPDATE wb_notes SET position = ? WHERE id = ?",
    args: [neighbor.position, current.id],
  });
  await db.execute({
    sql: "UPDATE wb_notes SET position = ? WHERE id = ?",
    args: [current.position, neighbor.id],
  });
  return getNote(db, id);
}

async function deleteNote(db, id) {
  await getNote(db, id);
  await db.execute({ sql: "DELETE FROM wb_notes WHERE id = ?", args: [id] });
}

function rowToNote(row) {
  return {
    ...row,
    title: typeof row.title === "string" ? row.title : "",
    content: typeof row.content === "string" ? row.content : "",
    position: Number(row.position),
  };
}

// Returns true if the request was handled (whiteboard route), false otherwise.
export async function handleWhiteboardApi(db, request, response, url) {
  const method = request.method || "GET";
  const noteId = decodeURIComponent(url.pathname.replace(/^\/api\/whiteboard\/notes\/?/, ""));

  if (method === "GET" && url.pathname === "/api/whiteboard/notes") {
    sendJson(response, 200, { notes: await listNotes(db) });
    return true;
  }

  if (method === "POST" && url.pathname === "/api/whiteboard/notes") {
    const body = await readJson(request);
    sendJson(response, 201, { note: await insertNote(db, body) });
    return true;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/whiteboard/notes/") && noteId) {
    const body = await readJson(request);
    sendJson(response, 200, { note: await updateNote(db, noteId, body) });
    return true;
  }

  if (method === "PATCH" && url.pathname.startsWith("/api/whiteboard/notes/") && noteId) {
    const body = await readJson(request);
    sendJson(response, 200, { note: await moveNote(db, noteId, body.move) });
    return true;
  }

  if (method === "DELETE" && url.pathname.startsWith("/api/whiteboard/notes/") && noteId) {
    await deleteNote(db, noteId);
    sendJson(response, 200, { ok: true });
    return true;
  }

  return false;
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
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(payload));
}
