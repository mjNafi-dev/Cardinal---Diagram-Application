/**
 * SQL ⇄ diagram.
 *  parseSql:     tolerant DDL parser (CREATE TABLE, ALTER TABLE … ADD FOREIGN KEY) for MySQL / PostgreSQL / SQLite / SQL Server
 *  generateSql:  DDL for the Crow's Foot tables in a diagram, per dialect
 *  applySql:     merge parsed tables into the diagram, keeping positions and styling of tables that already exist
 */
import { uid, type DEdge, type DNode, type Doc, type Field } from '../model/types';

export type Dialect = 'mysql' | 'postgres' | 'sqlite' | 'sqlserver';
export const DIALECTS: { id: Dialect; name: string }[] = [
  { id: 'mysql', name: 'MySQL' },
  { id: 'postgres', name: 'PostgreSQL' },
  { id: 'sqlite', name: 'SQLite' },
  { id: 'sqlserver', name: 'SQL Server' },
];

export interface PColumn { name: string; type: string; pk: boolean; notNull: boolean; unique: boolean; ai?: boolean; ref?: { table: string; column: string } }
export interface PTable { name: string; columns: PColumn[] }
export interface ParseResult { tables: PTable[]; error?: string }

// ───────────────────────── tokenizer ─────────────────────────

type Tok = { t: 'id' | 'qid' | 'str' | 'num' | 'sym'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '`' || c === '"' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1, v = '';
      while (j < n && src[j] !== close) v += src[j++];
      out.push({ t: 'qid', v });
      i = j + 1;
      continue;
    }
    if (c === "'") {
      let j = i + 1, v = '';
      while (j < n) {
        if (src[j] === "'" && src[j + 1] === "'") { v += "'"; j += 2; continue; }
        if (src[j] === "'") break;
        v += src[j++];
      }
      out.push({ t: 'str', v });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_À-￿]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$À-￿]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      out.push({ t: 'num', v: src.slice(i, j) });
      i = j;
      continue;
    }
    out.push({ t: 'sym', v: c });
    i++;
  }
  return out;
}

const kw = (t: Tok | undefined, ...words: string[]) => !!t && t.t === 'id' && words.includes(t.v.toUpperCase());
const isName = (t: Tok | undefined) => !!t && (t.t === 'id' || t.t === 'qid');

// ───────────────────────── parser ─────────────────────────

