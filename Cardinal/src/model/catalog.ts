import type { DEdge, EndMarker, Field, NodeKind, Notation } from './types';
import { uid } from './types';
import { BASIC_SHAPES, type BasicCategory } from './basicShapes';
import { LOGIC, type LogicType } from './logic';

export type Group = Notation | 'shared';
export type ShapeGroup = Notation | 'text' | BasicCategory | 'logic-input' | 'logic-gate' | 'logic-output';

// ───────────────────────── Shapes ─────────────────────────

export interface ShapeDef {
  /** stable id (used by favorites) */
  id: string;
  kind: NodeKind;
  group: ShapeGroup;
  name: string;
  keyword: string;
  defaultText: string;
  shape?: string;
  variant?: 'view' | 'enum';
  fields?: () => Field[];
  logic?: LogicType;
  /** tooltip / explanation */
  hint?: string;
}

const fld = (name: string, type: string, extra: Partial<Field> = {}): Field => ({ id: uid('f'), name, type, ...extra });

export const SHAPES: ShapeDef[] = [
  { id: 'cf-table', kind: 'table', group: 'crowsfoot', name: 'Entity table', keyword: 'TABLE', defaultText: 'Entity', fields: () => [fld('id', 'INT', { pk: true })] },
  { id: 'cf-simple', kind: 'entity-simple', group: 'crowsfoot', name: 'Entity (title only)', keyword: 'BOX', defaultText: 'Entity' },
  { id: 'cf-junction', kind: 'table', group: 'crowsfoot', name: 'Junction table (many-to-many)', keyword: 'JUNCTION', defaultText: 'A_B', fields: () => [fld('a_id', 'INT', { pk: true, fk: true }), fld('b_id', 'INT', { pk: true, fk: true })] },
  { id: 'cf-view', kind: 'table', variant: 'view', group: 'crowsfoot', name: 'View', keyword: 'VIEW', defaultText: 'v_summary', fields: () => [fld('id', 'INT'), fld('total', 'DECIMAL(10,2)')] },
  { id: 'cf-enum', kind: 'table', variant: 'enum', group: 'crowsfoot', name: 'Enum (list of values)', keyword: 'ENUM', defaultText: 'status', fields: () => [fld('pending', ''), fld('active', ''), fld('closed', '')] },

  { id: 'chen-entity', kind: 'entity', group: 'chen', name: 'Entity', keyword: 'E', defaultText: 'ENTITY' },
  { id: 'chen-weak', kind: 'weak-entity', group: 'chen', name: 'Weak entity', keyword: 'WE', defaultText: 'WEAK_ENTITY' },
  { id: 'chen-assoc', kind: 'associative-entity', group: 'chen', name: 'Associative entity', keyword: 'AE', defaultText: 'ENROLLMENT' },
  { id: 'chen-rel', kind: 'relationship', group: 'chen', name: 'Relationship', keyword: 'R', defaultText: 'RELATES' },
  { id: 'chen-idrel', kind: 'identifying-relationship', group: 'chen', name: 'Identifying relationship', keyword: 'IR', defaultText: 'HAS' },
  { id: 'chen-attr', kind: 'attribute', group: 'chen', name: 'Attribute', keyword: 'A', defaultText: 'Attribute' },
  { id: 'chen-key', kind: 'key-attribute', group: 'chen', name: 'Key attribute', keyword: 'KA', defaultText: 'Id' },
  { id: 'chen-pkey', kind: 'partial-key-attribute', group: 'chen', name: 'Partial key', keyword: 'PK', defaultText: 'Number' },
  { id: 'chen-multi', kind: 'multivalued-attribute', group: 'chen', name: 'Multivalued attribute', keyword: 'MA', defaultText: 'Phones' },
  { id: 'chen-derived', kind: 'derived-attribute', group: 'chen', name: 'Derived attribute', keyword: 'DA', defaultText: 'Age' },
  { id: 'chen-composite', kind: 'attribute', group: 'chen', name: 'Composite attribute (link sub-attributes to it)', keyword: 'CA', defaultText: 'Address' },
  { id: 'chen-disjoint', kind: 'specialization', group: 'chen', name: 'Specialization · disjoint', keyword: 'D', defaultText: 'd' },
  { id: 'chen-overlap', kind: 'specialization', group: 'chen', name: 'Specialization · overlapping', keyword: 'O', defaultText: 'o' },
  { id: 'chen-union', kind: 'specialization', group: 'chen', name: 'Category · union', keyword: 'U', defaultText: '∪' },
  { id: 'chen-isa', kind: 'isa', group: 'chen', name: 'ISA triangle', keyword: 'ISA', defaultText: 'ISA' },
  { id: 'chen-aggregation', kind: 'shape', shape: 'frame', group: 'chen', name: 'Aggregation (box around a relationship)', keyword: 'AGG', defaultText: '' },

  { id: 'text', kind: 'text', group: 'text', name: 'Text', keyword: 'T', defaultText: 'Text' },
  { id: 'note', kind: 'note', group: 'text', name: 'Sticky note', keyword: 'N', defaultText: 'Note' },

  ...BASIC_SHAPES.map((b): ShapeDef => ({
    id: 'shape-' + b.id, kind: 'shape', shape: b.id, group: b.category, name: b.name, keyword: b.keyword,
    defaultText: b.container ? (b.id === 'swimlane' ? 'Lane' : b.id === 'pool' ? 'Pool' : 'Group') : b.label === 'below' ? 'Actor' : '',
  })),

  ...LOGIC.map((l): ShapeDef => ({
    id: 'logic-' + l.id, kind: 'logic', logic: l.id, group: ('logic-' + l.category) as ShapeGroup, name: l.name,
    keyword: l.keyword, defaultText: '', hint: l.hint,
  })),
];

