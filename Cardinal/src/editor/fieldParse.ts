/**
 * Smart row entry for tables.
 * Each row has three cells: keys · name · type. Typing a whole row ("FK customer_id INT") into ANY cell
 * fills all three; typing just one part fills just that cell.
 */
import type { DNode, Doc, Field } from '../model/types';

export type Cell = 'key' | 'name' | 'type';
export interface RowVals { keys: string; name: string; type: string }

export interface KeyFlags { pk: boolean; fk: boolean; unique: boolean; nn: boolean; ai: boolean }

export const KEY_OPTIONS: { code: keyof typeof CODE_TO_FLAG; name: string; desc: string }[] = [
  { code: 'PK', name: 'Primary key', desc: 'Uniquely identifies each row. Every table needs one.' },
  { code: 'FK', name: 'Foreign key', desc: "Points to another table's primary key — this is what makes a relationship." },
  { code: 'UQ', name: 'Unique', desc: 'No two rows may share this value (e.g. email).' },
  { code: 'NN', name: 'Not null', desc: 'A value is required (cannot be empty).' },
  { code: 'AI', name: 'Auto increment', desc: 'The database numbers new rows for you: 1, 2, 3…' },
];
const CODE_TO_FLAG = { PK: 'pk', FK: 'fk', UQ: 'unique', NN: 'nn', AI: 'ai' } as const;

const ALIASES: Record<string, (keyof KeyFlags)[]> = {
  PK: ['pk'], PRIMARY: ['pk'], PRIMARYKEY: ['pk'],
  FK: ['fk'], FOREIGN: ['fk'], FOREIGNKEY: ['fk'],
  PKFK: ['pk', 'fk'], FKPK: ['pk', 'fk'],
  UQ: ['unique'], UNIQUE: ['unique'], UK: ['unique'],
  NN: ['nn'], NOTNULL: ['nn'], REQUIRED: ['nn'],
  AI: ['ai'], AUTO: ['ai'], AUTOINCREMENT: ['ai'], AUTO_INCREMENT: ['ai'], IDENTITY: ['ai'],
};

export const keyFlagsOf = (t: string): (keyof KeyFlags)[] | null => ALIASES[t.toUpperCase().replace(/[^A-Z_]/g, '')] ?? null;

