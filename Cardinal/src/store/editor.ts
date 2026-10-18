import { create } from 'zustand';
import { CONNECTORS, DEFAULT_CONNECTOR, SHAPES, connectorById, shapeById } from '../model/catalog';
import { emptyDoc, uid, type DEdge, type DNode, type DiagramFile, type DiagramMeta, type Doc, type Field, type NodeKind, type Notation, type Pt, type Side, type ColorKey, type EndRef } from '../model/types';
import { isEllipse, nodeRect } from '../geometry/geometry';
import { usePrefs } from './prefs';
import { inputCount, isGate, nextLabel, pinDir } from '../model/logic';
import type { SqlIssue } from '../sql/sql';

export interface View { x: number; y: number; zoom: number }
/** A chosen connection point: a table row (field, or '@header') or a spot along a side (pos 0..1). */
export interface RowAnchor { side: Side; field?: string; pos?: number }
export type Tool = 'select' | 'note' | 'text' | 'line' | 'pen' | 'comment';
export interface ToolOpts { noteColor: ColorKey; penColor: ColorKey; penWidth: number; lineArrow: boolean }

export type Editing =
  | { type: 'node'; id: string }
  | { type: 'field'; id: string; fieldId: string; cell?: 'key' | 'name' | 'type' }
  | { type: 'edge'; id: string }
  | null;

interface EditorState {
  meta: DiagramMeta | null;
  doc: Doc;
  past: Doc[];
  future: Doc[];
  txBase: Doc | null;
  lastCoalesce: string | null;
  selection: string[];
  hovered: string | null;
  view: View;
  panelNotation: Notation;
  activeConnector: Record<Notation, string>;
  editing: Editing;
  moving: Set<string> | null;
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
  dirtyTick: number;
  tool: Tool;
  toolOpts: ToolOpts;
  /** problems found in the SQL panel's code (not saved) */
  sqlIssues: SqlIssue[];
  /** ask the SQL panel to open and jump to a line */
  sqlJump: { line: number; tick: number } | null;
  /** SQL text that still has problems, kept while the SQL tab is closed */
  sqlDraft: string | null;
  /** bumps on undo / redo (the SQL panel then rewrites its code from the diagram) */
  historyTick: number;
  setSqlIssues(i: SqlIssue[]): void;
  jumpToSql(line: number): void;
  setTool(t: Tool): void;
  setToolOpts(p: Partial<ToolOpts>): void;
  addPreset(presetId: string, centerAt: Pt): string;
  addRaw(n: DNode): string;
  /** flip a switch / press a button: saved with the diagram but not an undo step */
  setSwitch(id: string, on: boolean): void;

  load(file: DiagramFile): void;
  setMeta(meta: DiagramMeta): void;
  /** Apply a change as one undo step. Same coalesce key in a row = one step (typing). */
  commit(fn: (d: Doc) => void, coalesce?: string): void;
  begin(): void;
  live(fn: (d: Doc) => void): void;
  end(): void;
  undo(): void;
  redo(): void;

  select(ids: string[], additive?: boolean): void;
  setHovered(id: string | null): void;
  setView(v: Partial<View>): void;
  setPanelNotation(n: Notation): void;
  setEditing(e: Editing): void;
  setMoving(s: Set<string> | null): void;
  setSaveStatus(s: EditorState['saveStatus']): void;

  addNode(kind: NodeKind, centerAt: Pt, text?: string): string;
  connect(source: string, target: string, anchors?: { source?: RowAnchor; target?: RowAnchor; connector?: string }): string | null;
  applyConnector(id: string): void;
  updateNode(id: string, patch: Partial<DNode>, coalesce?: string): void;
  updateEdge(id: string, patch: Partial<DEdge>, coalesce?: string): void;
  updateEdges(ids: string[], patch: Partial<DEdge>): void;
  deleteSelection(): void;
  duplicateSelection(): void;
  copySelection(): void;
  paste(at?: Pt): void;
  selectAll(kind?: 'nodes' | 'edges'): void;
  nudgeSelection(dx: number, dy: number): void;
}

