import type { WhiteboardNote } from "./types";

// Same context detection as src/api.ts: extension side panel talks to the
// public Vercel API, local dev uses the Vite proxy.
const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;
const BASE_URL = isExtension ? "https://translate-word-vault.vercel.app" : "";

const api = (path: string) => `${BASE_URL}${path}`;

type NotesResponse = {
  notes: WhiteboardNote[];
};

type NoteResponse = {
  note: WhiteboardNote;
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

export const fetchNotes = async () => {
  const payload = await requestJson<NotesResponse>(api("/api/whiteboard/notes"));
  return payload.notes;
};

export const createNote = async (input: { title?: string; content: string }) => {
  const payload = await requestJson<NoteResponse>(api("/api/whiteboard/notes"), {
    method: "POST",
    body: JSON.stringify(input),
  });
  return payload.note;
};

export const updateNote = async (id: string, input: { title?: string; content: string }) => {
  const payload = await requestJson<NoteResponse>(api(`/api/whiteboard/notes/${id}`), {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return payload.note;
};

export const moveNote = async (id: string, move: "up" | "down") => {
  const payload = await requestJson<NoteResponse>(api(`/api/whiteboard/notes/${id}`), {
    method: "PATCH",
    body: JSON.stringify({ move }),
  });
  return payload.note;
};

export const deleteNote = async (id: string) => {
  await requestJson<{ ok: true }>(api(`/api/whiteboard/notes/${id}`), {
    method: "DELETE",
  });
};