export function parseSql(src: string): ParseResult {
  const toks = tokenize(src);
  const tables: PTable[] = [];
  const byName = new Map<string, PTable>();
  let i = 0;

  const qualified = (): string => {
    // schema.table → table
    let name = toks[i++]?.v ?? '';
    while (toks[i]?.v === '.' && isName(toks[i + 1])) { i++; name = toks[i++].v; }
    return name;
  };
  const skipStatement = () => {
    let depth = 0;
    while (i < toks.length) {
      const t = toks[i++];
      if (t.v === '(') depth++;
      else if (t.v === ')') depth--;
      else if (t.v === ';' && depth <= 0) return;
    }
  };
  const nameList = (): string[] => {
    const out: string[] = [];
    if (toks[i]?.v !== '(') return out;
    i++;
    while (i < toks.length && toks[i].v !== ')') {
      if (isName(toks[i])) out.push(toks[i].v);
      i++;
      // skip ASC/DESC/length
      while (i < toks.length && toks[i].v !== ',' && toks[i].v !== ')') i++;
      if (toks[i]?.v === ',') i++;
    }
    i++;
    return out;
  };
  const references = (): { table: string; columns: string[] } | null => {
    if (!kw(toks[i], 'REFERENCES')) return null;
    i++;
    const table = qualified();
    const columns = nameList();
    // ON DELETE / ON UPDATE / MATCH … actions
    while (kw(toks[i], 'ON', 'MATCH', 'DEFERRABLE', 'INITIALLY', 'NOT')) {
      i++;
      while (i < toks.length && !(toks[i].v === ',' || toks[i].v === ')') && !kw(toks[i], 'ON', 'MATCH')) i++;
    }
    return { table, columns };
  };

  while (i < toks.length) {
    // CREATE [OR REPLACE] [TEMP|TEMPORARY] TABLE [IF NOT EXISTS] name ( … )
    if (kw(toks[i], 'CREATE')) {
      let j = i + 1;
      while (kw(toks[j], 'OR', 'REPLACE', 'TEMP', 'TEMPORARY', 'GLOBAL', 'LOCAL', 'UNLOGGED')) j++;
      if (!kw(toks[j], 'TABLE')) { skipStatement(); continue; }
      i = j + 1;
      if (kw(toks[i], 'IF')) i += 3;
      if (!isName(toks[i])) return { tables, error: 'Expected a table name after CREATE TABLE' };
      const name = qualified();
      if (toks[i]?.v !== '(') { skipStatement(); continue; }
      i++;
      const table: PTable = { name, columns: [] };
      const col = (n: string) => table.columns.find((c) => c.name.toLowerCase() === n.toLowerCase());
      const fks: { cols: string[]; ref: { table: string; columns: string[] } }[] = [];
      // definitions
      while (i < toks.length && toks[i].v !== ')') {
        if (kw(toks[i], 'CONSTRAINT')) { i++; if (isName(toks[i])) i++; }
        if (kw(toks[i], 'PRIMARY') && kw(toks[i + 1], 'KEY')) {
          i += 2;
          while (kw(toks[i], 'CLUSTERED', 'NONCLUSTERED')) i++;
          for (const c of nameList()) { const cc = col(c); if (cc) { cc.pk = true; cc.notNull = true; } }
        } else if (kw(toks[i], 'FOREIGN') && kw(toks[i + 1], 'KEY')) {
          i += 2;
          if (isName(toks[i]) && toks[i + 1]?.v === '(') i++; // MySQL index name
          const cols = nameList();
          const ref = references();
          if (ref) fks.push({ cols, ref });
        } else if (kw(toks[i], 'UNIQUE')) {
          i++;
          if (kw(toks[i], 'KEY', 'INDEX')) i++;
          if (isName(toks[i]) && toks[i + 1]?.v === '(') i++;
          const cols = nameList();
          if (cols.length === 1) { const cc = col(cols[0]); if (cc) cc.unique = true; }
        } else if (kw(toks[i], 'KEY', 'INDEX', 'CHECK', 'FULLTEXT', 'SPATIAL', 'EXCLUDE')) {
          // skip index / check definitions
          let depth = 0;
          while (i < toks.length) {
            if (toks[i].v === '(') depth++;
            if (toks[i].v === ')') { if (depth === 0) break; depth--; }
            if (toks[i].v === ',' && depth === 0) break;
            i++;
          }
        } else if (isName(toks[i])) {
          // column definition
          const c: PColumn = { name: toks[i++].v, type: '', pk: false, notNull: false, unique: false };
          // type: words + optional (…) + [] until a constraint keyword
          const typeParts: string[] = [];
          while (i < toks.length && toks[i].v !== ',' && toks[i].v !== ')' && !kw(toks[i], 'NOT', 'NULL', 'PRIMARY', 'UNIQUE', 'REFERENCES', 'DEFAULT', 'CONSTRAINT', 'CHECK', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'IDENTITY', 'GENERATED', 'COLLATE', 'COMMENT', 'ON', 'CHARACTER', 'CHARSET')) {
            if (toks[i].v === '(') {
              let depth = 0, s = '';
              do {
                const t = toks[i++];
                if (t.v === '(') depth++;
                if (t.v === ')') depth--;
                s += t.t === 'str' ? `'${t.v}'` : t.v;
                if (t.v === ',') s += '';
              } while (i < toks.length && depth > 0);
              typeParts[typeParts.length - 1] = (typeParts[typeParts.length - 1] ?? '') + s;
            } else if (toks[i].v === '[' || toks[i].v === ']') {
              typeParts[typeParts.length - 1] += toks[i++].v;
            } else typeParts.push(toks[i++].v);
          }
          c.type = typeParts.join(' ');
          if (/^(big|small)?serial$/i.test(c.type)) c.ai = true;
          // constraints
          while (i < toks.length && toks[i].v !== ',' && toks[i].v !== ')') {
            if (kw(toks[i], 'NOT') && kw(toks[i + 1], 'NULL')) { c.notNull = true; i += 2; }
            else if (kw(toks[i], 'PRIMARY') && kw(toks[i + 1], 'KEY')) { c.pk = true; c.notNull = true; i += 2; }
            else if (kw(toks[i], 'UNIQUE')) { c.unique = true; i++; }
            else if (kw(toks[i], 'AUTO_INCREMENT', 'AUTOINCREMENT', 'IDENTITY')) { c.ai = true; i++; }
            else if (kw(toks[i], 'REFERENCES')) {
              const ref = references();
              if (ref) c.ref = { table: ref.table, column: ref.columns[0] ?? '' };
            } else if (toks[i].v === '(') {
              let depth = 0;
              do { if (toks[i].v === '(') depth++; if (toks[i].v === ')') depth--; i++; } while (i < toks.length && depth > 0);
            } else i++;
          }
          table.columns.push(c);
        } else i++;
        if (toks[i]?.v === ',') i++;
      }
      i++; // ')'
      for (const fk of fks) {
        fk.cols.forEach((cn, k) => {
          const cc = col(cn);
          if (cc) cc.ref = { table: fk.ref.table, column: fk.ref.columns[k] ?? fk.ref.columns[0] ?? '' };
        });
      }
      skipStatement(); // table options until ;
      tables.push(table);
      byName.set(table.name.toLowerCase(), table);
      continue;
    }
    // ALTER TABLE x ADD [CONSTRAINT n] FOREIGN KEY (a) REFERENCES t(b)
    if (kw(toks[i], 'ALTER') && kw(toks[i + 1], 'TABLE')) {
      i += 2;
      if (kw(toks[i], 'ONLY')) i++;
      if (kw(toks[i], 'IF')) i += 2;
      const tname = qualified();
      const table = byName.get(tname.toLowerCase());
      while (i < toks.length && toks[i].v !== ';') {
        if (kw(toks[i], 'FOREIGN') && kw(toks[i + 1], 'KEY')) {
          i += 2;
          if (isName(toks[i]) && toks[i + 1]?.v === '(') i++;
          const cols = nameList();
          const ref = references();
          if (ref && table) cols.forEach((cn, k) => {
            const cc = table.columns.find((c) => c.name.toLowerCase() === cn.toLowerCase());
            if (cc) cc.ref = { table: ref.table, column: ref.columns[k] ?? ref.columns[0] ?? '' };
          });
        } else if (kw(toks[i], 'PRIMARY') && kw(toks[i + 1], 'KEY')) {
          i += 2;
          for (const cn of nameList()) {
            const cc = table?.columns.find((c) => c.name.toLowerCase() === cn.toLowerCase());
            if (cc) cc.pk = true;
          }
        } else i++;
      }
      i++;
      continue;
    }
    skipStatement();
  }
  return { tables };
}

