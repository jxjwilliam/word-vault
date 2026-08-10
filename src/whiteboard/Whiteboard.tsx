import { FormEvent, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { createNote, deleteNote, fetchNotes, moveNote, updateNote } from "./api";
import type { WhiteboardNote } from "./types";

type EditState = {
  id: string | null; // null → creating a brand-new note
  content: string;
};

const emptyEdit: EditState = { id: null, content: "" };

type NoteFormProps = {
  edit: EditState;
  saving: boolean;
  onChange: (next: EditState) => void;
  onSave: (event: FormEvent) => void;
  onCancel: () => void;
};

function NoteForm({ edit, saving, onChange, onSave, onCancel }: NoteFormProps) {
  return (
    <form className="wb-form" onSubmit={onSave}>
      <textarea
        className="wb-textarea"
        placeholder="写点什么…"
        rows={4}
        autoFocus
        value={edit.content}
        onChange={(event) => onChange({ ...edit, content: event.target.value })}
      />
      <div className="wb-form-actions">
        <button className="btn btn-primary" type="submit" disabled={saving}>
          <Check size={14} />
          <span>{saving ? "保存中…" : "保存"}</span>
        </button>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          <X size={14} />
          <span>取消</span>
        </button>
      </div>
    </form>
  );
}

export function Whiteboard({ onClose }: { onClose: () => void }) {
  const [notes, setNotes] = useState<WhiteboardNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);

  const refresh = async () => {
    try {
      setNotes(await fetchNotes());
      setError("");
    } catch {
      setError("无法加载便签。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const startAdd = () => setEdit(emptyEdit);

  const startEdit = (note: WhiteboardNote) =>
    setEdit({ id: note.id, content: note.content });

  const cancelEdit = () => setEdit(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!edit || saving) return;
    setSaving(true);
    setError("");
    try {
      if (edit.id) {
        await updateNote(edit.id, { content: edit.content });
      } else {
        await createNote({ content: edit.content });
      }
      setEdit(null);
      await refresh();
    } catch {
      setError("保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (note: WhiteboardNote, move: "up" | "down") => {
    try {
      await moveNote(note.id, move);
      await refresh();
    } catch {
      setError("移动失败，请重试。");
    }
  };

  const handleDelete = async (note: WhiteboardNote) => {
    try {
      await deleteNote(note.id);
      if (edit?.id === note.id) setEdit(null);
      await refresh();
    } catch {
      setError("删除失败，请重试。");
    }
  };

  const firstId = notes[0]?.id;
  const lastId = notes[notes.length - 1]?.id;

  return (
    <div className="wb-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="wb-panel">
        <header className="wb-head">
          <span className="wb-title">
            <NotebookPen size={17} />
            白板便签
          </span>
          <button className="icon-btn" onClick={onClose} type="button" title="关闭">
            <X size={16} />
          </button>
        </header>

        <div className="wb-body">
          {error && <p className="wb-error">{error}</p>}

          {!edit && (
            <button className="btn btn-primary wb-add" onClick={startAdd} type="button">
              <Plus size={15} />
              <span>添加便签</span>
            </button>
          )}

          {edit && !edit.id && (
            <NoteForm
              edit={edit}
              saving={saving}
              onChange={setEdit}
              onSave={save}
              onCancel={cancelEdit}
            />
          )}

          {loading ? (
            <p className="wb-empty">加载中…</p>
          ) : notes.length === 0 && !edit ? (
            <p className="wb-empty">还没有便签，点击「添加便签」开始记录。</p>
          ) : (
            <ul className="wb-list">
              {notes.map((note) => (
                <li key={note.id} className="wb-item">
                  {edit?.id === note.id ? (
                    <NoteForm
                      edit={edit}
                      saving={saving}
                      onChange={setEdit}
                      onSave={save}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <div className="wb-note">
                      <div className="wb-move">
                        <button
                          className="icon-btn"
                          type="button"
                          title="上移"
                          onClick={() => void handleMove(note, "up")}
                          disabled={note.id === firstId}
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          className="icon-btn"
                          type="button"
                          title="下移"
                          onClick={() => void handleMove(note, "down")}
                          disabled={note.id === lastId}
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                      <div className="wb-note-main">

                        <p className="wb-note-content">{note.content || "（空白便签）"}</p>
                      </div>
                      <div className="wb-note-actions">
                        <button
                          className="icon-btn"
                          type="button"
                          title="编辑"
                          onClick={() => startEdit(note)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-btn wb-danger"
                          type="button"
                          title="删除"
                          onClick={() => void handleDelete(note)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
