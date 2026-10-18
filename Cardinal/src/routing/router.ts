/**
 * Cardinal's connector router.
 *
 * Goals (the user's #1 feature): lines never pass through shapes, never lie on top of each other,
 * and always attach at sensible, distinct points — even as the diagram grows.
 *
 * Pipeline per frame:
 *   1. pick sides for every orthogonal edge (or use the side the user pinned)
 *   2. spread the ends sharing a side into distinct ports, ordered to avoid crossings
 *   3. A* over a sparse orthogonal grid built from nearby obstacles (bends + overlaps + crossings cost extra)
 *   4. nudge any collinear overlapping segments apart into parallel lanes
 *   5. build SVG paths with rounded corners and little hops where lines must cross
 */
import type { DEdge, DNode, Doc, Pt, Rect, Routing, Side } from '../model/types';
import type { Prefs } from '../model/prefs';
import { pinAt } from '../model/logic';
import { SIDE_DIR, boundaryToward, center, inflate, isOverlayish, isRoundish, projectToOutline, rectsIntersect, shapeKey, tableMetrics } from '../geometry/geometry';

export const STUB = 30; // straight run out of a shape (room for crow's-foot markers)
const MARGIN = 14; // clearance kept around shapes
const MIN_STUB = 22;
const BEND = 36;
const OVERLAP = 1.6; // cost per px of running on top of another line
const CROSS = 22;
const LANE = 10; // spacing between parallel lines after nudging
const HOP_R = 5;

export interface RoutedEdge {
  id: string;
  routing: Routing;
  points: Pt[]; // polyline (orthogonal/straight) or [p0, c1, c2, p3] for curved
  d: string;
  /** unit vectors pointing away from the attached shape, along the line */
  srcDir: Pt;
  tgtDir: Pt;
  start: Pt;
  end: Pt;
  mid: Pt;
  midAngle: number;
}

interface EndInfo {
  edge: DEdge;
  isSource: boolean;
  node: DNode;
  rect: Rect;
  side: Side;
  other: Pt; // center of the other end (for ordering)
  port?: Pt; // on the bbox side
  attach?: Pt; // on the real outline
  /** pinned to a table row — port is fixed, not distributed */
  fixed?: boolean;
  /** preferred spot along a pinned side (0..1) */
  pos?: number;
}

/** Center y of a table row, or null if the end isn't attached to a row. */
export function rowCenterY(n: DNode, r: Rect, fieldId: string | undefined, prefs: Prefs): number | null {
  if (!fieldId || n.kind !== 'table') return null;
  const m = tableMetrics(prefs, n);
  if (fieldId === '@header') return r.y + m.headerH / 2;
  const i = n.fields?.findIndex((f) => f.id === fieldId) ?? -1;
  if (i < 0) return null;
  return r.y + m.headerH + 3 + i * m.rowH + m.rowH / 2;
}

/** A fixed attachment point: a table row (side chosen to face the other shape) or a logic pin (side fixed). */
function fixedPort(n: DNode, r: Rect, ref: DEdge['source'], other: Rect, self: boolean, prefs: Prefs): { p: Pt; side: Side } | null {
  if (n.kind === 'logic') {
    const pin = pinAt(n, r, ref.field);
    return pin ? { p: { x: pin.x, y: pin.y }, side: pin.side } : null;
  }
  const y = rowCenterY(n, r, ref.field, prefs);
  if (y === null) return null;
  const side = rowSide(r, other, self, ref.side);
  return { p: { x: side === 'right' ? r.x + r.w : r.x, y }, side };
}

/** Which side a row-anchored end uses when the user didn't pick one: face the other shape. */
function rowSide(r: Rect, other: Rect, self: boolean, pinned?: Side): Side {
  if (pinned === 'left' || pinned === 'right') return pinned;
  if (self) return 'right';
  const gapX = Math.max(other.x - (r.x + r.w), r.x - (other.x + other.w));
  if (gapX < STUB * 2) return 'right'; // stacked: both lines leave on the same side and loop around
  return center(other).x >= center(r).x ? 'right' : 'left';
}

const DIRS: Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const sideToDir = (s: Side) => (s === 'right' ? 0 : s === 'bottom' ? 1 : s === 'left' ? 2 : 3);
const len = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const unit = (a: Pt, b: Pt): Pt => {
  const l = len(a, b) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
};

const CHEN_KINDS = new Set<DNode['kind']>([
  'entity', 'weak-entity', 'relationship', 'identifying-relationship', 'attribute', 'key-attribute',
  'partial-key-attribute', 'multivalued-attribute', 'derived-attribute', 'specialization', 'isa', 'associative-entity',
]);

export function edgeRouting(e: DEdge, a: DNode | undefined, b: DNode | undefined, prefs: Prefs): Routing {
  if (e.routing) return e.routing;
  if (a?.kind === 'logic' || b?.kind === 'logic') return 'orthogonal';
  if ((a && CHEN_KINDS.has(a.kind)) || (b && CHEN_KINDS.has(b.kind))) return prefs.line.routingChen;
  return prefs.line.routingCrowsFoot;
}

// ───────────────────────── side choice ─────────────────────────

