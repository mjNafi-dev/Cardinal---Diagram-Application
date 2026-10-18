import type { DNode, Field, Pt, Rect, Side } from '../model/types';
import { basicShape, isContainerShape } from '../model/basicShapes';
import { FONT_STACKS, type Prefs } from '../model/prefs';
import { logicSize } from '../model/logic';

// ───────────────────────── Text measuring ─────────────────────────

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();
let fontEpoch = 0;

/** Called when web fonts finish loading so sizes are re-measured. */
export function invalidateTextCache() {
  cache.clear();
  fontEpoch++;
}
export const getFontEpoch = () => fontEpoch;

export function textWidth(text: string, size: number, weight: number, family: string): number {
  const key = `${size}|${weight}|${family}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * size * 0.55;
  ctx.font = `${weight} ${size}px ${family}`;
  const w = ctx.measureText(text).width;
  cache.set(key, w);
  return w;
}

export function wrapText(text: string, maxW: number, size: number, weight: number, family: string): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const next = line + w;
      if (line && textWidth(next.trimEnd(), size, weight, family) > maxW) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else line = next;
    }
    out.push(line.trimEnd());
  }
  return out;
}

// ───────────────────────── Node layout ─────────────────────────

export interface TableMetrics {
  headerH: number;
  rowH: number;
  keyW: number;
}

/** What the key column shows for a row: PK, FK, UQ (unique). */
export function keyLabel(f: Field): string {
  const parts: string[] = [];
  if (f.pk) parts.push('PK');
  if (f.fk) parts.push('FK');
  if (f.unique && !f.pk) parts.push('UQ');
  return parts.join(' ');
}

export function tableMetrics(prefs: Prefs, n?: DNode): TableMetrics {
  const fs = n?.style?.fontSize ?? prefs.text.bodySize;
  const labels = (n?.fields ?? []).map((f) => keyLabel(f).length);
  const longest = Math.max(2, ...labels);
  // no keys anywhere → the key column disappears (it shows again in the row editor)
  const anyKey = labels.some((l) => l > 0);
  return {
    headerH: Math.round(prefs.text.titleSize * 2.5),
    rowH: Math.round(fs * 2.05),
    keyW: n?.variant === 'enum' || !anyKey ? 4 : longest <= 2 ? Math.round(fs * 2.7) : Math.round(fs * (1.2 + longest * 0.55)),
  };
}

/** Key used for outlines: 'shape:<id>' for general shapes, otherwise the node kind. */
export const shapeKey = (n: Pick<DNode, 'kind' | 'shape'>) => (n.kind === 'shape' ? 'shape:' + (n.shape ?? 'rect') : n.kind);
export const isContainer = (n: Pick<DNode, 'kind' | 'shape'>) => n.kind === 'shape' && isContainerShape(n.shape);
/** Free-floating things lines don't route around. */
export const isOverlayish = (n: Pick<DNode, 'kind' | 'shape'>) => isContainer(n) || n.kind === 'comment' || n.kind === 'drawing';

export const isDiamond = (k: string) => k === 'relationship' || k === 'identifying-relationship';
export const isEllipse = (k: string) =>
  k === 'attribute' || k === 'key-attribute' || k === 'partial-key-attribute' || k === 'multivalued-attribute' || k === 'derived-attribute';
export const isCircle = (k: string) => k === 'specialization';
/** Does this outline differ from its bounding box? (ports get spread less on those) */
export const isRoundish = (key: string) => isDiamond(key) || isEllipse(key) || isCircle(key) || (key.startsWith('shape:') && basicShape(key.slice(6)).outline({ x: 0, y: 0, w: 1, h: 1 }) !== 'rect');
/** Relationship-like nodes that don't count as a "hop" for hover focus. */
export const isPassThrough = (k: string) => isDiamond(k) || k === 'specialization' || k === 'isa';

/** Can this node's height be resized by the user? (tables grow with their rows) */
export const canResizeH = (n: DNode) => n.kind !== 'table' && n.kind !== 'text' && n.kind !== 'specialization' && n.kind !== 'comment' && n.kind !== 'logic';
export const canResizeW = (n: DNode) => n.kind !== 'text' && n.kind !== 'specialization' && n.kind !== 'comment' && n.kind !== 'logic';

export function nodeRect(n: DNode, prefs: Prefs): Rect {
  const fam = FONT_STACKS[prefs.text.font].css;
  const t = prefs.text;
  const tw = (s: string, size = t.titleSize, weight = t.titleWeight) => textWidth(s, size, weight, fam);
  let w: number, h: number;
  switch (n.kind) {
    case 'table': {
      const m = tableMetrics(prefs, n);
      const fs = n.style?.fontSize ?? t.bodySize;
      let rowW = 0;
      for (const f of n.fields ?? []) {
        const nameW = textWidth(f.name || ' ', fs, 450, fam);
        const typeW = t.typeColumn && f.type ? textWidth(f.type, fs - 1, 400, fam) + 20 : 0;
        rowW = Math.max(rowW, m.keyW + nameW + typeW + 22);
      }
      const auto = Math.max(170, tw(n.text) + 44, rowW);
      w = n.w ? Math.max(n.w, 120) : Math.ceil(auto / 10) * 10;
      h = m.headerH + Math.max(1, n.fields?.length ?? 0) * m.rowH + 6;
      break;
    }
    case 'entity-simple':
    case 'entity':
    case 'weak-entity':
      w = n.w ?? Math.max(130, Math.ceil((tw(n.text) + 48) / 10) * 10);
      h = n.h ?? 56;
      break;
    case 'relationship':
    case 'identifying-relationship':
      w = n.w ?? Math.max(150, Math.ceil((tw(n.text) * 1.7 + 50) / 10) * 10);
      h = n.h ?? 80;
      break;
    case 'attribute':
    case 'key-attribute':
    case 'partial-key-attribute':
    case 'multivalued-attribute':
    case 'derived-attribute':
      w = n.w ?? Math.max(110, Math.ceil((textWidth(n.text, t.bodySize, 450, fam) + 48) / 10) * 10);
      h = n.h ?? 46;
      break;
    case 'specialization':
      w = h = 40;
      break;
    case 'isa':
      w = n.w ?? 84;
      h = n.h ?? 64;
      break;
    case 'text': {
      const lines = (n.text || ' ').split('\n');
      const size = n.style?.fontSize ?? t.bodySize + 1;
      w = Math.max(30, ...lines.map((l) => textWidth(l || ' ', size, 450, fam))) + 12;
      h = lines.length * size * 1.4 + 8;
      break;
    }
    case 'associative-entity':
      w = n.w ?? Math.max(160, Math.ceil((tw(n.text) * 1.5 + 60) / 10) * 10);
      h = n.h ?? 72;
      break;
    case 'shape': {
      const b = basicShape(n.shape);
      w = n.w ?? b.w;
      h = n.h ?? b.h;
      break;
    }
    case 'image':
      w = n.w ?? n.nw ?? 240;
      h = n.h ?? n.nh ?? 160;
      break;
    case 'drawing':
      w = n.w ?? n.nw ?? 10;
      h = n.h ?? n.nh ?? 10;
      break;
    case 'comment':
      w = h = 30;
      break;
    case 'logic':
      ({ w, h } = logicSize(n));
      break;
    case 'note':
    default:
      w = n.w ?? 190;
      h = n.h ?? 110;
  }
  return { x: n.x, y: n.y, w, h };
}

// ───────────────────────── Outlines ─────────────────────────

type Outline = { type: 'ellipse' } | { type: 'poly'; pts: Pt[] };

function outline(kind: string, r: Rect): Outline {
  if (kind.startsWith('shape:')) {
    const o = basicShape(kind.slice(6)).outline(r);
    if (o === 'ellipse') return { type: 'ellipse' };
    if (o !== 'rect') return { type: 'poly', pts: o };
    return { type: 'poly', pts: [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }] };
  }
  if (isEllipse(kind) || isCircle(kind)) return { type: 'ellipse' };
  if (isDiamond(kind))
    return { type: 'poly', pts: [{ x: r.x + r.w / 2, y: r.y }, { x: r.x + r.w, y: r.y + r.h / 2 }, { x: r.x + r.w / 2, y: r.y + r.h }, { x: r.x, y: r.y + r.h / 2 }] };
  if (kind === 'isa') return { type: 'poly', pts: [{ x: r.x + r.w / 2, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }] };
  return { type: 'poly', pts: [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }] };
}

/** Smallest t > eps where origin + t*dir hits the shape outline (or null). */
function rayHit(kind: string, r: Rect, o: Pt, d: Pt): number | null {
  const ol = outline(kind, r);
  if (ol.type === 'ellipse') {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, a = r.w / 2, b = r.h / 2;
    const ox = (o.x - cx) / a, oy = (o.y - cy) / b, dx = d.x / a, dy = d.y / b;
    const A = dx * dx + dy * dy, B = 2 * (ox * dx + oy * dy), C = ox * ox + oy * oy - 1;
    const disc = B * B - 4 * A * C;
    if (disc < 0 || A === 0) return null;
    const s = Math.sqrt(disc);
    const ts = [(-B - s) / (2 * A), (-B + s) / (2 * A)].filter((t) => t > 1e-6).sort((x, y) => x - y);
    return ts[0] ?? null;
  }
  let best: number | null = null;
  const pts = ol.pts;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const ex = q.x - p.x, ey = q.y - p.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p.x - o.x) * ey - (p.y - o.y) * ex) / den;
    const u = ((p.x - o.x) * d.y - (p.y - o.y) * d.x) / den;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && (best === null || t < best)) best = t;
  }
  return best;
}

export const SIDE_DIR: Record<Side, Pt> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/** Move a point on the bounding-box side inward until it touches the real outline (diamond, ellipse…). */
export function projectToOutline(kind: string, r: Rect, p: Pt, side: Side): Pt {
  const out = SIDE_DIR[side];
  const o = { x: p.x + out.x * 2, y: p.y + out.y * 2 };
  const t = rayHit(kind, r, o, { x: -out.x, y: -out.y });
  if (t === null) return p;
  return { x: o.x - out.x * t, y: o.y - out.y * t };
}

/** Where the straight line from the node center toward `toward` leaves the outline. */
export function boundaryToward(kind: string, r: Rect, toward: Pt): Pt {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const d = { x: toward.x - c.x, y: toward.y - c.y };
  if (Math.abs(d.x) + Math.abs(d.y) < 1e-6) return c;
  const t = rayHit(kind, r, c, d);
  if (t === null) return c;
  return { x: c.x + d.x * t, y: c.y + d.y * t };
}

export const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const inflate = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
export const rectsIntersect = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const pointInRect = (p: Pt, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
export function unionRects(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rs) {
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Nearest side of a rect to a point (used when an endpoint is dropped on a node). */
export function nearestSide(r: Rect, p: Pt): Side {
  const d = { top: Math.abs(p.y - r.y), bottom: Math.abs(p.y - (r.y + r.h)), left: Math.abs(p.x - r.x), right: Math.abs(p.x - (r.x + r.w)) };
  return (Object.keys(d) as Side[]).reduce((a, b) => (d[a] <= d[b] ? a : b));
}