const endRef = (node: string, an?: RowAnchor): EndRef => {
  if (!an) return { node };
  return an.field ? { node, field: an.field, side: an.side } : an.pos !== undefined ? { node, side: an.side, pos: an.pos } : { node, side: an.side };
};

let clipboard: { nodes: DNode[]; edges: DEdge[] } | null = null;
const HISTORY_LIMIT = 200;

export const snap = (v: number) => {
  const { snap, gridSize } = usePrefs.getState().prefs.canvas;
  return snap ? Math.round(v / gridSize) * gridSize : Math.round(v);
};

export const newField = (name = '', type = '', extra: Partial<Field> = {}): Field => ({ id: uid('f'), name, type, ...extra });

const ATTRIBUTE_LIKE = (k?: NodeKind) => !!k && isEllipse(k);
const CF_KINDS = new Set<NodeKind>(['table', 'entity-simple']);

export const useEditor = create<EditorState>((set, get) => ({
  meta: null,
  doc: emptyDoc('crowsfoot'),
  past: [],
  future: [],
  txBase: null,
  lastCoalesce: null,
  selection: [],
  hovered: null,
  view: { x: 0, y: 0, zoom: 1 },
  panelNotation: 'crowsfoot',
  activeConnector: { ...DEFAULT_CONNECTOR },
  editing: null,
  moving: null,
  saveStatus: 'saved',
  dirtyTick: 0,
  tool: 'select',
  sqlIssues: [],
  sqlJump: null,
  sqlDraft: null,
  historyTick: 0,
  setSqlIssues(i) { if (i.length || get().sqlIssues.length) set({ sqlIssues: i }); },
  jumpToSql(line) { set({ sqlJump: { line, tick: Date.now() } }); },
  toolOpts: (() => {
    try { return { noteColor: 'yellow', penColor: 'auto', penWidth: 3, lineArrow: true, ...JSON.parse(localStorage.getItem('cardinal.toolOpts') || '{}') }; }
    catch { return { noteColor: 'yellow', penColor: 'auto', penWidth: 3, lineArrow: true }; }
  })(),
  setTool(t) { set({ tool: t, editing: null }); },
  setToolOpts(p) {
    const next = { ...get().toolOpts, ...p };
    set({ toolOpts: next });
    try { localStorage.setItem('cardinal.toolOpts', JSON.stringify(next)); } catch {}
  },
  addPreset(presetId, at) {
    const prefs = usePrefs.getState().prefs;
    const def = shapeById(presetId);
    if (!def) return '';
    const n: DNode = { id: uid('n'), kind: def.kind, x: 0, y: 0, text: def.defaultText };
    if (def.shape) n.shape = def.shape;
    if (def.variant) n.variant = def.variant;
    if (def.logic) {
      n.logic = def.logic;
      n.text = nextLabel(get().doc, def.logic);
      if (isGate(def.logic) && inputCount(n) > 1) n.inputs = 2;
    }
    if (def.fields) n.fields = def.fields();
    else if (def.kind === 'table') n.fields = [newField('id', 'INT', { pk: true })];
    if (def.kind === 'note') n.style = { fill: get().toolOpts.noteColor };
    else if (prefs.rememberLast && def.kind !== 'text' && def.kind !== 'logic' && Object.keys(prefs.last.node).length) n.style = { ...prefs.last.node };
    const r = nodeRect(n, prefs);
    n.x = snap(at.x - r.w / 2);
    n.y = snap(at.y - r.h / 2);
    get().commit((d) => {
      // containers go to the back of the list so they never cover other shapes in hit-testing
      if (def.kind === 'shape' && n.shape && ['container', 'frame', 'swimlane', 'pool'].includes(n.shape)) d.nodes.unshift(n);
      else d.nodes.push(n);
    });
    set({ selection: [n.id] });
    return n.id;
  },
  addRaw(n) {
    get().commit((d) => { d.nodes.push(n); });
    set({ selection: [n.id] });
    return n.id;
  },
  setSwitch(id, on) {
    const doc = get().doc;
    const cur = doc.nodes.find((n) => n.id === id);
    if (!cur || !!cur.on === on) return;
    const flip = (d: Doc) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, on: on || undefined } : n)) });
    // keep the state across undo/redo too, so undoing a move doesn't flip switches back
    set({ doc: flip(doc), past: get().past.map(flip), future: get().future.map(flip), saveStatus: 'unsaved', dirtyTick: get().dirtyTick + 1 });
  },

  load(file) {
    set({
      meta: file.meta,
      doc: file.doc,
      past: [],
      future: [],
      txBase: null,
      lastCoalesce: null,
      selection: [],
      hovered: null,
      editing: null,
      moving: null,
      panelNotation: file.doc.notation ?? file.meta.notation,
      sqlIssues: [],
      sqlJump: null,
      sqlDraft: null,
      saveStatus: 'saved',
    });
  },
  setMeta(meta) { set({ meta }); },

  commit(fn, coalesce) {
    const { doc, past, lastCoalesce } = get();
    const next = structuredClone(doc);
    fn(next);
    const merge = coalesce && coalesce === lastCoalesce;
    set({
      doc: next,
      past: merge ? past : [...past.slice(-HISTORY_LIMIT), doc],
      future: [],
      lastCoalesce: coalesce ?? null,
      saveStatus: 'unsaved',
      dirtyTick: get().dirtyTick + 1,
    });
  },
  begin() { set({ txBase: get().doc }); },
  live(fn) {
    const next = structuredClone(get().doc);
    fn(next);
    set({ doc: next });
  },
  end() {
    const { txBase, doc, past } = get();
    set({ txBase: null, lastCoalesce: null });
    if (!txBase || txBase === doc) return;
    if (JSON.stringify(txBase) === JSON.stringify(doc)) return;
    set({ past: [...past.slice(-HISTORY_LIMIT), txBase], future: [], saveStatus: 'unsaved', dirtyTick: get().dirtyTick + 1 });
  },
  undo() {
    const { past, future, doc } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    const ids = new Set([...prev.nodes.map((n) => n.id), ...prev.edges.map((e) => e.id)]);
    set({ historyTick: get().historyTick + 1, sqlDraft: null, sqlIssues: [], doc: prev, past: past.slice(0, -1), future: [doc, ...future], lastCoalesce: null, selection: get().selection.filter((s) => ids.has(s)), saveStatus: 'unsaved', dirtyTick: get().dirtyTick + 1, editing: null });
  },
  redo() {
    const { past, future, doc } = get();
    if (!future.length) return;
    const next = future[0];
    const ids = new Set([...next.nodes.map((n) => n.id), ...next.edges.map((e) => e.id)]);
    set({ historyTick: get().historyTick + 1, sqlDraft: null, sqlIssues: [], doc: next, past: [...past, doc], future: future.slice(1), lastCoalesce: null, selection: get().selection.filter((s) => ids.has(s)), saveStatus: 'unsaved', dirtyTick: get().dirtyTick + 1, editing: null });
  },

  select(ids, additive) {
    if (!additive) return set({ selection: ids });
    const cur = new Set(get().selection);
    for (const id of ids) cur.has(id) ? cur.delete(id) : cur.add(id);
    set({ selection: [...cur] });
  },
  setHovered(id) { if (get().hovered !== id) set({ hovered: id }); },
  setView(v) { set({ view: { ...get().view, ...v } }); },
  setPanelNotation(n) {
    set({ panelNotation: n });
    if (get().doc.notation !== n && !get().doc.nodes.length) get().commit((d) => { d.notation = n; });
  },
  setEditing(e) { set({ editing: e }); },
  setMoving(s) { set({ moving: s }); },
  setSaveStatus(s) { set({ saveStatus: s }); },

  addNode(kind, at, text) {
    const def = SHAPES.find((x) => x.kind === kind && (text === undefined || x.defaultText === text)) ?? SHAPES.find((x) => x.kind === kind);
    return def ? get().addPreset(def.id, at) : '';
  },

  connect(source, target, anchors) {
    const { doc, activeConnector } = get();
    let a = doc.nodes.find((n) => n.id === source);
    let b = doc.nodes.find((n) => n.id === target);
    if (!a || !b) return null;
    let sa = anchors?.source, ta = anchors?.target;
    // FK row → PK row: keep the "one" side on the table that owns the primary key
    const fieldOf = (n: DNode, an?: RowAnchor) => (an ? n.fields?.find((f) => f.id === an.field) : undefined);
    if (fieldOf(b, ta)?.pk && !fieldOf(a, sa)?.pk && sa) {
      [a, b] = [b, a];
      [sa, ta] = [ta, sa];
    }
    // logic wires: output pin → input pin, one wire per input
    if (a.kind === 'logic' || b.kind === 'logic') {
      let sp = a.kind === 'logic' ? sa?.field : undefined, tp = b.kind === 'logic' ? ta?.field : undefined;
      if (pinDir(sp) === 'in' || pinDir(tp) === 'out') { [a, b] = [b, a]; [sa, ta] = [ta, sa]; [sp, tp] = [tp, sp]; }
      if (a.kind === 'logic' && b.kind === 'logic' && (pinDir(sp) !== 'out' || pinDir(tp) !== 'in')) return null;
      const wire: DEdge = { id: uid('e'), source: endRef(a.id, sa), target: endRef(b.id, ta), sourceEnd: 'none', targetEnd: 'none' };
      const bId = b.id;
      get().commit((d) => {
        if (tp) d.edges = d.edges.filter((x) => !((x.target.node === bId && x.target.field === tp) || (x.source.node === bId && x.source.field === tp)));
        d.edges.push(wire);
      });
      set({ selection: [wire.id] });
      return wire.id;
    }
    const GENERAL = new Set<NodeKind>(['text', 'note', 'shape', 'image', 'drawing', 'comment']);
    let conn: string;
    if (anchors?.connector) conn = anchors.connector;
    else if (a.kind === 'text' || a.kind === 'note' || b.kind === 'text' || b.kind === 'note') conn = 'line';
    else if (GENERAL.has(a.kind) || GENERAL.has(b.kind)) conn = 'arrow';
    else if (CF_KINDS.has(a.kind) || CF_KINDS.has(b.kind)) conn = activeConnector.crowsfoot;
    else if (ATTRIBUTE_LIKE(a.kind) || ATTRIBUTE_LIKE(b.kind)) conn = 'chen-attr';
    else if (a.kind === 'specialization' || b.kind === 'specialization' || a.kind === 'isa' || b.kind === 'isa') conn = 'line';
    else conn = activeConnector.chen;
    const def = connectorById(conn) ?? CONNECTORS[0];
    const prefs = usePrefs.getState().prefs;
    const e: DEdge = {
      id: uid('e'),
      source: endRef(a.id, sa),
      target: endRef(b.id, ta),
      ...structuredClone(def.apply),
    };
    for (const k of Object.keys(e) as (keyof DEdge)[]) if (e[k] === undefined) delete e[k];
    if (prefs.rememberLast && Object.keys(prefs.last.edge).length) e.style = { ...prefs.last.edge };
    const pkField = fieldOf(a, sa), childField = fieldOf(b, ta);
    const aId = a.id, bId = b.id;
    get().commit((d) => {
      d.edges.push(e);
      // PK row ↔ other row: that other row becomes a foreign key referencing the PK
      if (pkField?.pk && childField && !childField.pk) {
        const f = d.nodes.find((n) => n.id === bId)?.fields?.find((x) => x.id === childField.id);
        if (f) { f.fk = true; f.ref = { node: aId, field: pkField.id }; }
      } else if (pkField?.pk && childField?.pk && aId !== bId) {
        const f = d.nodes.find((n) => n.id === bId)?.fields?.find((x) => x.id === childField.id);
        if (f) { f.fk = true; f.ref = { node: aId, field: pkField.id }; }
      }
    });
    set({ selection: [e.id] });
    return e.id;
  },

  applyConnector(id) {
    const def = connectorById(id);
    if (!def) return;
    const notation: Notation = def.group === 'chen' ? 'chen' : 'crowsfoot';
    if (def.group !== 'shared') set({ activeConnector: { ...get().activeConnector, [notation]: id } });
    const edgeIds = new Set(get().doc.edges.map((e) => e.id));
    const sel = get().selection.filter((s) => edgeIds.has(s));
    if (sel.length) get().updateEdges(sel, def.apply);
  },

  updateNode(id, patch, coalesce) {
    get().commit((d) => {
      const n = d.nodes.find((x) => x.id === id);
      if (n) Object.assign(n, patch);
    }, coalesce);
  },
  updateEdge(id, patch, coalesce) {
    get().commit((d) => {
      const e = d.edges.find((x) => x.id === id);
      if (!e) return;
      Object.assign(e, patch);
      for (const k of Object.keys(patch) as (keyof DEdge)[]) if (patch[k] === undefined) delete e[k];
    }, coalesce);
  },
  updateEdges(ids, patch) {
    const set_ = new Set(ids);
    get().commit((d) => {
      for (const e of d.edges) {
        if (!set_.has(e.id)) continue;
        Object.assign(e, structuredClone(patch));
        for (const k of Object.keys(patch) as (keyof DEdge)[]) if (patch[k] === undefined) delete e[k];
      }
    });
  },

  deleteSelection() {
    const sel = new Set(get().selection);
    if (!sel.size) return;
    get().commit((d) => {
      d.nodes = d.nodes.filter((n) => !sel.has(n.id));
      const alive = new Set(d.nodes.map((n) => n.id));
      d.edges = d.edges.filter((e) => !sel.has(e.id) && (!e.source.node || alive.has(e.source.node)) && (!e.target.node || alive.has(e.target.node)));
      // FK references to deleted tables are dropped
      for (const n of d.nodes) for (const f of n.fields ?? []) if (f.ref && !alive.has(f.ref.node)) delete f.ref;
    });
    set({ selection: [], editing: null, hovered: null });
  },

  copySelection() {
    const sel = new Set(get().selection);
    const { doc } = get();
    const nodes = doc.nodes.filter((n) => sel.has(n.id));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = doc.edges.filter((e) => (sel.has(e.id) || ids.has(e.source.node ?? '')) && e.source.node && e.target.node && ids.has(e.source.node) && ids.has(e.target.node));
    if (nodes.length) clipboard = structuredClone({ nodes, edges });
  },

  paste(at) {
    if (!clipboard) return;
    const map = new Map<string, string>();
    const nodes = clipboard.nodes.map((n) => {
      const id = uid('n');
      map.set(n.id, id);
      return { ...structuredClone(n), id };
    });
    let dx = 30, dy = 30;
    if (at && nodes.length) {
      const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
      dx = snap(at.x - minX);
      dy = snap(at.y - minY);
    }
    for (const n of nodes) {
      n.x += dx; n.y += dy;
      for (const f of n.fields ?? []) {
        f.id = uid('f');
        if (f.ref && map.has(f.ref.node)) f.ref = { ...f.ref, node: map.get(f.ref.node)! };
      }
    }
    const edges = clipboard.edges.map((e) => ({ ...structuredClone(e), id: uid('e'), source: { ...e.source, node: map.get(e.source.node!) }, target: { ...e.target, node: map.get(e.target.node!) } }));
    get().commit((d) => { d.nodes.push(...nodes); d.edges.push(...edges); });
    set({ selection: nodes.map((n) => n.id) });
    // next paste lands further along
    clipboard = { nodes: clipboard.nodes.map((n) => ({ ...n, x: n.x + 30, y: n.y + 30 })), edges: clipboard.edges };
  },

  duplicateSelection() {
    const saved = clipboard;
    get().copySelection();
    get().paste();
    clipboard = saved;
  },

  selectAll(kind) {
    const { doc } = get();
    const ids = kind === 'edges' ? doc.edges.map((e) => e.id) : kind === 'nodes' ? doc.nodes.map((n) => n.id) : [...doc.nodes.map((n) => n.id), ...doc.edges.map((e) => e.id)];
    set({ selection: ids });
  },

  nudgeSelection(dx, dy) {
    const sel = new Set(get().selection);
    get().commit((d) => {
      for (const n of d.nodes) if (sel.has(n.id)) { n.x += dx; n.y += dy; }
      for (const e of d.edges) if (sel.has(e.id)) {
        if (!e.source.node && e.source.x !== undefined) { e.source.x += dx; e.source.y! += dy; }
        if (!e.target.node && e.target.x !== undefined) { e.target.x += dx; e.target.y! += dy; }
      }
    }, 'nudge');
  },
}));