function chooseSides(a: Rect, b: Rect, self: boolean): [Side, Side] {
  if (self) return ['right', 'top'];
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  const ca = center(a), cb = center(b);
  const need = STUB * 2 + 4;
  // shapes side by side whose edges overlap can face each other even when close (a straight line fits)
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const needX = overlapY > 28 ? 22 : need, needY = overlapX > 28 ? 22 : need;
  if (gapX >= gapY && gapX > needX) return cb.x > ca.x ? ['right', 'left'] : ['left', 'right'];
  if (gapY > needY) return cb.y > ca.y ? ['bottom', 'top'] : ['top', 'bottom'];
  if (gapX > need) return cb.x > ca.x ? ['right', 'left'] : ['left', 'right'];
  // Close or overlapping: leave one horizontally, enter the other vertically (an L), or go around.
  if (Math.abs(cb.x - ca.x) > Math.abs(cb.y - ca.y)) {
    return [cb.x > ca.x ? 'right' : 'left', cb.y > ca.y ? 'top' : 'bottom'];
  }
  return [cb.y > ca.y ? 'bottom' : 'top', cb.x > ca.x ? 'left' : 'right'];
}

// ───────────────────────── occupancy ─────────────────────────

class Occupancy {
  h = new Map<number, [number, number][]>();
  v = new Map<number, [number, number][]>();
  add(points: Pt[]) {
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i], q = points[i + 1];
      if (Math.abs(p.y - q.y) < 0.5) push(this.h, Math.round(p.y), Math.min(p.x, q.x), Math.max(p.x, q.x));
      else if (Math.abs(p.x - q.x) < 0.5) push(this.v, Math.round(p.x), Math.min(p.y, q.y), Math.max(p.y, q.y));
    }
  }
  overlap(map: Map<number, [number, number][]>, c: number, a: number, b: number) {
    const list = map.get(Math.round(c));
    if (!list) return 0;
    let s = 0;
    for (const [x, y] of list) s += Math.max(0, Math.min(b, y) - Math.max(a, x));
    return s;
  }
  crossed(map: Map<number, [number, number][]>, c: number, at: number) {
    const list = map.get(Math.round(c));
    if (!list) return false;
    for (const [x, y] of list) if (at > x + 0.5 && at < y - 0.5) return true;
    return false;
  }
}
function push(m: Map<number, [number, number][]>, k: number, a: number, b: number) {
  const l = m.get(k);
  if (l) l.push([a, b]);
  else m.set(k, [[a, b]]);
}

// ───────────────────────── A* on a sparse grid ─────────────────────────

function uniqSorted(vals: number[]): number[] {
  vals.sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of vals) if (!out.length || v - out[out.length - 1] > 0.5) out.push(v);
  return out;
}
function withMidpoints(vals: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < vals.length; i++) {
    out.push(vals[i]);
    if (i < vals.length - 1 && vals[i + 1] - vals[i] > 2 * LANE) out.push((vals[i] + vals[i + 1]) / 2);
  }
  return out;
}
function bsearch(arr: number[], v: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (Math.abs(arr[m] - v) < 0.6) return m;
    if (arr[m] < v) lo = m + 1;
    else hi = m - 1;
  }
  return -1;
}

class Heap {
  f: number[] = [];
  s: number[] = [];
  push(f: number, s: number) {
    const F = this.f, S = this.s;
    let i = F.length;
    F.push(f); S.push(s);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      F[i] = F[p]; S[i] = S[p]; i = p;
    }
    F[i] = f; S[i] = s;
  }
  pop(): number {
    const F = this.f, S = this.s;
    const top = S[0];
    const lf = F.pop()!, ls = S.pop()!;
    if (F.length) {
      let i = 0;
      const n = F.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mf = lf;
        if (l < n && F[l] < mf) { m = l; mf = F[l]; }
        if (r < n && F[r] < mf) { m = r; mf = F[r]; }
        if (m === i) break;
        F[i] = F[m]; S[i] = S[m]; i = m;
      }
      F[i] = lf; S[i] = ls;
    }
    return top;
  }
  get size() { return this.f.length; }
}

