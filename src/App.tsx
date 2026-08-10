import { Fragment, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, NotebookPen, Pencil, Plus, Search, Sparkles, Star, Trash2, X } from "lucide-react";
import { detectDirection, entryMatches, normalizeSearchValue } from "./dictionary";
import { createEntry, deleteEntryById, fetchEntries, lookupWord, updateEntry } from "./api";
// Whiteboard (便签) — standalone feature; remove this import + the two spots marked below
import { Whiteboard } from "./whiteboard/Whiteboard";
import type { Category, DictionaryEntry, LookupMeaning, LookupResult } from "./types";

type SortMode = "time-desc" | "word-asc" | "word-desc";

type EditForm = {
  sourceText: string;
  targetText: string;
  synonyms: string;
  antonyms: string;
  note: string;
};

type PreviewItem = LookupResult & {
  sourceText: string;
  targetText: string;
  originalText: string;
};

const emptyEditForm: EditForm = {
  sourceText: "",
  targetText: "",
  synonyms: "",
  antonyms: "",
  note: "",
};

const splitList = (value: string): string[] =>
  value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

const listToInput = (list: string[]): string => list.join(", ");

const isChineseText = (value: string) => /[\u4e00-\u9fff]/.test(value);

// The LLM sometimes echoes the input word instead of translating it (e.g. brand
// names like Terraform). Fall back to the first meaning's text in that case —
// it holds the actual translation in the opposite language.
const translationFor = (inputText: string, lookup: LookupResult): string => {
  const trimmedInput = inputText.trim();
  const translation = lookup.translation.trim();
  const isEcho =
    Boolean(translation) && translation.toLowerCase() === trimmedInput.toLowerCase();
  const sameLanguage =
    Boolean(translation) &&
    isChineseText(translation) === isChineseText(trimmedInput);

  if (!translation || isEcho || sameLanguage) {
    const fallback = lookup.meanings[0]?.text.trim();
    if (fallback) return fallback;
  }
  return translation;
};

const normalizePreview = (inputText: string, lookup: LookupResult): PreviewItem => {
  const trimmedInput = inputText.trim();
  const translation = translationFor(inputText, lookup);
  const sourceText = isChineseText(trimmedInput)
    ? translation || trimmedInput
    : trimmedInput;
  const targetText = isChineseText(trimmedInput)
    ? trimmedInput
    : translation;

  return {
    ...lookup,
    translation,
    sourceText,
    targetText,
    originalText: trimmedInput,
  };
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const meaningLabel = (meaning: LookupMeaning) =>
  meaning.pos ? `${meaning.pos} · ${meaning.text}` : meaning.text;

const highlightText = (text: string, query: string) => {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return text;

  const normalizedText = normalizeSearchValue(text);
  if (!normalizedText) return text;

  const exactIndex = normalizedText.indexOf(normalizedQuery);
  if (exactIndex !== -1) {
    const before = text.slice(0, exactIndex);
    const match = text.slice(exactIndex, exactIndex + query.trim().length);
    const after = text.slice(exactIndex + query.trim().length);
    return (
      <>
        {before}
        <mark className="highlight">{match}</mark>
        {after}
      </>
    );
  }

  let searchIndex = 0;
  const matchedIndexes = new Set<number>();
  for (const char of normalizedQuery) {
    const foundIndex = normalizedText.indexOf(char, searchIndex);
    if (foundIndex === -1) return text;
    matchedIndexes.add(foundIndex);
    searchIndex = foundIndex + 1;
  }

  const segments: JSX.Element[] = [];
  let buffer = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (matchedIndexes.has(index)) {
      if (buffer) {
        segments.push(<Fragment key={`t-${index}-plain`}>{buffer}</Fragment>);
        buffer = "";
      }
      segments.push(
        <mark key={`t-${index}-match`} className="highlight">
          {character}
        </mark>,
      );
    } else {
      buffer += character;
    }
  }

  if (buffer) {
    segments.push(<Fragment key="t-tail">{buffer}</Fragment>);
  }

  return segments.length > 0 ? segments : text;
};

