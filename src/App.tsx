import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Download,
  FileInput,
  Import,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createExportPayload,
  entryMatches,
  normalizeTags,
  parseImportPayload,
  sortEntries,
  tagsToInput,
} from "./dictionary";
import {
  createEntry,
  deleteEntryById,
  fetchEntries,
  importAbbrs,
  importEntries,
  patchEntry,
  updateEntry,
} from "./api";
import type { ArchiveFilter, DictionaryEntry, Direction, SortKey } from "./types";

type EntryForm = {
  sourceText: string;
  targetText: string;
  direction: Direction;
  note: string;
  tags: string;
};

const emptyForm: EntryForm = {
  sourceText: "",
  targetText: "",
  direction: "en-to-zh",
  note: "",
  tags: "",
};

const sortLabels: Record<SortKey, string> = {
  updatedAt: "最近更新",
  createdAt: "创建时间",
  sourceText: "原文 A-Z",
  targetText: "译文 A-Z",
};

const archiveLabels: Record<ArchiveFilter, string> = {
  active: "未归档",
  archived: "已归档",
  all: "全部",
};

export function App() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [form, setForm] = useState<EntryForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("正在从 SQLite 读取词库。");
  const importInputRef = useRef<HTMLInputElement>(null);

  const [isExtension, setIsExtension] = useState(false);

  useEffect(() => {
    void refreshEntries("已从 SQLite 载入 abbrs.md 默认词库。");
  }, []);

  // Chrome extension integration: check for context menu prefill/lookup data
  useEffect(() => {
    const isExt = typeof chrome !== "undefined" && !!chrome.runtime?.id;
    setIsExtension(isExt);

    if (!isExt) return;

    // Read any pending data from the background script
    const loadPendingData = async () => {
      try {
        const data = await chrome.runtime.sendMessage({ type: "get-prefill" });
        if (!data) return;

        if (data.wordVaultPrefill?.sourceText) {
          setForm((prev) => ({
            ...prev,
            sourceText: data.wordVaultPrefill.sourceText,
          }));
          setEditingId(null);
          setMessage(`已载入选中的文字："${data.wordVaultPrefill.sourceText}"`);
        }

        if (data.wordVaultLookup?.query) {
          setQuery(data.wordVaultLookup.query);
        }

        // Clear the stored data so subsequent panel opens don't reuse it
        await chrome.runtime.sendMessage({ type: "clear-prefill" });
      } catch {
        // Background script not reachable — running outside extension context
      }
    };

    void loadPendingData();

    // Listen for real-time updates from background script
    const handleMessage = (message: { type: string }) => {
      if (message.type === "prefill-updated" || message.type === "lookup-updated") {
        void loadPendingData();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const refreshEntries = async (successMessage?: string) => {
    try {
      const nextEntries = await fetchEntries();
      setEntries(nextEntries);
      setMessage(successMessage || "已同步 SQLite 词库。");
    } catch {
      setMessage("无法连接 SQLite API，请确认 npm run dev 正在运行。");
    } finally {
      setIsLoading(false);
    }
  };

  const visibleEntries = useMemo(() => {
    const filtered = entries.filter((entry) => {
      if (archiveFilter === "active" && entry.archived) return false;
      if (archiveFilter === "archived" && !entry.archived) return false;

      return entryMatches(entry, query);
    });

    return sortEntries(filtered, sortKey);
  }, [archiveFilter, entries, query, sortKey]);

  const stats = useMemo(
    () => ({
      total: entries.length,
      active: entries.filter((entry) => !entry.archived).length,
      archived: entries.filter((entry) => entry.archived).length,
    }),
    [entries],
  );

  const editingEntry = entries.find((entry) => entry.id === editingId);

  const updateForm = (field: keyof EntryForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const sourceText = form.sourceText.trim();
    const targetText = form.targetText.trim();

    if (!sourceText || !targetText) {
      setMessage("请填写原文和译文。");
      return;
    }

    const tags = normalizeTags(form.tags);

    if (editingId) {
      try {
        const updated = await updateEntry(editingId, {
          sourceText,
          targetText,
          direction: form.direction,
          note: form.note.trim(),
          tags,
          archived: editingEntry?.archived || false,
        });
        setEntries((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
        setMessage("词条已更新到 SQLite。");
        resetForm();
      } catch {
        setMessage("更新失败，请检查 SQLite API。");
      }
      return;
    }

    try {
      const entry = await createEntry({
        sourceText,
        targetText,
        direction: form.direction,
        note: form.note.trim(),
        tags,
      });
      setEntries((current) => [entry, ...current]);
      setMessage("新词条已保存到 SQLite。");
      resetForm();
    } catch {
      setMessage("保存失败，请检查 SQLite API。");
    }
  };

  const startEditing = (entry: DictionaryEntry) => {
    setEditingId(entry.id);
    setForm({
      sourceText: entry.sourceText,
      targetText: entry.targetText,
      direction: entry.direction,
      note: entry.note,
      tags: tagsToInput(entry.tags),
    });
    setMessage("正在编辑词条。");
  };

  const toggleArchived = async (entry: DictionaryEntry) => {
    try {
      const updated = await patchEntry(entry.id, { archived: !entry.archived });
      setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(entry.archived ? "词条已恢复到 SQLite。" : "词条已归档到 SQLite。");
    } catch {
      setMessage("归档状态更新失败，请检查 SQLite API。");
    }
  };

  const deleteEntry = async (entry: DictionaryEntry) => {
    const confirmed = window.confirm(`删除“${entry.sourceText}”？此操作不可撤销。`);
    if (!confirmed) return;

    try {
      await deleteEntryById(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (editingId === entry.id) resetForm();
      setMessage("词条已从 SQLite 删除。");
    } catch {
      setMessage("删除失败，请检查 SQLite API。");
    }
  };

  const importSample = async () => {
    try {
      const result = await importAbbrs();
      setEntries(result.entries);
      setMessage(result.added > 0 ? `已导入 ${result.added} 条示例词条到 SQLite。` : "示例词库没有新增词条。");
    } catch {
      setMessage("导入 abbrs.md 失败，请检查 SQLite API。");
    }
  };

  const exportJson = () => {
    const payload = createExportPayload(entries);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `local-dictionary-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("词库 JSON 已导出。");
  };

  const handleJsonImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const incoming = parseImportPayload(text);
      if (incoming.length === 0) {
        setMessage("没有找到可导入的词条。");
        return;
      }

      const result = await importEntries(incoming);
      setEntries(result.entries);
      setMessage(`已导入 ${result.added} 条新词条到 SQLite，处理 ${incoming.length} 条候选记录。`);
    } catch {
      setMessage("导入失败，请确认文件是本应用导出的 JSON。");
    } finally {
      event.target.value = "";
    }
  };

  const duplicateEntry = async (entry: DictionaryEntry) => {
    try {
      const duplicated = await createEntry({
        sourceText: entry.sourceText,
        targetText: entry.targetText,
        direction: entry.direction,
        note: entry.note,
        tags: entry.tags,
      });
      setEntries((current) => [duplicated, ...current]);
      setMessage("已复制为 SQLite 新词条。");
    } catch {
      setMessage("复制失败，请检查 SQLite API。");
    }
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              Local Dictionary
              {isExtension && <span className="extension-badge">扩展</span>}
            </p>
            <h1>阅读生词库</h1>
          </div>
          <div className="stats" aria-label="词库统计">
            <span>{stats.active} 未归档</span>
            <span>{stats.archived} 已归档</span>
            <span>{stats.total} 总计</span>
          </div>
        </header>

        <section className="toolbar" aria-label="词条工具栏">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索原文、译文、备注或标签"
            />
          </label>

          <label className="select-field">
            <span>排序</span>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="select-field">
            <span>视图</span>
            <select
              value={archiveFilter}
              onChange={(event) => setArchiveFilter(event.target.value as ArchiveFilter)}
            >
              {Object.entries(archiveLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="toolbar-actions">
            <button className="secondary-button" onClick={importSample} type="button" title="导入 abbrs.md">
              <Import size={17} />
              <span>导入示例词库</span>
            </button>
            <button
              className="icon-button"
              onClick={() => importInputRef.current?.click()}
              type="button"
              title="导入 JSON"
            >
              <FileInput size={18} />
            </button>
            <button className="icon-button" onClick={exportJson} type="button" title="导出 JSON">
              <Download size={18} />
            </button>
            <input
              ref={importInputRef}
              className="hidden-input"
              type="file"
              accept="application/json,.json"
              onChange={handleJsonImport}
            />
          </div>
        </section>

        <div className="content-grid">
          <section className="entry-list" aria-label="词条列表">
            <div className="list-header">
              <h2>词条</h2>
              <span>{visibleEntries.length} 条匹配</span>
            </div>

            {visibleEntries.length === 0 ? (
              <div className="empty-state">
                <p>没有匹配词条。</p>
                <span>新增一个词，或导入示例词库开始使用。</span>
              </div>
            ) : (
              <div className="entries">
                {visibleEntries.map((entry) => (
                  <article
                    className={`entry-card ${entry.archived ? "archived" : ""} ${
                      editingId === entry.id ? "selected" : ""
                    }`}
                    key={entry.id}
                  >
                    <div className="entry-main">
                      <div>
                        <div className="entry-title-row">
                          <h3>{entry.sourceText}</h3>
                          <span className="direction-pill">
                            {entry.direction === "en-to-zh" ? "英到中" : "中到英"}
                          </span>
                        </div>
                        <p className="translation">{entry.targetText}</p>
                      </div>
                      <div className="card-actions">
                        <button onClick={() => startEditing(entry)} type="button" title="编辑">
                          <Pencil size={17} />
                        </button>
                        <button onClick={() => duplicateEntry(entry)} type="button" title="复制为新词条">
                          <Plus size={17} />
                        </button>
                        <button
                          onClick={() => toggleArchived(entry)}
                          type="button"
                          title={entry.archived ? "恢复" : "归档"}
                        >
                          {entry.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
                        </button>
                        <button onClick={() => deleteEntry(entry)} type="button" title="删除">
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>

                    {(entry.note || entry.tags.length > 0) && (
                      <footer className="entry-meta">
                        {entry.note && <span>{entry.note}</span>}
                        {entry.tags.map((tag) => (
                          <mark key={tag}>{tag}</mark>
                        ))}
                      </footer>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="editor-panel" aria-label="词条编辑器">
            <div className="editor-title">
              <div>
                <p className="eyebrow">{editingEntry ? "Edit Entry" : "New Entry"}</p>
                <h2>{editingEntry ? "编辑词条" : "新增词条"}</h2>
              </div>
              {editingEntry && (
                <button className="icon-button" onClick={resetForm} type="button" title="退出编辑">
                  <X size={18} />
                </button>
              )}
            </div>

            <form className="entry-form" onSubmit={handleSubmit}>
              <label>
                <span>方向</span>
                <select
                  value={form.direction}
                  onChange={(event) => updateForm("direction", event.target.value as Direction)}
                >
                  <option value="en-to-zh">英文到中文</option>
                  <option value="zh-to-en">中文到英文</option>
                </select>
              </label>

              <label>
                <span>原文</span>
                <textarea
                  value={form.sourceText}
                  onChange={(event) => updateForm("sourceText", event.target.value)}
                  placeholder="perceive"
                  rows={3}
                />
              </label>

              <label>
                <span>译文</span>
                <textarea
                  value={form.targetText}
                  onChange={(event) => updateForm("targetText", event.target.value)}
                  placeholder="感知"
                  rows={3}
                />
              </label>

              <label>
                <span>标签</span>
                <input
                  value={form.tags}
                  onChange={(event) => updateForm("tags", event.target.value)}
                  placeholder="AI, reading"
                />
              </label>

              <label>
                <span>备注</span>
                <textarea
                  value={form.note}
                  onChange={(event) => updateForm("note", event.target.value)}
                  placeholder="来源、语境或记忆提示"
                  rows={4}
                />
              </label>

              <div className="form-actions">
                <button className="primary-button" type="submit">
                  <Save size={18} />
                  <span>{editingEntry ? "保存修改" : "保存词条"}</span>
                </button>
                <button className="secondary-button" onClick={resetForm} type="button">
                  <RotateCcw size={17} />
                  <span>清空</span>
                </button>
              </div>
            </form>

            <p className="status-message" role="status">
              {message}
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
