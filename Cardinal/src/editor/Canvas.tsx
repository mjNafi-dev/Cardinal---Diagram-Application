import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditor, snap, newField, type RowAnchor as Anchor } from '../store/editor';
import { usePrefs } from '../store/prefs';
import { DiagramContent, computeFocus } from '../diagram/DiagramContent';
import { canvasRef, layoutRef, useFontEpoch } from '../diagram/layout';
import { Router } from '../routing/router';
import { shapeKey, isContainer, isRoundish, canResizeH, canResizeW, center, inflate, nearestSide, nodeRect, pointInRect, projectToOutline, rectsIntersect, tableMetrics, unionRects } from '../geometry/geometry';
import { FONT_STACKS } from '../model/prefs';
import { SHAPES, connectorById, shapeById, type ShapeDef } from '../model/catalog';
import { logicPins, pinDir } from '../model/logic';
import { toast } from '../ui/toast';
import { lineVar } from '../model/palette';
import type { DEdge, DNode, EndRef, NodeKind, Pt, Rect, Side } from '../model/types';
import { uid } from '../model/types';
import { ShapeIcon } from '../ui/previews';
import { InlineEditor } from './InlineEditor';

type Ix =
  | { t: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { t: 'marquee'; start: Pt; cur: Pt; additive: boolean; base: string[] }
  | { t: 'move'; start: Pt; ids: string[]; orig: Map<string, Pt>; edgeOrig: Map<string, { s?: Pt; t?: Pt }>; started: boolean; hit?: string; mod?: boolean }
  | { t: 'resize'; id: string; dir: string; start: Pt; orig: Rect; started: boolean }
  | { t: 'connect'; from: string; fromAnchor?: Anchor; cur: Pt; target: string | null; left: boolean; snap?: Anchor | null }
  | { t: 'endpoint'; edge: string; end: 'source' | 'target'; cur: Pt; target: string | null; started: boolean; snap?: Anchor | null }
  | { t: 'pen'; pts: Pt[] }
  | { t: 'draw-line'; start: Pt; cur: Pt; from: string | null; to: string | null };

const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

/** busy = a line already ends here, so the dot steps aside (inward) to keep that line's end easy to grab */
interface AnchorDot { key: string; side: Side; field?: string; pos?: number; x: number; y: number; band?: { top: number; h: number }; busy?: boolean }
const toAnchor = (d: AnchorDot): Anchor => (d.field ? { side: d.side, field: d.field } : { side: d.side, pos: d.pos });
const sameAnchor = (a: { side: Side; field?: string; pos?: number }, b: { side: Side; field?: string; pos?: number }) =>
  a.side === b.side && (a.field || b.field ? a.field === b.field : Math.abs((a.pos ?? 0.5) - (b.pos ?? 0.5)) < 0.002);
/** dot key ("<field>:<side>" or "slot:<side>:<pos>") back to an anchor */
function anchorFromKey(k: string): Anchor {
  if (k.startsWith('slot:')) { const [, side, pos] = k.split(':'); return { side: side as Side, pos: Number(pos) }; }
  const i = k.lastIndexOf(':');
  return { field: k.slice(0, i), side: k.slice(i + 1) as Side };
}
const anchorRef = (node: string, a: Anchor): EndRef => (a.field ? { node, field: a.field, side: a.side } : { node, side: a.side, pos: a.pos });
const DRAG_THRESHOLD = 3;

export function fitView(pad = 60) {
  const el = canvasRef.current;
  const lay = layoutRef.current;
  if (!el || !lay) return;
  const box = unionRects([...lay.rects.values()]);
  const W = el.clientWidth, H = el.clientHeight;
  if (!box) return useEditor.getState().setView({ x: W / 2, y: H / 2, zoom: 1 });
  const zoom = Math.max(0.15, Math.min(1.25, Math.min((W - pad * 2) / box.w, (H - pad * 2) / box.h)));
  useEditor.getState().setView({ zoom, x: W / 2 - (box.x + box.w / 2) * zoom, y: H / 2 - (box.y + box.h / 2) * zoom });
}

/** Drop a loose (unattached) line of this connector type; drag its ends onto shapes to attach. */
export function placeConnector(id: string, p: Pt) {
  const def = connectorById(id);
  if (!def) return;
  const st = useEditor.getState();
  const ed: DEdge = { id: uid('e'), source: { x: snap(p.x - 80), y: snap(p.y) }, target: { x: snap(p.x + 80), y: snap(p.y) }, ...structuredClone(def.apply) };
  for (const k of Object.keys(ed) as (keyof DEdge)[]) if (ed[k] === undefined) delete ed[k];
  st.commit((d) => { d.edges.push(ed); });
  st.select([ed.id]);
  if (def.group !== 'shared') st.applyConnector(def.id);
}

export function zoomBy(factor: number, at?: Pt) {
  const el = canvasRef.current;
  const { view, setView } = useEditor.getState();
  const p = at ?? { x: (el?.clientWidth ?? 800) / 2, y: (el?.clientHeight ?? 600) / 2 };
  const zoom = Math.max(0.1, Math.min(4, view.zoom * factor));
  const k = zoom / view.zoom;
  setView({ zoom, x: p.x - (p.x - view.x) * k, y: p.y - (p.y - view.y) * k });
}

/** World coordinates of the visible center (where clicked library items land). */
export function viewCenter(): Pt {
  const el = canvasRef.current;
  const { view } = useEditor.getState();
  const W = el?.clientWidth ?? 800, H = el?.clientHeight ?? 600;
  return { x: (W / 2 - view.x) / view.zoom, y: (H / 2 - view.y) / view.zoom };
}

const QUICK: Record<'crowsfoot' | 'chen', NodeKind[]> = {
  crowsfoot: ['table', 'entity-simple', 'note'],
  chen: ['entity', 'relationship', 'attribute', 'key-attribute', 'weak-entity', 'multivalued-attribute', 'derived-attribute'],
};
/** circuits: what to offer when a wire is dropped on empty canvas (from an output pin / from an input pin) */
const QUICK_LOGIC = {
  out: ['logic-and', 'logic-or', 'logic-not', 'logic-xor', 'logic-nand', 'logic-bulb', 'logic-probe'],
  in: ['logic-switch', 'logic-and', 'logic-or', 'logic-not', 'logic-const1', 'logic-const0'],
};
const quickDefs = (ids: string[]) => ids.map((id) => shapeById(id)!).filter(Boolean);

export function Canvas() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const hovered = useEditor((s) => s.hovered);
  const view = useEditor((s) => s.view);
  const editing = useEditor((s) => s.editing);
  const moving = useEditor((s) => s.moving);
  const tool = useEditor((s) => s.tool);
  const sqlIssues = useEditor((s) => s.sqlIssues);
  const toolOpts = useEditor((s) => s.toolOpts);
  const prefs = usePrefs((s) => s.prefs);
  const fontEpoch = useFontEpoch((s) => s.epoch);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ix = useRef<Ix | null>(null);
  const hoverDot = useRef<string | null>(null);
  const [overlay, setOverlay] = useState(0); // re-render tick for interaction previews
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const [quick, setQuick] = useState<{ screen: Pt; world: Pt; from: string; fromAnchor?: Anchor } | null>(null);
  const router = useRef(new Router());

  const rects = useMemo(() => new Map(doc.nodes.map((n) => [n.id, nodeRect(n, prefs)])), [doc.nodes, prefs, fontEpoch]);
  const routes = useMemo(() => router.current.route({ doc, rects, prefs, moving: moving ?? undefined }), [doc, rects, prefs, moving]);
  layoutRef.current = { rects, routes };

  // circuits: the signal-path highlight waits for the pointer to rest a moment, so sweeping across parts stays calm
  const circuit = doc.mode === 'circuit';
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!circuit) { setFocusId(hovered); return; }
    const t = window.setTimeout(() => setFocusId(hovered), hovered ? 160 : 140);
    return () => clearTimeout(t);
  }, [hovered, circuit]);
  // a click that hasn't become a drag (flipping a switch) keeps the highlight
  const busyIx = ix.current && !(ix.current.t === 'move' && !ix.current.started);
  const focus = useMemo(() => (busyIx ? null : computeFocus(doc, circuit ? focusId : hovered, prefs)), [doc, hovered, focusId, prefs, overlay, busyIx, circuit]);
  const selSet = useMemo(() => new Set(selection), [selection]);
  // SQL problems: on the table they belong to, or (no such table on the canvas) in a banner
  const { warnings, looseIssues } = useMemo(() => {
    const byName = new Map(doc.nodes.filter((n) => n.kind === 'table').map((n) => [n.text.toLowerCase(), n.id]));
    const w = new Map<string, string>();
    const loose: typeof sqlIssues = [];
    for (const i of sqlIssues) {
      const id = i.table ? byName.get(i.table.toLowerCase()) : undefined;
      if (id) w.set(id, (w.has(id) ? w.get(id) + '\n' : '') + `Line ${i.line}: ${i.message}`);
      else loose.push(i);
    }
    return { warnings: w, looseIssues: loose };
  }, [sqlIssues, doc.nodes]);
  const nodeById = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc.nodes]);

  // fit the diagram on screen when a diagram is opened
  const metaId = useEditor((s) => s.meta?.id);
  useEffect(() => {
    const t1 = requestAnimationFrame(() => fitView());
    const t2 = window.setTimeout(() => fitView(), 80);
    return () => { cancelAnimationFrame(t1); clearTimeout(t2); };
  }, [metaId]);

  useLayoutEffect(() => {
    canvasRef.current = wrapRef.current;
    return () => { if (canvasRef.current === wrapRef.current) canvasRef.current = null; };
  }, []);

  // space-to-pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping()) return;
      e.preventDefault();
      setSpace(true);
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // wheel: pan, ctrl/pinch = zoom (non-passive so we can prevent page zoom)
  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomBy(Math.exp(-e.deltaY * k * 0.0022), { x: e.clientX - r.left, y: e.clientY - r.top });
      } else {
        const v = useEditor.getState().view;
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        useEditor.getState().setView({ x: v.x - dx * k, y: v.y - dy * k });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (cx: number, cy: number): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    const v = useEditor.getState().view;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  };

  const nodeAt = (p: Pt, pad = 0, exclude?: string): string | null => {
    const nodes = useEditor.getState().doc.nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.id === exclude) continue;
      const r = rects.get(n.id);
      if (r && pointInRect(p, inflate(r, pad))) return n.id;
    }
    return null;
  };

  /**
   * Connection points of a shape:
   *  - tables: a dot at both ends of every row and of the title row
   *  - every side (tables: top/bottom only): one dot in the middle of each gap between the lines already
   *    attached there — no lines → one dot in the middle; one line → a dot on each side of it; …
   */
  const anchorDots = (id: string): AnchorDot[] => {
    const n = nodeById.get(id);
    const r = rects.get(id);
    if (!n || !r || n.kind === 'comment' || n.kind === 'drawing') return [];
    const out: AnchorDot[] = [];
    // rows / pins that already have a line on a side ("<field>:<side>")
    const busy = new Set<string>();
    for (const e of doc.edges) {
      for (const end of ['source', 'target'] as const) {
        if (e[end].node !== id || !e[end].field) continue;
        const rt = routes.get(e.id);
        if (!rt) continue;
        const pt = end === 'source' ? rt.start : rt.end;
        busy.add(e[end].field + ':' + (Math.abs(pt.x - r.x) <= Math.abs(pt.x - (r.x + r.w)) ? 'left' : 'right'));
      }
    }
    const inward = (side: Side, x: number, k: number) => (side === 'left' ? x + k : x - k);
    if (n.kind === 'logic') {
      for (const p of logicPins(n, r)) {
        const key = p.id + ':' + p.side;
        const b = busy.has(key);
        out.push({ key, field: p.id, side: p.side, x: b ? inward(p.side, p.x, 7) : p.x, y: p.y, busy: b });
      }
      return out;
    }
    if (n.kind === 'table') {
      const m = tableMetrics(prefs, n);
      for (const side of ['left', 'right'] as const) {
        const x = side === 'left' ? r.x : r.x + r.w;
        const hb = busy.has('@header:' + side);
        out.push({ key: '@header:' + side, field: '@header', side, x: hb ? inward(side, x, 12) : x, y: r.y + m.headerH / 2, band: { top: r.y, h: m.headerH }, busy: hb });
        (n.fields ?? []).forEach((f, i) => {
          const y = r.y + m.headerH + 3 + i * m.rowH + m.rowH / 2;
          const b = busy.has(f.id + ':' + side);
          out.push({ key: f.id + ':' + side, field: f.id, side, x: b ? inward(side, x, 12) : x, y, band: { top: y - m.rowH / 2, h: m.rowH }, busy: b });
        });
      }
    }
    // where lines already touch each side
    const used: Record<Side, number[]> = { top: [], right: [], bottom: [], left: [] };
    for (const e of doc.edges) {
      for (const end of ['source', 'target'] as const) {
        if (e[end].node !== id || e[end].field) continue;
        const rt = routes.get(e.id);
        if (!rt) continue;
        const pt = end === 'source' ? rt.start : rt.end;
        const dir = end === 'source' ? rt.srcDir : rt.tgtDir;
        const side: Side = rt.routing === 'orthogonal'
          ? (Math.abs(dir.x) > Math.abs(dir.y) ? (dir.x > 0 ? 'right' : 'left') : dir.y > 0 ? 'bottom' : 'top')
          : nearestSide(r, pt);
        used[side].push(side === 'top' || side === 'bottom' ? pt.x : pt.y);
      }
    }
    const key = shapeKey(n);
    const roundish = isRoundish(key);
    for (const side of SIDES) {
      if (n.kind === 'table' && (side === 'left' || side === 'right')) continue;
      const horiz = side === 'top' || side === 'bottom';
      const start = horiz ? r.x : r.y, L = horiz ? r.w : r.h;
      const lo = roundish ? start + L / 4 : start, hi = roundish ? start + (L * 3) / 4 : start + L;
      const cs = [lo, ...used[side].filter((c) => c > lo && c < hi).sort((a, b) => a - b), hi];
      for (let i = 0; i < cs.length - 1; i++) {
        const c = (cs[i] + cs[i + 1]) / 2;
        const bp = side === 'top' ? { x: c, y: r.y } : side === 'bottom' ? { x: c, y: r.y + r.h } : side === 'left' ? { x: r.x, y: c } : { x: r.x + r.w, y: c };
        const op = projectToOutline(key, r, bp, side);
        const pos = Math.round(((c - start) / L) * 1000) / 1000;
        out.push({ key: `slot:${side}:${pos}`, side, pos, x: op.x, y: op.y });
      }
    }
    return out;
  };
  /** Nearest connection point under the pointer (rows also catch the outer quarter of the row). */
  const snapAnchor = (id: string, p: Pt): Anchor | null => {
    const r = rects.get(id);
    const zz = useEditor.getState().view.zoom;
    if (!r) return null;
    let best: AnchorDot | null = null, bd = Infinity;
    for (const d of anchorDots(id)) {
      const dist = Math.hypot(d.x - p.x, d.y - p.y);
      const inBand = !!d.band && p.y >= d.band.top && p.y <= d.band.top + d.band.h && p.x >= r.x - 18 / zz && p.x <= r.x + r.w + 18 / zz && Math.abs(p.x - d.x) < Math.max(18 / zz, r.w * 0.25);
      if ((dist < 18 / zz || inBand) && dist < bd) { bd = dist; best = d; }
    }
    return best ? toAnchor(best) : null;
  };
  const dotOf = (id: string, a?: Anchor | null) => (a ? anchorDots(id).find((d) => sameAnchor(d, a)) : undefined);
  /** Logic part: the pin of this direction nearest to p, preferring inputs that have no wire yet. */
  const bestPin = (id: string, dir: 'in' | 'out', p: Pt): Anchor | null => {
    const n = nodeById.get(id), r = rects.get(id);
    if (!n || !r || n.kind !== 'logic') return null;
    const wired = new Set(doc.edges.flatMap((e) => [e.source, e.target]).filter((x) => x.node === id && x.field).map((x) => x.field!));
    const pins = logicPins(n, r).filter((q) => q.dir === dir);
    if (!pins.length) return null;
    const score = (q: (typeof pins)[number]) => Math.abs(q.y - p.y) + (dir === 'in' && wired.has(q.id) ? 1000 : 0);
    const best = pins.reduce((a, b) => (score(b) < score(a) ? b : a));
    return { side: best.side, field: best.id };
  };

  // ───────── pointer handling ─────────

  const onPointerDown = (e: React.PointerEvent) => {
    if (quick) setQuick(null);
    const st = useEditor.getState();
    const target = e.target as Element;
    wrapRef.current?.focus({ preventScroll: true });
    const p = toWorld(e.clientX, e.clientY);

    if (e.button === 1 || e.button === 2 || (e.button === 0 && space)) {
      ix.current = { t: 'pan', sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y };
      setPanning(true);
      capture(e);
      return;
    }
    if (e.button !== 0) return;
    // let an open text editor save itself (its blur handler commits) before we move on
    if (st.editing) { (document.activeElement as HTMLElement | null)?.blur?.(); if (useEditor.getState().editing) st.setEditing(null); }
    capture(e);

    // drawing tools from the rail
    if (st.tool !== 'select') {
      const place = (id: string) => { st.setTool('select'); if (id) st.setEditing({ type: 'node', id }); };
      if (st.tool === 'pen') { ix.current = { t: 'pen', pts: [p] }; st.select([]); setOverlay((x) => x + 1); return; }
      if (st.tool === 'line') { ix.current = { t: 'draw-line', start: p, cur: p, from: nodeAt(p, 2), to: null }; return; }
      if (st.tool === 'note') return place(st.addPreset('note', p));
      if (st.tool === 'text') return place(st.addPreset('text', p));
      if (st.tool === 'comment') return place(st.addRaw({ id: uid('n'), kind: 'comment', text: '', x: Math.round(p.x), y: Math.round(p.y - 30) }));
    }

    const warnEl = target.closest('[data-sqlwarn]');
    if (warnEl) {
      const t = nodeById.get(warnEl.getAttribute('data-sqlwarn')!);
      const issue = sqlIssues.find((i) => i.table && t && i.table.toLowerCase() === t.text.toLowerCase());
      if (issue) st.jumpToSql(issue.line);
      return;
    }
    const dot = target.closest('[data-anchor]');
    if (dot) {
      const from = dot.getAttribute('data-for')!;
      const fromAnchor = dotOf(from, anchorFromKey(dot.getAttribute('data-anchor')!));
      ix.current = { t: 'connect', from, fromAnchor: fromAnchor ? toAnchor(fromAnchor) : undefined, cur: p, target: null, left: false };
      st.setHovered(null);
      setOverlay((x) => x + 1);
      return;
    }
    const handle = target.closest('[data-handle]');
    if (handle) {
      const from = handle.getAttribute('data-for')!;
      ix.current = { t: 'connect', from, cur: p, target: null, left: false };
      st.setHovered(null);
      setOverlay((x) => x + 1);
      return;
    }
    const resize = target.closest('[data-resize]');
    if (resize) {
      const id = resize.getAttribute('data-for')!;
      ix.current = { t: 'resize', id, dir: resize.getAttribute('data-resize')!, start: p, orig: rects.get(id)!, started: false };
      return;
    }
    const endpoint = target.closest('[data-endpoint]');
    if (endpoint) {
      ix.current = { t: 'endpoint', edge: endpoint.getAttribute('data-for')!, end: endpoint.getAttribute('data-endpoint') as 'source' | 'target', cur: p, target: null, started: false };
      return;
    }
    const nodeEl = target.closest('[data-node]');
    const edgeEl = target.closest('[data-edge]');
    if (nodeEl || edgeEl) {
      const id = (nodeEl?.getAttribute('data-node') ?? edgeEl!.getAttribute('data-edge'))!;
      let sel = st.selection;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        st.select([id], true);
        sel = useEditor.getState().selection;
        if (!sel.includes(id)) return;
      } else if (!sel.includes(id)) {
        st.select([id]);
        sel = [id];
      }
      const ids = sel.filter((s) => nodeById.has(s));
      // push buttons are pressed while the mouse is down
      const hitNode = nodeById.get(id);
      if (hitNode?.kind === 'logic' && hitNode.logic === 'button') st.setSwitch(id, true);
      // moving a container moves everything inside it
      for (const cid of [...ids]) {
        const c = nodeById.get(cid)!;
        if (!isContainer(c)) continue;
        const cr = rects.get(cid)!;
        for (const n of st.doc.nodes) {
          if (ids.includes(n.id)) continue;
          const r = rects.get(n.id)!;
          if (r.x >= cr.x && r.y >= cr.y && r.x + r.w <= cr.x + cr.w && r.y + r.h <= cr.y + cr.h) ids.push(n.id);
        }
      }
      const orig = new Map(ids.map((s) => [s, { x: nodeById.get(s)!.x, y: nodeById.get(s)!.y }]));
      const edgeOrig = new Map<string, { s?: Pt; t?: Pt }>();
      for (const ed of st.doc.edges) {
        if (!sel.includes(ed.id)) continue;
        const o: { s?: Pt; t?: Pt } = {};
        if (!ed.source.node && ed.source.x !== undefined) o.s = { x: ed.source.x, y: ed.source.y! };
        if (!ed.target.node && ed.target.x !== undefined) o.t = { x: ed.target.x, y: ed.target.y! };
        if (o.s || o.t) edgeOrig.set(ed.id, o);
      }
      if (orig.size || edgeOrig.size) ix.current = { t: 'move', start: p, ids, orig, edgeOrig, started: false, hit: id, mod: e.shiftKey || e.ctrlKey || e.metaKey };
      return;
    }
    // empty canvas → marquee
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!additive) st.select([]);
    ix.current = { t: 'marquee', start: p, cur: p, additive, base: additive ? st.selection : [] };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    const cur = ix.current;
    const p = toWorld(e.clientX, e.clientY);
    if (!cur) {
      // geometric hover so the connect handles stay reachable just outside the shape
      const target = e.target as Element;
      const overHandle = target.closest('[data-anchor]')?.getAttribute('data-for');
      const dotEl = target.closest('[data-anchor]');
      const key = dotEl ? dotEl.getAttribute('data-anchor') : null;
      if (key !== hoverDot.current) { hoverDot.current = key; setOverlay((x) => x + 1); }
      st.setHovered(overHandle ?? nodeAt(p, 10));
      return;
    }
    switch (cur.t) {
      case 'pan':
        st.setView({ x: cur.vx + e.clientX - cur.sx, y: cur.vy + e.clientY - cur.sy });
        break;
      case 'pen': {
        const last = cur.pts[cur.pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) * st.view.zoom >= 2) { cur.pts.push(p); setOverlay((x) => x + 1); }
        break;
      }
      case 'draw-line':
        cur.cur = p;
        cur.to = nodeAt(p, 2);
        setOverlay((x) => x + 1);
        break;
      case 'marquee':
        cur.cur = p;
        setOverlay((x) => x + 1);
        break;
      case 'move': {
        const dx = p.x - cur.start.x, dy = p.y - cur.start.y;
        if (!cur.started) {
          if (Math.hypot(dx, dy) * st.view.zoom < DRAG_THRESHOLD) return;
          cur.started = true;
          st.begin();
          st.setMoving(new Set(cur.ids));
          st.setHovered(null);
        }
        // snap the primary (first) node, move the rest by the same delta
        const first = cur.ids[0] ? cur.orig.get(cur.ids[0])! : null;
        const sdx = first && !e.altKey ? snap(first.x + dx) - first.x : Math.round(dx);
        const sdy = first && !e.altKey ? snap(first.y + dy) - first.y : Math.round(dy);
        st.live((d) => {
          for (const n of d.nodes) {
            const o = cur.orig.get(n.id);
            if (o) { n.x = o.x + sdx; n.y = o.y + sdy; }
          }
          for (const ed of d.edges) {
            const o = cur.edgeOrig.get(ed.id);
            if (!o) continue;
            if (o.s) { ed.source.x = o.s.x + sdx; ed.source.y = o.s.y + sdy; }
            if (o.t) { ed.target.x = o.t.x + sdx; ed.target.y = o.t.y + sdy; }
          }
        });
        break;
      }
      case 'resize': {
        const dx = p.x - cur.start.x, dy = p.y - cur.start.y;
        if (!cur.started) {
          if (Math.hypot(dx, dy) * st.view.zoom < DRAG_THRESHOLD) return;
          cur.started = true;
          st.begin();
          st.setMoving(new Set([cur.id]));
        }
        const o = cur.orig;
        let { x, y, w, h } = o;
        if (cur.dir.includes('e')) w = snap(o.x + o.w + dx) - o.x;
        if (cur.dir.includes('s')) h = snap(o.y + o.h + dy) - o.y;
        if (cur.dir.includes('w')) { x = snap(o.x + dx); w = o.x + o.w - x; }
        if (cur.dir.includes('n')) { y = snap(o.y + dy); h = o.y + o.h - y; }
        const minW = 40, minH = 24;
        if (w < minW) { if (cur.dir.includes('w')) x = o.x + o.w - minW; w = minW; }
        if (h < minH) { if (cur.dir.includes('n')) y = o.y + o.h - minH; h = minH; }
        st.live((d) => {
          const n = d.nodes.find((q) => q.id === cur.id);
          if (!n) return;
          if (canResizeW(n)) { n.x = x; n.w = w; }
          if (canResizeH(n)) { n.y = y; n.h = h; }
        });
        break;
      }
      case 'connect': {
        cur.cur = p;
        const over = nodeAt(p, 4);
        if (over !== cur.from) cur.left = true;
        cur.snap = over ? snapAnchor(over, p) : null;
        // a point can link to another point of the same shape (e.g. manager_id → id)
        const selfRow = over === cur.from && cur.fromAnchor && cur.snap && !sameAnchor(cur.snap, cur.fromAnchor);
        cur.target = over === cur.from && !cur.left && !selfRow ? null : over;
        if (!cur.target) cur.snap = null;
        setOverlay((x) => x + 1);
        break;
      }
      case 'endpoint': {
        cur.cur = p;
        if (!cur.started) {
          cur.started = true;
          st.begin();
        }
        cur.target = nodeAt(p, 4) ?? null;
        // ignore this line's own slot while dragging it
        cur.snap = cur.target ? snapAnchor(cur.target, p) : null;
        const tgt = cur.target, sn = cur.snap;
        st.live((d) => {
          const q = d.edges.find((z) => z.id === cur.edge);
          if (q) q[cur.end] = tgt && sn ? anchorRef(tgt, sn) : { x: p.x, y: p.y };
        });
        setOverlay((x) => x + 1);
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    const cur = ix.current;
    ix.current = null;
    setPanning(false);
    if (!cur) return;
    switch (cur.t) {
      case 'pen': {
        const pts = cur.pts;
        const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        const nw = Math.max(1, Math.max(...xs) - x0), nh = Math.max(1, Math.max(...ys) - y0);
        const { penColor, penWidth } = st.toolOpts;
        st.addRaw({
          id: uid('n'), kind: 'drawing', text: '', x: x0, y: y0, nw, nh,
          points: pts.map((q) => [Math.round((q.x - x0) * 10) / 10, Math.round((q.y - y0) * 10) / 10] as [number, number]),
          style: { stroke: penColor, strokeWidth: penWidth },
        });
        st.select([]);
        break;
      }
      case 'draw-line': {
        if (Math.hypot(cur.cur.x - cur.start.x, cur.cur.y - cur.start.y) * st.view.zoom < 6) break;
        const conn = st.toolOpts.lineArrow ? 'arrow' : 'line';
        if (cur.from && cur.to && cur.from !== cur.to) st.connect(cur.from, cur.to, { connector: conn });
        else {
          const def = connectorById(conn)!;
          const ed: DEdge = {
            id: uid('e'),
            source: cur.from ? { node: cur.from } : { x: Math.round(cur.start.x), y: Math.round(cur.start.y) },
            target: cur.to && cur.to !== cur.from ? { node: cur.to } : { x: Math.round(cur.cur.x), y: Math.round(cur.cur.y) },
            ...structuredClone(def.apply),
            routing: 'straight',
          };
          for (const k of Object.keys(ed) as (keyof DEdge)[]) if (ed[k] === undefined) delete ed[k];
          st.commit((d) => { d.edges.push(ed); });
          st.select([ed.id]);
        }
        st.setTool('select');
        break;
      }
      case 'marquee': {
        const r = normRect(cur.start, cur.cur);
        if (r.w * st.view.zoom > 3 || r.h * st.view.zoom > 3) {
          const hit = st.doc.nodes.filter((n) => { const b = rects.get(n.id)!; return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h; }).map((n) => n.id);
          const hs = new Set(hit);
          const edges = st.doc.edges.filter((ed) => {
            if (ed.source.node && ed.target.node) return hs.has(ed.source.node) && hs.has(ed.target.node);
            const rt = routes.get(ed.id);
            return rt ? rectsIntersect(r, normRect(rt.start, rt.end)) : false;
          }).map((ed) => ed.id);
          st.select([...new Set([...cur.base, ...hit, ...edges])]);
        }
        break;
      }
      case 'move': {
        if (cur.started) { st.setMoving(null); st.end(); }
        const hit = cur.hit ? st.doc.nodes.find((q) => q.id === cur.hit) : undefined;
        if (hit?.kind === 'logic' && hit.logic === 'button') st.setSwitch(hit.id, false);
        // a click (no drag) on a switch flips it
        else if (!cur.started && !cur.mod && hit?.kind === 'logic' && hit.logic === 'switch') st.setSwitch(hit.id, !hit.on);
        break;
      }
      case 'resize':
        if (cur.started) { st.setMoving(null); st.end(); }
        break;
      case 'connect': {
        if (cur.target) {
          let snapTo = cur.snap ?? undefined;
          const tn = nodeById.get(cur.target);
          const fromDir = pinDir(cur.fromAnchor?.field);
          // dropped on a logic part but not on a fitting pin: use the nearest pin that fits
          if (tn?.kind === 'logic' && fromDir && (!snapTo || pinDir(snapTo.field) === fromDir)) snapTo = bestPin(cur.target, fromDir === 'out' ? 'in' : 'out', cur.cur) ?? snapTo;
          const made = st.connect(cur.from, cur.target, { source: cur.fromAnchor, target: snapTo });
          if (!made && (tn?.kind === 'logic' || fromDir)) toast('Wires go from an output (right side) to an input (left side).');
        } else {
          const from = rects.get(cur.from)!;
          const far = Math.hypot(cur.cur.x - center(from).x, cur.cur.y - center(from).y) > Math.max(from.w, from.h) / 2 + 30;
          if (far) {
            const r = wrapRef.current!.getBoundingClientRect();
            setQuick({ screen: { x: e.clientX - r.left, y: e.clientY - r.top }, world: cur.cur, from: cur.from, fromAnchor: cur.fromAnchor });
          }
        }
        break;
      }
      case 'endpoint': {
        if (!cur.started) break;
        const target = cur.target;
        // a wire end dropped on a logic part (not exactly on a pin) snaps to the nearest pin that fits
        if (target && nodeById.get(target)?.kind === 'logic') {
          const other = st.doc.edges.find((z) => z.id === cur.edge)?.[cur.end === 'source' ? 'target' : 'source'];
          const need = pinDir(other?.field) === 'in' ? 'out' : 'in';
          if (!cur.snap || pinDir(cur.snap.field) !== need) cur.snap = bestPin(target, need, cur.cur) ?? cur.snap;
        }
        if (target && cur.snap) {
          const sn = cur.snap;
          st.live((d) => {
            const q = d.edges.find((z) => z.id === cur.edge);
            if (q) q[cur.end] = anchorRef(target, sn);
          });
        } else if (target) {
          const r = rects.get(target)!;
          // dropped near an edge of the shape → pin that side; dropped in the middle → automatic
          const side = nearestSide(r, cur.cur);
          const nearEdge = Math.min(Math.abs(cur.cur.x - r.x), Math.abs(cur.cur.x - r.x - r.w), Math.abs(cur.cur.y - r.y), Math.abs(cur.cur.y - r.y - r.h)) < 14 / st.view.zoom + 4;
          st.live((d) => {
            const q = d.edges.find((z) => z.id === cur.edge);
            if (q) q[cur.end] = nearEdge ? { node: target, side } : { node: target };
          });
        }
        st.end();
        break;
      }
    }
    setOverlay((x) => x + 1);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = useEditor.getState();
    // pointer capture makes the event target the <svg>; look up what is really under the cursor
    const target = (document.elementFromPoint(e.clientX, e.clientY) ?? e.target) as Element;
    const p = toWorld(e.clientX, e.clientY);
    const nodeEl = target.closest('[data-node]');
    const edgeEl = target.closest('[data-edge]');
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-node')!;
      const n = nodeById.get(id)!;
      const fieldEl = target.closest('[data-field]');
      if (n.kind === 'table') {
        const r = rects.get(id)!;
        const m = tableMetrics(prefs, n);
        const cell = p.x < r.x + m.keyW ? 'key' : p.x > r.x + r.w * 0.64 ? 'type' : 'name';
        if (fieldEl) return st.setEditing({ type: 'field', id, fieldId: fieldEl.getAttribute('data-field')!, cell });
        if (p.y > r.y + m.headerH) {
          const f = newField('', '');
          st.commit((d) => { d.nodes.find((q) => q.id === id)!.fields!.push(f); });
          return st.setEditing({ type: 'field', id, fieldId: f.id, cell: 'key' });
        }
      }
      st.select([id]);
      return st.setEditing({ type: 'node', id });
    }
    if (edgeEl) {
      const id = edgeEl.getAttribute('data-edge')!;
      st.select([id]);
      return st.setEditing({ type: 'edge', id });
    }
    // empty canvas: drop the notation's main shape and start typing its name (circuits: nothing)
    if (st.doc.mode === 'circuit') return;
    const kind: NodeKind = st.panelNotation === 'chen' ? 'entity' : 'table';
    const id = st.addNode(kind, p);
    st.setEditing({ type: 'node', id });
  };

  // ───────── drag & drop from the library ─────────

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-cardinal')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-cardinal');
    if (!raw) return;
    e.preventDefault();
    const item = JSON.parse(raw);
    const st = useEditor.getState();
    const p = toWorld(e.clientX, e.clientY);
    if (item.type === 'shape') {
      st.addPreset(item.id, p);
      return;
    }
    if (item.type === 'connector') {
      // dropped onto an existing line → restyle it
      const under = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest('[data-edge]')).find(Boolean);
      if (under) {
        st.select([under.getAttribute('data-edge')!]);
        st.applyConnector(item.id);
        return;
      }
      placeConnector(item.id, p);
    }
  };

  // ───────── overlays ─────────

  const z = view.zoom;
  const cur = ix.current;
  const handleFor = !cur && tool === 'select' && hovered && nodeById.has(hovered) && !editing ? hovered : null;
  const singleSel = selection.length === 1 && nodeById.has(selection[0]) ? nodeById.get(selection[0])! : null;
  const gs = prefs.canvas.gridSize * 2;
  const famCss = FONT_STACKS[prefs.text.font].css;

  const overlays: React.ReactNode[] = [];
  // a selected line's end handles go on top of everything, so they win over connection dots
  const endHandles: React.ReactNode[] = [];
  // selection outlines
  for (const id of selection) {
    const r = rects.get(id);
    if (r) {
      overlays.push(<rect key={'s' + id} x={r.x - 3 / z} y={r.y - 3 / z} width={r.w + 6 / z} height={r.h + 6 / z} rx={4 / z} style={{ fill: 'none', stroke: 'var(--select)', strokeWidth: 1.5 / z, pointerEvents: 'none' }} />);
      continue;
    }
    const rt = routes.get(id);
    const ed = doc.edges.find((q) => q.id === id);
    if (rt && ed) {
      overlays.push(<path key={'s' + id} d={rt.d} style={{ fill: 'none', stroke: 'var(--select)', strokeWidth: (ed.style?.strokeWidth ?? prefs.line.width) + 5 / z, strokeOpacity: 0.28, pointerEvents: 'none', strokeLinecap: 'round' }} />);
      if (selection.length === 1) {
        for (const [end, pt] of [['source', rt.start], ['target', rt.end]] as const) {
          endHandles.push(
            <circle key={end} data-endpoint={end} data-for={id} cx={pt.x} cy={pt.y} r={5.5 / z}
              style={{ fill: 'var(--panel)', stroke: 'var(--select)', strokeWidth: 1.6 / z, cursor: 'crosshair' }} />,
          );
        }
      }
    }
  }
  // resize handles
  if (singleSel && !cur && !editing && (canResizeW(singleSel) || canResizeH(singleSel))) {
    const r = rects.get(singleSel.id)!;
    const dirs = canResizeH(singleSel) ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] : ['e', 'w'];
    const s = 8 / z;
    for (const d of dirs) {
      const hx = d.includes('w') ? r.x : d.includes('e') ? r.x + r.w : r.x + r.w / 2;
      const hy = d.includes('n') ? r.y : d.includes('s') ? r.y + r.h : r.y + r.h / 2;
      overlays.push(
        <rect key={'r' + d} data-resize={d} data-for={singleSel.id} x={hx - s / 2} y={hy - s / 2} width={s} height={s} rx={2 / z}
          style={{ fill: 'var(--panel)', stroke: 'var(--select)', strokeWidth: 1.4 / z, cursor: `${d}-resize` }} />,
      );
    }
  }
  // target outline while connecting
  if (cur?.t === 'connect' && cur.target) {
    const r = rects.get(cur.target)!;
    overlays.push(<rect key="ct" x={r.x - 4 / z} y={r.y - 4 / z} width={r.w + 8 / z} height={r.h + 8 / z} rx={6 / z} style={{ fill: 'var(--select-soft)', stroke: 'var(--select)', strokeWidth: 1.5 / z, pointerEvents: 'none' }} />);
  }
  // row / header highlight bands
  const band = (id: string, a: Anchor | null | undefined, key: string, strong = false) => {
    const d = dotOf(id, a);
    const r = rects.get(id);
    if (!d?.band || !r) return;
    overlays.push(<rect key={key} x={r.x + 1} y={d.band.top} width={r.w - 2} height={d.band.h} style={{ fill: strong ? 'var(--select-soft)' : 'var(--accent-soft)', opacity: strong ? 1 : 0.85, pointerEvents: 'none' }} />);
  };
  if (cur?.t === 'connect') band(cur.from, cur.fromAnchor, 'fromband', true);
  // a selected line pinned to rows shows which rows it joins
  if (selection.length === 1 && !cur) {
    const ed = doc.edges.find((q) => q.id === selection[0]);
    if (ed?.source.node && ed.source.field) band(ed.source.node, { side: ed.source.side ?? 'right', field: ed.source.field }, 'selband-s');
    if (ed?.target.node && ed.target.field) band(ed.target.node, { side: ed.target.side ?? 'left', field: ed.target.field }, 'selband-t');
  }
  // connection dots: on the hovered shape, and on whatever a line is being dragged onto
  const dotNodes = new Set<string>();
  if (handleFor) dotNodes.add(handleFor);
  if ((cur?.t === 'connect' || cur?.t === 'endpoint') && cur.target) dotNodes.add(cur.target);
  for (const id of dotNodes) {
    const snapped = cur && (cur.t === 'connect' || cur.t === 'endpoint') && cur.target === id ? cur.snap : null;
    if (snapped) band(id, snapped, 'snapband', true);
    for (const d of anchorDots(id)) {
      const on = (snapped && sameAnchor(d, snapped)) || hoverDot.current === d.key;
      if (hoverDot.current === d.key && !cur && d.band) band(id, d, 'hb' + d.key, true);
      overlays.push(
        <g key={'ad' + id + d.key} data-anchor={d.key} data-for={id} style={{ cursor: 'crosshair' }}>
          <circle cx={d.x} cy={d.y} r={(d.busy ? 5 : 9) / z} style={{ fill: 'transparent' }} />
          <circle cx={d.x} cy={d.y} r={(on ? 4.8 : d.busy ? 3 : 3.4) / z} style={{ fill: on ? 'var(--select)' : 'var(--panel)', stroke: 'var(--select)', strokeWidth: 1.4 / z }} />
        </g>,
      );
    }
  }

  // connect preview
  if (cur?.t === 'connect') {
    const r = rects.get(cur.from)!;
    const fromDot = dotOf(cur.from, cur.fromAnchor);
    const c = fromDot ?? center(r);
    const snapDot = cur.target ? dotOf(cur.target, cur.snap) : undefined;
    const end = snapDot ?? (cur.target ? center(rects.get(cur.target)!) : cur.cur);
    overlays.push(<line key="cp" x1={c.x} y1={c.y} x2={end.x} y2={end.y} style={{ stroke: 'var(--select)', strokeWidth: 2 / z, strokeDasharray: `${6 / z} ${4 / z}`, pointerEvents: 'none' }} />);
  }
  if (cur?.t === 'endpoint' && cur.target) {
    const r = rects.get(cur.target)!;
    overlays.push(<rect key="et" x={r.x - 4 / z} y={r.y - 4 / z} width={r.w + 8 / z} height={r.h + 8 / z} rx={6 / z} style={{ fill: 'var(--select-soft)', stroke: 'var(--select)', strokeWidth: 1.5 / z, pointerEvents: 'none' }} />);
  }
  if (cur?.t === 'pen' && cur.pts.length) {
    const d = 'M' + cur.pts.map((q) => `${q.x},${q.y}`).join('L');
    overlays.push(<path key="pen" d={d} style={{ fill: 'none', stroke: lineVar(toolOpts.penColor), strokeWidth: toolOpts.penWidth, strokeLinecap: 'round', strokeLinejoin: 'round', pointerEvents: 'none' }} />);
  }
  if (cur?.t === 'draw-line') {
    for (const id of [cur.from, cur.to]) {
      const r = id ? rects.get(id) : undefined;
      if (r) overlays.push(<rect key={'dl' + id} x={r.x - 4 / z} y={r.y - 4 / z} width={r.w + 8 / z} height={r.h + 8 / z} rx={6 / z} style={{ fill: 'var(--select-soft)', stroke: 'var(--select)', strokeWidth: 1.5 / z, pointerEvents: 'none' }} />);
    }
    overlays.push(<line key="dlp" x1={cur.start.x} y1={cur.start.y} x2={cur.cur.x} y2={cur.cur.y} style={{ stroke: 'var(--select)', strokeWidth: 2 / z, pointerEvents: 'none' }} />);
  }
  if (cur?.t === 'marquee') {
    const r = normRect(cur.start, cur.cur);
    overlays.push(<rect key="mq" x={r.x} y={r.y} width={r.w} height={r.h} style={{ fill: 'var(--select-soft)', stroke: 'var(--select)', strokeWidth: 1 / z, pointerEvents: 'none' }} />);
  }

  const isEmpty = doc.nodes.length === 0 && doc.edges.length === 0;

  return (
    <div
      ref={wrapRef}
      className={`canvas-wrap${panning ? ' panning' : ''}${space ? ' space' : ''}${tool !== 'select' ? ' tool-' + tool : ''}`}
      tabIndex={0}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
      style={{ ['--diagram-font' as any]: famCss }}
    >
      <svg
        ref={svgRef}
        className="canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { if (!ix.current) useEditor.getState().setHovered(null); }}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          <pattern id="grid" width={gs} height={gs} patternUnits="userSpaceOnUse">
            <circle cx={gs / 2} cy={gs / 2} r={Math.max(0.7, 1 / z)} style={{ fill: 'var(--grid)' }} />
          </pattern>
        </defs>
        <g transform={`translate(${view.x},${view.y}) scale(${z})`}>
          {prefs.canvas.grid && z > 0.3 && (
            <rect x={-view.x / z - gs} y={-view.y / z - gs} width={(wrapRef.current?.clientWidth ?? 4000) / z + gs * 2} height={(wrapRef.current?.clientHeight ?? 3000) / z + gs * 2} style={{ fill: 'url(#grid)', pointerEvents: 'none' }} />
          )}
          <DiagramContent
            doc={doc}
            rects={rects}
            routes={routes}
            prefs={prefs}
            focus={focus}
            interactive
            editingNode={editing?.type === 'node' ? editing.id : undefined}
            editingField={editing?.type === 'field' ? editing.fieldId : undefined}
            editingEdge={editing?.type === 'edge' ? editing.id : undefined}
            openComments={new Set([...selection, ...(hovered ? [hovered] : [])])}
            warnings={warnings}
          />
          <g>{overlays}</g>
          <g>{endHandles}</g>
        </g>
      </svg>

      {isEmpty && doc.mode === 'circuit' && (
        <div className="hint">
          <b>Build a circuit</b>
          <span>Drag a <b>switch</b>, a <b>gate</b> and a <b>light bulb</b> from the left.</span>
          <span>Drag from a pin dot to another pin to wire them. Click a switch to flip it.</span>
        </div>
      )}
      {isEmpty && doc.mode !== 'circuit' && (
        <div className="hint">
          <b>Start your diagram</b>
          <span>Drag a shape from the left, or double-click anywhere to add {useEditor.getState().panelNotation === 'chen' ? 'an entity' : 'a table'}.</span>
          <span>To connect two shapes, hover one and drag from a <b style={{ color: 'var(--select)' }}>blue dot</b> on its edge onto the other.</span>
        </div>
      )}

      {looseIssues.length > 0 && (
        <button className="sql-banner" onClick={() => useEditor.getState().jumpToSql(looseIssues[0].line)} title="Show it in the SQL">
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1.5L15 14H1Z" fill="var(--warn)" stroke="var(--warn)" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 6V9.6M8 11.8V12" stroke="#1B1D21" strokeWidth="1.7" strokeLinecap="round" /></svg>
          <span><b>SQL line {looseIssues[0].line}:</b> {looseIssues[0].message}{looseIssues.length > 1 ? ` (+${looseIssues.length - 1} more)` : ''}</span>
        </button>
      )}

      {editing && <InlineEditor rects={rects} routes={routes} />}

      {quick && (() => {
        const fromDir = pinDir(quick.fromAnchor?.field);
        const defs = fromDir ? quickDefs(QUICK_LOGIC[fromDir]) : QUICK[useEditor.getState().panelNotation].map((k) => SHAPES.find((s) => s.kind === k)!);
        return (
          <QuickCreate
            at={quick.screen}
            defs={defs}
            title={fromDir ? 'Add connected part' : 'Add connected shape'}
            onPick={(def) => {
              const st = useEditor.getState();
              const id = st.addPreset(def.id, quick.world);
              if (fromDir) {
                const n = useEditor.getState().doc.nodes.find((q) => q.id === id)!;
                const pin = logicPins(n, nodeRect(n, prefs)).find((q) => q.dir !== fromDir);
                if (pin) st.connect(quick.from, id, { source: quick.fromAnchor, target: { side: pin.side, field: pin.id } });
                st.select([id]);
              } else {
                st.connect(quick.from, id);
                st.select([id]);
                st.setEditing({ type: 'node', id });
              }
              setQuick(null);
            }}
            onClose={() => setQuick(null)}
          />
        );
      })()}
    </div>
  );
}