const normalizeLookupKey = (value: string) => value.trim().toLowerCase();

const findExactEntry = (entries: DictionaryEntry[], value: string) => {
  const key = normalizeLookupKey(value);
  return entries.find(
    (entry) => normalizeLookupKey(entry.sourceText) === key || normalizeLookupKey(entry.targetText) === key,
  );
};

const buildExactPreview = (inputText: string, entry: DictionaryEntry): PreviewItem => ({
  translation: entry.targetText,
  meanings: [],
  synonyms: entry.synonyms,
  antonyms: entry.antonyms,
  examples: [],
  direction: detectDirection(entry.sourceText),
  sourceText: entry.sourceText,
  targetText: entry.targetText,
  originalText: inputText.trim(),
});

const getAutocompleteSuggestions = (entries: DictionaryEntry[], value: string) => {
  const normalizedValue = normalizeSearchValue(value);
  if (!normalizedValue) return [] as DictionaryEntry[];

  return [...entries]
    .filter((entry) => {
      const sourceKey = normalizeSearchValue(entry.sourceText);
      const targetKey = normalizeSearchValue(entry.targetText);
      return sourceKey.startsWith(normalizedValue) || targetKey.startsWith(normalizedValue) || sourceKey.includes(normalizedValue) || targetKey.includes(normalizedValue);
    })
    .sort((a, b) => {
      const aSource = normalizeSearchValue(a.sourceText);
      const aTarget = normalizeSearchValue(a.targetText);
      const bSource = normalizeSearchValue(b.sourceText);
      const bTarget = normalizeSearchValue(b.targetText);
      const aScore = (aSource.startsWith(normalizedValue) ? 4 : 0) + (aTarget.startsWith(normalizedValue) ? 4 : 0) + (aSource.includes(normalizedValue) ? 2 : 0) + (aTarget.includes(normalizedValue) ? 2 : 0) + (a.starred ? 1 : 0);
      const bScore = (bSource.startsWith(normalizedValue) ? 4 : 0) + (bTarget.startsWith(normalizedValue) ? 4 : 0) + (bSource.includes(normalizedValue) ? 2 : 0) + (bTarget.includes(normalizedValue) ? 2 : 0) + (b.starred ? 1 : 0);
      if (bScore !== aScore) return bScore - aScore;
      return a.sourceText.localeCompare(b.sourceText, ["en", "zh-Hans"], { sensitivity: "base" });
    })
    .slice(0, 6);
};

