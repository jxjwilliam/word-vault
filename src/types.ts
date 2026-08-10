export type Direction = "en-to-zh" | "zh-to-en";

export type LookupMeaning = {
  pos: string;
  text: string;
};

export type Category = "" | "ai" | "programming" | "general";
export type CategoryFilter = "all" | Category;
export type LookupResult = {
  translation: string;
  meanings: LookupMeaning[];
  synonyms: string[];
  antonyms: string[];
  examples: string[];
  direction: Direction;
};

export type DictionaryEntry = {
  id: string;
  sourceText: string;
  targetText: string;
  direction: Direction;
  note: string;
  tags: string[];
  archived: boolean;
  synonyms: string[];
  antonyms: string[];
  category: Category;
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
