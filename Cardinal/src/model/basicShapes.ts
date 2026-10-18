/**
 * General-purpose shapes (draw.io / Lucid style): basic geometry, flowchart, arrows, containers, people.
 * Each shape draws itself inside its bounding box and tells the router what its outline is.
 */
import type { Pt, Rect } from './types';

export type BasicCategory = 'general' | 'flowchart' | 'arrows' | 'containers' | 'misc';
export type Outline = 'rect' | 'ellipse' | Pt[];

export interface BasicShape {
  id: string;
  name: string;
  category: BasicCategory;
  keyword: string;
  w: number;
  h: number;
  text?: string;
  /** main outline path (filled) */
  path(r: Rect): string;
  /** extra strokes on top (no fill) */
  extra?(r: Rect): string;
  outline(r: Rect): Outline;
  /** where the label goes */
  label?: 'center' | 'below' | 'header' | 'side';
  /** open shapes (braces) have no fill */
  open?: boolean;
  /** containers sit behind other shapes, lines pass through them, and they carry their contents when moved */
  container?: boolean;
}

const poly = (pts: Pt[]) => 'M' + pts.map((p) => `${r1(p.x)},${r1(p.y)}`).join('L') + 'Z';
const r1 = (n: number) => Math.round(n * 10) / 10;
const rectPath = (r: Rect, rad = 0) => {
  if (!rad) return `M${r.x},${r.y}H${r.x + r.w}V${r.y + r.h}H${r.x}Z`;
  const k = Math.min(rad, r.w / 2, r.h / 2);
  return `M${r.x + k},${r.y}H${r.x + r.w - k}A${k},${k} 0 0 1 ${r.x + r.w},${r.y + k}V${r.y + r.h - k}A${k},${k} 0 0 1 ${r.x + r.w - k},${r.y + r.h}H${r.x + k}A${k},${k} 0 0 1 ${r.x},${r.y + r.h - k}V${r.y + k}A${k},${k} 0 0 1 ${r.x + k},${r.y}Z`;
};
const ellipsePath = (r: Rect) => {
  const rx = r.w / 2, ry = r.h / 2, cx = r.x + rx, cy = r.y + ry;
  return `M${cx - rx},${cy}A${rx},${ry} 0 1 0 ${cx + rx},${cy}A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`;
};

// polygons in unit space (0..1) scaled into the box
const unitPoly = (u: [number, number][]) => (r: Rect): Pt[] => u.map(([a, b]) => ({ x: r.x + a * r.w, y: r.y + b * r.h }));

