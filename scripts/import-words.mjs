#!/usr/bin/env node

/**
 * import-words.mjs
 *
 * Reads a plain-text word list and inserts the words into the Turso database
 * configured in .env.local (the "Live" database).
 *
 * Line format — each line is either:
 *   1. A pair:        forgo, 放弃            → used as-is, no translation
 *   2. Single word:   decomposition          → translated by the LLM (en → zh)
 *                     分解                     → translated by the LLM (zh → en)
 *   3. Comma list:    forgo, distinction     → split into 2 separate words
 *
 * Blank lines and lines starting with `#` or `//` are ignored.
 *
 * Usage:
 *   node scripts/import-words.mjs [file] [--dry-run] [--verbose]
 *
 *   --dry-run   Translate and print what would be inserted, write nothing
 *   --verbose   Print the LLM's full lookup payload for each word
 *
 * Default file: repo-root/abbr-new.txt
 *
 * Environment (from .env.local):
 *   TURSO_DATABASE_URL   - Turso DB connection URL
 *   TURSO_AUTH_TOKEN     - Turso auth token
 *   LLM_API_KEY          - OpenAI-compatible API key (DeepSeek default)
 *   LLM_BASE_URL         - default https://api.deepseek.com/v1
 *   LLM_MODEL            - default deepseek-chat
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

loadEnv({ path: existsSync(".env.local") ? ".env.local" : ".env", quiet: true });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const positional = args.filter((a) => !a.startsWith("--"));
const WORD_FILE =
  positional[0] || fileURLToPath(new URL("../abbr-new.txt", import.meta.url));

const TAG = "abbr-new";
const LLM_RETRIES = 2;

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Split a line into trimmed, non-empty tokens on , ， 、 | */
function splitTokens(line) {
  return line
    .replace(/^[-*+]\s+/, "")
    .replace(/\*\*/g, "")
    .split(/[,，、|]/)
    .map((t) => t.trim().replace(/^["'`“”]|["'`“”]$/g, "").trim())
    .filter(Boolean);
}

/**
 * Parse the word file into a list of terms.
 * Returns [{ sourceText, targetText | null, line }]
 *   targetText === null  → needs LLM translation
 */
function parseWordFile(text) {
  const terms = [];
  const seen = new Set();

  const push = (sourceText, targetText, line) => {
    const key = sourceText.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    terms.push({ sourceText, targetText, line });
  };

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    if (/^(#|\/\/)/.test(line)) return;

    const tokens = splitTokens(line);
    if (tokens.length === 0) return;

    const english = tokens.filter((t) => !CJK_RE.test(t));
    const chinese = tokens.filter((t) => CJK_RE.test(t));

    // Pair: exactly one English + one Chinese token on the line → use as-is
    if (english.length === 1 && chinese.length === 1) {
      push(english[0], chinese[0], index + 1);
      return;
    }

    // Otherwise every token is its own standalone term
    for (const token of tokens) push(token, null, index + 1);
  });

  return terms;
}

// ---------------------------------------------------------------------------
// LLM translation (same prompt as server/index.mjs lookupWord)
// ---------------------------------------------------------------------------

/** Candidate API keys, in priority order: .env.local first, then the shell env. */
function apiKeys() {
  const keys = [process.env.LLM_API_KEY, process.env.DEEPSEEK_API_KEY]
    .map((k) => (k ?? "").trim())
    .filter(Boolean);
  return [...new Set(keys)];
}

async function requestTranslation(word, apiKey) {
  const base = (process.env.LLM_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL || "deepseek-chat";

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a technical bilingual dictionary for AI and programming terms. " +
            "If the input is English, return the best natural Chinese translation; if the input is Chinese, return the best natural English technical term. " +
            "Never translate literally when a domain term has an established form " +
            "(e.g. RAG → 检索增强生成, embedding → 向量嵌入, backpressure → 背压). " +
            "For English input, translation must be Chinese text — never echo the English word itself. " +
            "For proper nouns or brand names without an established Chinese name, keep the English name and add a short Chinese explanation in parentheses " +
            "(e.g. Terraform → Terraform（基础设施即代码工具）, Kubernetes → Kubernetes（容器编排平台）). " +
            'Respond ONLY with a JSON object: {"translation": string, "meanings": [{"pos": string, "text": string}], "synonyms": string[], "antonyms": string[], "examples": string[]} ' +
            "with at most 3 meanings, 3 synonyms/antonyms, and 2 short examples.",
        },
        { role: "user", content: `Translate this term: ${word}` },
      ],
    }),
  });

  if (!response.ok) {
    const error = new Error(`LLM request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty response");

  const parsed = JSON.parse(content);
  let translation = String(parsed.translation ?? "").trim();

  // Guard: the model echoed the input instead of translating it
  if (!translation || translation.toLowerCase() === word.toLowerCase()) {
    translation = Array.isArray(parsed.meanings)
      ? String(parsed.meanings[0]?.text ?? "").trim()
      : "";
  }
  if (!translation) throw new Error("LLM returned empty translation");

  return { translation, payload: parsed };
}

async function translateWord(word) {
  const keys = apiKeys();
  if (keys.length === 0) {
    throw new Error("No API key — set LLM_API_KEY in .env.local (or DEEPSEEK_API_KEY in the env)");
  }

  let lastError;
  for (const apiKey of keys) {
    for (let attempt = 0; attempt <= LLM_RETRIES; attempt++) {
      try {
        const { translation, payload } = await requestTranslation(word, apiKey);
        return {
          translation,
          direction: CJK_RE.test(word) ? "zh-to-en" : "en-to-zh",
          payload,
        };
      } catch (error) {
        lastError = error;
        // Bad key → give up on this one, try the next candidate
        if (error.status === 401 || error.status === 403) break;
        if (attempt < LLM_RETRIES) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

async function ensureSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      source_text TEXT NOT NULL,
      target_text TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('en-to-zh', 'zh-to-en')),
      note TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      archived INTEGER NOT NULL DEFAULT 0,
      starred INTEGER NOT NULL DEFAULT 0,
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

/** Any existing row with the same source word (regardless of translation)? */
async function findExisting(db, sourceText) {
  const result = await db.execute({
    sql: "SELECT id, source_text, target_text FROM entries WHERE lower(trim(source_text)) = lower(trim(?)) LIMIT 1",
    args: [sourceText],
  });
  return result.rows[0] ?? null;
}

function makeEntry(sourceText, targetText, direction, fromFile) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    sourceText: sourceText.trim(),
    targetText: targetText.trim(),
    direction,
    note: fromFile ? "Imported from abbr-new.txt" : "Imported from abbr-new.txt (auto-translated)",
    tags: [TAG],
    createdAt: now,
    updatedAt: now,
  };
}

async function insertEntry(db, entry) {
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
      0,
      entry.createdAt,
      entry.updatedAt,
    ],
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(WORD_FILE)) {
    console.error(`❌ File not found: ${WORD_FILE}`);
    process.exit(1);
  }

  console.log(`📖 Reading: ${WORD_FILE}${DRY_RUN ? "  (dry run — nothing will be written)" : ""}`);
  const terms = parseWordFile(readFileSync(WORD_FILE, "utf8"));
  console.log(`📝 Parsed ${terms.length} term(s): ${terms.map((t) => t.sourceText).join(", ")}`);

  if (terms.length === 0) {
    console.log("Nothing to import.");
    return;
  }

  const dbUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!dbUrl || !authToken) {
    console.error("❌ TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env.local");
    process.exit(1);
  }

  const db = createClient({ url: dbUrl, authToken });
  await ensureSchema(db);

  let added = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const term of terms) {
    const existing = await findExisting(db, term.sourceText);
    if (existing) {
      console.log(`⏭  skip   ${term.sourceText} — already exists → ${existing.target_text}`);
      skipped++;
      continue;
    }

    let targetText = term.targetText;
    let direction;
    try {
      if (targetText) {
        direction = CJK_RE.test(term.sourceText) ? "zh-to-en" : "en-to-zh";
        console.log(`✅ pair   ${term.sourceText} → ${targetText}`);
      } else {
        const result = await translateWord(term.sourceText);
        targetText = result.translation;
        direction = result.direction;
        if (VERBOSE) console.log(JSON.stringify(result.payload, null, 2));
        console.log(`🤖 llm    ${term.sourceText} → ${targetText}`);
      }
    } catch (error) {
      console.log(`❌ fail   ${term.sourceText} — ${error.message}`);
      failures.push({ word: term.sourceText, reason: error.message });
      failed++;
      continue;
    }

    if (DRY_RUN) {
      added++;
      continue;
    }

    try {
      await insertEntry(db, makeEntry(term.sourceText, targetText, direction, Boolean(term.targetText)));
      added++;
    } catch (error) {
      console.log(`❌ insert ${term.sourceText} — ${error.message}`);
      failures.push({ word: term.sourceText, reason: error.message });
      failed++;
    }
  }

  console.log(
    `\n${DRY_RUN ? "🔎 Dry run done" : "✅ Done"}: ${added} ${DRY_RUN ? "would be added" : "added"}, ${skipped} skipped, ${failed} failed`,
  );
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f.word}: ${f.reason}`);
  }

  if (!DRY_RUN && added > 0) {
    const total = await db.execute("SELECT COUNT(*) AS count FROM entries");
    console.log(`📊 Total entries in DB: ${total.rows[0].count}`);
  }

  await db.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});