export const shapeById = (id: string) => SHAPES.find((s) => s.id === id);

// ───────────────────────── Connectors ─────────────────────────

export interface ConnectorDef {
  id: string;
  group: Group;
  name: string;
  keyword: string;
  /** properties applied to the edge */
  apply: Partial<DEdge>;
  /** Crow's Foot pairs: the marker at the start and at the end (min+max codes) */
  ends?: [CfCode, CfCode];
  /** other ways people write it (lecture words, ratio) — searched as text */
  aliases?: string[];
}

type CfCode = '11' | '01' | '1M' | '0M';
/** How each min+max end is written in the notations used in lectures and in industry. */
export const NOTATIONS: Record<CfCode, { lecture: string; short: string; uml: string; minmax: string }> = {
  '11': { lecture: 'one and only one', short: 'mandatory one', uml: '1', minmax: '(1,1)' },
  '01': { lecture: 'zero or one', short: 'optional one', uml: '0..1', minmax: '(0,1)' },
  '1M': { lecture: 'one or many', short: 'mandatory many', uml: '1..*', minmax: '(1,N)' },
  '0M': { lecture: 'zero or many', short: 'optional many', uml: '0..*', minmax: '(0,N)' },
};
const ratioOf = (a: CfCode, b: CfCode) => {
  const ma = a[1] === 'M', mb = b[1] === 'M';
  return !ma && !mb ? ['one-to-one', '1:1'] : !ma ? ['one-to-many', '1:N', '1:M'] : !mb ? ['many-to-one', 'N:1', 'M:1'] : ['many-to-many', 'M:N', 'N:M'];
};

/** The same line written in every notation (for tooltips). (min,max) sits on the opposite ends. */
export function equivalents(def: ConnectorDef): string[] {
  if (!def.ends) return [];
  const [a, b] = def.ends;
  const A = NOTATIONS[a], B = NOTATIONS[b];
  return [
    `In words: ${A.lecture} → ${B.lecture}`,
    `UML multiplicity: ${A.uml} → ${B.uml}`,
    `(min,max): ${B.minmax} at the start, ${A.minmax} at the end (written on the other side)`,
    `Ratio: ${ratioOf(a, b).slice(1).join(' or ')} (${ratioOf(a, b)[0]})`,
  ];
}

const CF_ENDS: { code: EndMarker; name: string }[] = [
  { code: '11', name: 'Mandatory one' },
  { code: '01', name: 'Optional one' },
  { code: '1M', name: 'Mandatory many' },
  { code: '0M', name: 'Optional many' },
];

const crowsFoot: ConnectorDef[] = [];
for (const a of CF_ENDS) {
  for (const b of CF_ENDS) {
    crowsFoot.push({
      id: `cf-${a.code}-${b.code}`,
      group: 'crowsfoot',
      name: `${a.name} to ${b.name.toLowerCase()}`,
      keyword: `${a.code}:${b.code}`,
      apply: { sourceEnd: a.code, targetEnd: b.code, chenLabel: undefined, total: undefined, subset: undefined },
      ends: [a.code as CfCode, b.code as CfCode],
      aliases: [
        `${NOTATIONS[a.code as CfCode].lecture} to ${NOTATIONS[b.code as CfCode].lecture}`,
        ...ratioOf(a.code as CfCode, b.code as CfCode),
      ],
    });
  }
}
// Most-used first: one-to-many shapes lead.
const CF_ORDER = ['11:0M', '11:1M', '01:0M', '01:1M', '11:11', '11:01', '01:01', '0M:0M', '1M:1M', '0M:1M'];
crowsFoot.sort((x, y) => {
  const ix = CF_ORDER.indexOf(x.keyword), iy = CF_ORDER.indexOf(y.keyword);
  return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
});