function arrowPts(r: Rect, dir: 'r' | 'l' | 'u' | 'd'): Pt[] {
  // right-pointing arrow in a w×h box, then mirrored/rotated
  const horiz = dir === 'r' || dir === 'l';
  const L = horiz ? r.w : r.h, T = horiz ? r.h : r.w;
  const hl = Math.min(L * 0.45, T);
  const base: [number, number][] = [[0, T * 0.28], [L - hl, T * 0.28], [L - hl, 0], [L, T / 2], [L - hl, T], [L - hl, T * 0.72], [0, T * 0.72]];
  return base.map(([a, b]) => {
    if (dir === 'r') return { x: r.x + a, y: r.y + b };
    if (dir === 'l') return { x: r.x + r.w - a, y: r.y + b };
    if (dir === 'd') return { x: r.x + b, y: r.y + a };
    return { x: r.x + b, y: r.y + r.h - a };
  });
}
function doubleArrowPts(r: Rect, horiz: boolean): Pt[] {
  const L = horiz ? r.w : r.h, T = horiz ? r.h : r.w;
  const hl = Math.min(L * 0.3, T);
  const base: [number, number][] = [[0, T / 2], [hl, 0], [hl, T * 0.28], [L - hl, T * 0.28], [L - hl, 0], [L, T / 2], [L - hl, T], [L - hl, T * 0.72], [hl, T * 0.72], [hl, T]];
  return base.map(([a, b]) => (horiz ? { x: r.x + a, y: r.y + b } : { x: r.x + b, y: r.y + a }));
}
function starPts(r: Rect): Pt[] {
  const cx = r.x + r.w / 2, cy = r.y + r.h * 0.53, R = Math.min(r.w, r.h * 1.05) / 2, ri = R * 0.42;
  const out: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? ri : R;
    out.push({ x: cx + Math.cos(a) * rr * (r.w / Math.min(r.w, r.h * 1.05)), y: cy + Math.sin(a) * rr });
  }
  return out;
}
function crossPts(r: Rect): Pt[] {
  const t = Math.min(r.w, r.h) / 3;
  const x1 = r.x + (r.w - t) / 2, x2 = x1 + t, y1 = r.y + (r.h - t) / 2, y2 = y1 + t;
  return [{ x: x1, y: r.y }, { x: x2, y: r.y }, { x: x2, y: y1 }, { x: r.x + r.w, y: y1 }, { x: r.x + r.w, y: y2 }, { x: x2, y: y2 }, { x: x2, y: r.y + r.h }, { x: x1, y: r.y + r.h }, { x: x1, y: y2 }, { x: r.x, y: y2 }, { x: r.x, y: y1 }, { x: x1, y: y1 }];
}
const polyShape = (id: string, name: string, category: BasicCategory, keyword: string, w: number, h: number, pts: (r: Rect) => Pt[], extra?: BasicShape['extra']): BasicShape =>
  ({ id, name, category, keyword, w, h, path: (r) => poly(pts(r)), outline: pts, extra });

const cylinderRy = (r: Rect) => Math.min(r.h * 0.13, 14);

