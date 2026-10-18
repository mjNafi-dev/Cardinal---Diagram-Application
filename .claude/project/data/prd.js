window.HUB_DATA = window.HUB_DATA || {};
window.HUB_DATA["prd"] = /*DATA*/
{
  "sections": [
    {
      "heading": "Product summary",
      "body": "**Cardinal** is a fully offline ERD / EER diagram maker and logic-circuit simulator that looks as clean as Lucidchart. It supports **Chen / EER** and **Crow's Foot** notation, keeps projects in a Figma-style library, routes every relationship line automatically so nothing overlaps, speaks SQL in both directions like eraser.io, and simulates logic circuits with live truth tables. It ships as a small **desktop app for Windows and Mac** (Tauri), free on GitHub Releases."
    },
    {
      "heading": "Problem & audience",
      "body": "Built for one person (the owner) who draws database diagrams for study and projects. **Lucidchart** looks great but isn't truly offline (each document has to be marked for offline use). **draw.io** works offline but looks dated, its lines overlap and lose their attachment points when entities move on busy canvases, and it forgets line styling (every line has to be re-thickened by hand).\n\nSince v0.2 it's also shared publicly for **students doing databases and digital logic**, and for anyone who wants Lucidchart-style diagrams offline and free."
    },
    {
      "heading": "Core experience",
      "body": "Open the app, pick a project, open a diagram. Drag a shape in (or double-click the canvas), type columns fast (`PK id INT`, Enter for the next column), then drag from a **blue connection dot** on a shape's edge, or from a **row dot**, onto another shape to connect. Lines route at right angles around shapes, each gets its own port, parallel runs separate into lanes, and unavoidable crossings get little hops.\n\n**The one thing that must be great:** connections. Drag-to-connect that just works, with lines that never overlap and always attach at the right point (including the exact FK/PK row)."
    },
    {
      "heading": "Scope — v1",
      "body": "- Project library (projects → diagrams, thumbnails, recent, rename/duplicate/delete to .trash), autosave to `Documents\\Cardinal`\n- Notation toggle (Crow's Foot / Chen-EER) in the shapes panel and in the line's cardinality picker\n- Crow's Foot tables with PK/FK columns. Chen entities, weak entities, relationships, identifying relationships, attribute kinds, specialization (d / o / ∪), ISA triangle\n- Drag-to-connect from side handles and per-row dots. FK row → PK row sets the FK reference automatically\n- Orthogonal router: side choice, ordered ports, A* around obstacles, lane nudging, hops. Straight/curved optional\n- Hover focus: connected = full, 2 steps = slightly dim, everything else dimmer\n- Cardinality library: picture + name + keyword (`1M01` = mandatory many to optional one), space-insensitive search\n- SQL panel: live two-way sync, 4 dialects, open .sql\n- Export PNG/SVG/PDF/SQL/JSON. Backup/restore all\n- Preferences: theme, fonts and text hierarchy, default line width (2), colors, routing, hops, snap/grid, remember-last-style, hover focus strength"
    },
    {
      "heading": "Non-goals",
      "body": "No AI features. No accounts, cloud sync or collaboration. No paywall (personal use)."
    },
    {
      "heading": "Tech decisions",
      "body": "- **Web app** (TypeScript + React + Vite) instead of Flutter: web diagramming, SVG and text tooling is far more mature, so it's faster to build and better looking\n- **Tauri v2 desktop app** (system WebView: WebView2 on Windows, WKWebView on Mac). Rust commands store the same `projects/ diagrams/ settings/` JSON files in Documents/Cardinal and show native Save dialogs for exports\n- **Local Node helper** still serves browser mode (and `npm run dev`). IndexedDB is the last fallback\n- **Custom SVG canvas + custom router** (no diagram library), for full control over ports and routing quality\n- Zustand for state with snapshot undo/redo. CodeMirror 6 for SQL. dagre for Tidy up. jsPDF for PDF\n- Releases: GitHub Actions (`tauri-action`) builds a Windows NSIS installer and a universal macOS .dmg on every `v*` tag. Not code-signed (Mac build is ad-hoc signed so \"Open Anyway\" works)"
    },
    {
      "heading": "Roadmap",
      "body": "Public roadmap: `ROADMAP.md` in the repo root. In order: **flowchart mode** (own diagram type, Yes/No decision labels, top-to-bottom tidy-up, examples) · **canvas comfort** (minimap, alignment guides, manual waypoints, templates) · **Chen → SQL** · **circuit polish** (junction dots, rotate/flip parts) · **bigger circuit stuff** (expression → circuit, K-maps, flip-flops, clock, mux, 7-segment, custom chips)."
    }
  ]
}
/*END*/;
