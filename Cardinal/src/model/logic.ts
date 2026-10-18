/**
 * Logic circuits: gate/input/output definitions, pin layout, drawing paths, simulation, truth tables.
 * A circuit part is a node with kind 'logic' and `logic: <LogicType>`. Wires are ordinary edges whose
 * ends are pinned to pins through `field` ('i0', 'i1', … for inputs, 'o' for the output).
 */
import type { DNode, Doc, Pt, Rect, Side } from './types';

export type GateType = 'and' | 'or' | 'not' | 'nand' | 'nor' | 'xor' | 'xnor' | 'buf';
export type LogicType = GateType | 'switch' | 'button' | 'const1' | 'const0' | 'bulb' | 'probe';
export type LogicCategory = 'input' | 'gate' | 'output';
/** 0 / 1, or null = not driven (floating) or undecided */
export type Sig = 0 | 1 | null;

export interface LogicDef {
  id: LogicType;
  name: string;
  keyword: string;
  category: LogicCategory;
  /** one-line explanation shown in the library tooltip and properties */
  hint: string;
}

export const LOGIC: LogicDef[] = [
  { id: 'switch', name: 'Switch', keyword: 'SW', category: 'input', hint: 'Click it to flip between 0 and 1.' },
  { id: 'button', name: 'Push button', keyword: 'BTN', category: 'input', hint: 'Gives 1 only while you hold it down.' },
  { id: 'const1', name: 'Constant 1', keyword: 'HIGH', category: 'input', hint: 'Always 1 (high / VCC).' },
  { id: 'const0', name: 'Constant 0', keyword: 'LOW', category: 'input', hint: 'Always 0 (low / ground).' },
  { id: 'and', name: 'AND', keyword: 'AND', category: 'gate', hint: '1 only when every input is 1.' },
  { id: 'or', name: 'OR', keyword: 'OR', category: 'gate', hint: '1 when at least one input is 1.' },
  { id: 'not', name: 'NOT', keyword: 'NOT', category: 'gate', hint: 'Flips the input: 0 → 1, 1 → 0.' },
  { id: 'nand', name: 'NAND', keyword: 'NAND', category: 'gate', hint: 'NOT AND: 0 only when every input is 1.' },
  { id: 'nor', name: 'NOR', keyword: 'NOR', category: 'gate', hint: 'NOT OR: 1 only when every input is 0.' },
  { id: 'xor', name: 'XOR', keyword: 'XOR', category: 'gate', hint: '1 when an odd number of inputs are 1.' },
  { id: 'xnor', name: 'XNOR', keyword: 'XNOR', category: 'gate', hint: '1 when an even number of inputs are 1.' },
  { id: 'buf', name: 'Buffer', keyword: 'BUF', category: 'gate', hint: 'Passes the input through unchanged.' },
  { id: 'bulb', name: 'Light bulb', keyword: 'LED', category: 'output', hint: 'Lights up when its input is 1.' },
  { id: 'probe', name: 'Digit display', keyword: 'PROBE', category: 'output', hint: 'Shows the value on its input as 0 or 1.' },
];
export const logicDef = (t?: LogicType) => LOGIC.find((d) => d.id === t) ?? LOGIC[4];

export const GATES: GateType[] = ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor', 'buf'];
export const isGate = (t?: LogicType): t is GateType => !!t && (GATES as string[]).includes(t);
export const isOneInput = (t?: LogicType) => t === 'not' || t === 'buf';
export const isInputPart = (t?: LogicType) => t === 'switch' || t === 'button' || t === 'const1' || t === 'const0';
export const isOutputPart = (t?: LogicType) => t === 'bulb' || t === 'probe';
const inverted = (t?: LogicType) => t === 'not' || t === 'nand' || t === 'nor' || t === 'xnor';

export const PIN = 12; // pin stub length
const STEP = 20; // distance between input pins (2 grid cells)

/** How many inputs a part has. */
export function inputCount(n: Pick<DNode, 'logic' | 'inputs'>): number {
  const t = n.logic;
  if (isInputPart(t)) return 0;
  if (isOutputPart(t) || isOneInput(t)) return 1;
  return Math.max(2, Math.min(8, n.inputs ?? 2));
}
export const hasOutput = (t?: LogicType) => !isOutputPart(t);

