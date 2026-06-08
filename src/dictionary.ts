import type { DictionaryEntry, Direction, ExportPayload, SortKey } from "./types";

export const normalizeTags = (value: string) =>
  value
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

export const tagsToInput = (tags: string[]) => tags.join(", ");

export const sortEntries = (entries: DictionaryEntry[], sortKey: SortKey) => {
  return [...entries].sort((a, b) => {
    if (sortKey === "sourceText" || sortKey === "targetText") {
      return a[sortKey].localeCompare(b[sortKey], ["en", "zh-Hans"], {
        sensitivity: "base",
      });
    }

    return new Date(b[sortKey]).getTime() - new Date(a[sortKey]).getTime();
  });
};

export const entryMatches = (entry: DictionaryEntry, query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    entry.sourceText,
    entry.targetText,
    entry.note,
    entry.direction,
    entry.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
};

export const parseImportPayload = (text: string): DictionaryEntry[] => {
  const parsed = JSON.parse(text) as unknown;
  const entries = Array.isArray(parsed)
    ? parsed
    : isExportPayload(parsed)
      ? parsed.entries
      : [];

  return entries.filter(isEntry);
};

export const createExportPayload = (entries: DictionaryEntry[]): ExportPayload => ({
  app: "local-dictionary",
  version: 1,
  exportedAt: new Date().toISOString(),
  entries,
});

const isExportPayload = (value: unknown): value is ExportPayload => {
  return Boolean(
    value &&
      typeof value === "object" &&
      "entries" in value &&
      Array.isArray((value as { entries: unknown }).entries),
  );
};

const isEntry = (value: unknown): value is DictionaryEntry => {
  if (!value || typeof value !== "object") return false;

  const entry = value as DictionaryEntry;
  return (
    typeof entry.id === "string" &&
    typeof entry.sourceText === "string" &&
    typeof entry.targetText === "string" &&
    (entry.direction === "en-to-zh" || entry.direction === "zh-to-en") &&
    typeof entry.note === "string" &&
    Array.isArray(entry.tags) &&
    typeof entry.archived === "boolean" &&
    typeof entry.createdAt === "string" &&
    typeof entry.updatedAt === "string"
  );
};
