## Case

- For unknown word, quick and convenient search translator
- generate a library for quick and easily search.

## word-vault

- **Codex**: architecture, design, implementation 
- **Opencode**: added-on: initial abbrs.md to db
- Vercel deployment
- DB: chrome localstorage -> sqlite -> turso (for vercel)

## translate-plugin 

- **Cursor**: Convert `word-vault` app to **Chrome Plugin** `translate-plugin`

## Status

- `word-vault` → **TermVault (术语库)**: compact single-line UI, LLM auto-translation
  (synonyms/antonyms), categorized AI/programming glossary. Web + Chrome extension
  share one Turso-backed API on Vercel.
- Search is strict substring matching; a non-existent query shows 「X」不在词库中 +
  自动添加（AI 翻译）→ LLM preview → 保存.
- LLM translation guarantees Chinese for English input; brand names keep the English
  name with a Chinese explanation (Terraform → Terraform（基础设施即代码工具）).
- Added standalone whiteboard/notepad (白板便签) — own `wb_notes` table + routes.
- `translate-plugin` retired — its functionality is built into word-vault's extension.
