# Handoff prompt — paste this into the new Claude Code session

Hey! This folder is **Cardinal**, my personal offline diagram app. We built it together in a previous session that's now gone, so here's the briefing. The code, the hub and the docs are all in this folder.

## Get your bearings first
1. Read `CLAUDE.md` and follow it. It's my standing rules: hub data files, versioning, "build", "commit", "later" notes. I handle git myself through **GitHub Desktop**, so give me text and steps and don't push or tag for me.
2. Read `.claude/docs/architecture.md` (how the app works), then the hub data in `.claude/project/data/`: `meta.js`, `versions.js` (there's a big `pending` list since 0.1.0), `checklist.js`, `features.js`, `prd.js`.
3. Check git: `git remote -v` should point at my **new Cardinal repo**. If it still says `Build-with-Claude---Starter-Pack`, stop and walk me through fixing that in GitHub Desktop before anything else.

Things to know about me and the app:
- **Never draw eyes on living beings** (birds, animals, people) in logos, icons or art. It's a religious thing. Cardinal's logo is a line-art cardinal with no eye. Any app icon you make must keep it that way.
- I use the **Zen browser** (Firefox-based), so test with Firefox in mind.
- The name is **Cardinal**. Final, no more renaming.
- What it does today:
  - Lucidchart-style ER diagrams: Crow's Foot and Chen/EER, a self-routing line router, two-way SQL ↔ diagram with error markers, cardinality keywords like `11:0M` (search also understands UML, (min,max), ratio and lecture wording).
  - A **Logic circuits** mode: gates, switches, bulbs, live simulation, truth tables.
  - General shapes, sticky notes, pen, comments, page tabs, dark mode, export to PNG/SVG/PDF/SQL.
  - It runs as a web app plus a tiny Node file server (`build.bat` → `Cardinal/server/serve.mjs`) and saves to `Documents\Cardinal`.
  - Dev preview: `.claude/launch.json` → `cardinal-sandbox` (port 5179, sandbox data).

## Job 1: a proper UX pass (do this BEFORE the installers)
Go through the whole app like a first-time user who's a bit nervous around tech. Use the in-app browser on the sandbox and actually click through everything:
- Home: projects, search, filters.
- New diagram dialog.
- ER editor: tables, row editing, Chen shapes, lines, the cardinality library, the SQL panel, export.
- Logic circuit editor: parts, wiring, the truth table.
- Preferences, dark mode, page tabs, the tool rail.

Look for:
- Confusing labels or jargon.
- Missing hints or empty states.
- Things that look scary or crowded.
- Actions that are hard to find, or don't say what they did.
- Inconsistent wording.
- Keyboard traps.
- Anything broken or ugly in dark mode or at smaller window sizes.

Then:
- Give me a short list grouped by **quick wins / medium / bigger ideas**, each with a one-line why.
- Do the quick wins straight away, check them in the browser, and add pending entries to `versions.js`.
- Ask me before doing medium or bigger things.
- Keep the clean Lucid-ish look. Friendlier, not busier.

## Job 2: GitHub repo page with some personality
Write the repo's **README.md** and suggest the **About** description and topics. Tone: casual and warm with a bit of character, like a student who built the tool they wished existed. Not corporate. Include:
- What Cardinal is, in a line or two, and who it's for: students doing databases and digital logic, anyone who wants Lucidchart-style diagrams offline and free.
- A feature tour with **screenshots**. Take them yourself from the running app, in light and dark, and save them under `docs/screenshots/`.
- **Download** section with one-click links to the latest release for Windows and Mac. Say honestly that it isn't code-signed, and give the exact steps past the warning on each OS:
  - Windows: SmartScreen → More info → Run anyway.
  - Mac: System Settings → Privacy & Security → Open Anyway.
- Quick start: the first diagram in 30 seconds, and the first circuit.
- A small **notation cheat sheet**: Crow's Foot words ↔ Cardinal keywords (`11`, `01`, `1M`, `0M`, written `start:end`) ↔ UML ↔ (min,max), and the warning that (min,max) sits on the opposite ends. The data is in `Cardinal/src/model/catalog.ts` (`NOTATIONS`).
- **Roadmap / what's next**, built from `checklist.js` (Phase 2 / future) and `features.js` (todo rows). Examples: minimap, alignment guides, manual waypoints, templates, Chen → SQL, circuit junction dots, rotating parts, expression → circuit, K-maps, flip-flops/clock/mux/7-segment, custom chips. **Ask me** which ones I actually want to show, and in what order, before you finalise.
- Privacy: everything stays on your machine.
- How to run from source (`build.bat`), plus "built with" credits.

If something about the use case or the story isn't clear, ask me. Short questions are fine. I'll set the About text and topics myself in GitHub, or you can give me the exact text to paste.

## Job 3: desktop installers for Windows + Mac, one click from GitHub
I've decided on **Tauri**: small installers that use the system WebView, so there's a real Start-menu / Applications app with no Node.js and no console window.
- Wrap the existing Vite app with Tauri v2.
- Replace the Node file server with Tauri-side storage. Keep the same `projects/ diagrams/ settings/` JSON layout in `Documents\Cardinal` (on Mac, `~/Documents/Cardinal`) so my existing projects just show up. Keep the browser/IndexedDB fallback working.
- App icon from the Cardinal logo. **No eyes.**
- Window title, About and version all from the app version. Keep `meta.js`, `src/version.ts` and the Tauri config version in sync.
- Keep `build.bat` working for me on Windows: dev build plus run. Tell me exactly what to install first (Rust via rustup, the MSVC build tools if needed) and why.
- Add a **GitHub Actions** workflow (`tauri-apps/tauri-action`) that, when I push a version tag like `v0.2.0`:
  - builds the Windows installer and a universal macOS `.dmg`
  - attaches them to a GitHub Release with nice notes taken from `versions.js`
- Make the README download links point at the latest release, so it really is one click.
- Before the first release, do the "build" promotion from `CLAUDE.md`: promote `pending` → a new version. I think **0.2.0**, but ask me.
- Then give me the exact GitHub Desktop steps to:
  - commit
  - create the tag
  - push the tag
  - watch the Action run
  - find the Release
- If anything can't be automated, guide me through it step by step. I'm comfortable clicking around but not a git-command-line person.
- Test the Windows build on my PC before calling it done. For the Mac build, tell me what to look out for, since neither of us can test it here. Safari's engine (WKWebView) may show small font or CSS differences.

## How I like to work
- Keep the task list going.
- Show me screenshots of UI changes.
- Keep the hub files truthful as you go.
- When you finish a chunk, give me the commit summary and description (ending with the co-author line, per `CLAUDE.md`).
- Explain things simply.
- Small questions are welcome. Big surprises aren't.
