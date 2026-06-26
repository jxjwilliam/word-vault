import type { DictionaryEntry } from "./types";

// When running as a Chrome extension (side panel), use the public Vercel API.
// In local dev (Vite proxy), use the relative /api path.
const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;
const BASE_URL = isExtension ? "https://translate-word-vault.vercel.app" : "";

const api = (path: string) => `${BASE_URL}${path}`;

type EntriesResponse = {
  entries: DictionaryEntry[];
};

type EntryResponse = {
  entry: DictionaryEntry;
};

type ImportResponse = EntriesResponse & {
  added: number;
};

const requestJson = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload as T;
};

export const fetchEntries = async () => {
  const payload = await requestJson<EntriesResponse>(api("/api/entries"));
  return payload.entries;
};

export const createEntry = async (
  entry: Pick<DictionaryEntry, "sourceText" | "targetText" | "direction" | "note" | "tags">,
) => {
  const payload = await requestJson<EntryResponse>(api("/api/entries"), {
    method: "POST",
    body: JSON.stringify(entry),
  });

  return payload.entry;
};

export const updateEntry = async (
  id: string,
  entry: Pick<DictionaryEntry, "sourceText" | "targetText" | "direction" | "note" | "tags" | "archived">,
) => {
  const payload = await requestJson<EntryResponse>(api(`/api/entries/${encodeURIComponent(id)}`), {
    method: "PUT",
    body: JSON.stringify(entry),
  });

  return payload.entry;
};

export const patchEntry = async (id: string, patch: Partial<Pick<DictionaryEntry, "archived">>) => {
  const payload = await requestJson<EntryResponse>(api(`/api/entries/${encodeURIComponent(id)}`), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  return payload.entry;
};

export const deleteEntryById = async (id: string) => {
  await requestJson<{ ok: true }>(api(`/api/entries/${encodeURIComponent(id)}`), {
    method: "DELETE",
  });
};

export const importAbbrs = async () => {
  return requestJson<ImportResponse>(api("/api/import/abbrs"), {
    method: "POST",
    body: JSON.stringify({}),
  });
};

export const importEntries = async (entries: DictionaryEntry[]) => {
  return requestJson<ImportResponse>(api("/api/import/json"), {
    method: "POST",
    body: JSON.stringify({ entries }),
  });
};