function astar(start: Pt, startDir: number, goal: Pt, goalDir: number, obstaclesAll: Rect[], occ: Occupancy, region: Rect): Pt[] | null {
  const strictlyIn = (p: Pt, o: Rect) => p.x > o.x + 0.5 && p.x < o.x + o.w - 0.5 && p.y > o.y + 0.5 && p.y < o.y + o.h - 0.5;
  // Obstacles that swallow an endpoint are ignored (shapes placed very close together).
  const obstacles = obstaclesAll.filter((o) => rectsIntersect(o, region) && !strictlyIn(start, o) && !strictlyIn(goal, o));

  const xs0 = [region.x, region.x + region.w, start.x, goal.x];
  const ys0 = [region.y, region.y + region.h, start.y, goal.y];
  for (const o of obstacles) {
    for (const x of [o.x, o.x + o.w]) if (x >= region.x && x <= region.x + region.w) xs0.push(x);
    for (const y of [o.y, o.y + o.h]) if (y >= region.y && y <= region.y + region.h) ys0.push(y);
  }
  const xs = withMidpoints(uniqSorted(xs0));
  const ys = withMidpoints(uniqSorted(ys0));
  const nx = xs.length, ny = ys.length;
  if (nx * ny > 40000) return null;

  const si = bsearch(xs, start.x), sj = bsearch(ys, start.y);
  const gi = bsearch(xs, goal.x), gj = bsearch(ys, goal.y);
  if (si < 0 || sj < 0 || gi < 0 || gj < 0) return null;

  const N = nx * ny;
  const hBlocked = new Uint8Array(N);
  const vBlocked = new Uint8Array(N);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      if (i < nx - 1) {
        const m = { x: (xs[i] + xs[i + 1]) / 2, y: ys[j] };
        for (const o of obstacles) if (strictlyIn(m, o)) { hBlocked[id] = 1; break; }
      }
      if (j < ny - 1) {
        const m = { x: xs[i], y: (ys[j] + ys[j + 1]) / 2 };
        for (const o of obstacles) if (strictlyIn(m, o)) { vBlocked[id] = 1; break; }
      }
    }
  }

  const S = N * 4;
  const g = new Float64Array(S).fill(Infinity);
  const parent = new Int32Array(S).fill(-1);
  const closed = new Uint8Array(S);
  const heap = new Heap();
  const startS = (sj * nx + si) * 4 + startDir;
  const goalId = gj * nx + gi;
  const reverseGoal = (goalDir + 2) % 4; // travelling outward from the target would mean coming through it
  g[startS] = 0;
  heap.push(Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y), startS);

  if (goalId === sj * nx + si) return [start];

  let found = -1;
  while (heap.size) {
    const s = heap.pop();
    if (closed[s]) continue;
    closed[s] = 1;
    const id = s >> 2, d = s & 3;
    if (id === goalId) { found = s; break; }
    const i = id % nx, j = (id - i) / nx;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === ((d + 2) & 3)) continue;
      let ni = i, nj = j, blocked = 0;
      if (nd === 0) { if (i >= nx - 1) continue; ni = i + 1; blocked = hBlocked[id]; }
      else if (nd === 2) { if (i <= 0) continue; ni = i - 1; blocked = hBlocked[id - 1]; }
      else if (nd === 1) { if (j >= ny - 1) continue; nj = j + 1; blocked = vBlocked[id]; }
      else { if (j <= 0) continue; nj = j - 1; blocked = vBlocked[id - nx]; }
      if (blocked) continue;
      const nid = nj * nx + ni;
      if (nid === goalId && nd === reverseGoal) continue;
      const x1 = xs[i], y1 = ys[j], x2 = xs[ni], y2 = ys[nj];
      let cost = Math.abs(x2 - x1) + Math.abs(y2 - y1);
      if (nd !== d) cost += BEND;
      if (nd === 0 || nd === 2) {
        cost += OVERLAP * occ.overlap(occ.h, y1, Math.min(x1, x2), Math.max(x1, x2));
        if (occ.crossed(occ.v, x2, y2)) cost += CROSS;
      } else {
        cost += OVERLAP * occ.overlap(occ.v, x1, Math.min(y1, y2), Math.max(y1, y2));
        if (occ.crossed(occ.h, y2, x2)) cost += CROSS;
      }
      if (nid === goalId && nd !== goalDir) cost += BEND;
      const ns = nid * 4 + nd;
      const ng = g[s] + cost;
      if (ng < g[ns]) {
        g[ns] = ng;
        parent[ns] = s;
        heap.push(ng + Math.abs(goal.x - x2) + Math.abs(goal.y - y2), ns);
      }
    }
  }
  if (found < 0) return null;
  const pts: Pt[] = [];
  for (let s = found; s >= 0; s = parent[s]) {
    const id = s >> 2;
    const i = id % nx, j = (id - i) / nx;
    pts.push({ x: xs[i], y: ys[j] });
  }
  return pts.reverse();
}

export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2], b = last!;
      const colinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - p.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - p.y) < 0.01);
      if (colinear) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

/** Cheap fallback route: out of the start, across the middle, into the goal. */
function fallbackRoute(start: Pt, sd: number, goal: Pt): Pt[] {
  if (sd === 0 || sd === 2) {
    const mx = (start.x + goal.x) / 2;
    return [start, { x: mx, y: start.y }, { x: mx, y: goal.y }, goal];
  }
  const my = (start.y + goal.y) / 2;
  return [start, { x: start.x, y: my }, { x: goal.x, y: my }, goal];
}

// ───────────────────────── nudging ─────────────────────────

