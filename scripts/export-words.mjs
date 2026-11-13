#!/usr/bin/env node

/**
 * export-words.mjs
 *
 * Exports every TermVault entry into a plain-text file that is easy to print.
 * The output file is ALWAYS rewritten from scratch (truncate + rename), so
 * running the script repeatedly never appends and never creates duplicates.
 *
 * Data source:
 *   - Turso DB when TURSO_DATABASE_URL is set in .env.local (the "Live" database)
 *   - otherwise the local SQLite file at data/dictionary.sqlite
 *
 * Usage:
 *   node scripts/export-words.mjs [--out <file>] [--all] [--starred]
 *                                 [--group] [--notes] [--help]
 *
 *   --out <file>  Output path (default repo-root/data/termvault.txt)
 *   --all         Include archived entries (default: active entries only)
 *   --starred     Only export starred entries
 *   --group       Add A–Z / # section headers
 *   --notes       Print each entry's note on a second line
 *
 * Default format (one entry per line, sorted by source text):
 *   backpressure — 背压
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@libsql/client";
import { existsSync, mkdirSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: existsSync(".env.local") ? ".env.local" : ".env", quiet: true });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_OUT = resolve(ROOT, "data/termvault.txt");
const SEPARATOR = " — ";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/export-words.mjs [options]

  --out <file>  Output path (default data/termvault.txt)
  --all         Include archived entries
  --starred     Only export starred entries
  --group       Add A–Z / # section headers
  --notes       Print each entry's note on a second line

Always rewrites the whole file — never appends, never duplicates.`);
  process.exit(0);
}

const valueOf = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`❌ ${flag} requires a path`);
    process.exit(1);
  }
  return value;
};

const OUT_FILE = resolve(process.cwd(), valueOf("--out") || DEFAULT_OUT);
const INCLUDE_ARCHIVED = args.includes("--all");
const STARRED_ONLY = args.includes("--starred");
const GROUP = args.includes("--group");
const WITH_NOTES = args.includes("--notes");

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** Local SQLite path, mirroring the server's resolution order. */
function localDbPath() {
  return process.env.DICTIONARY_DB_PATH || resolve(ROOT, "data/dictionary.sqlite");
}

async function openDb() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url) {
    console.log(`🌐 Source: Turso (${new URL(url).host})`);
    return createClient({ url, authToken });
  }

  const dbPath = localDbPath();
  if (!existsSync(dbPath)) {
    console.error(`❌ No TURSO_DATABASE_URL set, and no local database at ${dbPath}`);
    process.exit(1);
  }
  console.log(`💾 Source: local SQLite (${dbPath})`);
  return createClient({ url: `file:${dbPath}` });
}

async function fetchEntries(db) {
  // No SQL filtering — filter in JS so the log can report exactly what was
  // skipped (archived rows stay visible to the summary).
  const result = await db.execute(
    `SELECT source_text, target_text, direction, note, tags, archived, starred
       FROM entries`,
  );

  return result.rows.map((row) => ({
    sourceText: String(row.source_text ?? "").trim(),
    targetText: String(row.target_text ?? "").trim(),
    direction: String(row.direction ?? ""),
    note: String(row.note ?? "").trim(),
    archived: Number(row.archived ?? 0) === 1,
    starred: Number(row.starred ?? 0) === 1,
  }));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const collator = new Intl.Collator(["en", "zh-Hans"], { sensitivity: "base", numeric: true });

/** Section header for grouping: A–Z, # for digits/punctuation, 其他 for CJK. */
function sectionOf(sourceText) {
  const first = sourceText[0] ?? "";
  if (/[a-z]/i.test(first)) return first.toUpperCase();
  if (/[0-9]/.test(first)) return "#";
  return "其他";
}

function buildText(entries, skipped) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(
    2,
    "0",
  )}`;

  const scope = [STARRED_ONLY ? "仅星标" : null, INCLUDE_ARCHIVED ? "含归档" : "仅未归档"]
    .filter(Boolean)
    .join(" · ");

  const lines = [
    "TermVault 词汇导出",
    `生成时间：${stamp}`,
    `条目数量：${entries.length}${scope ? `（${scope}）` : ""}`,
  ];
  if (skipped > 0) lines.push(`已去重：${skipped}`);
  lines.push("", "=".repeat(48), "");

  let currentSection = null;
  for (const entry of entries) {
    if (GROUP) {
      const section = sectionOf(entry.sourceText);
      if (section !== currentSection) {
        if (currentSection !== null) lines.push("");
        lines.push(`【${section}】`);
        currentSection = section;
      }
    }

    lines.push(`${entry.sourceText}${SEPARATOR}${entry.targetText}`);
    if (WITH_NOTES && entry.note) lines.push(`  ${entry.note}`);
  }

  lines.push("", "=".repeat(48), "");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const db = await openDb();

  let rows;
  try {
    rows = await fetchEntries(db);
  } catch (error) {
    console.error(`❌ Could not read the entries table: ${error.message}`);
    await db.close();
    process.exit(1);
  }
  await db.close();

  // Dedupe identical text pairs (case/whitespace insensitive) — the DB already
  // enforces this, but archived/duplicate pairs from older imports may leak in.
  const seen = new Set();
  const unique = [];
  let duplicates = 0;
  let skippedArchived = 0;
  let skippedUnstarred = 0;

  for (const entry of rows) {
    if (!entry.sourceText || !entry.targetText) continue;
    if (!INCLUDE_ARCHIVED && entry.archived) {
      skippedArchived++;
      continue;
    }
    if (STARRED_ONLY && !entry.starred) {
      skippedUnstarred++;
      continue;
    }

    const key = `${entry.sourceText.toLowerCase()}|${entry.targetText.toLowerCase()}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    unique.push(entry);
  }

  unique.sort(
    (a, b) => collator.compare(a.sourceText, b.sourceText) || collator.compare(a.targetText, b.targetText),
  );

  const text = buildText(unique, duplicates);

  // Write to a temp file in the same directory, then rename over the target, so
  // an interrupted run can never leave a half-written export behind.
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tempFile = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tempFile, text, "utf8");
    renameSync(tempFile, OUT_FILE);
  } catch (error) {
    try {
      rmSync(tempFile, { force: true });
    } catch {
      /* ignore cleanup failure */
    }
    console.error(`❌ Could not write ${OUT_FILE}: ${error.message}`);
    process.exit(1);
  }

  console.log(`📄 Exported ${unique.length} entries → ${OUT_FILE}`);
  if (duplicates > 0) console.log(`⏭  Skipped ${duplicates} duplicate pair(s)`);
  if (skippedArchived > 0)
    console.log(`🗄  Skipped ${skippedArchived} archived entry/entries (use --all)`);
  if (skippedUnstarred > 0) console.log(`☆ Skipped ${skippedUnstarred} non-starred entry/entries`);
  if (unique.length === 0) console.log("ℹ️  The file contains only the header — no matching entries.");
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});
