import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import {
  categoryLabels,
  categoryOf,
  detectDirection,
  entryMatches,
  sortEntries,
} from "./dictionary";
import { createEntry, deleteEntryById, fetchEntries, lookupWord, updateEntry } from "./api";
import type { Category, CategoryFilter, DictionaryEntry, LookupResult } from "./types";

type EditForm = {
  sourceText: string;
  targetText: string;
  synonyms: string;
  antonyms: string;
  category: Category;
  note: string;
};

const emptyEditForm: EditForm = {
  sourceText: "",
  targetText: "",
  synonyms: "",
  antonyms: "",
  category: "",
  note: "",
};

const splitList = (value: string): string[] =>
  value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

const listToInput = (list: string[]): string => list.join(", ");

export function App() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [isLoading, setIsLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [preview, setPreview] = useState<LookupResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [status, setStatus] = useState("");
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
    const filtered = entries.filter((entry) => {
      if (categoryFilter !== "all" && categoryOf(entry) !== categoryFilter) return false;
      return entryMatches(entry, query);
    });
    return sortEntries(filtered, "updatedAt");
  }, [entries, query, categoryFilter, categoryOf, entryMatches, sortEntries]);

  // ---- add / LLM flow ----

  const openAdd = () => {
    setEditingId(null);
    setEditForm(emptyEditForm);
    setAddOpen(true);
    setManualMode(false);
    setPreview(null);
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
    setEditForm((current) => ({ ...current, sourceText: addText }));
  };

  const resetAdd = () => {
    setAddOpen(false);
    setAddText("");
    setPreview(null);
    setManualMode(false);
    setEditingId(null);
    setEditForm(emptyEditForm);
  };

  const runLookup = async (overrideWord?: string) => {
    const word = (overrideWord ?? addText).trim();
    if (!word) return;
    setPreviewLoading(true);
    setPreview(null);
    setStatus("");
    try {
      setPreview(await lookupWord(word));
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
    const sourceText = addText.trim();
    if (!sourceText) return;
    try {
      const entry = await createEntry({
        sourceText,
        targetText: preview.translation,
        direction: preview.direction,
        note: "",
        tags: [],
        synonyms: preview.synonyms,
        antonyms: preview.antonyms,
        category: "",
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
        targetText: result.translation,
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
      category: editForm.category,
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
      category: entry.category,
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
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">TermVault</p>
          <h1>术语库</h1>
        </div>

        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索单词 / 译文 / 同义词…"
          />
        </label>

        <label className="select-field">
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
          >
            <option value="all">全部分类</option>
            <option value="ai">AI</option>
            <option value="programming">编程</option>
            <option value="general">通用</option>
          </select>
        </label>

        <button className="btn btn-primary" onClick={openAdd} type="button">
          <Plus size={16} />
          <span>添加</span>
        </button>
      </header>

      {addOpen && (
        <section className="add-bar">
          {!preview && !manualMode && (
            <div className="add-input-row">
              <input
                ref={addInputRef}
                className="add-input"
                value={addText}
                onChange={(event) => setAddText(event.target.value)}
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
          )}

          {preview && !manualMode && (
            <div className="preview-card">
              <div className="preview-main">
                <h3>{addText}</h3>
                <span className="direction-pill">
                  {preview.direction === "en-to-zh" ? "英 → 中" : "中 → 英"}
                </span>
                <p className="translation">{preview.translation}</p>
              </div>

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
                <span>分类</span>
                <select
                  value={editForm.category}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      category: event.target.value as Category,
                    }))
                  }
                >
                  <option value="">未分类</option>
                  <option value="ai">AI</option>
                  <option value="programming">编程</option>
                  <option value="general">通用</option>
                </select>
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

      <div className="table">
        <div className="table-header">
          <span>单词</span>
          <span>译文</span>
          <span>分类</span>
          <span />
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
            const cat = categoryOf(entry);
            return (
              <div key={entry.id}>
                <div
                  className={`tbl-row ${expanded ? "selected" : ""}`}
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                >
                  <span className="row-word" title={entry.sourceText}>
                    {entry.sourceText}
                  </span>
                  <span className="row-trans" title={entry.targetText}>
                    {entry.targetText}
                  </span>
                  <span>
                    {cat ? <span className={`chip chip-${cat}`}>{categoryLabels[cat]}</span> : null}
                  </span>
                  <span className="row-actions" onClick={(event) => event.stopPropagation()}>
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
                      {entry.synonyms.length > 0 && (
                        <div className="syn-row">
                          <span className="syn-label">同义</span>
                          {entry.synonyms.map((item) => (
                            <button
                              key={item}
                              className="syn-chip"
                              type="button"
                              onClick={() => {
                                setQuery(item);
                                setExpandedId(null);
                              }}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      )}
                      {entry.antonyms.length > 0 && (
                        <div className="syn-row">
                          <span className="syn-label">反义</span>
                          {entry.antonyms.map((item) => (
                            <span key={item} className="syn-chip antonym">
                              {item}
                            </span>
                          ))}
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
