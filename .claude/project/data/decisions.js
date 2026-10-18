window.HUB_DATA = window.HUB_DATA || {};
window.HUB_DATA["decisions"] = /*DATA*/
{
  "note": "Every questionnaire answer lands here. Statuses: open (never asked/answered), deferred (user said later — AI keeps re-asking when relevant), answered, n/a.",
  "sections": [
    {
      "title": "Stage 1 — The gist",
      "questions": [
        {
          "id": "gist.what",
          "q": "What does the app do? (brain-dump, any order)",
          "status": "answered",
          "answer": "An offline ERD / EER diagram maker that looks as good as Lucidchart. Supports both Chen and Crow's Foot notation (toggle in the shape/relationship panel, shared shapes shown in both). Drag-from-handle connections, smart line routing with no overlaps, hover-to-highlight by connection distance, a searchable cardinality library with short keywords (e.g. 1M01), SQL import/export like eraser.io, and a Figma-style project library."
        },
        {
          "id": "gist.who",
          "q": "Who is it for?",
          "status": "answered",
          "answer": "The user personally. Not for sale."
        },
        {
          "id": "gist.problem",
          "q": "What problem does it remove / why do existing apps fail?",
          "status": "answered",
          "answer": "Lucidchart looks good but isn't truly offline (each project has to be marked for offline use). draw.io works offline but looks dated, and its connector lines overlap and lose correct connection points when entities get moved around on busy canvases."
        },
        {
          "id": "gist.platforms",
          "q": "Which platforms for v1?",
          "status": "answered",
          "answer": "Web app running locally in the browser on Windows. A desktop wrapper (Tauri) only if the user asks for it later."
        },
        {
          "id": "gist.hero",
          "q": "The one thing that must be undeniably great?",
          "status": "answered",
          "answer": "Connections: drag-to-connect that just works, plus lines that never overlap and always attach at the correct points, even as the diagram grows. Close second: a fast, searchable cardinality picker."
        }
      ]
    },
    {
      "title": "Stage 2 — Scope",
      "questions": [
        {
          "id": "scope.core",
          "q": "Core v1 features (must-haves)",
          "status": "answered",
          "answer": "Project library (projects → diagrams, autosave to real files) · Chen + Crow's Foot with a notation toggle · drag-to-connect from handles and from per-row dots on tables (FK row → PK row) · obstacle-avoiding right-angle routing with distinct ports, lane separation and line hops · hover focus that dims by connection distance · cardinality library tiles (picture, name, keyword) with space-insensitive keyword search (1M01) · SQL panel with live two-way sync (MySQL / PostgreSQL / SQLite / SQL Server) · export PNG / SVG / PDF / SQL / .cardinal.json · undo/redo · preferences with defaults for fonts, text sizes, line width (default 2) and remember-last-style · light + dark."
        },
        {
          "id": "scope.nice",
          "q": "Nice-to-haves (v1.x candidates)",
          "status": "answered",
          "answer": "Claude's pick, change any time: minimap · smart alignment guides while dragging · Chen → tables conversion for SQL export · manual waypoints on lines · templates gallery · desktop .exe via Tauri (user decides later)."
        },
        {
          "id": "scope.nongoals",
          "q": "Explicit non-goals",
          "status": "answered",
          "answer": "No AI features. No premium/paywall. No cloud accounts or collaboration."
        },
        {
          "id": "scope.offline",
          "q": "Offline-first, online-first, or hybrid?",
          "status": "answered",
          "answer": "Offline-first. Fully offline, stored on the device."
        },
        {
          "id": "scope.paywall",
          "q": "Will there be a paid/premium tier?",
          "status": "answered",
          "answer": "No. Personal use only."
        },
        {
          "id": "scope.competitors",
          "q": "Competitor analysis? (Claude proposes the competitor list in the same breath; you can add/remove names)",
          "status": "answered",
          "answer": "Declined. Not needed for a personal tool."
        }
      ]
    },
    {
      "title": "Stage 3 — Name & identity",
      "questions": [
        {
          "id": "name.name",
          "q": "App name (AI offers candidates; a codename is used until final)",
          "status": "answered",
          "answer": "Cardinal (from cardinality; the bird pairs with crow's foot). Logo: minimal single-stroke line art of a cardinal, not filled."
        },
        {
          "id": "name.tagline",
          "q": "Tagline / one-liner",
          "status": "answered",
          "answer": "Offline ERD & EER diagrams whose lines route themselves. (Claude's pick)"
        },
        {
          "id": "name.vibe",
          "q": "Personality / vibe words for the app",
          "status": "answered",
          "answer": "Clean, precise, calm, quietly confident. Lucid-like neutrals with a cardinal-red accent. (Claude's pick)"
        }
      ]
    },
    {
      "title": "Stage 4 — Tech",
      "questions": [
        {
          "id": "tech.framework",
          "q": "Framework & language (default suggestion: Flutter)",
          "status": "answered",
          "answer": "Web app: TypeScript + React (Vite). Chosen over Flutter because web diagramming/routing libraries are far more mature. Can be wrapped in Tauri later for a desktop .exe."
        },
        {
          "id": "tech.state",
          "q": "State management approach",
          "status": "answered",
          "answer": "Zustand stores (editor with snapshot undo/redo, library, preferences)."
        },
        {
          "id": "tech.persistence",
          "q": "Local persistence / database",
          "status": "answered",
          "answer": "A local Node helper (started by build.bat / Start Cardinal.bat) saves every project and diagram as a JSON file in Documents\\Cardinal; deletes go to a .trash subfolder. IndexedDB is only a fallback when opened without the helper. Chosen because the user browses with Zen (Firefox), which can evict or clear browser storage."
        },
        {
          "id": "tech.backend",
          "q": "Backend / auth / sync (if any)",
          "status": "n/a",
          "answer": "None. Fully local."
        },
        {
          "id": "tech.payments",
          "q": "Payments provider (only if paywall)",
          "status": "n/a",
          "answer": "No paywall."
        }
      ]
    },
    {
      "title": "Stage 5 — Design",
      "questions": [
        {
          "id": "design.source",
          "q": "Exact token values, or derive the design from the PRD's vibe?",
          "status": "answered",
          "answer": "Derived from the vibe: Lucid-style light UI plus a matching dark mode. (Claude's pick)"
        },
        {
          "id": "design.mode",
          "q": "Dark / light / both?",
          "status": "answered",
          "answer": "Both: Lucid-style light theme plus a dark mode."
        },
        {
          "id": "design.fonts",
          "q": "Fonts (display / body / mono)",
          "status": "answered",
          "answer": "UI: Inter. Mono/code: JetBrains Mono. Diagram font is a preference (Inter, System UI, JetBrains Mono, Serif). All bundled for offline use."
        },
        {
          "id": "design.accents",
          "q": "Accent color(s)",
          "status": "answered",
          "answer": "Cardinal red #D7263D (dark: #EE4A5F) for brand and primary actions. Selection/interaction blue #2F6FEB (dark: #5B8DEF). 9-color soft palette for shapes and lines, theme-aware."
        },
        {
          "id": "design.motion",
          "q": "Animation appetite (none / subtle / animation-heavy)",
          "status": "answered",
          "answer": "Subtle: quick fades (hover focus, menus), no decorative animation."
        },
        {
          "id": "design.refs",
          "q": "Reference apps whose look you admire",
          "status": "answered",
          "answer": "Lucidchart (overall look). Eraser.io (code-to-diagram and SQL export)."
        }
      ]
    },
    {
      "title": "Stage 6 — Workflow",
      "questions": [
        {
          "id": "flow.version",
          "q": "Starting version + what x.y.z mean for this project",
          "status": "answered",
          "answer": "Start at 0.1.0. x = major milestone (1 = daily-driver complete), y = feature release, z = fixes."
        },
        {
          "id": "flow.pages",
          "q": "Initial list of pages/screens (used for tagging changes)",
          "status": "answered",
          "answer": "Home / Projects, Editor canvas, Shapes panel, Properties panel, SQL panel, Preferences, Export, Local server"
        },
        {
          "id": "flow.git",
          "q": "GitHub repo name / branching habit (GitHub Desktop assumed)",
          "status": "answered",
          "answer": "Existing repo on main, committed through GitHub Desktop. Claude supplies commit text."
        },
        {
          "id": "flow.build",
          "q": "Build flavor for build.bat (default: debug profile APK)",
          "status": "answered",
          "answer": "Web project, so no debug profile build: build.bat installs deps (first run), runs the production build, and starts the local server + opens the browser at http://localhost:5178. Cardinal/Start Cardinal.bat launches without rebuilding."
        }
      ]
    }
  ]
}
/*END*/;