function nudge(routes: Map<string, Pt[]>, obstacles: Rect[]) {
  for (const horizontal of [true, false]) {
    type Seg = { id: string; k: number; c: number; a: number; b: number; score: number };
    const segs: Seg[] = [];
    for (const [id, P] of routes) {
      for (let k = 1; k < P.length - 2; k++) {
        const p = P[k], q = P[k + 1];
        const isH = Math.abs(p.y - q.y) < 0.5 && Math.abs(p.x - q.x) > 0.5;
        const isV = Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) > 0.5;
        if (horizontal ? !isH : !isV) continue;
        const c = horizontal ? p.y : p.x;
        const a = horizontal ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
        const b = horizontal ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
        const prev = P[k - 1], next = P[k + 2];
        const score = horizontal ? (prev.y + next.y) / 2 : (prev.x + next.x) / 2;
        segs.push({ id, k, c, a, b, score });
      }
    }
    segs.sort((s, t) => s.c - t.c || s.a - t.a);
    // cluster: same coordinate + overlapping ranges
    const clusters: Seg[][] = [];
    let i = 0;
    while (i < segs.length) {
      let j = i;
      while (j + 1 < segs.length && Math.abs(segs[j + 1].c - segs[i].c) < 0.6) j++;
      const bucket = segs.slice(i, j + 1).sort((s, t) => s.a - t.a);
      let cur: Seg[] = [];
      let end = -Infinity;
      for (const s of bucket) {
        if (cur.length && s.a < end - 1) { cur.push(s); end = Math.max(end, s.b); }
        else { if (cur.length > 1) clusters.push(cur); cur = [s]; end = s.b; }
      }
      if (cur.length > 1) clusters.push(cur);
      i = j + 1;
    }
    for (const cl of clusters) {
      // only nudge if more than one edge is involved
      if (new Set(cl.map((s) => s.id)).size < 2) continue;
      const c = cl[0].c;
      const A = Math.min(...cl.map((s) => s.a)), B = Math.max(...cl.map((s) => s.b));
      let lo = -Infinity, hi = Infinity;
      for (const o of obstacles) {
        const oa = horizontal ? o.x : o.y, ob = horizontal ? o.x + o.w : o.y + o.h;
        if (ob <= A || oa >= B) continue;
        const oc1 = horizontal ? o.y : o.x, oc2 = horizontal ? o.y + o.h : o.x + o.w;
        if (oc2 <= c + 0.5) lo = Math.max(lo, oc2);
        if (oc1 >= c - 0.5) hi = Math.min(hi, oc1);
      }
      const free = Math.min(c - lo, hi - c);
      const n = cl.length;
      const spacing = Math.max(3, Math.min(LANE, (2 * free) / (n + 1)));
      cl.sort((s, t) => s.score - t.score);
      cl.forEach((s, idx) => {
        const nc = c + (idx - (n - 1) / 2) * spacing;
        const P = routes.get(s.id)!;
        // keep the stubs long enough
        if (s.k === 1) {
          const shift = nc - c;
          const p0 = P[0], p1 = P[1];
          const stubLen = horizontal ? (p1.y + shift - p0.y) * Math.sign(p1.y - p0.y || 1) : (p1.x + shift - p0.x) * Math.sign(p1.x - p0.x || 1);
          if (stubLen < MIN_STUB) return;
        }
        if (s.k + 1 === P.length - 2) {
          const shift = nc - c;
          const pe = P[P.length - 1], pl = P[P.length - 2];
          const stubLen = horizontal ? (pl.y + shift - pe.y) * Math.sign(pl.y - pe.y || 1) : (pl.x + shift - pe.x) * Math.sign(pl.x - pe.x || 1);
          if (stubLen < MIN_STUB) return;
        }
        if (horizontal) { P[s.k] = { ...P[s.k], y: nc }; P[s.k + 1] = { ...P[s.k + 1], y: nc }; }
        else { P[s.k] = { ...P[s.k], x: nc }; P[s.k + 1] = { ...P[s.k + 1], x: nc }; }
      });
    }
  }
}

// ───────────────────────── path building ─────────────────────────

function polyMid(P: Pt[]): { p: Pt; angle: number } {
  let total = 0;
  for (let i = 0; i < P.length - 1; i++) total += len(P[i], P[i + 1]);
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const l = len(P[i], P[i + 1]);
    if (acc + l >= total / 2 && l > 0) {
      const t = (total / 2 - acc) / l;
      return { p: { x: P[i].x + (P[i + 1].x - P[i].x) * t, y: P[i].y + (P[i + 1].y - P[i].y) * t }, angle: Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x) };
    }
    acc += l;
  }
  return { p: P[0] ?? { x: 0, y: 0 }, angle: 0 };
}

export function orthoPath(P: Pt[], radius: number, hops: Map<number, number[]> | undefined): string {
  if (P.length < 2) return '';
  const r: number[] = P.map((_, i) => {
    if (i === 0 || i === P.length - 1) return 0;
    return Math.min(radius, len(P[i - 1], P[i]) / 2, len(P[i], P[i + 1]) / 2);
  });
  let d = '';
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const u = unit(a, b);
    const s = { x: a.x + u.x * r[i], y: a.y + u.y * r[i] };
    const e = { x: b.x - u.x * r[i + 1], y: b.y - u.y * r[i + 1] };
    if (i === 0) d += `M${f(s.x)},${f(s.y)}`;
    const hs = hops?.get(i);
    if (hs && Math.abs(u.y) < 0.01) {
      const dir = u.x > 0 ? 1 : -1;
      const sorted = [...hs].sort((x, y) => (x - y) * dir);
      for (const hx of sorted) {
        const x1 = hx - dir * HOP_R, x2 = hx + dir * HOP_R;
        if ((x1 - s.x) * dir < 1 || (e.x - x2) * dir < 1) continue;
        d += `L${f(x1)},${f(a.y)}A${HOP_R},${HOP_R} 0 0 ${dir > 0 ? 1 : 0} ${f(x2)},${f(a.y)}`;
      }
    }
    d += `L${f(e.x)},${f(e.y)}`;
    if (i < P.length - 2 && r[i + 1] > 0) {
      const c = P[i + 1];
      const u2 = unit(c, P[i + 2]);
      d += `Q${f(c.x)},${f(c.y)} ${f(c.x + u2.x * r[i + 1])},${f(c.y + u2.y * r[i + 1])}`;
    }
  }
  return d;
}
const f = (n: number) => (Math.round(n * 10) / 10).toString();