export function App() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("time-desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, LookupResult>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [isLoading, setIsLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [status, setStatus] = useState("");
  // Whiteboard: open state (remove with the whiteboard feature)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshEntries("已载入词库。");
  }, []);

  // Chrome extension integration: prefill add input / search from context menu
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return;

    const loadPending = async () => {
      try {
        const data = await chrome.runtime.sendMessage({ type: "get-prefill" });
        if (data?.wordVaultPrefill?.sourceText) {
          setEditingId(null);
          setEditForm(emptyEditForm);
          setAddOpen(true);
          setAddText(data.wordVaultPrefill.sourceText);
          setManualMode(false);
          setPreview(null);
          setStatus("");
        }
        if (data?.wordVaultLookup?.query) {
          setQuery(data.wordVaultLookup.query);
        }
        await chrome.runtime.sendMessage({ type: "clear-prefill" });
      } catch {
        // Background script not reachable — running as plain web app
      }
    };

    void loadPending();

    const handleMessage = (message: { type: string }) => {
      if (message.type === "prefill-updated" || message.type === "lookup-updated") {
        void loadPending();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const refreshEntries = async (successMessage?: string) => {
    try {
      setEntries(await fetchEntries());
      setStatus(successMessage || "已同步词库。");
    } catch {
      setStatus("无法连接词库 API。");
    } finally {
      setIsLoading(false);
    }
  };

  const visibleEntries = useMemo(() => {
    const filtered = entries.filter((entry) => entryMatches(entry, query));
    if (sortMode === "time-desc") {
      return [...filtered].sort((a, b) => {
        if (a.starred !== b.starred) return Number(b.starred) - Number(a.starred);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    return [...filtered].sort((a, b) => {
      if (a.starred !== b.starred) return Number(b.starred) - Number(a.starred);
      const result = a.sourceText.localeCompare(b.sourceText, ["en", "zh-Hans"], {
        sensitivity: "base",
      });
      return sortMode === "word-asc" ? result : -result;
    });
  }, [entries, query, sortMode]);

  const autocompleteSuggestions = useMemo(() => {
    if (!addOpen || manualMode || preview) return [] as DictionaryEntry[];
    return getAutocompleteSuggestions(entries, addText);
  }, [addOpen, addText, entries, manualMode, preview]);

  useEffect(() => {
    if (!expandedId) return;
    if (detailCache[expandedId]) return;

    const entry = entries.find((item) => item.id === expandedId);
    if (!entry) return;

    let cancelled = false;
    setDetailLoadingId(expandedId);

    void lookupWord(entry.sourceText)
      .then((detail) => {
        if (cancelled) return;
        setDetailCache((current) => ({ ...current, [entry.id]: detail }));
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(`「${entry.sourceText}」的更多释义加载失败。`);
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoadingId((current) => (current === expandedId ? null : current));
      });

    return () => {
      cancelled = true;
    };
  }, [expandedId, detailCache, entries]);

  // ---- add / LLM flow ----

  const openAdd = () => {
    setEditingId(null);
    setEditForm(emptyEditForm);
    setAddOpen(true);
    setManualMode(false);
    setPreview(null);
    setShowSuggestions(true);
    setStatus("");
    setTimeout(() => addInputRef.current?.focus(), 0);
  };

  const addFromSearch = () => {
    const word = query.trim();
    if (!word) return;
    setAddText(word);
    openAdd();
    void runLookup(word);
  };

  const startManual = () => {
    setManualMode(true);
    setShowSuggestions(false);
    setEditForm((current) => ({ ...current, sourceText: addText }));
  };

  const resetAdd = () => {
    setAddOpen(false);
    setAddText("");
    setPreview(null);
    setManualMode(false);
    setEditingId(null);
    setEditForm(emptyEditForm);
    setShowSuggestions(false);
  };

  const runLookup = async (overrideWord?: string) => {
    const word = (overrideWord ?? addText).trim();
    if (!word) return;
    setPreviewLoading(true);
    setPreview(null);
    setShowSuggestions(false);
    setStatus("");
    try {
      const exactEntry = findExactEntry(entries, word);
      if (exactEntry) {
        setPreview(buildExactPreview(word, exactEntry));
      } else {
        setPreview(normalizePreview(word, await lookupWord(word)));
      }
      setManualMode(false);
    } catch (error) {
      setStatus(error instanceof Error ? `翻译失败：${error.message}` : "翻译失败，请手动填写。");
      startManual();
    } finally {
      setPreviewLoading(false);
    }
  };

  const saveFromPreview = async () => {
    if (!preview) return;
    const sourceText = preview.sourceText.trim();
    const targetText = preview.targetText.trim();
    if (!sourceText || !targetText) return;
    try {
      const entry = await createEntry({
        sourceText,
        targetText,
        direction: detectDirection(sourceText),
        note: "",
        tags: [],
        synonyms: preview.synonyms,
        antonyms: preview.antonyms,
        category: "",
        starred: false,
      });
      setEntries((current) => [entry, ...current]);
      setStatus(`已保存「${sourceText}」。`);
      resetAdd();
    } catch {
      setStatus("保存失败，请检查 API。");
    }
  };

  const retranslate = async () => {
    const word = editForm.sourceText.trim();
    if (!word) return;
    setStatus("AI 翻译中…");
    try {
      const result = await lookupWord(word);
      setEditForm((current) => ({
        ...current,
        targetText: translationFor(word, result),
        synonyms: listToInput(result.synonyms),
        antonyms: listToInput(result.antonyms),
      }));
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? `翻译失败：${error.message}` : "翻译失败。");
    }
  };

  const saveManual = async (event: FormEvent) => {
    event.preventDefault();
    const sourceText = editForm.sourceText.trim();
    const targetText = editForm.targetText.trim();
    if (!sourceText || !targetText) {
      setStatus("请填写单词和译文。");
      return;
    }
    const payload = {
      sourceText,
      targetText,
      direction: detectDirection(sourceText),
      note: editForm.note.trim(),
      tags: [],
      synonyms: splitList(editForm.synonyms),
      antonyms: splitList(editForm.antonyms),
      category: "" as Category,
      starred: editingId ? entries.find((item) => item.id === editingId)?.starred ?? false : false,
    };
    try {
      if (editingId) {
        const updated = await updateEntry(editingId, { ...payload, archived: false });
        setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setStatus("已保存修改。");
      } else {
        const entry = await createEntry(payload);
        setEntries((current) => [entry, ...current]);
        setStatus(`已保存「${sourceText}」。`);
      }
      resetAdd();
    } catch {
      setStatus("保存失败，请检查 API。");
    }
  };

  // ---- row actions ----

  const startEdit = (entry: DictionaryEntry) => {
    setEditingId(entry.id);
    setEditForm({
      sourceText: entry.sourceText,
      targetText: entry.targetText,
      synonyms: listToInput(entry.synonyms),
      antonyms: listToInput(entry.antonyms),
      note: entry.note,
    });
    setAddOpen(true);
    setManualMode(true);
    setPreview(null);
    setAddText(entry.sourceText);
    setExpandedId(null);
    setStatus("");
  };

  const removeEntry = async (entry: DictionaryEntry) => {
    if (!window.confirm(`删除「${entry.sourceText}」？此操作不可撤销。`)) return;
    try {
      await deleteEntryById(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setDetailCache((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      if (editingId === entry.id) resetAdd();
      setStatus("已删除。");
    } catch {
      setStatus("删除失败。");
    }
  };

  const copyTranslation = async (entry: DictionaryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.targetText);
      setStatus(`已复制译文：「${entry.targetText}」`);
    } catch {
      setStatus("复制失败。");
    }
  };

  const toggleStar = async (entry: DictionaryEntry) => {
    try {
      const updated = await updateEntry(entry.id, { ...entry, starred: !entry.starred, archived: entry.archived });
      setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDetailCache((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      setStatus(updated.starred ? "已加入常用。" : "已取消常用。");
    } catch {
      setStatus("常用标记失败。");
    }
  };
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/logo.svg" alt="" aria-hidden="true" />
          <div className="brand-copy">
            <p className="eyebrow">TermVault</p>
            <h1>术语库</h1>
          </div>
        </div>

        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="搜索词条"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索单词 / 译文 / 同义词…"
          />
          {query.trim() ? (
            <button
              className="search-clear"
              type="button"
              onClick={() => {
                setQuery("");
                setExpandedId(null);
              }}
              aria-label="清空搜索"
              title="清空搜索"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <label className="sort-field">
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="time-desc">输入时间 · 新到旧</option>
            <option value="word-asc">单词 · 升序</option>
            <option value="word-desc">单词 · 降序</option>
          </select>
        </label>

        <button className="btn btn-primary" onClick={openAdd} type="button">
          <Plus size={16} />
          <span>添加</span>
        </button>

        {/* Whiteboard: topbar entry (remove with the whiteboard feature) */}
        <button
          className="icon-btn topbar-whiteboard"
          onClick={() => setWhiteboardOpen(true)}
          type="button"
          title="白板便签"
          aria-label="打开白板便签"
        >
          <NotebookPen size={18} />
        </button>
      </header>

      {addOpen && (
        <section className="add-bar">
          {!preview && !manualMode && (
            <div className="add-input-wrap">
              <div className="add-input-row">
                <input
                  ref={addInputRef}
                  className="add-input"
                  value={addText}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    window.setTimeout(() => setShowSuggestions(false), 120);
                  }}
                  onChange={(event) => {
                    setAddText(event.target.value);
                    setShowSuggestions(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void runLookup();
                  }}
                  placeholder="输入英文或中文单词，回车自动翻译…"
                />
                <button
                  className="btn btn-secondary"
                  onClick={() => void runLookup()}
                  type="button"
                  disabled={previewLoading}
                >
                  <Sparkles size={15} />
                  <span>{previewLoading ? "翻译中…" : "AI 翻译"}</span>
                </button>
                <button className="manual-link" onClick={startManual} type="button">
                  手动填写
                </button>
                <button className="icon-btn" onClick={resetAdd} type="button" title="关闭">
                  <X size={16} />
                </button>
              </div>

              {showSuggestions && autocompleteSuggestions.length > 0 && (
                <div className="autocomplete-panel">
                  {autocompleteSuggestions.map((item) => (
                    <button
                      key={item.id}
                      className="autocomplete-item"
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setAddText(item.sourceText);
                        setShowSuggestions(false);
                        void runLookup(item.sourceText);
                      }}
                    >
                      <span className="autocomplete-source">{item.sourceText}</span>
                      <span className="autocomplete-target">{item.targetText}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {preview && !manualMode && (
            <div className="preview-card">
              <button
                className="icon-btn preview-close"
                onClick={() => setPreview(null)}
                type="button"
                title="忽略"
              >
                <X size={16} />
              </button>
              <div className="preview-main">
                <div className="preview-head">
                  <h3>{preview.sourceText}</h3>
                  <span className="direction-pill">英 → 中</span>
                </div>
                <p className="translation">{preview.targetText}</p>
                {preview.originalText !== preview.sourceText && (
                  <p className="source-hint">已识别输入「{preview.originalText}」，自动匹配英文词条</p>
                )}
              </div>

              {preview.meanings.length > 0 && (
                <div className="detail-block">
                  <span className="detail-title">更多含义</span>
                  <ul className="detail-list">
                    {preview.meanings.map((meaning) => (
                      <li key={`${meaning.pos}-${meaning.text}`}>{meaningLabel(meaning)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.synonyms.length > 0 && (
                <div className="syn-row">
                  <span className="syn-label">同义</span>
                  {preview.synonyms.map((item) => (
                    <button
                      key={item}
                      className="syn-chip"
                      type="button"
                      onClick={() => setAddText(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
              {preview.antonyms.length > 0 && (
                <div className="syn-row">
                  <span className="syn-label">反义</span>
                  {preview.antonyms.map((item) => (
                    <span key={item} className="syn-chip antonym">
                      {item}
                    </span>
                  ))}
                </div>
              )}

              {preview.examples.length > 0 && (
                <div className="detail-block">
                  <span className="detail-title">简单例子</span>
                  <ul className="detail-list">
                    {preview.examples.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="preview-actions">
                <button className="btn btn-primary" onClick={() => void saveFromPreview()} type="button">
                  <Check size={15} />
                  <span>保存</span>
                </button>
                <button className="btn btn-secondary" onClick={startManual} type="button">
                  手动修改
                </button>
              </div>
            </div>
          )}

          {manualMode && (
            <form className="inline-form" onSubmit={saveManual}>
              <label className="field">
                <span>单词</span>
                <input
                  value={editForm.sourceText}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, sourceText: event.target.value }))
                  }
                  placeholder="agent"
                />
              </label>
              <label className="field">
                <span>译文</span>
                <input
                  value={editForm.targetText}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, targetText: event.target.value }))
                  }
                  placeholder="智能体"
                />
              </label>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => void retranslate()} type="button">
                  <Sparkles size={14} />
                  <span>AI 重译</span>
                </button>
              </div>
              <label className="field">
                <span>同义词（逗号分隔，最多 3 个）</span>
                <input
                  value={editForm.synonyms}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, synonyms: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>反义词（逗号分隔，最多 3 个）</span>
                <input
                  value={editForm.antonyms}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, antonyms: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>备注（可选）</span>
                <textarea
                  value={editForm.note}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, note: event.target.value }))
                  }
                  rows={2}
                />
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">
                  <Check size={15} />
                  <span>{editingId ? "保存修改" : "保存"}</span>
                </button>
                <button className="btn btn-ghost" onClick={resetAdd} type="button">
                  <X size={15} />
                  <span>取消</span>
                </button>
              </div>
            </form>
          )}
        </section>
      )}
      {/* Whiteboard: overlay mount (remove with the whiteboard feature) */}
      {whiteboardOpen && <Whiteboard onClose={() => setWhiteboardOpen(false)} />}
      <div className="table">
        <div className="table-header">
          <span>单词</span>
          <span>译文</span>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <p>加载中…</p>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="empty-state">
            {query.trim() ? (
              <>
                <p>「{query.trim()}」不在词库中。</p>
                <button className="btn btn-primary" type="button" onClick={addFromSearch}>
                  <Sparkles size={15} />
                  <span>自动添加（AI 翻译）</span>
                </button>
              </>
            ) : (
              <>
                <p>没有匹配词条。</p>
                <span>点击右上角「添加」，输入一个词即可自动翻译建库。</span>
              </>
            )}
          </div>
        ) : (
          visibleEntries.map((entry) => {
            const expanded = expandedId === entry.id;
            const detail = detailCache[entry.id];
            const meanings = detail?.meanings ?? [];
            const examples = detail?.examples ?? [];
            const synonyms = uniqueStrings([...(detail?.synonyms ?? []), ...entry.synonyms]);
            const antonyms = uniqueStrings([...(detail?.antonyms ?? []), ...entry.antonyms]);
            return (
              <div key={entry.id}>
                <div
                  className={`tbl-row ${expanded ? "selected" : ""}`}
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                >
                  <span className="row-word" title={entry.sourceText}>
                    {entry.starred ? <Star size={12} className="row-star" aria-hidden="true" /> : null}
                    {highlightText(entry.sourceText, query)}
                  </span>
                  <span className="row-trans" title={entry.targetText}>
                    {highlightText(entry.targetText, query)}
                  </span>
                  <span className="row-actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      className="icon-btn"
                      type="button"
                      title={entry.starred ? "取消常用" : "设为常用"}
                      onClick={() => void toggleStar(entry)}
                    >
                      <Star size={14} fill={entry.starred ? "currentColor" : "none"} />
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      title="复制译文"
                      onClick={() => void copyTranslation(entry)}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      title="编辑"
                      onClick={() => startEdit(entry)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      title="删除"
                      onClick={() => void removeEntry(entry)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>

                {expanded && (
                  <div className="row-expand">
                    <div className="expand-meta">
                      {detailLoadingId === entry.id && !detail && (
                        <p className="note">更多含义加载中…</p>
                      )}

                      {meanings.length > 0 && (
                        <div className="detail-block">
                          <span className="detail-title">更多含义</span>
                          <ul className="detail-list">
                            {meanings.map((meaning) => (
                              <li key={`${meaning.pos}-${meaning.text}`}>{meaningLabel(meaning)}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {synonyms.length > 0 && (
                        <div className="syn-row">
                          <span className="syn-label">同义</span>
                          {synonyms.map((item) => (
                            <button
                              key={item}
                              className="syn-chip"
                              type="button"
                              onClick={() => {
                                setQuery(item);
                                setExpandedId(null);
                              }}
                            >
                              {highlightText(item, query)}
                            </button>
                          ))}
                        </div>
                      )}
                      {antonyms.length > 0 && (
                        <div className="syn-row">
                          <span className="syn-label">反义</span>
                          {antonyms.map((item) => (
                            <span key={item} className="syn-chip antonym">
                              {highlightText(item, query)}
                            </span>
                          ))}
                        </div>
                      )}
                      {examples.length > 0 && (
                        <div className="detail-block">
                          <span className="detail-title">简单例子</span>
                          <ul className="detail-list">
                            {examples.map((example) => (
                              <li key={example}>{example}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {entry.note && <p className="note">{entry.note}</p>}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}
    </main>
  );
}