// ───────────────────────── generator ─────────────────────────

const RESERVED = new Set(['order', 'user', 'group', 'select', 'table', 'from', 'where', 'key', 'index', 'desc', 'check', 'default', 'primary', 'references', 'column', 'limit', 'range', 'rank', 'row', 'values', 'to', 'by', 'as', 'and', 'or', 'not', 'null', 'in', 'is', 'on', 'case', 'end', 'level', 'option', 'session', 'size', 'status', 'type', 'date', 'time', 'timestamp']);

function quote(name: string, d: Dialect): string {
  const plain = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !RESERVED.has(name.toLowerCase());
  if (plain) return name;
  if (d === 'mysql') return '`' + name.replace(/`/g, '``') + '`';
  if (d === 'sqlserver') return '[' + name.replace(/]/g, ']]') + ']';
  return '"' + name.replace(/"/g, '""') + '"';
}

function mapType(type: string, d: Dialect): string {
  const t = type.trim();
  if (!t) return d === 'sqlite' ? 'TEXT' : 'VARCHAR(255)';
  const u = t.toUpperCase();
  if (d === 'postgres') {
    if (u === 'DATETIME') return 'TIMESTAMP';
    if (u === 'TINYINT(1)') return 'BOOLEAN';
    if (u === 'DOUBLE') return 'DOUBLE PRECISION';
    if (/^INT\(\d+\)$/.test(u)) return 'INTEGER';
  }
  if (d === 'sqlserver') {
    if (u === 'BOOLEAN' || u === 'BOOL') return 'BIT';
    if (u === 'TEXT') return 'NVARCHAR(MAX)';
    if (u === 'TIMESTAMP') return 'DATETIME2';
    if (u === 'DOUBLE' || u === 'DOUBLE PRECISION') return 'FLOAT';
    if (u === 'SERIAL') return 'INT IDENTITY(1,1)';
  }
  if (d === 'mysql') {
    if (u === 'SERIAL') return 'INT AUTO_INCREMENT';
    if (u === 'BOOLEAN' || u === 'BOOL') return 'BOOLEAN';
    if (u === 'TIMESTAMPTZ') return 'TIMESTAMP';
  }
  if (d === 'sqlite') {
    if (u === 'SERIAL') return 'INTEGER';
  }
  return t;
}

/** Which table/column a FK field points to: explicit ref, else inferred from a connected table. */
export function resolveRef(doc: Doc, table: DNode, f: Field): { table: DNode; field: Field } | null {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  if (f.ref) {
    const t = byId.get(f.ref.node);
    const rf = t?.fields?.find((x) => x.id === f.ref!.field);
    if (t && rf) return { table: t, field: rf };
  }
  if (!f.fk) return null;
  const neighbours = doc.edges
    .filter((e) => e.source.node === table.id || e.target.node === table.id)
    .map((e) => byId.get(e.source.node === table.id ? e.target.node! : e.source.node!))
    .filter((n): n is DNode => !!n && n.kind === 'table' && n.id !== table.id);
  const lname = f.name.toLowerCase();
  for (const n of neighbours) {
    const pks = (n.fields ?? []).filter((x) => x.pk);
    const tn = n.text.toLowerCase().replace(/s$/, '');
    for (const pk of pks) {
      const pn = pk.name.toLowerCase();
      if (lname === pn || lname === `${tn}_${pn}` || lname === `${tn}${pn}` || (pn === 'id' && (lname === `${tn}_id` || lname === `${tn}id`))) return { table: n, field: pk };
    }
  }
  return null;
}

export function generateSql(doc: Doc, d: Dialect): string {
  const tables = doc.nodes.filter((n) => n.kind === 'table' && !n.variant);
  if (!tables.length) return '';
  const out: string[] = [];
  const header = { mysql: '-- MySQL', postgres: '-- PostgreSQL', sqlite: '-- SQLite', sqlserver: '-- SQL Server' }[d];
  out.push(`${header} · generated by Cardinal`);
  // parents first so FOREIGN KEY targets exist
  const order: DNode[] = [];
  const seen = new Set<string>();
  const visit = (t: DNode, stack: Set<string>) => {
    if (seen.has(t.id) || stack.has(t.id)) return;
    stack.add(t.id);
    for (const f of t.fields ?? []) {
      const r = resolveRef(doc, t, f);
      if (r && r.table.id !== t.id) visit(r.table, stack);
    }
    seen.add(t.id);
    order.push(t);
  };
  for (const t of tables) visit(t, new Set());

  for (const t of order) {
    const lines: string[] = [];
    const fields = t.fields ?? [];
    const pks = fields.filter((f) => f.pk);
    // SQLite only auto-increments a single INTEGER PRIMARY KEY column
    const sqliteAi = d === 'sqlite' && pks.length === 1 && pks[0].ai;
    for (const f of fields) {
      let type = mapType(f.type, d);
      if (f.ai && d === 'postgres' && /^(int|integer|bigint|smallint)/i.test(type)) type = /^bigint/i.test(type) ? 'BIGSERIAL' : 'SERIAL';
      let line = `  ${quote(f.name || 'column', d)} ${type}`;
      if (sqliteAi && f === pks[0]) line = `  ${quote(f.name, d)} INTEGER PRIMARY KEY AUTOINCREMENT`;
      else {
        if (f.pk || f.nullable === false) line += ' NOT NULL';
        if (f.ai && d === 'mysql') line += ' AUTO_INCREMENT';
        if (f.ai && d === 'sqlserver') line += ' IDENTITY(1,1)';
        if (f.unique && !f.pk) line += ' UNIQUE';
      }
      lines.push(line);
    }
    if (pks.length && !sqliteAi) lines.push(`  PRIMARY KEY (${pks.map((f) => quote(f.name, d)).join(', ')})`);
    // group FK columns by target table
    const groups = new Map<string, { cols: string[]; refCols: string[]; table: DNode }>();
    for (const f of fields) {
      if (!f.fk && !f.ref) continue;
      const r = resolveRef(doc, t, f);
      if (!r) continue;
      const g = groups.get(r.table.id) ?? { cols: [], refCols: [], table: r.table };
      g.cols.push(quote(f.name, d));
      g.refCols.push(quote(r.field.name, d));
      groups.set(r.table.id, g);
    }
    for (const g of groups.values()) lines.push(`  FOREIGN KEY (${g.cols.join(', ')}) REFERENCES ${quote(g.table.text, d)} (${g.refCols.join(', ')})`);
    out.push(`\nCREATE TABLE ${quote(t.text || 'table', d)} (\n${lines.join(',\n')}\n)${d === 'mysql' ? ' ENGINE=InnoDB' : ''};`);
  }
  return out.join('\n') + '\n';
}

// ───────────────────────── merge into diagram ─────────────────────────

/** Top-level statements (split on ; outside strings, comments and parentheses), with their offsets. */
export function splitStatements(src: string): { from: number; to: number; text: string }[] {
  const out: { from: number; to: number; text: string }[] = [];
  let start = 0, depth = 0, i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'" || c === '"' || c === '`') { i++; while (i < n && src[i] !== c) i += src[i] === '\\' ? 2 : 1; i++; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) { out.push({ from: start, to: i + 1, text: src.slice(start, i + 1) }); start = i + 1; }
    i++;
  }
  if (src.slice(start).trim()) out.push({ from: start, to: n, text: src.slice(start) });
  return out;
}