// ───────────────────────── main entry ─────────────────────────

export interface RouteInput {
  doc: Doc;
  rects: Map<string, Rect>;
  prefs: Prefs;
  /** nodes being dragged right now — only edges near them are re-routed */
  moving?: Set<string>;
}

interface CacheEntry {
  sig: string;
  points: Pt[];
  bbox: Rect;
}

export class Router {
  private cache = new Map<string, CacheEntry>();

  route({ doc, rects, prefs, moving }: RouteInput): Map<string, RoutedEdge> {
    const nodesById = new Map(doc.nodes.map((n) => [n.id, n]));
    const out = new Map<string, RoutedEdge>();
    const orthoEnds: EndInfo[] = [];
    const orthoEdges: { e: DEdge; s: EndInfo; t: EndInfo }[] = [];
    const free: DEdge[] = [];

    // 1. classify edges and choose sides
    for (const e of doc.edges) {
      const a = e.source.node ? nodesById.get(e.source.node) : undefined;
      const b = e.target.node ? nodesById.get(e.target.node) : undefined;
      const routing = edgeRouting(e, a, b, prefs);
      if (!a || !b) { free.push(e); continue; }
      const ra = rects.get(a.id)!, rb = rects.get(b.id)!;
      if (routing !== 'orthogonal') {
        out.set(e.id, this.routeDirect(e, a, ra, b, rb, routing, prefs));
        continue;
      }
      const self = a.id === b.id;
      let [sa, sb] = chooseSides(ra, rb, self);
      if (e.source.side) sa = e.source.side;
      if (e.target.side) sb = e.target.side;
      const fa = fixedPort(a, ra, e.source, rb, self, prefs);
      const fb = fixedPort(b, rb, e.target, ra, self, prefs);
      if (fa) sa = fa.side;
      if (fb) sb = fb.side;
      if (self && sa === sb && !fa && !fb) sb = sa === 'top' ? 'right' : 'top';
      const s: EndInfo = { edge: e, isSource: true, node: a, rect: ra, side: sa, other: center(rb), pos: e.source.side === sa ? e.source.pos : undefined };
      const t: EndInfo = { edge: e, isSource: false, node: b, rect: rb, side: sb, other: center(ra), pos: e.target.side === sb ? e.target.pos : undefined };
      for (const [end, fp] of [[s, fa], [t, fb]] as const) {
        if (!fp) continue;
        end.fixed = true;
        end.port = fp.p;
        end.attach = end.port;
      }
      orthoEnds.push(s, t);
      orthoEdges.push({ e, s, t });
    }

    // 2. distribute ports along each side
    const bySide = new Map<string, EndInfo[]>();
    for (const end of orthoEnds) {
      if (end.fixed) continue;
      const k = end.node.id + ':' + end.side;
      const l = bySide.get(k);
      if (l) l.push(end);
      else bySide.set(k, [end]);
    }
    for (const list of bySide.values()) {
      const { rect, side, node } = list[0];
      const horiz = side === 'top' || side === 'bottom';
      // order: a chosen spot (pos) or else where the other end is — both as a coordinate along this side
      const key = (end: EndInfo) =>
        end.pos !== undefined ? (horiz ? rect.x + end.pos * rect.w : rect.y + end.pos * rect.h) : horiz ? end.other.x : end.other.y;
      list.sort((p, q) => key(p) - key(q) || (p.edge.id < q.edge.id ? -1 : 1));
      const L = horiz ? rect.w : rect.h;
      // spread evenly: 1 line → middle, 2 → thirds, 3 → quarters… (rounder shapes use their middle half)
      const span = isRoundish(shapeKey(node)) ? L * 0.5 : L;
      const n = list.length;
      const c = center(rect);
      list.forEach((end, i) => {
        const off = -span / 2 + (span * (i + 1)) / (n + 1);
        const p =
          side === 'top' ? { x: c.x + off, y: rect.y } :
          side === 'bottom' ? { x: c.x + off, y: rect.y + rect.h } :
          side === 'left' ? { x: rect.x, y: c.y + off } :
          { x: rect.x + rect.w, y: c.y + off };
        end.port = p;
        end.attach = projectToOutline(shapeKey(node), rect, p, side);
      });
    }

    // 2b. two shapes facing each other with one line between them: line the ports up for a straight run
    for (const { s, t } of orthoEdges) {
      if (s.node.id === t.node.id || (s.fixed && t.fixed)) continue;
      const opposite =
        (s.side === 'right' && t.side === 'left') || (s.side === 'left' && t.side === 'right') ||
        (s.side === 'top' && t.side === 'bottom') || (s.side === 'bottom' && t.side === 'top');
      if (!opposite) continue;
      const alone = (end: EndInfo) => end.fixed || bySide.get(end.node.id + ':' + end.side)?.length === 1;
      if (!alone(s) || !alone(t)) continue;
      const horiz = s.side === 'right' || s.side === 'left';
      const pad = 14;
      const range = (end: EndInfo): [number, number] => {
        if (end.fixed) { const v = horiz ? end.port!.y : end.port!.x; return [v, v]; }
        return horiz ? [end.rect.y + pad, end.rect.y + end.rect.h - pad] : [end.rect.x + pad, end.rect.x + end.rect.w - pad];
      };
      const [a1, a2] = range(s), [b1, b2] = range(t);
      const lo = Math.max(a1, b1), hi = Math.min(a2, b2);
      if (lo > hi) continue;
      const fixedEnd = s.fixed ? s : t.fixed ? t : null;
      const want = fixedEnd ? (horiz ? fixedEnd.port!.y : fixedEnd.port!.x) : horiz ? (s.port!.y + t.port!.y) / 2 : (s.port!.x + t.port!.x) / 2;
      const v = Math.round(Math.max(lo, Math.min(hi, want)));
      for (const end of [s, t]) {
        if (end.fixed) continue;
        end.port = horiz ? { x: end.port!.x, y: v } : { x: v, y: end.port!.y };
        end.attach = projectToOutline(shapeKey(end.node), end.rect, end.port, end.side);
      }
    }

    // 3. route (unaffected edges reuse last frame while dragging)
    const obstacles: Rect[] = doc.nodes.filter((n) => !isOverlayish(n)).map((n) => inflate(rects.get(n.id)!, MARGIN));
    const movingRects = moving ? [...moving].map((id) => rects.get(id)).filter(Boolean).map((r) => inflate(r!, MARGIN + 40)) : [];
    const occ = new Occupancy();
    const routes = new Map<string, Pt[]>();
    const todo: { e: DEdge; s: EndInfo; t: EndInfo; sig: string }[] = [];

    for (const oe of orthoEdges) {
      const { e, s, t } = oe;
      const sig = `${f(s.port!.x)},${f(s.port!.y)},${s.side}|${f(t.port!.x)},${f(t.port!.y)},${t.side}`;
      const prev = this.cache.get(e.id);
      const affected =
        !moving || !prev || prev.sig !== sig ||
        moving.has(s.node.id) || moving.has(t.node.id) ||
        movingRects.some((r) => rectsIntersect(r, prev.bbox));
      if (!affected && prev) {
        routes.set(e.id, prev.points.map((p) => ({ ...p })));
        occ.add(prev.points);
      } else todo.push({ ...oe, sig });
    }
    todo.sort((p, q) => {
      const lp = Math.abs(p.s.port!.x - p.t.port!.x) + Math.abs(p.s.port!.y - p.t.port!.y);
      const lq = Math.abs(q.s.port!.x - q.t.port!.x) + Math.abs(q.s.port!.y - q.t.port!.y);
      return lp - lq;
    });

    const allBox = obstacles.length
      ? obstacles.reduce((acc, r) => ({ x: Math.min(acc.x, r.x), y: Math.min(acc.y, r.y), w: 0, h: 0 }), { x: Infinity, y: Infinity, w: 0, h: 0 })
      : { x: 0, y: 0, w: 0, h: 0 };
    let maxX = -Infinity, maxY = -Infinity;
    for (const r of obstacles) { maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h); }
    const world: Rect = { x: allBox.x - 120, y: allBox.y - 120, w: maxX - allBox.x + 240, h: maxY - allBox.y + 240 };

