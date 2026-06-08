export type Direction = "en-to-zh" | "zh-to-en";

export type DictionaryEntry = {
  id: string;
  sourceText: string;
  targetText: string;
  direction: Direction;
  note: string;
  tags: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SortKey = "updatedAt" | "createdAt" | "sourceText" | "targetText";
export type ArchiveFilter = "active" | "archived" | "all";

export type ExportPayload = {
  app: "local-dictionary";
  version: 1;
  exportedAt: string;
  entries: DictionaryEntry[];
};