export function logicSize(n: Pick<DNode, 'logic' | 'inputs'>): { w: number; h: number } {
  const t = n.logic;
  if (isGate(t)) return { w: 80, h: Math.max(2, inputCount(n)) * STEP };
  if (t === 'switch' || t === 'button') return { w: 60, h: 40 };
  if (t === 'const1' || t === 'const0') return { w: 40, h: 40 };
  return { w: 50, h: 40 }; // bulb, probe
}

export interface PinInfo { id: string; dir: 'in' | 'out'; side: Side; x: number; y: number }

/** All pins of a part, in world coordinates. Inputs face left, the output faces right. */
export function logicPins(n: Pick<DNode, 'logic' | 'inputs'>, r: Rect): PinInfo[] {
  const out: PinInfo[] = [];
  const k = inputCount(n);
  for (let i = 0; i < k; i++) {
    const y = k === 1 ? r.y + r.h / 2 : r.y + STEP / 2 + i * STEP;
    out.push({ id: 'i' + i, dir: 'in', side: 'left', x: r.x, y });
  }
  if (hasOutput(n.logic)) out.push({ id: 'o', dir: 'out', side: 'right', x: r.x + r.w, y: r.y + r.h / 2 });
  return out;
}
export const pinDir = (field?: string): 'in' | 'out' | null => (!field ? null : field === 'o' ? 'out' : /^i\d+$/.test(field) ? 'in' : null);
export function pinAt(n: DNode, r: Rect, field?: string): PinInfo | undefined {
  return field ? logicPins(n, r).find((p) => p.id === field) : undefined;
}

// ───────────────────────── drawing ─────────────────────────

/** Gate body outline inside its box (pins excluded). Returns [body path, extra stroke path]. */
export function gatePaths(t: GateType, r: Rect): { body: string; extra?: string; bubble?: Pt } {
  const x0 = r.x + PIN, x1 = r.x + r.w - PIN - (inverted(t) ? 9 : 0);
  const y0 = r.y + 1, y1 = r.y + r.h - 1, h = y1 - y0, w = x1 - x0, cy = (y0 + y1) / 2;
  const bubble = inverted(t) ? { x: x1 + 4.5, y: cy } : undefined;
  if (t === 'and' || t === 'nand') {
    const k = Math.min(h / 2, w * 0.6);
    return { body: `M${x0},${y0}H${x1 - k}A${k},${h / 2} 0 0 1 ${x1 - k},${y1}H${x0}Z`, bubble };
  }
  if (t === 'not' || t === 'buf') {
    const ty0 = cy - Math.min(h / 2, 18), ty1 = cy + Math.min(h / 2, 18);
    return { body: `M${x0 + 4},${ty0}L${x1},${cy}L${x0 + 4},${ty1}Z`, bubble };
  }
  // OR family: curved back, pointed front
  const back = Math.min(10, w * 0.2);
  const xs = t === 'xor' || t === 'xnor' ? x0 + 6 : x0;
  const body =
    `M${xs},${y0}` +
    `Q${xs + w * 0.55},${y0} ${x1},${cy}` +
    `Q${xs + w * 0.55},${y1} ${xs},${y1}` +
    `Q${xs + back},${cy} ${xs},${y0}Z`;
  const extra = t === 'xor' || t === 'xnor' ? `M${x0},${y0}Q${x0 + back},${cy} ${x0},${y1}` : undefined;
  return { body, extra, bubble };
}

/** Where the input pin stubs end on the gate body (the OR-family back is curved). */
export function stubEnd(t: LogicType | undefined, r: Rect, pinY: number): number {
  if (!isGate(t) || !(t === 'or' || t === 'nor' || t === 'xor' || t === 'xnor')) return r.x + PIN + (t === 'not' || t === 'buf' ? 4 : 0);
  const w = r.w - 2 * PIN, back = Math.min(10, w * 0.2);
  const y0 = r.y + 1, y1 = r.y + r.h - 1, cy = (y0 + y1) / 2;
  const s = 1 - Math.abs(pinY - cy) / ((y1 - y0) / 2); // 1 at the middle, 0 at the ends
  return r.x + PIN + back * Math.max(0, s) * 0.95 + (t === 'xor' || t === 'xnor' ? 0 : 0);
}

// ───────────────────────── simulation ─────────────────────────

/** Gate outputs from the last run — lets latches built from gates keep their state. */
const memory = new Map<string, Sig>();

