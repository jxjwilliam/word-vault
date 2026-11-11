# Pronunciation (朗读) — design

_2026-11-11 · small change_

## Intent

Some English entries are hard to pronounce from spelling alone. Add one click on a row
that says the English word out loud, so the pronunciation can be heard without leaving
the list.

## Goal

A speaker icon on every row that reads the English side of that row aloud.

## Non-goals

- Pronouncing the Chinese side.
- Saving audio files, pronunciation history, or IPA display.
- Auto-reading on hover/selection (explicit click only).
- Any server work: no `/api/tts` route, no key, no stored audio.

## Constraints

- Must work on the deployed site and inside the Chrome extension side panel.
- No new dependency (the project ships no test framework or linter; adding libraries is
  discouraged).
- The audio must follow a user gesture, and clicking the icon is one.

## Approaches considered

1. **Browser built-in speech (`window.speechSynthesis`) — chosen.** Instant, free,
   offline, ~30 lines, works in every supported browser and in extension pages. Voice
   quality is whatever English voice the OS ships (macOS: Samantha-class).
2. **Built-in + online recording fallback** (Free Dictionary API MP3s). Better sound for
   single words, but adds a network round-trip, a fallback path, and fails offline and for
   multi-word phrases. Rejected as complexity not worth the gain for now.
3. **Online TTS only.** Rejected outright: needs a provider, a key, and network on every
   click, and CORS/staleness issues, for no benefit over option 1.

## What was decided

- Approach 1. If the OS voice feels robotic later, option 2 can be layered on as a
  fallback without changing the UI.
- **Always speak English.** `englishTextFor(entry)` returns the left column when it holds
  no Chinese characters, otherwise the right column (the translation). Both-Chinese rows
  fall back to the left column.
- Rate `0.9`, `lang = "en-US"`; the first installed `en-US` voice is used when available.
- The previous utterance is cancelled before speaking, so rapid clicks never queue up.
- The speaker is the first of five row actions; `.tbl-row` `padding-right` grows
  106px → 132px so icons stay clear of the translation.
- Browsers without `speechSynthesis` get a status message instead of a silent failure.

## Left to the builder

- Voice selection polish (per-user voice preference) if anyone asks.
- Whether the expanded detail panel and the AI preview panel also get a speaker button.