const clearCf = { sourceEnd: 'none' as EndMarker, targetEnd: 'none' as EndMarker };

const chen: ConnectorDef[] = [
  { id: 'chen-attr', group: 'chen', name: 'Attribute link', keyword: 'AL', apply: { ...clearCf, chenLabel: undefined, total: false, subset: false } },
  { id: 'chen-p1', group: 'chen', name: 'Partial participation · 1', keyword: 'P1', apply: { ...clearCf, chenLabel: '1', total: false, subset: false } },
  { id: 'chen-pn', group: 'chen', name: 'Partial participation · N', keyword: 'PN', apply: { ...clearCf, chenLabel: 'N', total: false, subset: false } },
  { id: 'chen-pm', group: 'chen', name: 'Partial participation · M', keyword: 'PM', apply: { ...clearCf, chenLabel: 'M', total: false, subset: false } },
  { id: 'chen-t1', group: 'chen', name: 'Total participation · 1', keyword: 'T1', apply: { ...clearCf, chenLabel: '1', total: true, subset: false } },
  { id: 'chen-tn', group: 'chen', name: 'Total participation · N', keyword: 'TN', apply: { ...clearCf, chenLabel: 'N', total: true, subset: false } },
  { id: 'chen-tm', group: 'chen', name: 'Total participation · M', keyword: 'TM', apply: { ...clearCf, chenLabel: 'M', total: true, subset: false } },
  { id: 'chen-01', group: 'chen', name: '(min,max) optional one (0,1)', keyword: '01', aliases: ['0..1', 'zero or one'], apply: { ...clearCf, chenLabel: '(0,1)', total: false, subset: false } },
  { id: 'chen-11', group: 'chen', name: '(min,max) mandatory one (1,1)', keyword: '11', aliases: ['1..1', 'one and only one'], apply: { ...clearCf, chenLabel: '(1,1)', total: false, subset: false } },
  { id: 'chen-0n', group: 'chen', name: '(min,max) optional many (0,N)', keyword: '0N', aliases: ['0..*', 'zero or many'], apply: { ...clearCf, chenLabel: '(0,N)', total: false, subset: false } },
  { id: 'chen-1n', group: 'chen', name: '(min,max) mandatory many (1,N)', keyword: '1N', aliases: ['1..*', 'one or many'], apply: { ...clearCf, chenLabel: '(1,N)', total: false, subset: false } },
  { id: 'chen-total', group: 'chen', name: 'Total specialization (double line)', keyword: 'TS', apply: { ...clearCf, chenLabel: undefined, total: true, subset: false } },
  { id: 'chen-subset', group: 'chen', name: 'Subclass link (⊂)', keyword: 'SUB', apply: { ...clearCf, chenLabel: undefined, total: false, subset: true } },
];

const shared: ConnectorDef[] = [
  { id: 'simple-11', group: 'crowsfoot', name: 'One to one (simple)', keyword: '1:1', aliases: ['one-to-one'], apply: { sourceEnd: 'one', targetEnd: 'one', chenLabel: undefined, total: false, subset: false } },
  { id: 'simple-1m', group: 'crowsfoot', name: 'One to many (simple)', keyword: '1:M', aliases: ['one-to-many', '1:N'], apply: { sourceEnd: 'one', targetEnd: 'many', chenLabel: undefined, total: false, subset: false } },
  { id: 'simple-mm', group: 'crowsfoot', name: 'Many to many (simple)', keyword: 'M:N', aliases: ['many-to-many', 'N:M'], apply: { sourceEnd: 'many', targetEnd: 'many', chenLabel: undefined, total: false, subset: false } },
  { id: 'line', group: 'shared', name: 'Plain line', keyword: 'LINE', apply: { ...clearCf, chenLabel: undefined, total: false, subset: false, dashed: false } },
  { id: 'arrow', group: 'shared', name: 'Arrow', keyword: 'ARROW', apply: { sourceEnd: 'none', targetEnd: 'arrow', chenLabel: undefined, total: false, subset: false } },
  { id: 'dashed', group: 'shared', name: 'Dashed line', keyword: 'DASH', apply: { ...clearCf, chenLabel: undefined, total: false, subset: false, dashed: true } },
  { id: 'inherit', group: 'shared', name: 'Inheritance (is-a)', keyword: 'INHERIT', apply: { sourceEnd: 'none', targetEnd: 'triangle', chenLabel: undefined, total: false, subset: false } },
];

export const CONNECTORS: ConnectorDef[] = [...crowsFoot, ...chen, ...shared];

export const connectorById = (id: string) => CONNECTORS.find((c) => c.id === id);
export const DEFAULT_CONNECTOR: Record<Notation, string> = { crowsfoot: 'cf-11-0M', chen: 'chen-p1' };