export function evalGate(t: GateType, ins: Sig[]): Sig {
  const any0 = ins.some((v) => v === 0), any1 = ins.some((v) => v === 1), anyX = ins.some((v) => v === null);
  let v: Sig;
  switch (t) {
    case 'and': case 'nand': v = any0 ? 0 : anyX ? null : 1; break;
    case 'or': case 'nor': v = any1 ? 1 : anyX ? null : 0; break;
    case 'xor': case 'xnor': v = anyX ? null : ((ins.filter((x) => x === 1).length % 2) as Sig); break;
    default: v = ins[0] ?? null;
  }
  if (v === null || !inverted(t)) return v;
  return v === 1 ? 0 : 1;
}

export interface SimResult {
  /** "<node>:<pin>" → value */
  pins: Map<string, Sig>;
  /** edge id → value carried by that wire (undefined = not a wire) */
  wires: Map<string, Sig>;
  /** a feedback loop never settled (e.g. a NOT gate wired to itself) */
  unstable: boolean;
}

interface Wire { id: string; from: string; fromPin: string; to: string; toPin: string }

/** Wires between an output pin and an input pin (either drawing direction). */
export function circuitWires(doc: Doc): Wire[] {
  const logic = new Set(doc.nodes.filter((n) => n.kind === 'logic').map((n) => n.id));
  const out: Wire[] = [];
  for (const e of doc.edges) {
    const a = e.source, b = e.target;
    if (!a.node || !b.node || !logic.has(a.node) || !logic.has(b.node)) continue;
    const da = pinDir(a.field), db = pinDir(b.field);
    if (da === 'out' && db === 'in') out.push({ id: e.id, from: a.node, fromPin: a.field!, to: b.node, toPin: b.field! });
    else if (da === 'in' && db === 'out') out.push({ id: e.id, from: b.node, fromPin: b.field!, to: a.node, toPin: a.field! });
  }
  return out;
}

export function simulate(doc: Doc, overrides?: Map<string, Sig>, useMemory = true): SimResult {
  const parts = doc.nodes.filter((n) => n.kind === 'logic');
  const wires = circuitWires(doc);
  const driver = new Map<string, Wire>(); // "<node>:<inputPin>" → wire feeding it (first one wins)
  for (const w of wires) if (!driver.has(w.to + ':' + w.toPin)) driver.set(w.to + ':' + w.toPin, w);
  const outv = new Map<string, Sig>();
  for (const n of parts) {
    const t = n.logic;
    const o = overrides?.get(n.id);
    if (o !== undefined) outv.set(n.id, o);
    else if (t === 'switch' || t === 'button') outv.set(n.id, n.on ? 1 : 0);
    else if (t === 'const1') outv.set(n.id, 1);
    else if (t === 'const0') outv.set(n.id, 0);
    else outv.set(n.id, useMemory ? memory.get(n.id) ?? null : null);
  }
  const inputOf = (n: DNode, i: number): Sig => {
    const w = driver.get(n.id + ':i' + i);
    return w ? outv.get(w.from) ?? null : null;
  };
  const gates = parts.filter((n) => isGate(n.logic));
  let unstable = true;
  for (let iter = 0; iter < Math.max(8, gates.length * 3); iter++) {
    let changed = false;
    for (const n of gates) {
      const ins: Sig[] = [];
      for (let i = 0; i < inputCount(n); i++) ins.push(inputOf(n, i));
      const v = evalGate(n.logic as GateType, ins);
      if (outv.get(n.id) !== v) { outv.set(n.id, v); changed = true; }
    }
    if (!changed) { unstable = false; break; }
  }
  if (useMemory && !overrides) for (const n of gates) memory.set(n.id, outv.get(n.id) ?? null);
  const pins = new Map<string, Sig>();
  for (const n of parts) {
    for (let i = 0; i < inputCount(n); i++) pins.set(n.id + ':i' + i, inputOf(n, i));
    if (hasOutput(n.logic)) pins.set(n.id + ':o', outv.get(n.id) ?? null);
  }
  const wv = new Map<string, Sig>();
  for (const w of wires) wv.set(w.id, outv.get(w.from) ?? null);
  return { pins, wires: wv, unstable };
}

// ───────────────────────── truth table & expressions ─────────────────────────