export const BASIC_SHAPES: BasicShape[] = [
  // ── General ──
  { id: 'rect', name: 'Rectangle', category: 'general', keyword: 'RECT', w: 120, h: 64, path: (r) => rectPath(r), outline: () => 'rect' },
  { id: 'rounded', name: 'Rounded rectangle', category: 'general', keyword: 'ROUND', w: 120, h: 64, path: (r) => rectPath(r, 12), outline: () => 'rect' },
  { id: 'ellipse', name: 'Ellipse', category: 'general', keyword: 'ELLIPSE', w: 120, h: 70, path: ellipsePath, outline: () => 'ellipse' },
  { id: 'circle', name: 'Circle', category: 'general', keyword: 'CIRCLE', w: 80, h: 80, path: ellipsePath, outline: () => 'ellipse' },
  polyShape('diamond', 'Diamond', 'general', 'DIAMOND', 110, 80, unitPoly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])),
  polyShape('triangle', 'Triangle', 'general', 'TRI', 100, 86, unitPoly([[0.5, 0], [1, 1], [0, 1]])),
  polyShape('right-triangle', 'Right triangle', 'general', 'RTRI', 90, 80, unitPoly([[0, 0], [1, 1], [0, 1]])),
  polyShape('pentagon', 'Pentagon', 'general', 'PENT', 90, 86, unitPoly([[0.5, 0], [1, 0.38], [0.81, 1], [0.19, 1], [0, 0.38]])),
  polyShape('hexagon', 'Hexagon', 'general', 'HEX', 110, 80, unitPoly([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]])),
  polyShape('octagon', 'Octagon', 'general', 'OCT', 90, 90, unitPoly([[0.29, 0], [0.71, 0], [1, 0.29], [1, 0.71], [0.71, 1], [0.29, 1], [0, 0.71], [0, 0.29]])),
  polyShape('parallelogram', 'Parallelogram', 'general', 'PARA', 130, 64, unitPoly([[0.18, 0], [1, 0], [0.82, 1], [0, 1]])),
  polyShape('trapezoid', 'Trapezoid', 'general', 'TRAP', 130, 64, unitPoly([[0.18, 0], [0.82, 0], [1, 1], [0, 1]])),
  polyShape('star', 'Star', 'general', 'STAR', 90, 86, starPts),
  polyShape('cross', 'Cross', 'general', 'PLUS', 80, 80, crossPts),
  {
    id: 'cloud', name: 'Cloud', category: 'general', keyword: 'CLOUD', w: 130, h: 80, outline: () => 'ellipse',
    path: (r) => {
      const X = (a: number) => r1(r.x + a * r.w), Y = (b: number) => r1(r.y + b * r.h);
      return `M${X(0.25)},${Y(0.85)}C${X(0.02)},${Y(0.85)} ${X(0.0)},${Y(0.55)} ${X(0.18)},${Y(0.48)}C${X(0.12)},${Y(0.2)} ${X(0.42)},${Y(0.08)} ${X(0.52)},${Y(0.26)}C${X(0.6)},${Y(0.02)} ${X(0.9)},${Y(0.1)} ${X(0.84)},${Y(0.38)}C${X(1.02)},${Y(0.42)} ${X(1.02)},${Y(0.85)} ${X(0.78)},${Y(0.85)}Z`;
    },
  },
  {
    id: 'cylinder', name: 'Cylinder / database', category: 'general', keyword: 'DB', w: 90, h: 100, outline: () => 'rect',
    path: (r) => { const ry = cylinderRy(r); return `M${r.x},${r.y + ry}A${r.w / 2},${ry} 0 0 1 ${r.x + r.w},${r.y + ry}V${r.y + r.h - ry}A${r.w / 2},${ry} 0 0 1 ${r.x},${r.y + r.h - ry}Z`; },
    extra: (r) => { const ry = cylinderRy(r); return `M${r.x},${r.y + ry}A${r.w / 2},${ry} 0 0 0 ${r.x + r.w},${r.y + ry}`; },
  },
  {
    id: 'document', name: 'Document', category: 'general', keyword: 'DOC', w: 110, h: 76, outline: () => 'rect',
    path: (r) => { const wv = r.h * 0.12; return `M${r.x},${r.y}H${r.x + r.w}V${r.y + r.h - wv}C${r.x + r.w * 0.75},${r.y + r.h - wv * 3} ${r.x + r.w * 0.3},${r.y + r.h + wv * 1.2} ${r.x},${r.y + r.h - wv}Z`; },
  },
  {
    id: 'callout', name: 'Callout', category: 'general', keyword: 'CALLOUT', w: 130, h: 80, outline: () => 'rect',
    path: (r) => { const b = r.y + r.h * 0.78, k = 8; return `M${r.x + k},${r.y}H${r.x + r.w - k}Q${r.x + r.w},${r.y} ${r.x + r.w},${r.y + k}V${b - k}Q${r.x + r.w},${b} ${r.x + r.w - k},${b}H${r.x + r.w * 0.4}L${r.x + r.w * 0.22},${r.y + r.h}L${r.x + r.w * 0.26},${b}H${r.x + k}Q${r.x},${b} ${r.x},${b - k}V${r.y + k}Q${r.x},${r.y} ${r.x + k},${r.y}Z`; },
  },
  {
    id: 'card', name: 'Card (cut corner)', category: 'general', keyword: 'CARD', w: 110, h: 70, outline: () => 'rect',
    path: (r) => poly([{ x: r.x + 16, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y + 16 }]),
  },

  // ── Flowchart ──
  { id: 'process', name: 'Process', category: 'flowchart', keyword: 'PROCESS', w: 120, h: 60, path: (r) => rectPath(r), outline: () => 'rect' },
  polyShape('decision', 'Decision', 'flowchart', 'DECISION', 120, 80, unitPoly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])),
  { id: 'terminator', name: 'Start / end', category: 'flowchart', keyword: 'TERM', w: 120, h: 50, path: (r) => rectPath(r, r.h / 2), outline: () => 'rect' },
  polyShape('data', 'Data (input/output)', 'flowchart', 'IO', 130, 60, unitPoly([[0.18, 0], [1, 0], [0.82, 1], [0, 1]])),
  {
    id: 'predefined', name: 'Predefined process', category: 'flowchart', keyword: 'SUB', w: 130, h: 60, path: (r) => rectPath(r), outline: () => 'rect',
    extra: (r) => `M${r.x + r.w * 0.1},${r.y}V${r.y + r.h}M${r.x + r.w * 0.9},${r.y}V${r.y + r.h}`,
  },
  polyShape('manual-input', 'Manual input', 'flowchart', 'MANUAL', 120, 64, unitPoly([[0, 0.28], [1, 0], [1, 1], [0, 1]])),
  polyShape('preparation', 'Preparation', 'flowchart', 'PREP', 130, 60, unitPoly([[0.15, 0], [0.85, 0], [1, 0.5], [0.85, 1], [0.15, 1], [0, 0.5]])),
  polyShape('manual-op', 'Manual operation', 'flowchart', 'MANOP', 130, 60, unitPoly([[0, 0], [1, 0], [0.82, 1], [0.18, 1]])),
  {
    id: 'delay', name: 'Delay', category: 'flowchart', keyword: 'DELAY', w: 110, h: 64, outline: () => 'rect',
    path: (r) => { const k = Math.min(r.h / 2, r.w / 2); return `M${r.x},${r.y}H${r.x + r.w - k}A${k},${r.h / 2} 0 0 1 ${r.x + r.w - k},${r.y + r.h}H${r.x}Z`; },
  },
  {
    id: 'multi-document', name: 'Multiple documents', category: 'flowchart', keyword: 'DOCS', w: 120, h: 80, outline: () => 'rect',
    path: (r) => { const o = 8, wv = r.h * 0.11, x = r.x, y = r.y + 2 * o, w = r.w - 2 * o, h = r.h - 2 * o; return `M${x},${y}H${x + w}V${y + h - wv}C${x + w * 0.75},${y + h - wv * 3} ${x + w * 0.3},${y + h + wv * 1.2} ${x},${y + h - wv}Z`; },
    extra: (r) => { const o = 8; return `M${r.x + o},${r.y + 2 * o}V${r.y + o}H${r.x + r.w - o}V${r.y + r.h - 3 * o}H${r.x + r.w - 2 * o}M${r.x + 2 * o},${r.y + o}V${r.y}H${r.x + r.w}V${r.y + r.h - 4 * o}H${r.x + r.w - o}`; },
  },
  polyShape('off-page', 'Off-page link', 'flowchart', 'OFFPAGE', 70, 70, unitPoly([[0, 0], [1, 0], [1, 0.65], [0.5, 1], [0, 0.65]])),
  { id: 'connector', name: 'On-page link', category: 'flowchart', keyword: 'CONN', w: 44, h: 44, path: ellipsePath, outline: () => 'ellipse' },
  polyShape('merge', 'Merge', 'flowchart', 'MERGE', 80, 64, unitPoly([[0, 0], [1, 0], [0.5, 1]])),
  { id: 'or', name: 'Or', category: 'flowchart', keyword: 'OR', w: 50, h: 50, path: ellipsePath, outline: () => 'ellipse', extra: (r) => `M${r.x + r.w / 2},${r.y}V${r.y + r.h}M${r.x},${r.y + r.h / 2}H${r.x + r.w}` },
  { id: 'summing', name: 'Summing junction', category: 'flowchart', keyword: 'SUM', w: 50, h: 50, path: ellipsePath, outline: () => 'ellipse', extra: (r) => { const k = 0.146; return `M${r.x + r.w * k},${r.y + r.h * k}L${r.x + r.w * (1 - k)},${r.y + r.h * (1 - k)}M${r.x + r.w * (1 - k)},${r.y + r.h * k}L${r.x + r.w * k},${r.y + r.h * (1 - k)}`; } },
  {
    id: 'internal-storage', name: 'Internal storage', category: 'flowchart', keyword: 'STORE', w: 90, h: 70, path: (r) => rectPath(r), outline: () => 'rect',
    extra: (r) => `M${r.x + 14},${r.y}V${r.y + r.h}M${r.x},${r.y + 14}H${r.x + r.w}`,
  },
  {
    id: 'stored-data', name: 'Stored data', category: 'flowchart', keyword: 'STORED', w: 120, h: 60, outline: () => 'rect',
    path: (r) => { const k = r.w * 0.12; return `M${r.x + k},${r.y}H${r.x + r.w}Q${r.x + r.w - k * 1.4},${r.y + r.h / 2} ${r.x + r.w},${r.y + r.h}H${r.x + k}Q${r.x - k * 0.4},${r.y + r.h / 2} ${r.x + k},${r.y}Z`; },
  },
  {
    id: 'display', name: 'Display', category: 'flowchart', keyword: 'DISPLAY', w: 120, h: 60, outline: () => 'rect',
    path: (r) => { const k = r.w * 0.15; return `M${r.x},${r.y + r.h / 2}L${r.x + k},${r.y}H${r.x + r.w - k}Q${r.x + r.w},${r.y} ${r.x + r.w},${r.y + r.h / 2}Q${r.x + r.w},${r.y + r.h} ${r.x + r.w - k},${r.y + r.h}H${r.x + k}Z`; },
  },

  // ── Arrows ──
  polyShape('arrow-right', 'Arrow right', 'arrows', 'ARR', 120, 60, (r) => arrowPts(r, 'r')),
  polyShape('arrow-left', 'Arrow left', 'arrows', 'ARL', 120, 60, (r) => arrowPts(r, 'l')),
  polyShape('arrow-up', 'Arrow up', 'arrows', 'ARU', 60, 120, (r) => arrowPts(r, 'u')),
  polyShape('arrow-down', 'Arrow down', 'arrows', 'ARD', 60, 120, (r) => arrowPts(r, 'd')),
  polyShape('arrow-lr', 'Double arrow', 'arrows', 'ARLR', 140, 60, (r) => doubleArrowPts(r, true)),
  polyShape('arrow-ud', 'Double arrow (vertical)', 'arrows', 'ARUD', 60, 140, (r) => doubleArrowPts(r, false)),
  polyShape('chevron', 'Chevron', 'arrows', 'CHEV', 110, 60, unitPoly([[0, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0, 1], [0.25, 0.5]])),
  polyShape('tag', 'Tag / step', 'arrows', 'TAG', 120, 60, unitPoly([[0, 0], [0.78, 0], [1, 0.5], [0.78, 1], [0, 1]])),

  // ── Containers ──
  {
    id: 'container', name: 'Container', category: 'containers', keyword: 'BOX', w: 380, h: 260, label: 'header', container: true,
    path: (r) => rectPath(r, 8), outline: () => 'rect', extra: (r) => `M${r.x},${r.y + 32}H${r.x + r.w}`,
  },
  {
    id: 'frame', name: 'Frame / group', category: 'containers', keyword: 'FRAME', w: 380, h: 260, label: 'header', container: true,
    path: (r) => rectPath(r, 10), outline: () => 'rect',
  },
  {
    id: 'swimlane', name: 'Swimlane', category: 'containers', keyword: 'LANE', w: 520, h: 180, label: 'side', container: true,
    path: (r) => rectPath(r), outline: () => 'rect', extra: (r) => `M${r.x + 34},${r.y}V${r.y + r.h}`,
  },
  {
    id: 'pool', name: 'Pool (vertical lane)', category: 'containers', keyword: 'POOL', w: 220, h: 420, label: 'header', container: true,
    path: (r) => rectPath(r), outline: () => 'rect', extra: (r) => `M${r.x},${r.y + 34}H${r.x + r.w}`,
  },

  // ── People & misc ──
  {
    id: 'actor', name: 'Actor', category: 'misc', keyword: 'ACTOR', w: 44, h: 84, label: 'below', outline: () => 'rect', open: true,
    // line figure, no face features
    path: (r) => {
      const cx = r.x + r.w / 2, hr = Math.min(r.w, r.h) * 0.2;
      return `M${cx + hr},${r.y + hr}A${hr},${hr} 0 1 1 ${cx - hr},${r.y + hr}A${hr},${hr} 0 1 1 ${cx + hr},${r.y + hr}Z`;
    },
    extra: (r) => {
      const cx = r.x + r.w / 2, hr = Math.min(r.w, r.h) * 0.2, neck = r.y + 2 * hr, hip = r.y + r.h * 0.66;
      return `M${cx},${neck}V${hip}M${r.x},${r.y + r.h * 0.4}H${r.x + r.w}M${cx},${hip}L${r.x + r.w * 0.08},${r.y + r.h}M${cx},${hip}L${r.x + r.w * 0.92},${r.y + r.h}`;
    },
  },
  {
    id: 'person', name: 'Person', category: 'misc', keyword: 'USER', w: 60, h: 64, label: 'below', outline: () => 'rect',
    path: (r) => {
      const cx = r.x + r.w / 2, hr = r.w * 0.22;
      const head = `M${cx + hr},${r.y + hr}A${hr},${hr} 0 1 1 ${cx - hr},${r.y + hr}A${hr},${hr} 0 1 1 ${cx + hr},${r.y + hr}Z`;
      const body = `M${r.x},${r.y + r.h}V${r.y + r.h * 0.82}Q${r.x},${r.y + r.h * 0.5} ${cx},${r.y + r.h * 0.5}Q${r.x + r.w},${r.y + r.h * 0.5} ${r.x + r.w},${r.y + r.h * 0.82}V${r.y + r.h}Z`;
      return head + body;
    },
  },
  {
    id: 'brace-left', name: 'Brace {', category: 'misc', keyword: 'BRACE', w: 30, h: 120, outline: () => 'rect', open: true,
    path: (r) => { const x = r.x, w = r.w, y = r.y, h = r.h; return `M${x + w},${y}Q${x + w * 0.45},${y} ${x + w * 0.45},${y + h * 0.12}V${y + h * 0.38}Q${x + w * 0.45},${y + h / 2} ${x},${y + h / 2}Q${x + w * 0.45},${y + h / 2} ${x + w * 0.45},${y + h * 0.62}V${y + h * 0.88}Q${x + w * 0.45},${y + h} ${x + w},${y + h}`; },
  },
  {
    id: 'brace-right', name: 'Brace }', category: 'misc', keyword: 'BRACE', w: 30, h: 120, outline: () => 'rect', open: true,
    path: (r) => { const x = r.x, w = r.w, y = r.y, h = r.h; return `M${x},${y}Q${x + w * 0.55},${y} ${x + w * 0.55},${y + h * 0.12}V${y + h * 0.38}Q${x + w * 0.55},${y + h / 2} ${x + w},${y + h / 2}Q${x + w * 0.55},${y + h / 2} ${x + w * 0.55},${y + h * 0.62}V${y + h * 0.88}Q${x + w * 0.55},${y + h} ${x},${y + h}`; },
  },
  {
    id: 'bracket', name: 'Bracket [ ]', category: 'misc', keyword: 'BRACKET', w: 120, h: 80, outline: () => 'rect', open: true,
    path: (r) => `M${r.x + 12},${r.y}H${r.x}V${r.y + r.h}H${r.x + 12}M${r.x + r.w - 12},${r.y}H${r.x + r.w}V${r.y + r.h}H${r.x + r.w - 12}`,
  },
  {
    id: 'hline', name: 'Divider', category: 'misc', keyword: 'HR', w: 160, h: 10, outline: () => 'rect', open: true,
    path: (r) => `M${r.x},${r.y + r.h / 2}H${r.x + r.w}`,
  },
];

const byId = new Map(BASIC_SHAPES.map((s) => [s.id, s]));
export const basicShape = (id?: string): BasicShape => byId.get(id ?? '') ?? BASIC_SHAPES[0];
export const isContainerShape = (id?: string) => !!byId.get(id ?? '')?.container;
