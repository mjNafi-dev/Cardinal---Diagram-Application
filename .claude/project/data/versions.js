window.HUB_DATA = window.HUB_DATA || {};
window.HUB_DATA["versions"] = /*DATA*/
{
  "pending": [],
  "versions": [
    {
      "version": "0.2.1",
      "date": "2026-10-19",
      "items": [
        {
          "text": "Figma-style **floating tool dock** at the bottom of the canvas (find shape, select, note, text, line, frames, image, pen, comment); popovers open above it. The left rail is gone: the shape library has its own **hide** button in its header (same icon as the right panel) and a slim tab brings it back, so there is one clear control per panel.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            },
            {
              "name": "Shapes panel",
              "type": "edit"
            }
          ]
        }
      ]
    },
    {
      "version": "0.2.0",
      "date": "2026-10-18",
      "items": [
        {
          "text": "Table rows edit **per cell** (keys · name · type) with suggestions: key picker with plain-English explanations (PK, FK, UQ, NN, AI), common column names, **foreign-key suggestions from other tables' primary keys**, and SQL data types. Typing a whole row like `FK customer_id INT` in any cell fills the entire row.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Picking or typing a foreign key links it to the referenced PK and **draws the relationship line row-to-row** automatically.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "add"
            }
          ]
        },
        {
          "text": "New **Auto increment (AI)** key flag, exported per dialect (AUTO_INCREMENT / SERIAL / IDENTITY / AUTOINCREMENT).",
          "pages": [
            {
              "name": "SQL panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "**General shape library** (draw.io/Lucid style): basic shapes, flowchart, arrows, containers & frames (carry their contents, lines pass through), people & braces.",
          "pages": [
            {
              "name": "Shapes panel",
              "type": "add"
            },
            {
              "name": "Editor canvas",
              "type": "add"
            }
          ]
        },
        {
          "text": "ER extras: junction table, **view**, **enum**, associative entity, composite attribute, aggregation frame, simple 1:1 / 1:M / M:N lines.",
          "pages": [
            {
              "name": "Shapes panel",
              "type": "add"
            }
          ]
        },
        {
          "text": "Library sections are **collapsible**; new **Favorites** strip on top (right-click → Add to favorites / Place on canvas, or drag items into it).",
          "pages": [
            {
              "name": "Shapes panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Lucid-style **tool rail**: search, select, sticky notes (color picker), shape library toggle, text, line/arrow tool, frames menu, image insert (also Ctrl+V paste), **pen** (colors + widths), **comments**. Library panel collapses.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "add"
            }
          ]
        },
        {
          "text": "Page tabs restyled like Google Sheets: **+** adds a page, **≡** lists pages, active tab **∨** menu (rename, duplicate, delete), double-click to rename.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "SQL panel: **Import** (open .sql), Download, Copy. Paste SQL straight into the editor.",
          "pages": [
            {
              "name": "SQL panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Router: shapes facing each other get a **straight line** when nothing is in between; thumbnails generated for new pages.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            },
            {
              "name": "Home / Projects",
              "type": "edit"
            }
          ]
        },
        {
          "text": "**Connection dots everywhere**: tables get a dot at both ends of the title row and every row; every side has dots in the middle of each gap between attached lines (no lines → one middle dot; one line → a dot either side). Replaces the old + handles.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Lines on one side now **spread evenly** (½, ⅓–⅔, ¼–½–¾…) and respect the slot you dropped them on.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Tables hide the key column when no row has a key (types already hide when empty); UQ shows in the key column.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Favorites: line tiles are wider. Library section titles **stick to the top** while their section is on screen.",
          "pages": [
            {
              "name": "Shapes panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Fix: typing a column name into the keys box no longer wipes the row's existing keys (PK kept).",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "**Logic circuits**: new diagram type with switches, push buttons, constants, AND/OR/NOT/NAND/NOR/XOR/XNOR/buffer gates (2–8 inputs), light bulbs and digit displays. Live simulation: click a switch, wires turn green for 1.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "add"
            },
            {
              "name": "Shapes panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "**Truth table** tab for circuits: every switch combination, Boolean expression per output, click a row to set the switches, copy to Sheets/Word.",
          "pages": [
            {
              "name": "Truth table panel",
              "type": "add"
            }
          ]
        },
        {
          "text": "Properties for gates (type picker, input count, live pin values, colors) and wires; drop a wire on empty canvas to add a connected part.",
          "pages": [
            {
              "name": "Properties panel",
              "type": "edit"
            },
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "New diagram dialog: choose **Database diagram** or **Logic circuit** (half-adder example). Cards and page list show the type.",
          "pages": [
            {
              "name": "Home / Projects",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Rows that already have a line: the connection dot steps inside the table so the line's end is easy to grab; a selected line's end handles sit above the dots.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Circuits: hovering a part highlights its **signal path** (what feeds it and what it drives); the rest fades. Waits a moment before changing, so sweeping the mouse doesn't flicker; clicking a switch keeps the highlight.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Home: subtle type icon on every diagram card (Crow's Foot / Chen / Logic), a type filter (All · Database → All / Crow's Foot / Chen · Logic) and a **Search everything** box (press / or Ctrl K).",
          "pages": [
            {
              "name": "Home / Projects",
              "type": "edit"
            }
          ]
        },
        {
          "text": "SQL panel updates the diagram as you type (0.25 s); a broken statement no longer blocks the rest — good statements apply, existing tables are kept, and the status line names the bad line. New **Update** button (Ctrl+Enter) applies right away.",
          "pages": [
            {
              "name": "SQL panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "SQL panel: deleting all the code removes the tables from the canvas (Ctrl+Z brings them back); tables not in the code are removed even while another statement is broken.",
          "pages": [
            {
              "name": "SQL panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "SQL problems are shown everywhere: underlined with a gutter marker in the editor, an amber **⚠ triangle** on the table's header (click → jumps to the line), and a banner on the canvas when the problem has no table yet (e.g. `CREATE TABLE help{}`). Catches broken statements, CREATE TABLE without columns, and references to missing tables/columns. Unfinished code survives switching tabs.",
          "pages": [
            {
              "name": "SQL panel",
              "type": "edit"
            },
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Cardinality keywords now read **start:end** (e.g. `11:0M`; typing `110M` still works). Search understands UML (`1 0..*`), (min,max) (`(0,N) (1,1)`, placed on the other ends as in lectures), ratios (`1:N`, `M:N`) and lecture words (\"one and only one to zero or many\"). Tooltips list every equivalent.",
          "pages": [
            {
              "name": "Shapes panel",
              "type": "edit"
            },
            {
              "name": "Properties panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "UX pass: empty-canvas hint and Quick keys now describe the **blue connection dots** (the old “+ handle” wording was out of date); shortcut tooltips use one style (`Ctrl + Z`, `Ctrl + 0`…).",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            },
            {
              "name": "Properties panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Fix: **Favorites** only show items that fit the diagram type, so ER tables and cardinalities no longer appear in a logic circuit's parts list (and gates don't appear in ER diagrams).",
          "pages": [
            {
              "name": "Shapes panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Truth table explains **?** (a gate input that isn't connected yet) whenever it shows up.",
          "pages": [
            {
              "name": "Truth table panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Narrow windows: the editor toolbar no longer overlaps the diagram name (project crumb and the word “Saved” hide below 1000 px; the save dot keeps a tooltip).",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            }
          ]
        },
        {
          "text": "New diagram dialog explains **Crow's Foot** vs **Chen / EER** in plain words.",
          "pages": [
            {
              "name": "Home / Projects",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Narrow windows: below 1200 px the **shape library hides itself**, below 1000 px the **right panel** does too (a slim tab on the right brings it back; the SQL / Truth table button and SQL error links also reopen it). Widening the window restores them. New **hide panel** button next to the Properties / SQL tabs.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            },
            {
              "name": "Shapes panel",
              "type": "edit"
            },
            {
              "name": "Properties panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Home: diagrams that never had a preview (imported, made from SQL, older saves) **get a thumbnail automatically** the next time the project list loads.",
          "pages": [
            {
              "name": "Home / Projects",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Library tiles work with the **keyboard**: Tab to a tile, Enter or Space adds the shape or picks the line style; tiles have names for screen readers and a visible focus ring.",
          "pages": [
            {
              "name": "Shapes panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Library search hides the empty **Favorites** box when none of your favorites match.",
          "pages": [
            {
              "name": "Shapes panel",
              "type": "edit"
            }
          ]
        },
        {
          "text": "**Desktop app (Tauri v2)** for Windows and Mac: a real Start-menu / Applications app with no Node.js and no console window. It saves to the same `Documents/Cardinal` files (`projects/ diagrams/ settings/`), so existing projects just show up; browser mode and the IndexedDB fallback still work.",
          "pages": [
            {
              "name": "Desktop app",
              "type": "add"
            },
            {
              "name": "Local server",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Exports, SQL downloads and backups open a native **Save as** dialog in the desktop app (and say where they saved). PDF export goes through the same path.",
          "pages": [
            {
              "name": "Export",
              "type": "edit"
            },
            {
              "name": "SQL panel",
              "type": "edit"
            },
            {
              "name": "Preferences",
              "type": "edit"
            }
          ]
        },
        {
          "text": "New **About** tab in Preferences (version, desktop or browser, privacy note). The window title shows the version (`Cardinal 0.2.0`).",
          "pages": [
            {
              "name": "Preferences",
              "type": "add"
            },
            {
              "name": "Desktop app",
              "type": "add"
            }
          ]
        },
        {
          "text": "App icon: the line-art cardinal (no eyes) in white on a red rounded square, for Windows and macOS.",
          "pages": [
            {
              "name": "Desktop app",
              "type": "add"
            }
          ]
        },
        {
          "text": "**One-click releases**: pushing a tag like `v0.2.0` makes GitHub Actions build a Windows installer and a universal macOS .dmg and publish them with notes from this version log. `build.bat` now builds and opens the desktop app (debug); `Start Cardinal.bat` keeps browser mode. `scripts/set-version.mjs` keeps every version copy in sync.",
          "pages": [
            {
              "name": "Desktop app",
              "type": "add"
            }
          ]
        },
        {
          "text": "New README with screenshots (light and dark), downloads, quick start, notation cheat sheet and roadmap. Starter-pack leftovers removed.",
          "pages": []
        },
        {
          "text": "Deleting a page and **Reset all** now ask in Cardinal's own dialog (the browser-style confirm box isn't reliable inside the desktop app). The Save toast names the file you actually picked.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "edit"
            },
            {
              "name": "Preferences",
              "type": "edit"
            },
            {
              "name": "Export",
              "type": "edit"
            }
          ]
        },
        {
          "text": "Preferences → Storage shows **how much space** your projects take (KB / MB / GB, and how much of that is in .trash).",
          "pages": [
            {
              "name": "Preferences",
              "type": "edit"
            }
          ]
        },
        {
          "text": "**Keyboard shortcuts**: Ctrl+, opens Preferences everywhere · Ctrl+K finds a shape to add (opens the library if hidden) · Ctrl+E export · Ctrl+S saves with a confirmation · N makes a new diagram/project on the projects page · ? shows every shortcut in a new **Shortcuts** tab in Preferences.",
          "pages": [
            {
              "name": "Preferences",
              "type": "add"
            },
            {
              "name": "Editor canvas",
              "type": "edit"
            },
            {
              "name": "Home / Projects",
              "type": "edit"
            }
          ]
        }
      ]
    },
    {
      "version": "0.1.0",
      "date": "2026-10-18",
      "items": [
        {
          "text": "Project scaffolded from the starter pack.",
          "pages": []
        },
        {
          "text": "Project library with autosave to real files in `Documents\\Cardinal` (local helper server, .trash for deletes, backup/restore).",
          "pages": [
            {
              "name": "Home / Projects",
              "type": "add"
            },
            {
              "name": "Local server",
              "type": "add"
            }
          ]
        },
        {
          "text": "Diagram editor: Crow's Foot tables and Chen/EER shapes, pan/zoom, snap, marquee, undo/redo, copy/paste, align, Tidy up.",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "add"
            }
          ]
        },
        {
          "text": "Connection router: right-angle routing around shapes, ordered distinct ports, lane separation, line hops. **Per-row connection dots** on tables (FK row → PK row sets the reference).",
          "pages": [
            {
              "name": "Editor canvas",
              "type": "add"
            }
          ]
        },
        {
          "text": "Shapes panel with **Crow's Foot / Chen toggle** and cardinality tiles (picture, name, keyword like `1M01`) with keyword search.",
          "pages": [
            {
              "name": "Shapes panel",
              "type": "add"
            }
          ]
        },
        {
          "text": "Properties panel: column editor, cardinality picker with notation toggle, line/shape styling, make-default.",
          "pages": [
            {
              "name": "Properties panel",
              "type": "add"
            }
          ]
        },
        {
          "text": "SQL panel with live two-way sync for MySQL, PostgreSQL, SQLite, SQL Server.",
          "pages": [
            {
              "name": "SQL panel",
              "type": "add"
            }
          ]
        },
        {
          "text": "Preferences (theme, fonts, text hierarchy, default line width 2, colors, routing, hops, remember last style, hover focus) and Export (PNG, SVG, PDF, SQL, JSON).",
          "pages": [
            {
              "name": "Preferences",
              "type": "add"
            },
            {
              "name": "Export",
              "type": "add"
            }
          ]
        },
        {
          "text": "Cardinal line-art logo, light + dark themes.",
          "pages": []
        }
      ]
    }
  ]
}
/*END*/;
