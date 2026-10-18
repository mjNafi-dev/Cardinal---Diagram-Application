import type { ColorKey, Notation, Routing } from './types';

export type FontChoice = 'inter' | 'system' | 'mono' | 'serif';

export const FONT_STACKS: Record<FontChoice, { label: string; css: string }> = {
  inter: { label: 'Inter', css: "'Inter Variable', 'Inter', system-ui, sans-serif" },
  system: { label: 'System UI', css: "system-ui, 'Segoe UI', sans-serif" },
  mono: { label: 'JetBrains Mono', css: "'JetBrains Mono', Consolas, monospace" },
  serif: { label: 'Serif (Georgia)', css: "Georgia, 'Times New Roman', serif" },
};

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  defaultNotation: Notation;
  text: {
    font: FontChoice;
    titleSize: number;
    titleWeight: number;
    bodySize: number;
    labelSize: number;
    typeColumn: boolean;
  };
  line: {
    width: number;
    color: ColorKey;
    routingCrowsFoot: Routing;
    routingChen: Routing;
    cornerRadius: number;
    hops: boolean;
  };
  shape: {
    strokeWidth: number;
    stroke: ColorKey;
    fill: ColorKey;
    headerFill: ColorKey;
    radius: number;
  };
  /** When you style a line or shape, new lines/shapes you draw afterwards get the same style. */
  rememberLast: boolean;
  last: {
    edge: { strokeWidth?: number; stroke?: ColorKey };
    node: { strokeWidth?: number; stroke?: ColorKey; fill?: ColorKey };
  };
  canvas: { grid: boolean; snap: boolean; gridSize: number };
  focus: { enabled: boolean; near: number; far: number };
  exportBg: 'light' | 'dark' | 'transparent';
  exportScale: number;
  /** library favorites: 'shape:<id>' or 'conn:<id>' */
  favorites: string[];
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  defaultNotation: 'crowsfoot',
  text: { font: 'inter', titleSize: 14, titleWeight: 650, bodySize: 13, labelSize: 12, typeColumn: true },
  line: { width: 2, color: 'auto', routingCrowsFoot: 'orthogonal', routingChen: 'straight', cornerRadius: 6, hops: true },
  shape: { strokeWidth: 1.5, stroke: 'auto', fill: 'auto', headerFill: 'gray', radius: 6 },
  rememberLast: true,
  last: { edge: {}, node: {} },
  canvas: { grid: true, snap: true, gridSize: 10 },
  focus: { enabled: true, near: 0.62, far: 0.4 },
  exportBg: 'light',
  exportScale: 2,
  favorites: ['shape:cf-table', 'conn:cf-11-0M', 'conn:cf-11-1M', 'shape:note'],
};

/** Merge saved prefs over defaults (new settings appear automatically after updates). */
export function mergePrefs(saved: any): Prefs {
  const out: any = structuredClone(DEFAULT_PREFS);
  if (!saved || typeof saved !== 'object') return out;
  for (const k of Object.keys(out)) {
    if (saved[k] === undefined) continue;
    if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = { ...out[k], ...saved[k] };
    else out[k] = saved[k];
  }
  return out;
}
