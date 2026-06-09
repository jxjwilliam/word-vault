#!/usr/bin/env node

/**
 * import-large-abbrs.mjs
 *
 * Parses a large abbrs.md (markdown vocabulary file) and inserts entries
 * into the Turso database configured in .env.
 *
 * Supports two formats:
 *   1. Markdown tables:  | English Term | Chinese Translation |
 *   2. Bullet lists:     - English term 中文翻译
 *
 * Usage:
 *   node scripts/import-large-abbrs.mjs [path-to-abbrs.md]
 *
 * Default file: /Users/william.jiang/my-AI/abbrs.md
 *
 * Environment (from .env):
 *   TURSO_DATABASE_URL   - Turso DB connection URL
 *   TURSO_AUTH_TOKEN      - Turso auth token
 */

import "dotenv/config";
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ABBR_FILE = process.argv[2] || "/Users/william.jiang/my-AI/abbrs.md";
const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Entry factory
// ---------------------------------------------------------------------------

function makeEntry(sourceText, targetText) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    sourceText: sourceText.trim(),
    targetText: targetText.trim(),
    direction: "en-to-zh",
    note: "Imported from abbrs.md (large)",
    tags: ["abbrs"],
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Parser — handles table rows AND bullet-list items
// ---------------------------------------------------------------------------

function parseAbbrs(markdown) {
  const entries = [];
  const lines = markdown.split("\n");
  let bulletProblems = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Skip section titles, horizontal rules, table separators, page breaks
    if (/^###?\s/.test(line)) continue;
    if (/^---/.test(line)) continue;
    if (/^\|?\s*-{2,}\|?/.test(line)) continue;
    if (/^\s*$/.test(line)) continue;

    // ── Format 1: Markdown table row ──
    if (line.startsWith("|") && line.endsWith("|")) {
      // Skip table header
      if (/English\s*Term/i.test(line) || /Chinese\s*Translation/i.test(line)) continue;

      const cells = line
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());

      if (cells.length < 2) continue;

      const [src, tgt] = cells;
      if (src && tgt) {
        entries.push(makeEntry(src, tgt));
      }
      continue;
    }

    // ── Format 2: Bullet list line (e.g. `- sentiment analysis 情感分析`) ──
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const text = line.replace(/^[-*]\s*/, "").trim();
      if (!text) continue;

      // Find the first CJK character — that's where Chinese translation starts
      const cjkMatch = text.match(
        /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/,
      );
      if (!cjkMatch) {
        // No CJK → not a bilingual entry, skip
        continue;
      }

      const splitIdx = cjkMatch.index;

      // Walk backwards from CJK to find the word boundary (skip spaces)
      let chineseStart = splitIdx;
      while (chineseStart > 0 && text[chineseStart - 1] === " ") chineseStart--;

      const sourceText = text.substring(0, chineseStart).trim();
      const targetText = text.substring(splitIdx).trim();

      if (sourceText && targetText) {
        // Sanity check: Chinese text shouldn't appear in source
        // (catches lines like "deterministic behavior (确定性行为)" which
        //  are comma-separated lists with inline translations — we skip those)
        if (/[\u4e00-\u9fff]/.test(sourceText)) {
          bulletProblems.push(line);
          continue;
        }
        entries.push(makeEntry(sourceText, targetText));
      }
      continue;
    }

    // Lines that don't match either format are silently skipped
  }

  if (bulletProblems.length > 0) {
    console.warn(
      `⚠️  Skipped ${bulletProblems.length} bullet line(s) with ambiguous parsing:`,
    );
    for (const p of bulletProblems.slice(0, 5)) {
      console.warn(`   ${p}`);
    }
    if (bulletProblems.length > 5) {
      console.warn(`   ... and ${bulletProblems.length - 5} more`);
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!dbUrl || !authToken) {
    console.error(
      "❌ TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env",
    );
    process.exit(1);
  }

  console.log(`🔌 Connecting to Turso: ${dbUrl}`);
  const db = createClient({ url: dbUrl, authToken });

  // ── Ensure schema exists ──
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
    // Index already exists
  }

  // ── Parse ──
  console.log(`📖 Reading: ${ABBR_FILE}`);
  const markdown = readFileSync(ABBR_FILE, "utf8");
  const entries = parseAbbrs(markdown);
  console.log(`📝 Parsed ${entries.length} entries from file`);

  if (entries.length === 0) {
    console.log("Nothing to import.");
    await db.close();
    return;
  }

  // ── Batch insert with dedup ──
  let added = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    for (const entry of batch) {
      const existing = await db.execute({
        sql:
          "SELECT id FROM entries WHERE lower(trim(source_text)) = lower(trim(?)) AND lower(trim(target_text)) = lower(trim(?))",
        args: [entry.sourceText, entry.targetText],
      });

      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      await db.execute({
        sql: `INSERT INTO entries (id, source_text, target_text, direction, note, tags, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      added++;
    }

    const pct = Math.min(
      100,
      Math.round(((i + BATCH_SIZE) / entries.length) * 100),
    );
    process.stdout.write(
      `\r⏳ Progress: ${pct}% (${added} added, ${skipped} skipped)`,
    );
  }

  console.log(`\n✅ Done! Added ${added} new entries, skipped ${skipped} existing.`);

  // ── Summary ──
  const total = await db.execute("SELECT COUNT(*) AS count FROM entries");
  console.log(`📊 Total entries in DB: ${total.rows[0].count}`);

  await db.close();
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