/** Find which library connector an edge currently matches (for highlighting in the picker). */
export function matchConnector(e: DEdge): ConnectorDef | undefined {
  return CONNECTORS.find((c) =>
    Object.entries(c.apply).every(([k, v]) => {
      const cur = (e as any)[k];
      if (v === undefined || v === false || v === 'none') return cur === undefined || cur === false || cur === 'none';
      return cur === v;
    }),
  );
}

// ───────────────────────── Search ─────────────────────────

/** "11:1m" / "111M" → "111M". N, *, ∞ all count as M; spaces, colons, dots and brackets are ignored. */
const normCode = (s: string) => s.toUpperCase().replace(/[\s,()·\-_:.]/g, '').replace(/[N*∞]/g, 'M');

// Notation-aware readings of a query, each giving the Crow's Foot ends it means (start + end codes).
const UML_END: Record<string, CfCode> = { '1': '11', '1..1': '11', '0..1': '01', '1..*': '1M', '1..n': '1M', '1..m': '1M', '*': '0M', '0..*': '0M', '0..n': '0M', '0..m': '0M' };
/** UML: "1 1..*", "0..1 to *" (same ends as Crow's Foot) */
function readUml(q: string): string | null {
  if (!/\.\.|\*/.test(q)) return null;
  const t = q.toLowerCase().replace(/\bto\b|→|->|—|–/g, ' ').split(/[\s,;]+/).filter(Boolean);
  return t.length === 2 && UML_END[t[0]] && UML_END[t[1]] ? UML_END[t[0]] + UML_END[t[1]] : null;
}
/** (min,max): "(0,N) (1,1)" — each pair sits on its own entity's side, so it's the opposite end in Crow's Foot */
function readMinMax(q: string): string | null {
  const m = [...q.matchAll(/\(\s*([01])\s*,\s*([1nm*])\s*\)/gi)];
  if (m.length !== 2) return null;
  const c = (x: RegExpMatchArray) => x[1] + (x[2] === '1' ? '1' : 'M');
  return c(m[1]) + c(m[0]);
}
/** ratio: "1:N", "M:N" → the max at each end */
function readRatio(q: string): [string, string] | null {
  const m = /^\s*([1nm])\s*:\s*([1nm])\s*$/i.exec(q);
  return m ? [m[1] === '1' ? '1' : 'M', m[2] === '1' ? '1' : 'M'] : null;
}

type Searchable = { name: string; keyword: string; ends?: [string, string]; aliases?: string[] };

function textScore(q: string, text: string, extra: string): number {
  const ql = q.toLowerCase();
  const tl = text.toLowerCase();
  if (tl.includes(ql)) return 50 - Math.min(10, text.length / 20);
  const words = ql.split(/\s+/).filter(Boolean);
  const hay = (text + ' ' + extra).toLowerCase();
  if (!words.every((w) => hay.includes(w))) return 0;
  // prefer whole-word hits and words in the order typed ("optional many to mandatory one")
  const tokens = new Set(hay.split(/[^a-z0-9∪⊂]+/));
  const whole = words.filter((w) => tokens.has(w)).length;
  let pos = 0, ordered = true;
  for (const w of words) {
    const i = tl.indexOf(w, pos);
    if (i < 0) { ordered = false; break; }
    pos = i + w.length;
  }
  return 20 + whole * 2 + (ordered ? 5 : 0) - Math.min(5, text.length / 20);
}

export function searchScore(query: string, it: Searchable): number {
  const q = query.trim();
  if (!q) return 1;
  // written in another notation? match on meaning, not spelling
  const code = it.ends ? it.ends[0] + it.ends[1] : null;
  const mm = readMinMax(q), uml = readUml(q), ratio = readRatio(q);
  if (mm || uml) return code ? ((mm ?? uml) === code ? 100 : 0) : 0;
  if (ratio && code) return it.ends![0][1] === ratio[0] && it.ends![1][1] === ratio[1] ? 90 : 0;
  const qc = normCode(q);
  const kc = normCode(it.keyword);
  if (qc && qc === kc) return 100;
  for (const a of it.aliases ?? []) if (qc && /[0-9:]/.test(q) && qc === normCode(a)) return 95;
  if (qc && /[0-9]/.test(q) && kc.startsWith(qc)) return 60;
  const extra = it.keyword + ' ' + (it.aliases ?? []).join(' ');
  return Math.max(textScore(q, it.name, extra), ...(it.aliases ?? []).map((a) => textScore(q, a, it.name + ' ' + it.keyword) - 2));
}

export function searchItems<T extends Searchable>(items: T[], query: string): T[] {
  if (!query.trim()) return items;
  return items
    .map((it, i) => ({ it, i, s: searchScore(query, it) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);
}