/** Split on spaces/commas, but keep "DECIMAL(10, 2)" together. */
export function tokens(v: string): string[] {
  const out: string[] = [];
  let cur = '', depth = 0;
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (/\s/.test(ch) || ch === ',')) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const TYPE_RE = /^(tiny|small|medium|big)?int(eger)?\b|^(big|small)?serial\b|^n?(var)?char\b|^n?varchar|^(tiny|medium|long)?text\b|^bool(ean)?\b|^bit\b|^date(time2?)?\b|^time(stamp(tz)?)?\b|^year\b|^decimal\b|^numeric\b|^float\b|^double\b|^real\b|^money\b|^uuid\b|^jsonb?\b|^(tiny|medium|long)?blob\b|^(var)?binary\b|^bytea\b|^enum\s*\(|^set\s*\(|^xml\b|^interval\b|^geometry\b|^point\b|^citext\b|^inet\b|^cidr\b|^nvarchar|^uniqueidentifier\b|^image\b/i;
export const looksLikeType = (s: string) => TYPE_RE.test(s.trim());

export function parseKeys(v: string): KeyFlags {
  const f: KeyFlags = { pk: false, fk: false, unique: false, nn: false, ai: false };
  for (const t of tokens(v)) for (const k of keyFlagsOf(t) ?? []) f[k] = true;
  return f;
}
export function keysToString(f: Partial<KeyFlags>): string {
  return (['PK', 'FK', 'UQ', 'NN', 'AI'] as const).filter((c) => f[CODE_TO_FLAG[c]]).join(' ');
}
export function fieldToVals(f: Field): RowVals {
  return {
    keys: keysToString({ pk: f.pk, fk: f.fk, unique: f.unique && !f.pk, nn: f.nullable === false && !f.pk, ai: f.ai }),
    name: f.name,
    type: f.type,
  };
}
const normKeys = (toks: string[]) => keysToString(parseKeys(toks.join(' ')));

/** Interpret what was typed in one cell. `whole` = the text described the entire row. */
export function smartParse(cell: Cell, value: string, cur: RowVals): RowVals & { whole?: boolean } {
  const toks = tokens(value);
  let i = 0;
  while (i < toks.length && keyFlagsOf(toks[i])) i++;
  const keyToks = toks.slice(0, i);
  const rest = toks.slice(i);
  // a lone word in the name/type cell is a value, even if it looks like a key code
  if (cell !== 'key' && !rest.length) return cell === 'name' ? { ...cur, name: value.trim() } : { ...cur, type: value.trim() };

  if (cell === 'key') {
    if (!rest.length) return { ...cur, keys: normKeys(keyToks) };
    // a plain name typed over the keys box ("customer_id") fills the name and keeps the existing keys
    if (!keyToks.length) return { keys: cur.keys, name: rest[0], type: rest.slice(1).join(' ') || cur.type, whole: true };
    return { keys: normKeys(keyToks), name: rest[0], type: rest.slice(1).join(' ') || cur.type, whole: true };
  }
  if (cell === 'name') {
    if (keyToks.length) return { keys: normKeys(keyToks), name: rest[0], type: rest.slice(1).join(' ') || cur.type, whole: true };
    if (rest.length >= 2 && looksLikeType(rest.slice(1).join(' '))) return { ...cur, name: rest[0], type: rest.slice(1).join(' '), whole: true };
    return { ...cur, name: rest.join('_') }; // "first name" → first_name
  }
  // type cell
  if (keyToks.length && rest.length >= 2 && !looksLikeType(rest[0])) return { keys: normKeys(keyToks), name: rest[0], type: rest.slice(1).join(' '), whole: true };
  if (keyToks.length) return { ...cur, keys: normKeys(keyToks), type: rest.join(' ') };
  if (rest.length >= 2 && !looksLikeType(rest[0]) && looksLikeType(rest.slice(1).join(' '))) return { ...cur, name: rest[0], type: rest.slice(1).join(' '), whole: true };
  return { ...cur, type: value.trim() };
}

// ───────────────────────── suggestions ─────────────────────────

export interface Suggestion {
  label: string;
  desc: string;
  /** what selecting it does */
  apply: (cur: RowVals) => RowVals & { ref?: { node: string; field: string } };
}

export const TYPE_OPTIONS: { t: string; desc: string }[] = [
  { t: 'INT', desc: 'Whole number' },
  { t: 'BIGINT', desc: 'Very large whole number' },
  { t: 'SMALLINT', desc: 'Small whole number' },
  { t: 'DECIMAL(10,2)', desc: 'Exact decimal — money, prices' },
  { t: 'FLOAT', desc: 'Approximate decimal' },
  { t: 'BOOLEAN', desc: 'True / false' },
  { t: 'VARCHAR(255)', desc: 'Text up to 255 characters' },
  { t: 'VARCHAR(100)', desc: 'Text up to 100 characters' },
  { t: 'VARCHAR(50)', desc: 'Short text up to 50 characters' },
  { t: 'CHAR(10)', desc: 'Fixed-length text' },
  { t: 'TEXT', desc: 'Long text (descriptions, notes)' },
  { t: 'DATE', desc: 'A date — 2026-10-18' },
  { t: 'TIME', desc: 'A time of day — 14:30' },
  { t: 'DATETIME', desc: 'Date and time' },
  { t: 'TIMESTAMP', desc: 'Date and time (often auto-set)' },
  { t: 'UUID', desc: 'Random unique identifier' },
  { t: 'JSON', desc: 'Structured JSON data' },
  { t: 'BLOB', desc: 'Binary data (files, images)' },
  { t: "ENUM('a','b')", desc: 'One value from a fixed list' },
  { t: 'SERIAL', desc: 'Auto-numbered integer (PostgreSQL)' },
];

const COMMON: { name: string; type: string; keys?: string }[] = [
  { name: 'id', type: 'INT', keys: 'PK AI' },
  { name: 'name', type: 'VARCHAR(100)' },
  { name: 'title', type: 'VARCHAR(200)' },
  { name: 'description', type: 'TEXT' },
  { name: 'email', type: 'VARCHAR(255)', keys: 'UQ' },
  { name: 'phone', type: 'VARCHAR(20)' },
  { name: 'password_hash', type: 'VARCHAR(255)' },
  { name: 'first_name', type: 'VARCHAR(50)' },
  { name: 'last_name', type: 'VARCHAR(50)' },
  { name: 'birth_date', type: 'DATE' },
  { name: 'address', type: 'VARCHAR(255)' },
  { name: 'city', type: 'VARCHAR(100)' },
  { name: 'country', type: 'VARCHAR(100)' },
  { name: 'status', type: 'VARCHAR(20)' },
  { name: 'price', type: 'DECIMAL(10,2)' },
  { name: 'amount', type: 'DECIMAL(10,2)' },
  { name: 'quantity', type: 'INT' },
  { name: 'is_active', type: 'BOOLEAN' },
  { name: 'code', type: 'VARCHAR(20)' },
  { name: 'url', type: 'VARCHAR(255)' },
  { name: 'notes', type: 'TEXT' },
  { name: 'created_at', type: 'DATETIME' },
  { name: 'updated_at', type: 'DATETIME' },
];

const addKey = (keys: string, code: string) => keysToString(parseKeys(keys + ' ' + code));
const lastToken = (v: string) => { const m = v.match(/(\S*)$/); return m ? m[1] : ''; };

export function suggestionsFor(cell: Cell, value: string, cur: RowVals, doc: Doc, table: DNode, field: Field): Suggestion[] {
  if (cell === 'key') {
    const q = lastToken(value).toLowerCase();
    const present = parseKeys(value.slice(0, value.length - lastToken(value).length));
    return KEY_OPTIONS.filter((o) => !present[CODE_TO_FLAG[o.code]])
      .filter((o) => !q || o.code.toLowerCase().startsWith(q) || o.name.toLowerCase().includes(q))
      .map((o) => ({
        label: `${o.code} · ${o.name}`,
        desc: o.desc,
        apply: (c) => ({ ...c, keys: addKey(value.slice(0, value.length - lastToken(value).length), o.code) }),
      }));
  }
  if (cell === 'type') {
    const q = value.trim().toLowerCase();
    return TYPE_OPTIONS.filter((o) => !q || o.t.toLowerCase().startsWith(q) || o.desc.toLowerCase().includes(q))
      .filter((o) => o.t.toLowerCase() !== q)
      .slice(0, 12)
      .map((o) => ({ label: o.t, desc: o.desc, apply: (c) => ({ ...c, type: o.t }) }));
  }
  // name cell: foreign keys to other tables first, then common column names
  const q = value.trim().toLowerCase();
  const taken = new Set((table.fields ?? []).filter((f) => f.id !== field.id).map((f) => f.name.toLowerCase()));
  const out: Suggestion[] = [];
  for (const t of doc.nodes) {
    if (t.kind !== 'table' || t.id === table.id || t.variant) continue;
    for (const pk of (t.fields ?? []).filter((f) => f.pk)) {
      const base = t.text.toLowerCase().replace(/\s+/g, '_').replace(/s$/, '');
      const name = pk.name.toLowerCase() === 'id' ? `${base}_id` : pk.name;
      if (taken.has(name.toLowerCase())) continue;
      if (q && !name.toLowerCase().includes(q) && !t.text.toLowerCase().includes(q)) continue;
      out.push({
        label: name,
        desc: `Foreign key → ${t.text}.${pk.name}${pk.type ? ` (${pk.type})` : ''}`,
        apply: (c) => ({ ...c, name, type: c.type || pk.type.replace(/^serial$/i, 'INT'), keys: addKey(c.keys, 'FK'), ref: { node: t.id, field: pk.id } }),
      });
    }
  }
  if (q) {
    const common = COMMON.filter((c) => !taken.has(c.name) && c.name.includes(q) && c.name !== q)
      .sort((a, b) => Number(!a.name.startsWith(q)) - Number(!b.name.startsWith(q)));
    for (const c of common) out.push({
      label: c.name,
      desc: `${c.keys ? c.keys + ' · ' : ''}${c.type}`,
      apply: (cv) => ({ ...cv, name: c.name, type: cv.type || c.type, keys: cv.keys || c.keys || '' }),
    });
  }
  return out.slice(0, 10);
}

/** Resolve an FK by name when it wasn't picked from suggestions: same-named PK, or <table>_id → table.id. */
export function guessRef(doc: Doc, table: DNode, name: string): { node: string; field: string } | null {
  const n = name.toLowerCase();
  for (const t of doc.nodes) {
    if (t.kind !== 'table' || t.id === table.id || t.variant) continue;
    const base = t.text.toLowerCase().replace(/\s+/g, '_');
    for (const pk of (t.fields ?? []).filter((f) => f.pk)) {
      const p = pk.name.toLowerCase();
      if (n === p && p !== 'id') return { node: t.id, field: pk.id };
      if (p === 'id' && (n === `${base}_id` || n === `${base.replace(/s$/, '')}_id` || n === `${base}id`)) return { node: t.id, field: pk.id };
    }
  }
  return null;
}