const byLabelThenPos = (a: DNode, b: DNode) => (a.text || '~').localeCompare(b.text || '~', undefined, { numeric: true }) || a.y - b.y || a.x - b.x;
export const circuitInputs = (doc: Doc) => doc.nodes.filter((n) => n.kind === 'logic' && (n.logic === 'switch' || n.logic === 'button')).sort(byLabelThenPos);
export const circuitOutputs = (doc: Doc) => doc.nodes.filter((n) => n.kind === 'logic' && isOutputPart(n.logic)).sort(byLabelThenPos);

export const MAX_TABLE_INPUTS = 10;

export interface TruthTable { inputs: DNode[]; outputs: DNode[]; rows: { ins: (0 | 1)[]; outs: Sig[] }[] }

export function truthTable(doc: Doc): TruthTable {
  const inputs = circuitInputs(doc), outputs = circuitOutputs(doc);
  const rows: TruthTable['rows'] = [];
  if (inputs.length > MAX_TABLE_INPUTS) return { inputs, outputs, rows };
  const total = 1 << inputs.length;
  for (let m = 0; m < total; m++) {
    const ins = inputs.map((_, i) => ((m >> (inputs.length - 1 - i)) & 1) as 0 | 1);
    const ov = new Map<string, Sig>(inputs.map((n, i) => [n.id, ins[i]]));
    const sim = simulate(doc, ov, false);
    rows.push({ ins, outs: outputs.map((o) => sim.pins.get(o.id + ':i0') ?? null) });
  }
  return { inputs, outputs, rows };
}

const OPS: Record<GateType, string> = { and: ' · ', nand: ' · ', or: ' + ', nor: ' + ', xor: ' ⊕ ', xnor: ' ⊕ ', not: '', buf: '' };

/** Boolean expression feeding an output, read straight off the wiring (e.g. "¬(A · B) + C"). */
export function expressionFor(doc: Doc, outputId: string): string {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const driver = new Map<string, Wire>();
  for (const w of circuitWires(doc)) if (!driver.has(w.to + ':' + w.toPin)) driver.set(w.to + ':' + w.toPin, w);
  const names = new Map<string, string>();
  let letter = 0;
  const nameOf = (n: DNode) => {
    if (n.text.trim()) return n.text.trim();
    if (!names.has(n.id)) names.set(n.id, 'In' + ++letter);
    return names.get(n.id)!;
  };
  const visit = (id: string, seen: Set<string>): { s: string; atom: boolean } => {
    const n = byId.get(id);
    if (!n) return { s: '?', atom: true };
    const t = n.logic;
    if (t === 'const1') return { s: '1', atom: true };
    if (t === 'const0') return { s: '0', atom: true };
    if (t === 'switch' || t === 'button') return { s: nameOf(n), atom: true };
    if (!isGate(t)) return { s: '?', atom: true };
    if (seen.has(id)) return { s: '(loop)', atom: true };
    const next = new Set(seen).add(id);
    const args = Array.from({ length: inputCount(n) }, (_, i) => {
      const w = driver.get(id + ':i' + i);
      return w ? visit(w.from, next) : { s: '?', atom: true };
    });
    if (t === 'buf') return args[0];
    if (t === 'not') return { s: '¬' + (args[0].atom ? args[0].s : `(${args[0].s})`), atom: true };
    const inner = args.map((a) => (a.atom ? a.s : `(${a.s})`)).join(OPS[t]);
    if (inverted(t)) return { s: `¬(${inner})`, atom: true };
    return { s: inner, atom: false };
  };
  const w = driver.get(outputId + ':i0');
  return w ? visit(w.from, new Set()).s : '(not connected)';
}

/** Next free label for a new switch (A, B, C…) or output (Q, Q1, Q2…). */
export function nextLabel(doc: Doc, t: LogicType): string {
  const used = new Set(doc.nodes.filter((n) => n.kind === 'logic').map((n) => n.text.trim()));
  if (t === 'switch' || t === 'button') {
    for (let i = 0; i < 26; i++) { const s = String.fromCharCode(65 + i); if (!used.has(s)) return s; }
    for (let i = 1; ; i++) if (!used.has('In' + i)) return 'In' + i;
  }
  if (isOutputPart(t)) {
    if (!used.has('Q')) return 'Q';
    for (let i = 1; ; i++) if (!used.has('Q' + i)) return 'Q' + i;
  }
  return '';
}
