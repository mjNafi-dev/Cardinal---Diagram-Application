# Cardinal — architecture

Web app (TypeScript + React + Vite) in `Cardinal/`, wrapped in a **Tauri v2** desktop shell (`Cardinal/src-tauri/`, Rust) for the Windows / Mac apps. A small Node server still serves browser mode and `npm run dev`.

## Run / build
- `build.bat` (repo root): `npm install` → `npm run tauri build -- --debug --no-bundle` → starts `Cardinal/src-tauri/target/debug/cardinal.exe`. Needs Node, Rust (rustup) and the MSVC C++ build tools.
- `Cardinal/Start Cardinal.bat`: browser mode (`npm run build` if needed → `node server/serve.mjs --open` on http://localhost:5178).
- `npm run tauri dev`: desktop app with hot reload (loads the Vite dev server on 5177).
- `npm run shots`: Vite on 5180 with `Cardinal/.shots-data` (clean data used for the README screenshots, git-ignored).

## Desktop app (`src-tauri/`)
- `src/storage.rs`: commands `store_ping/list/get/put/del`, `open_data_folder`, `save_file`. Same layout and rules as `server/storage.mjs` (atomic tmp+rename writes, deletes go to `.trash`, `CARDINAL_DATA` env override, Documents via the OS known-folder API so OneDrive redirection works).
- `save_file` takes the bytes as a raw IPC body plus an `x-file-name` header and shows a native Save dialog (`tauri-plugin-dialog`, Rust side only). The web side's `download()` (`src/export/export.ts`) uses it whenever `isDesktop()`; blob downloads don't work in WKWebView.
- `lib.rs` sets the window title to `Cardinal <version>`. `tauri.conf.json`: `dragDropEnabled: false` (otherwise Windows swallows HTML5 drag-and-drop from the library), min window 900×600, NSIS (per-user) + app + dmg, macOS ad-hoc signing (`signingIdentity: "-"`) so unsigned builds can be opened with *Open Anyway*.
- Icons: `src-tauri/icons/app-icon.svg` → `npx tauri icon src-tauri/icons/app-icon.svg` (then delete the android/ios folders). No eyes on the bird.

## Versions and releases
- `node scripts/set-version.mjs x.y.z` writes the version to meta.js, `src/version.ts`, package.json, tauri.conf.json and Cargo.toml; `--check [tag]` verifies they match.
- `.github/workflows/release.yml` runs on `v*` tags: checks versions, writes notes with `scripts/release-notes.mjs` (from versions.js), creates a draft release, builds Windows (NSIS) + universal macOS (dmg) with `tauri-action`, then uploads fixed-name copies `Cardinal-Windows-Setup.exe` / `Cardinal-macOS.dmg` (the README links to `releases/latest/download/<name>`) and publishes.
- Dev: `npm run dev` (port 5177, real data) or `npm run sandbox` (port 5179, data in `Cardinal/.sandbox-data`, git-ignored). `.claude/launch.json` → `cardinal-sandbox`.
- In dev, `window.__cardinal` exposes `useEditor`, `layoutRef`, `useLibrary` for console debugging.

## Storage (`server/storage.mjs`, `src-tauri/src/storage.rs`)
- Data dir: `CARDINAL_DATA` env, else the real Windows Documents folder (registry lookup, OneDrive-safe) + `\Cardinal`.
- Collections `projects/`, `diagrams/`, `settings/` — one JSON file per id. Writes are atomic (tmp + rename). DELETE moves to `.trash/`.
- Client: `src/store/backend.ts`: TauriBackend in the desktop app, FileBackend (HTTP) when the Node server answers `/api/ping`, IndexedDB fallback otherwise.

## Model (`src/model`)
- `Doc { nodes: DNode[], edges: DEdge[] }`. Edge ends are `EndRef { node?, side?, field?, x?, y? }`: `side` pins a side, `field` pins a table row, `x/y` = free end.
- Crow's Foot ends are min+max codes (`01`, `11`, `0M`, `1M`). The library keyword is `start code:end code` (e.g. `11:0M`). Search also reads UML multiplicity (`1 0..*`), (min,max) pairs (`(0,N) (1,1)`, flipped to the other ends), ratios (`1:N`) and lecture words (`model/catalog.ts`: `NOTATIONS`, `equivalents`, `searchScore`).
- Colors are palette keys (`auto`, `red`, …) resolved by CSS variables, so dark mode needs no per-element colors.
- Shapes/lines without explicit style follow Preferences (default line width 2).

## Rendering
- `diagram/DiagramContent.tsx` draws nodes/edges as SVG using CSS variables. The same component renders exports (`renderToStaticMarkup` → vars resolved by `resolveVars`, font embedded).
- `editor/Canvas.tsx` = interaction (pan/zoom, select, move, resize, connect from `+` handles or table row dots, endpoint re-attach with row snapping, marquee, drop from library, inline editors).

## Router (`routing/router.ts`)
1. Choose sides per edge (pinned side / row anchor → left/right facing the other shape).
2. Distribute non-pinned ends along each side, ordered by the other end's position (avoids crossings).
2b. Facing shapes with a single line: align ports for a straight run (row-anchored ends stay fixed).
3. A* on a sparse orthogonal grid built from nearby obstacles (inflated 14px). Costs: length + bends + overlap with earlier routes + crossings. While dragging, only edges near moving shapes are rerouted.
4. Nudge collinear overlapping middle segments into parallel lanes (skipped mid-drag).
5. Paths with rounded corners and hops where horizontal runs cross vertical ones.

## SQL (`sql/sql.ts`)
Tolerant tokenizer/parser for CREATE TABLE / ALTER TABLE across MySQL, PostgreSQL, SQLite and SQL Server. `applySql` merges into the diagram by table name (positions kept, renames paired) and anchors FK lines PK row → FK row. `generateSql` orders parents first.

## Versioning
App version lives in `src/version.ts`, `.claude/project/data/meta.js`, `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. Use `scripts/set-version.mjs`, never edit one by hand.

## Library, tools, rows (v0.1.x additions)
- `model/basicShapes.ts`: general shapes. Each has `path(r)`, optional `extra(r)`, `outline(r)` (rect / ellipse / polygon, used by the router) and flags (`container`, `open`, `label`). Nodes use `kind: 'shape'` + `shape: <id>`.
- `model/catalog.ts`: every library item has a stable `id`. Favorites are stored in prefs as `shape:<id>` / `conn:<id>`.
- Containers render behind everything, are not routing obstacles, and drag their contents along. Comments and pen strokes (`drawing`) are also not obstacles. Comments are never exported.
- `editor/fieldParse.ts` + `editor/RowEditor.tsx`: three-cell row editor. `smartParse(cell, text)` spreads a whole typed row across cells. Suggestions cover keys (with explanations), FK candidates from other tables' PKs, common columns and SQL types. Saving a row with a new FK reference adds a PK-row → FK-row line if the tables aren't linked yet.
- `editor/ToolRail.tsx`: tools are editor-store state (`tool`, `toolOpts` persisted in localStorage). Canvas pointerdown handles note/text/comment placement, pen strokes and the line tool.

## Logic circuits (Gates section)
- A diagram is a circuit when `doc.mode === 'circuit'` (`meta.mode` mirrors it for the home cards). ER diagrams leave `mode` unset.
- `model/logic.ts`: part definitions (`LOGIC`), sizes, pin layout (`logicPins`: inputs `i0…` on the left, output `o` on the right), gate outlines (`gatePaths`), simulation, truth table and expressions.
- Parts are nodes with `kind: 'logic'`, `logic: <type>`, `inputs` (gates, 2–8) and `on` (switches/buttons). Wires are edges whose ends are pinned with `field` = pin id; the router treats pins like table rows (fixed ports) via `fixedPort`.
- `simulate(doc)`: 3-valued (0 / 1 / null = not driven) relaxation until stable; gate outputs are remembered between runs so latches built from gates hold state. `DiagramContent` runs it, so the canvas and exports show live colors (`--sig-on/off/x`).
- `store.connect` makes wires output → input (swaps if drawn backwards) and replaces an existing wire on that input. `setSwitch` changes a switch without an undo step.
- UI: `editor/CircuitPanels.tsx` (part / wire properties, circuit overview, Truth table tab). The SQL tab and button become Truth table in circuit mode; the left library shows Inputs / Gates / Outputs.
- Connection dots on rows or pins that already have a line step inward (`busy`), so the line's end stays grabbable.

## Editor layout (v0.2)
- Below 1200 px the shape library hides itself, below 1000 px the right panel too (`NARROW` / `TINY` in `EditorPage.tsx`); only the user's own toggles are remembered in localStorage.
- Library tiles are keyboard buttons (`pressable()` in `ShapesPanel.tsx`). Favorites only show items valid for the diagram type.
- `useLibrary.refresh()` backfills missing thumbnails in the background.
- Keyboard: `ui/shortcuts.ts` holds the list shown in Preferences → Shortcuts (keep it in sync with the handlers in `Home.tsx` / `EditorPage.tsx`). Ctrl+, and Ctrl+S work even while typing; other keys are ignored inside text boxes and the SQL editor.
- Storage size: `Backend.usage()` → Rust `store_usage` / Node `GET /api/usage` (recursive folder size) / `navigator.storage.estimate()` in the browser.