function QuickCreate({ at, defs, title, onPick, onClose }: { at: Pt; defs: ShapeDef[]; title: string; onPick: (d: ShapeDef) => void; onClose: () => void }) {
  // keep the menu inside the canvas (it would otherwise hide under the right panel)
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: at.x + 6, y: at.y + 6 });
  useLayoutEffect(() => {
    const el = ref.current, box = el?.parentElement;
    if (!el || !box) return;
    setPos({ x: Math.max(6, Math.min(at.x + 6, box.clientWidth - el.offsetWidth - 8)), y: Math.max(6, Math.min(at.y + 6, box.clientHeight - el.offsetHeight - 8)) });
  }, [at.x, at.y]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div ref={ref} className="menu" style={{ position: 'absolute', left: pos.x, top: pos.y }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="menu-label">{title}</div>
      {defs.map((def) => (
        <button key={def.id} className="menu-item" onClick={() => onPick(def)}>
          <span style={{ width: 30, display: 'flex', justifyContent: 'center', color: 'var(--text-2)' }}><ShapeIcon kind={def.kind} logic={def.logic} /></span>
          <span className="grow">{def.name}</span>
        </button>
      ))}
    </div>
  );
}

function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || !!el.closest('.cm-editor');
}

export type { DNode };

function capture(e: React.PointerEvent) {
  try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch {}
}
