window.DS_DATA = window.DS_DATA || {};
window.DS_DATA["tokens"] = /*DATA*/
{
  "note": "Cardinal design tokens. Mirror of Cardinal/src/theme/tokens.ts + palette.ts — keep both in sync.",
  "fonts": {
    "display": "'Inter Variable', Inter, system-ui, sans-serif",
    "body": "'Inter Variable', Inter, system-ui, sans-serif",
    "mono": "'JetBrains Mono', Consolas, monospace"
  },
  "neutrals": [
    {
      "name": "D0 bg",
      "hex": "#111214"
    },
    {
      "name": "D1 panel",
      "hex": "#191B1F"
    },
    {
      "name": "D2 panel-3",
      "hex": "#262931"
    },
    {
      "name": "D3 border",
      "hex": "#3A3E46"
    },
    {
      "name": "MID text-3",
      "hex": "#8A919B"
    },
    {
      "name": "L2 border-strong",
      "hex": "#CBD0D6"
    },
    {
      "name": "L1 border",
      "hex": "#E3E5E9"
    },
    {
      "name": "L0.5 bg",
      "hex": "#F3F4F6"
    },
    {
      "name": "L0 canvas",
      "hex": "#FAFAFB"
    }
  ],
  "accents": [
    {
      "name": "Cardinal (brand / primary)",
      "light": {
        "subtle": "#FCE8EB",
        "muted": "#F0A3AE",
        "default": "#D7263D",
        "strong": "#BD1D32",
        "fg": "#FFFFFF"
      },
      "dark": {
        "subtle": "#3A1B22",
        "muted": "#7A2B37",
        "default": "#EE4A5F",
        "strong": "#F26476",
        "fg": "#FFFFFF"
      }
    },
    {
      "name": "Select (interaction)",
      "light": {
        "subtle": "#E6EEFD",
        "muted": "#9DB8F3",
        "default": "#2F6FEB",
        "strong": "#2457C0",
        "fg": "#FFFFFF"
      },
      "dark": {
        "subtle": "#18233A",
        "muted": "#2E4A80",
        "default": "#5B8DEF",
        "strong": "#7EA4F2",
        "fg": "#0D1117"
      }
    }
  ],
  "semantic": [
    {
      "name": "Success",
      "light": "#2E7D4F",
      "dark": "#5DBB87",
      "subtleLight": "#E3F2E9",
      "subtleDark": "#0F2318"
    },
    {
      "name": "Warning",
      "light": "#A8760A",
      "dark": "#D9A441",
      "subtleLight": "#FAF0DA",
      "subtleDark": "#271D08"
    },
    {
      "name": "Danger",
      "light": "#B3382C",
      "dark": "#E07B6F",
      "subtleLight": "#F9E4E1",
      "subtleDark": "#2A100D"
    },
    {
      "name": "Key label (PK/FK)",
      "light": "#C8213A",
      "dark": "#F0667A",
      "subtleLight": "#FCE6E9",
      "subtleDark": "#3A1D23"
    },
    {
      "name": "Signal 1 (wire on)",
      "light": "#16A34A",
      "dark": "#4ADE80"
    },
    {
      "name": "Signal 0 (wire off)",
      "light": "#3A3F47",
      "dark": "#C5CAD1"
    },
    {
      "name": "Signal ? (not driven)",
      "light": "#AEB4BC",
      "dark": "#5A616B"
    },
    {
      "name": "Switch off track",
      "light": "#E4E7EB",
      "dark": "#30343C"
    },
    {
      "name": "Bulb lit",
      "light": "#FFC531",
      "dark": "#FFC531"
    },
    {
      "name": "SQL problem (warn triangle)",
      "light": "#F0A41C",
      "dark": "#F5B33B"
    }
  ],
  "type": [
    {
      "token": "pageTitle",
      "px": 22,
      "weight": 750,
      "lh": 1.2,
      "font": "display",
      "sample": "Projects"
    },
    {
      "token": "dialogTitle",
      "px": 16,
      "weight": 700,
      "lh": 1.3,
      "font": "display",
      "sample": "Export"
    },
    {
      "token": "diagramTitle",
      "px": 14,
      "weight": 650,
      "lh": 1.3,
      "font": "body",
      "sample": "Customer (table header, default)"
    },
    {
      "token": "body",
      "px": 13,
      "weight": 400,
      "lh": 1.45,
      "font": "body",
      "sample": "Default UI text and table columns."
    },
    {
      "token": "label",
      "px": 11,
      "weight": 650,
      "lh": 1.3,
      "font": "body",
      "sample": "SECTION LABEL"
    },
    {
      "token": "lineLabel",
      "px": 12,
      "weight": 500,
      "lh": 1.3,
      "font": "body",
      "sample": "places · N · (0,N)"
    },
    {
      "token": "mono",
      "px": 12,
      "weight": 400,
      "lh": 1.4,
      "font": "mono",
      "sample": "PK id INT · 1M01 · Ctrl+Z"
    }
  ],
  "spacing": [
    {
      "name": "space4",
      "px": 4,
      "use": "tight gaps"
    },
    {
      "name": "space6",
      "px": 6,
      "use": "tile grid gap"
    },
    {
      "name": "space8",
      "px": 8,
      "use": "inner padding"
    },
    {
      "name": "space12",
      "px": 12,
      "use": "panel section padding"
    },
    {
      "name": "space16",
      "px": 16,
      "use": "modal padding, card grid gap"
    },
    {
      "name": "space32",
      "px": 32,
      "use": "home page gutters"
    }
  ],
  "radius": [
    {
      "name": "radiusSm",
      "px": 6
    },
    {
      "name": "radiusMd",
      "px": 8
    },
    {
      "name": "radiusTile",
      "px": 9
    },
    {
      "name": "radiusCard",
      "px": 12
    },
    {
      "name": "radiusModal",
      "px": 14
    }
  ],
  "elevation": [
    {
      "name": "Level 0",
      "css": "none",
      "use": "panels (borders instead of shadows)"
    },
    {
      "name": "Level 1",
      "css": "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08)",
      "use": "active segment, small chips"
    },
    {
      "name": "Level 2",
      "css": "0 4px 12px rgba(16,24,40,.10), 0 2px 4px rgba(16,24,40,.06)",
      "use": "card hover, zoom control"
    },
    {
      "name": "Level 3",
      "css": "0 16px 40px rgba(16,24,40,.18), 0 4px 10px rgba(16,24,40,.08)",
      "use": "menus, modals"
    }
  ],
  "opacity": [
    {
      "name": "Hover focus · 2 steps",
      "v": 0.62
    },
    {
      "name": "Hover focus · unconnected",
      "v": 0.4
    },
    {
      "name": "Disabled",
      "v": 0.45
    },
    {
      "name": "Backdrop",
      "v": 0.42
    }
  ]
}
/*END*/;
