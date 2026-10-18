import type { LogicType } from './logic';

export type Notation = 'crowsfoot' | 'chen';
/** What a diagram is for: database diagrams (ER) or logic circuits. */
export type DiagramMode = 'er' | 'circuit';

export type NodeKind =
  // Crow's Foot
  | 'table'
  | 'entity-simple'
  // Chen / EER
  | 'entity'
  | 'weak-entity'
  | 'relationship'
  | 'identifying-relationship'
  | 'attribute'
  | 'key-attribute'
  | 'partial-key-attribute'
  | 'multivalued-attribute'
  | 'derived-attribute'
  | 'specialization'
  | 'isa'
  | 'associative-entity'
  // Shared / general
  | 'text'
  | 'note'
  | 'shape'
  | 'image'
  | 'drawing'
  | 'comment'
  // Logic circuits
  | 'logic';

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** Palette key ('auto' = follow theme/preferences). Keys map to light/dark-aware colors. */
export type ColorKey = 'auto' | 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'white';

export interface Field {
  id: string;
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  nullable?: boolean;
  unique?: boolean;
  /** auto increment / identity */
  ai?: boolean;
  /** FK target, when known (set by SQL import or the properties panel). */
  ref?: { node: string; field: string };
}

export interface NodeStyle {
  fill?: ColorKey;
  stroke?: ColorKey;
  strokeWidth?: number;
  fontSize?: number;
}

export interface DNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  /** undefined = automatic size from content */
  w?: number;
  h?: number;
  text: string;
  fields?: Field[];
  style?: NodeStyle;
  /** kind 'shape': which general shape (see basicShapes.ts) */
  shape?: string;
  /** kind 'table': plain table, database view, or enum */
  variant?: 'view' | 'enum';
  /** kind 'image': data URL */
  src?: string;
  /** kind 'drawing': freehand stroke points, relative to the natural size nw×nh */
  points?: [number, number][];
  nw?: number;
  nh?: number;
  /** kind 'logic': which part (gate, switch, bulb…) */
  logic?: LogicType;
  /** kind 'logic' gates: number of inputs (2–8) */
  inputs?: number;
  /** kind 'logic' switches / buttons: current state */
  on?: boolean;
}

export interface EndRef {
  node?: string;
  /** pinned side; undefined = automatic */
  side?: Side;
  /** pinned to this table row (field id, or '@header' for the title row) */
  field?: string;
  /** with a pinned side: preferred spot along it, 0..1 (orders lines on that side) */
  pos?: number;
  /** free endpoint (not attached to a node) */
  x?: number;
  y?: number;
}

/** Crow's Foot end marker. Pairs are min+max: 0/1 then 1/M. */
export type EndMarker = 'none' | '01' | '11' | '0M' | '1M' | 'one' | 'many' | 'arrow' | 'triangle';

export type Routing = 'orthogonal' | 'straight' | 'curved';

export interface DEdge {
  id: string;
  source: EndRef;
  target: EndRef;
  sourceEnd?: EndMarker;
  targetEnd?: EndMarker;
  /** Chen: label on the line, e.g. "1", "N", "(0,N)" */
  chenLabel?: string;
  /** Chen: total participation (double line) */
  total?: boolean;
  /** EER: subset symbol (⊂) in the middle, opening toward the source (superclass side) */
  subset?: boolean;
  dashed?: boolean;
  routing?: Routing;
  label?: string;
  style?: { stroke?: ColorKey; strokeWidth?: number };
  /** created by the SQL panel (may be removed by it again) */
  fromSql?: boolean;
}

export interface Doc {
  version: 1;
  notation: Notation;
  /** undefined = 'er' */
  mode?: DiagramMode;
  nodes: DNode[];
  edges: DEdge[];
}

export interface DiagramMeta {
  id: string;
  projectId: string;
  name: string;
  notation: Notation;
  mode?: DiagramMode;
  createdAt: number;
  updatedAt: number;
  thumb?: string;
}

export interface DiagramFile {
  meta: DiagramMeta;
  doc: Doc;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  color?: ColorKey;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

export const uid = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const emptyDoc = (notation: Notation, mode: DiagramMode = 'er'): Doc =>
  mode === 'circuit' ? { version: 1, notation, mode, nodes: [], edges: [] } : { version: 1, notation, nodes: [], edges: [] };
export const docMode = (d: Pick<Doc, 'mode'> | null | undefined): DiagramMode => d?.mode ?? 'er';