/**
 * Parse as much as possible: statements that fail on their own are blanked out (one at a time) and the rest
 * is parsed again, so one half-typed statement doesn't stop everything else from updating.
 */
/** Something in the SQL that can't be shown on the canvas. `table` = the table it belongs to (if known). */
export interface SqlIssue { line: number; from: number; to: number; message: string; table?: string; column?: string; broken?: boolean }

const stripComments = (s: string) => s.replace(/--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const CREATE_RE = /^\s*create\s+(?:or\s+replace\s+)?(?:(?:temp|temporary|global|local|unlogged)\s+)*table\s+(?:if\s+not\s+exists\s+)?([`"[]?[\w$]+[`"\]]?(?:\s*\.\s*[`"[]?[\w$]+[`"\]]?)*)?/i;
const bareName = (s: string) => s.split('.').pop()!.replace(/[`"[\]\s]/g, '');
/** True when there is nothing but whitespace and comments. */
export const isBlankSql = (src: string) => !stripComments(src).trim();

/**
 * Parse as much as possible: statements that fail on their own are blanked out (one at a time) and the rest
 * is parsed again, so one half-typed statement doesn't stop everything else from updating.
 */
export function parseSqlTolerant(src: string): ParseResult & { broken: SqlIssue[] } {
  let text = src;
  let res = parseSql(text);
  const broken: SqlIssue[] = [];
  const issueFor = (st: { from: number; to: number; text: string }, message: string): SqlIssue => {
    const clean = stripComments(st.text);
    const lead = clean.length - clean.trimStart().length;
    const m = CREATE_RE.exec(clean);
    return { line: src.slice(0, st.from + lead).split('\n').length, from: st.from + lead, to: st.to, message, table: m?.[1] ? bareName(m[1]) : undefined, broken: true };
  };
  for (let tries = 0; res.error && tries < 30; tries++) {
    const bad = splitStatements(text).find((s) => s.text.trim() && parseSql(s.text).error);
    if (!bad) break;
    broken.push(issueFor(bad, parseSql(bad.text).error!));
    text = text.slice(0, bad.from) + bad.text.replace(/[^\n]/g, ' ') + text.slice(bad.to);
    res = parseSql(text);
  }
  // a CREATE TABLE that produced no table (e.g. "CREATE TABLE help{}") is a problem too, not silence
  const got = new Set(res.tables.map((t) => t.name.toLowerCase()));
  for (const st of splitStatements(text)) {
    const m = CREATE_RE.exec(stripComments(st.text));
    if (!m) continue;
    if (!m[1]) { broken.push(issueFor(st, 'CREATE TABLE needs a table name')); continue; }
    const name = bareName(m[1]);
    if (!got.has(name.toLowerCase())) broken.push(issueFor(st, `CREATE TABLE ${name} needs its columns inside ( … )`));
  }
  broken.sort((a, b) => a.from - b.from);
  return { ...res, broken };
}

/** References to tables / columns that don't exist (they can't be drawn as lines). */
export function referenceIssues(src: string, tables: PTable[], otherNames: string[]): SqlIssue[] {
  const names = new Map(tables.map((t) => [t.name.toLowerCase(), t]));
  const known = new Set([...names.keys(), ...otherNames.map((n) => n.toLowerCase())]);
  const out: SqlIssue[] = [];
  const clean = stripComments(src);
  const where = (table: string, column: string) => {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const head = new RegExp(`create\\s+(?:\\w+\\s+)*table\\s+(?:if\\s+not\\s+exists\\s+)?[\\w."\`\\[\\]]*?[\`"\\[]?${esc(table)}[\`"\\]]?\\s*\\(`, 'i').exec(clean);
    let from = head ? head.index : 0;
    if (head) {
      const col = new RegExp(`[\`"\\[]?\\b${esc(column)}\\b`, 'i').exec(clean.slice(from + head[0].length));
      if (col) from = from + head[0].length + col.index;
    }
    return { from, to: from + column.length, line: src.slice(0, from).split('\n').length };
  };
  for (const t of tables) {
    for (const c of t.columns) {
      if (!c.ref) continue;
      const target = c.ref.table.toLowerCase();
      if (!known.has(target)) out.push({ ...where(t.name, c.name), table: t.name, column: c.name, message: `${t.name}.${c.name} references “${c.ref.table}”, but there is no table with that name` });
      else if (c.ref.column && names.get(target) && !names.get(target)!.columns.some((x) => x.name.toLowerCase() === c.ref!.column.toLowerCase()))
        out.push({ ...where(t.name, c.name), table: t.name, column: c.name, message: `${t.name}.${c.name} references ${c.ref.table}.${c.ref.column}, but ${c.ref.table} has no column “${c.ref.column}”` });
    }
  }
  return out;
}

/**
 * keep: tables missing from `parsed` that must stay anyway — true = all of them (a broken statement whose table
 * is unknown), or a set of lowercase names (broken statements of those tables). Renames are off while keeping.
 */
export function applySql(doc: Doc, parsed: PTable[], place: (index: number, count: number) => { x: number; y: number }, keep: boolean | Set<string> = false): Doc {
  const keepMissing = keep !== false;
  const next: Doc = structuredClone(doc);
  const tables = next.nodes.filter((n) => n.kind === 'table' && !n.variant);
  const byName = new Map(tables.map((t) => [t.text.toLowerCase(), t]));
  const matched = new Map<PTable, DNode>();
  const unmatchedParsed: PTable[] = [];
  for (const p of parsed) {
    const t = byName.get(p.name.toLowerCase());
    if (t && ![...matched.values()].includes(t)) matched.set(p, t);
    else unmatchedParsed.push(p);
  }
  // a table that was renamed in code keeps its spot: pair leftovers in order
  const unmatchedNodes = tables.filter((t) => ![...matched.values()].includes(t));
  const renamePairs = keepMissing ? 0 : Math.min(unmatchedNodes.length, unmatchedParsed.length);
  for (let k = 0; k < renamePairs; k++) matched.set(unmatchedParsed[k], unmatchedNodes[k]);
  const created = unmatchedParsed.slice(renamePairs);
  const keptIds = new Set(unmatchedNodes.filter((n) => keep === true || (keep instanceof Set && keep.has(n.text.toLowerCase()))).map((n) => n.id));
  const removed = new Set(unmatchedNodes.slice(renamePairs).filter((n) => !keptIds.has(n.id)).map((n) => n.id));

  // update / create
  let k = 0;
  const nodeFor = new Map<string, DNode>();
  for (const p of parsed) {
    let node = matched.get(p);
    if (!node) {
      const pos = place(k++, created.length);
      node = { id: uid('n'), kind: 'table', x: pos.x, y: pos.y, text: p.name, fields: [] };
      next.nodes.push(node);
    }
    node.text = p.name;
    const old = new Map((node.fields ?? []).map((f) => [f.name.toLowerCase(), f]));
    node.fields = p.columns.map((c) => {
      const prev = old.get(c.name.toLowerCase());
      const f: Field = { id: prev?.id ?? uid('f'), name: c.name, type: c.type };
      if (c.pk) f.pk = true;
      if (c.ref) f.fk = true;
      if (c.unique) f.unique = true;
      if (c.ai) f.ai = true;
      if (!c.pk) f.nullable = !c.notNull;
      return f;
    });
    nodeFor.set(p.name.toLowerCase(), node);
  }
  next.nodes = next.nodes.filter((n) => !removed.has(n.id));

  // resolve references → field refs + relationship lines
  const wanted = new Map<string, { parent: DNode; child: DNode; nullable: boolean; unique: boolean; pf?: string; cf?: string }>();
  for (const p of parsed) {
    const child = nodeFor.get(p.name.toLowerCase())!;
    for (const c of p.columns) {
      if (!c.ref) continue;
      const parent = nodeFor.get(c.ref.table.toLowerCase()) ?? next.nodes.find((n) => n.kind === 'table' && n.text.toLowerCase() === c.ref!.table.toLowerCase());
      if (!parent) continue;
      const f = child.fields!.find((x) => x.name === c.name)!;
      const pf = parent.fields?.find((x) => x.name.toLowerCase() === (c.ref!.column || '').toLowerCase()) ?? parent.fields?.find((x) => x.pk);
      if (pf) f.ref = { node: parent.id, field: pf.id };
      const key = parent.id + '>' + child.id;
      const onlyPk = p.columns.filter((x) => x.pk).length === 1 && c.pk;
      const prev = wanted.get(key);
      wanted.set(key, { parent, child, nullable: (prev?.nullable ?? false) || (!c.notNull && !c.pk), unique: c.unique || onlyPk, pf: prev?.pf ?? pf?.id, cf: prev?.cf ?? f.id });
    }
  }
  const alive = new Set(next.nodes.map((n) => n.id));
  const kept: DEdge[] = [];
  const have = new Set<string>();
  for (const e of next.edges) {
    if ((e.source.node && !alive.has(e.source.node)) || (e.target.node && !alive.has(e.target.node))) continue;
    const a = e.source.node, b = e.target.node;
    const key = a && b ? (wanted.has(a + '>' + b) ? a + '>' + b : wanted.has(b + '>' + a) ? b + '>' + a : null) : null;
    if (key) { have.add(key); kept.push(e); continue; }
    // the FK behind this line was removed from the code (while a statement is broken, only judge tables that parsed)
    if (e.fromSql && !keptIds.has(e.target.node ?? '')) continue;
    kept.push(e);
  }
  for (const [key, w] of wanted) {
    if (have.has(key)) continue;
    // lines run from the PK row to the FK row
    kept.push({
      id: uid('e'),
      source: w.pf ? { node: w.parent.id, field: w.pf } : { node: w.parent.id },
      target: w.cf ? { node: w.child.id, field: w.cf } : { node: w.child.id },
      sourceEnd: w.nullable ? '01' : '11', targetEnd: w.unique ? '01' : '0M', fromSql: true,
    });
  }
  next.edges = kept;
  return next;
}
