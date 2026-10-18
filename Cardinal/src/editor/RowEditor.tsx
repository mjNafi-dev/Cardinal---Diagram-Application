import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, newField } from '../store/editor';
import { usePrefs } from '../store/prefs';
import { tableMetrics } from '../geometry/geometry';
import { uid, type DEdge, type Rect } from '../model/types';
import { fieldToVals, guessRef, parseKeys, smartParse, suggestionsFor, type Cell, type RowVals } from './fieldParse';

const ORDER: Cell[] = ['key', 'name', 'type'];

/** Inline editor for one table row: three cells (keys · name · type) with suggestions. */
export function RowEditor({ rect, tableId, fieldId, startCell }: { rect: Rect; tableId: string; fieldId: string; startCell: Cell }) {
  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.view);
  const prefs = usePrefs((s) => s.prefs);
  const table = doc.nodes.find((n) => n.id === tableId);
  const field = table?.fields?.find((f) => f.id === fieldId);
  const original = useMemo(() => (field ? fieldToVals(field) : { keys: '', name: '', type: '' }), [fieldId]); // eslint-disable-line react-hooks/exhaustive-deps
  const wasEmpty = !original.keys && !original.name && !original.type;
  const [vals, setVals] = useState<RowVals>(original);
  const [cell, setCell] = useState<Cell>(startCell);
  const [hi, setHi] = useState(-1);
  const [showSug, setShowSug] = useState(true);
  const pendingRef = useRef<{ node: string; field: string } | null>(null);
  const done = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const inputs = { key: useRef<HTMLInputElement>(null), name: useRef<HTMLInputElement>(null), type: useRef<HTMLInputElement>(null) };

  useEffect(() => {
    done.current = false;
    pendingRef.current = null;
    setVals(original);
    setCell(startCell);
    requestAnimationFrame(() => { inputs[startCell].current?.focus(); inputs[startCell].current?.select(); });
  }, [fieldId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sugs = useMemo(
    () => (table && field ? suggestionsFor(cell, cell === 'key' ? vals.keys : cell === 'name' ? vals.name : vals.type, vals, doc, table, field) : []),
    [cell, vals, doc, table, field],
  );
  useEffect(() => {
    const v = cell === 'key' ? vals.keys : cell === 'name' ? vals.name : vals.type;
    setHi(v.trim() && sugs.length ? 0 : -1);
  }, [cell, vals.keys, vals.name, vals.type, sugs.length]);

  if (!table || !field) return null;
  const st = useEditor.getState();

  /** Re-read the current cell with the smart parser (a whole row typed in one cell spreads out). */
  const settle = (c: Cell, v: RowVals): RowVals => {
    const raw = c === 'key' ? v.keys : c === 'name' ? v.name : v.type;
    // in the keys box, "existing keys" means the ones the row had when editing started
    const parsed = smartParse(c, raw, c === 'key' ? { ...v, keys: original.keys } : v);
    return { keys: parsed.keys, name: parsed.name, type: parsed.type };
  };

  const save = (v: RowVals): boolean => {
    const flags = parseKeys(v.keys);
    const name = v.name.trim(), type = v.type.trim();
    const empty = !name && !type && !Object.values(flags).some(Boolean);
    if (empty) {
      st.commit((d) => { const t = d.nodes.find((q) => q.id === tableId)!; t.fields = t.fields!.filter((f) => f.id !== fieldId); });
      return false;
    }
    st.commit((d) => {
      const t = d.nodes.find((q) => q.id === tableId)!;
      const f = t.fields!.find((q) => q.id === fieldId)!;
      const hadRef = !!f.ref;
      f.name = name;
      f.type = type;
      const set = (k: 'pk' | 'fk' | 'unique' | 'ai', on: boolean) => { if (on) f[k] = true; else delete f[k]; };
      set('pk', flags.pk); set('fk', flags.fk); set('unique', flags.unique); set('ai', flags.ai);
      if (flags.nn) f.nullable = false;
      else if (f.nullable === false) delete f.nullable;
      if (!flags.fk) delete f.ref;
      else if (pendingRef.current) f.ref = pendingRef.current;
      else if (!f.ref) { const g = guessRef(d, t, name); if (g) f.ref = g; }
      // a new FK → draw the relationship line (PK row → FK row) unless the tables are already linked
      if (f.ref && !hadRef) {
        const parent = f.ref.node;
        const linked = d.edges.some((e) => (e.source.node === parent && e.target.node === tableId) || (e.target.node === parent && e.source.node === tableId));
        if (!linked && parent !== tableId) {
          const e: DEdge = { id: uid('e'), source: { node: parent, field: f.ref.field }, target: { node: tableId, field: f.id }, sourceEnd: flags.nn || flags.pk ? '11' : '01', targetEnd: flags.unique ? '01' : '0M' };
          d.edges.push(e);
        }
      }
    }, 'row:' + fieldId);
    return true;
  };

  const close = () => { done.current = true; st.setEditing(null); };

  const goRow = (dir: 1 | -1, focus: Cell) => {
    done.current = true;
    const fields = useEditor.getState().doc.nodes.find((q) => q.id === tableId)?.fields ?? [];
    const idx = fields.findIndex((f) => f.id === fieldId);
    const next = idx >= 0 ? fields[idx + dir] : fields[fields.length - 1];
    if (next) return st.setEditing({ type: 'field', id: tableId, fieldId: next.id, cell: focus });
    if (dir === -1) return close();
    const nf = newField('', '');
    st.commit((d) => { d.nodes.find((q) => q.id === tableId)!.fields!.push(nf); }, 'row:' + fieldId);
    st.setEditing({ type: 'field', id: tableId, fieldId: nf.id, cell: focus });
  };

  const accept = (i: number) => {
    const s = sugs[i];
    if (!s) return;
    const r = s.apply(vals);
    if (r.ref) pendingRef.current = r.ref;
    setVals({ keys: r.keys, name: r.name, type: r.type });
    if (cell !== 'key') setShowSug(false);
  };

  const onKey = (e: React.KeyboardEvent, c: Cell) => {
    e.stopPropagation();
    const visible = showSug && sugs.length > 0;
    if (e.key === 'ArrowDown' && visible) { e.preventDefault(); setHi((h) => (h + 1) % sugs.length); return; }
    if (e.key === 'ArrowUp' && visible) { e.preventDefault(); setHi((h) => (h <= 0 ? sugs.length - 1 : h - 1)); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (visible) return setShowSug(false);
      done.current = true;
      if (wasEmpty) st.commit((d) => { const t = d.nodes.find((q) => q.id === tableId)!; t.fields = t.fields!.filter((f) => f.id !== fieldId); });
      return close();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (visible && hi >= 0) return accept(hi);
      const v = settle(c, vals);
      if (save(v)) goRow(1, 'key');
      else close();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      let v = vals;
      if (visible && hi >= 0) {
        const r = sugs[hi].apply(vals);
        if (r.ref) pendingRef.current = r.ref;
        v = { keys: r.keys, name: r.name, type: r.type };
      }
      v = settle(c, v);
      setVals(v);
      const i = ORDER.indexOf(c) + (e.shiftKey ? -1 : 1);
      if (i >= 0 && i < ORDER.length) {
        setCell(ORDER[i]);
        setShowSug(true);
        requestAnimationFrame(() => { inputs[ORDER[i]].current?.focus(); inputs[ORDER[i]].current?.select(); });
        return;
      }
      if (save(v)) goRow(e.shiftKey ? -1 : 1, e.shiftKey ? 'type' : 'key');
      else close();
    }
  };

  const onBlurBox = (e: React.FocusEvent) => {
    if (done.current) return;
    if (e.relatedTarget && box.current?.contains(e.relatedTarget as Node)) return;
    done.current = true;
    save(settle(cell, vals));
    st.setEditing(null);
  };

  // geometry
  const z = view.zoom;
  const m = tableMetrics(prefs, table);
  const idx = table.fields!.findIndex((f) => f.id === fieldId);
  const sx = view.x + rect.x * z;
  const sy = view.y + (rect.y + m.headerH + 3 + idx * m.rowH) * z;
  const h = Math.max(26, m.rowH * z);
  const fs = Math.max(12, (table.style?.fontSize ?? prefs.text.bodySize) * Math.min(z, 1.3));
  const keyW = Math.max(74, m.keyW * z);
  const typeW = Math.max(128, rect.w * z * 0.32);
  const total = Math.max(rect.w * z, keyW + 170 + typeW);
  const left: Record<Cell, number> = { key: 0, name: keyW + 2, type: total - typeW };

  const input = (c: Cell, placeholder: string, mono = false) => (
    <input
      ref={inputs[c]}
      className={`row-cell${cell === c ? ' on' : ''}${mono ? ' mono' : ''}`}
      style={{ left: left[c], width: c === 'name' ? total - typeW - keyW - 4 : c === 'key' ? keyW : typeW, height: h, fontSize: fs }}
      value={c === 'key' ? vals.keys : c === 'name' ? vals.name : vals.type}
      placeholder={placeholder}
      spellCheck={false}
      onFocus={() => { setCell(c); setShowSug(true); }}
      onChange={(e) => {
        const v = e.target.value;
        setShowSug(true);
        setVals((p) => (c === 'key' ? { ...p, keys: v.toUpperCase() === v ? v : v } : c === 'name' ? { ...p, name: v } : { ...p, type: v }));
      }}
      onKeyDown={(e) => onKey(e, c)}
    />
  );

  return (
    <div ref={box} className="row-editor" style={{ left: sx, top: sy, width: total, height: h }} onBlur={onBlurBox} onPointerDown={(e) => e.stopPropagation()}>
      {input('key', 'PK…')}
      {input('name', 'column name')}
      {input('type', 'type', true)}
      {showSug && sugs.length > 0 && (
        <div className="row-sug" style={{ left: Math.min(left[cell], total - 280 > 0 ? left[cell] : 0), top: h + 4 }}>
          {cell === 'key' && <div className="row-sug-head">Keys — pick one or more</div>}
          {cell === 'name' && sugs.some((s) => s.desc.startsWith('Foreign')) && <div className="row-sug-head">Link to another table, or a common column</div>}
          {cell === 'type' && <div className="row-sug-head">Data type</div>}
          {sugs.map((s, i) => (
            <button key={s.label + i} className={`row-sug-item${i === hi ? ' hl' : ''}`} onMouseDown={(e) => { e.preventDefault(); accept(i); }} onMouseEnter={() => setHi(i)}>
              <span className="l">{s.label}</span>
              <span className="d">{s.desc}</span>
            </button>
          ))}
          <div className="row-sug-foot">Tip: type a whole row like <b>FK customer_id INT</b> in any box · Tab next box · Enter next row</div>
        </div>
      )}
    </div>
  );
}