    for (const { e, s, t, sig } of todo) {
      const sd = sideToDir(s.side), td = sideToDir(t.side);
      // facing ports on one line with nothing in between → just a straight line
      if ((sd + 2) % 4 === td && s.node.id !== t.node.id) {
        const a = s.attach!, b = t.attach!;
        const aligned = sd % 2 === 0 ? Math.abs(a.y - b.y) < 0.5 : Math.abs(a.x - b.x) < 0.5;
        const forward = sd === 0 ? b.x > a.x : sd === 2 ? b.x < a.x : sd === 1 ? b.y > a.y : b.y < a.y;
        if (aligned && forward) {
          const seg = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) || 1, h: Math.abs(a.y - b.y) || 1 };
          const blocked = doc.nodes.some((n) => n.id !== s.node.id && n.id !== t.node.id && !isOverlayish(n) && rectsIntersect(inflate(rects.get(n.id)!, 4), seg));
          if (!blocked) {
            const pts = [a, b];
            routes.set(e.id, pts);
            occ.add(pts);
            this.cache.set(e.id, { sig, points: pts.map((p) => ({ ...p })), bbox: { ...seg } });
            continue;
          }
        }
      }
      const ss = { x: s.port!.x + DIRS[sd].x * STUB, y: s.port!.y + DIRS[sd].y * STUB };
      const ts = { x: t.port!.x + DIRS[td].x * STUB, y: t.port!.y + DIRS[td].y * STUB };
      const goalDir = (td + 2) % 4; // final travel direction into the target
      const box = {
        x: Math.min(ss.x, ts.x, s.rect.x, t.rect.x) - 160,
        y: Math.min(ss.y, ts.y, s.rect.y, t.rect.y) - 160,
        w: 0, h: 0,
      };
      box.w = Math.max(ss.x, ts.x, s.rect.x + s.rect.w, t.rect.x + t.rect.w) + 160 - box.x;
      box.h = Math.max(ss.y, ts.y, s.rect.y + s.rect.h, t.rect.y + t.rect.h) + 160 - box.y;
      let path = astar(ss, sd, ts, goalDir, obstacles, occ, box) ?? astar(ss, sd, ts, goalDir, obstacles, occ, world);
      if (!path) path = fallbackRoute(ss, sd, ts);
      const pts = simplify([s.attach!, ...path, t.attach!]);
      routes.set(e.id, pts);
      occ.add(pts);
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
      this.cache.set(e.id, { sig, points: pts.map((p) => ({ ...p })), bbox: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } });
    }

    // 4. separate overlapping parallel runs (skip while dragging for speed)
    if (!moving) nudge(routes, doc.nodes.filter((n) => !isOverlayish(n)).map((n) => inflate(rects.get(n.id)!, 3)));
    for (const [id, P] of routes) routes.set(id, simplify(P));

    // free-ended edges (being attached, or dropped from the library)
    for (const e of free) out.set(e.id, this.routeFree(e, nodesById, rects, prefs));

    // 5. hops where horizontal runs cross vertical runs of other edges
    const hopsByEdge = new Map<string, Map<number, number[]>>();
    if (prefs.line.hops) {
      const vsegs: { id: string; x: number; a: number; b: number }[] = [];
      for (const [id, P] of routes) {
        for (let i = 0; i < P.length - 1; i++) {
          const p = P[i], q = P[i + 1];
          if (Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) > 0.5) vsegs.push({ id, x: p.x, a: Math.min(p.y, q.y), b: Math.max(p.y, q.y) });
        }
      }
      for (const [id, P] of routes) {
        for (let i = 0; i < P.length - 1; i++) {
          const p = P[i], q = P[i + 1];
          if (Math.abs(p.y - q.y) > 0.5) continue;
          const xa = Math.min(p.x, q.x), xb = Math.max(p.x, q.x);
          for (const v of vsegs) {
            if (v.id === id) continue;
            if (v.x > xa + HOP_R + 2 && v.x < xb - HOP_R - 2 && p.y > v.a + 1 && p.y < v.b - 1) {
              let m = hopsByEdge.get(id);
              if (!m) hopsByEdge.set(id, (m = new Map()));
              const l = m.get(i);
              if (l) l.push(v.x);
              else m.set(i, [v.x]);
            }
          }
        }
      }
    }

    for (const { e } of orthoEdges) {
      const P = routes.get(e.id)!;
      const mid = polyMid(P);
      out.set(e.id, {
        id: e.id,
        routing: 'orthogonal',
        points: P,
        d: orthoPath(P, prefs.line.cornerRadius, hopsByEdge.get(e.id)),
        srcDir: unit(P[0], P[1] ?? P[0]),
        tgtDir: unit(P[P.length - 1], P[P.length - 2] ?? P[P.length - 1]),
        start: P[0],
        end: P[P.length - 1],
        mid: mid.p,
        midAngle: mid.angle,
      });
    }

    // forget deleted edges
    if (!moving) for (const id of [...this.cache.keys()]) if (!routes.has(id)) this.cache.delete(id);
    return out;
  }

  private routeDirect(e: DEdge, a: DNode, ra: Rect, b: DNode, rb: Rect, routing: Routing, prefs?: Prefs): RoutedEdge {
    if (prefs) {
      const self = a.id === b.id;
      const fa = fixedPort(a, ra, e.source, rb, self, prefs), fb = fixedPort(b, rb, e.target, ra, self, prefs);
      if (fa || fb) {
        const sa = fa?.side ?? null, sb = fb?.side ?? null;
        const p0 = fa ? fa.p : boundaryToward(shapeKey(a), ra, center(rb));
        const p3 = fb ? fb.p : boundaryToward(shapeKey(b), rb, p0);
        if (routing === 'straight') {
          const mid = polyMid([p0, p3]);
          return { id: e.id, routing, points: [p0, p3], d: `M${f(p0.x)},${f(p0.y)}L${f(p3.x)},${f(p3.y)}`, srcDir: unit(p0, p3), tgtDir: unit(p3, p0), start: p0, end: p3, mid: mid.p, midAngle: mid.angle };
        }
        const k = Math.max(40, len(p0, p3) * 0.35);
        const na = sa ? SIDE_DIR[sa] : normalAt(ra, p0), nb = sb ? SIDE_DIR[sb] : normalAt(rb, p3);
        return this.curveResult(e.id, p0, { x: p0.x + na.x * k, y: p0.y + na.y * k }, { x: p3.x + nb.x * k, y: p3.y + nb.y * k }, p3);
      }
    }
    const sidePoint = (n: DNode, r: Rect, side: Side) => {
      const c = center(r);
      const p = side === 'top' ? { x: c.x, y: r.y } : side === 'bottom' ? { x: c.x, y: r.y + r.h } : side === 'left' ? { x: r.x, y: c.y } : { x: r.x + r.w, y: c.y };
      return projectToOutline(shapeKey(n), r, p, side);
    };
    if (a.id === b.id) {
      // self loop as a small curve on the top-right corner
      const p0 = sidePoint(a, ra, 'right'), p3 = sidePoint(a, ra, 'top');
      const c1 = { x: p0.x + 50, y: p0.y }, c2 = { x: p3.x, y: p3.y - 50 };
      return this.curveResult(e.id, p0, c1, c2, p3);
    }
    const ca = center(ra), cb = center(rb);
    const p0 = e.source.side ? sidePoint(a, ra, e.source.side) : boundaryToward(shapeKey(a), ra, e.target.side ? sidePoint(b, rb, e.target.side) : cb);
    const p3 = e.target.side ? sidePoint(b, rb, e.target.side) : boundaryToward(shapeKey(b), rb, e.source.side ? p0 : ca);
    if (routing === 'straight') {
      const mid = polyMid([p0, p3]);
      return { id: e.id, routing, points: [p0, p3], d: `M${f(p0.x)},${f(p0.y)}L${f(p3.x)},${f(p3.y)}`, srcDir: unit(p0, p3), tgtDir: unit(p3, p0), start: p0, end: p3, mid: mid.p, midAngle: mid.angle };
    }
    // curved: leave along the outward normal of the nearest side
    const k = Math.max(40, len(p0, p3) * 0.35);
    const na = normalAt(ra, p0), nb = normalAt(rb, p3);
    return this.curveResult(e.id, p0, { x: p0.x + na.x * k, y: p0.y + na.y * k }, { x: p3.x + nb.x * k, y: p3.y + nb.y * k }, p3);
  }

  private curveResult(id: string, p0: Pt, c1: Pt, c2: Pt, p3: Pt): RoutedEdge {
    const at = (t: number): Pt => {
      const u = 1 - t;
      return {
        x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
      };
    };
    const m = at(0.5), m2 = at(0.52);
    return {
      id, routing: 'curved', points: [p0, c1, c2, p3],
      d: `M${f(p0.x)},${f(p0.y)}C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p3.x)},${f(p3.y)}`,
      srcDir: unit(p0, at(0.04)), tgtDir: unit(p3, at(0.96)), start: p0, end: p3, mid: m, midAngle: Math.atan2(m2.y - m.y, m2.x - m.x),
    };
  }

  private routeFree(e: DEdge, nodes: Map<string, DNode>, rects: Map<string, Rect>, prefs: Prefs): RoutedEdge {
    const endPt = (ref: DEdge['source'], other: Pt): Pt => {
      const n = ref.node ? nodes.get(ref.node) : undefined;
      if (n) return boundaryToward(shapeKey(n), rects.get(n.id)!, other);
      return { x: ref.x ?? 0, y: ref.y ?? 0 };
    };
    const rough = (ref: DEdge['source']): Pt => {
      const n = ref.node ? nodes.get(ref.node) : undefined;
      return n ? center(rects.get(n.id)!) : { x: ref.x ?? 0, y: ref.y ?? 0 };
    };
    const p0 = endPt(e.source, rough(e.target));
    const p3 = endPt(e.target, rough(e.source));
    const routing = e.routing ?? prefs.line.routingCrowsFoot;
    let P: Pt[];
    if (routing === 'orthogonal') {
      const horiz = Math.abs(p3.x - p0.x) >= Math.abs(p3.y - p0.y);
      P = horiz
        ? simplify([p0, { x: (p0.x + p3.x) / 2, y: p0.y }, { x: (p0.x + p3.x) / 2, y: p3.y }, p3])
        : simplify([p0, { x: p0.x, y: (p0.y + p3.y) / 2 }, { x: p3.x, y: (p0.y + p3.y) / 2 }, p3]);
    } else P = [p0, p3];
    if (P.length < 2) P = [p0, { x: p0.x + 0.01, y: p0.y }];
    const mid = polyMid(P);
    return {
      id: e.id, routing, points: P,
      d: routing === 'orthogonal' ? orthoPath(P, prefs.line.cornerRadius, undefined) : `M${f(p0.x)},${f(p0.y)}L${f(p3.x)},${f(p3.y)}`,
      srcDir: unit(P[0], P[1]), tgtDir: unit(P[P.length - 1], P[P.length - 2]), start: P[0], end: P[P.length - 1], mid: mid.p, midAngle: mid.angle,
    };
  }
}

function normalAt(r: Rect, p: Pt): Pt {
  const d = { top: Math.abs(p.y - r.y), bottom: Math.abs(p.y - (r.y + r.h)), left: Math.abs(p.x - r.x), right: Math.abs(p.x - (r.x + r.w)) };
  const s = (Object.keys(d) as Side[]).reduce((a, b) => (d[a] <= d[b] ? a : b));
  return SIDE_DIR[s];
}
