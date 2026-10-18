# Cardinal — instructions for the AI

This folder is **Cardinal**, an offline ER/EER diagram and logic-circuit app. The app code is in `Cardinal/`; the project hub and docs are in `.claude/`. Everything below is standing instruction for the AI working in this folder.

Read `.claude/project/data/meta.js` and `.claude/docs/architecture.md` at the start of every session, then follow the file map and rules below.

## File map — where to check what

| Path | What it holds | When to touch it |
|---|---|---|
| `.claude/project/hub.html` | The Project Hub UI (PRD · Versions · Checklist · Features · Premium · Decisions · Rules). Data lives in the js files, NOT in the HTML. | Rarely. |
| `.claude/project/data/meta.js` | App name, version, pages, platforms, premiumEnabled, setupDone | Version bumps, page list changes |
| `.claude/project/data/prd.js` | The living PRD | Whenever product direction changes |
| `.claude/project/data/versions.js` | `pending` (work done, not yet versioned) + `versions` (the log) | **Add a pending entry after every meaningful change you make.** Promote on "build". |
| `.claude/project/data/checklist.js` | Launch checklist + notes-for-later + phase-2, in sections | "later" items immediately; task progress |
| `.claude/project/data/features.js` | Feature catalog: groups × platforms × status (todo/partial/done/na) + free/premium tier | When features land or get scoped |
| `.claude/project/data/premium.js` | Free/premium split, gating UX, pending monetization decisions | Paywall design changes |
| `.claude/project/data/competitors.js` | Competitor analysis: per-competitor grade, feature table vs. our scope, strengths/weaknesses, verdict | Fill any `requested: true` entry the user adds in the hub |
| `.claude/project/data/decisions.js` | Every product decision; statuses open/deferred/answered/n-a | Whenever a deferred decision resolves |
| `.claude/project/data/rules.js` | The user-facing rules (mirrors the Rules section below) | Only when the user changes a rule |
| `.claude/creative/design-system.html` | Visual design-system reference (colors, type, spacing, components) | When the look changes |
| `.claude/creative/data/design-tokens.js` | The actual token values the design system renders | Whenever the design evolves — the app code must match these |
| `.claude/creative/icons/` | User drops SVGs here for bulk addition to the app | Read when asked to "add the icons" |
| `.claude/shared/sync-engine.js` | Auto-save/live-sync engine for the HTML pages | Almost never |
| `.claude/docs/` | Extra long-form docs (flows, data models, architecture) | See "Where new files go" |
| `Cardinal/` | ALL app code (Vite + React web app; Tauri desktop shell in `Cardinal/src-tauri/`). | Constantly |
| `build.bat` | Double-click debug **profile** build | Keep working at all times |

## Data file protocol (critical — the browser syncs live)

Every `data/*.js` file has this exact shape:

```js
window.HUB_DATA = window.HUB_DATA || {};
window.HUB_DATA["<key>"] = /*DATA*/
{ ...valid JSON... }
/*END*/;
```

- The content between `/*DATA*/` and `/*END*/` **must stay valid JSON** (double-quoted keys, no trailing commas, no comments). The hub page parses it with `JSON.parse`.
- The user may have the hub open in a browser **while you edit these files**. The page polls every ~2.5s and picks your changes up automatically — and in Chrome/Edge the page also **writes user edits back to these files**. Therefore: **always re-read a data file immediately before editing it** (it may have changed since you last saw it), and write the whole file in one atomic Write.
- Design tokens use the same pattern with `window.DS_DATA["tokens"]`.

## Rules (the user's standing orders)

These mirror `.claude/project/data/rules.js`. If the user edits rules in the hub, honor the file.

1. **"build"** (or anything meaning *finalize changes and make a debuggable APK/build*):
   1. Promote `pending` → a new version in `versions.js` (ask which segment bumps if unclear), set the new version in `meta.js` **and** in the in-app version constant.
   2. Output the GitHub commit **summary + description**; the description ends with `Co-Authored-By: Claude <noreply@anthropic.com>` (never include a model name).
   3. Point the user to `build.bat` (debug **profile** build, always, unless the user changes it). Keep the bat current.
2. **"commit"**: output commit summary + description (with the co-author line). Nothing else.
3. **"merge"**: give merge details and the exact steps in the **GitHub Desktop app**. The user handles git through GitHub Desktop — supply text and instructions rather than pushing yourself.
4. **build.bat troubleshooting**: if the user says the build is broken — fix `build.bat` first, also print the full terminal command (with `cd`), and if the root cause can't be found, run the build yourself on the user's behalf.
5. **"later" rule**: any time the user says they'll do/decide something later, add it to `checklist.js` → "Notes for later" **immediately, in the same turn**. Remove items only when truly resolved.
6. **Deferred decisions**: whenever work touches a topic whose decision in `decisions.js` is `open`/`deferred`, re-ask the user — every time, until they decide. When they decide, update `decisions.js` and remove any echo from Notes for later.
7. **Version discipline**: after every meaningful change you make to the app, add a `pending` entry to `versions.js` (with the pages it touched, tagged add/edit/remove). This is what makes "build" promotions accurate.
8. **Competitor analysis**: offered once the app's scope is clear (questionnaire Stage 2.5) — in the same message, propose the competitor list so the user can add/remove names before deciding. If declined, set `enabled: false` in `competitors.js` (tab hides). Any competitor the user adds via the hub arrives with `requested: true` — research and complete it when noticed or when asked to "fill in the competitor analysis". Use web search; grade against OUR planned scope; flag unverifiable vendor claims honestly.
9. **Per-project styling**: the pack ships neutral. After the questionnaire, restyle `hub.html` and `design-system.html` to the app's identity. (Only these HTML shells get restyled — the data files' format never changes.)

## Where new files go

- **Long-form docs** (flows, data model, architecture notes): `.claude/docs/<topic>.md`. One **broad** file per collective topic (e.g. `flows.md`, `data-model.md`) — never one file per small thing.
- **Things the user needs to SEE** (visual references, dashboards): an HTML page following the hub pattern — page in `.claude/project/` or `.claude/creative/`, data in a sibling `data/*.js` file with the `/*DATA*/.../*END*/` contract, wired to `sync-engine.js`. Add a link/mention in the hub if it's central.
- **SVG icons**: user drops them in `.claude/creative/icons/`; you take them from there into the app.
- **App code**: only inside the app folder. If the framework can't share one codebase across OSes, make per-OS subfolders inside the app folder.
- Never scatter loose files at the pack root (exceptions: `CLAUDE.md`, `README.md`, `ROADMAP.md` (public roadmap, keep it in sync with checklist Phase 2), `build.bat`, git files; `docs/` holds README screenshots; `.github/` holds the release workflow).

## Versioning

- Scheme is `x.y.z`; what each segment means is recorded per-project in `meta.versionMeaning` (asked during setup).
- The version lives in **two** places that must never drift: `meta.js` and the in-app version constant (create it during scaffold; e.g. `lib/version.dart`).
- `versions.js` items support markdown-lite (`**bold**`, `` `code` ``) and page tags `{name, type: add|edit|remove}` — tag pages from `meta.pages`.

## Working style

- The hub (`.claude/project/hub.html`) is the user's single dashboard — keep its data files truthful in the same turn as the work, not "later".
- When the user gives design values, update `design-tokens.js` AND keep the app's theme code in sync with it.
- Uncertain about a product decision? Check `decisions.js` before asking again — the answer may already be there.
