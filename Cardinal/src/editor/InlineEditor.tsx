import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store/editor';
import { usePrefs } from '../store/prefs';
import { tableMetrics } from '../geometry/geometry';
import { basicShape } from '../model/basicShapes';
import type { Rect } from '../model/types';
import type { RoutedEdge } from '../routing/router';
import { RowEditor } from './RowEditor';

/** In-place text editing: shape names, notes, line labels, comments. Table rows use RowEditor. */
export function InlineEditor({ rects, routes }: { rects: Map<string, Rect>; routes: Map<string, RoutedEdge> }) {
  const editing = useEditor((s) => s.editing)!;
  const view = useEditor((s) => s.view);
  const doc = useEditor((s) => s.doc);
  const prefs = usePrefs((s) => s.prefs);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const done = useRef(false);

  const node = editing.type === 'node' ? doc.nodes.find((n) => n.id === editing.id) : undefined;
  const edge = editing.type === 'edge' ? doc.edges.find((e) => e.id === editing.id) : undefined;
  const initial = editing.type === 'edge' ? edge?.label ?? '' : node?.text ?? '';
  const [value, setValue] = useState(initial);

  useEffect(() => {
    done.current = false;
    setValue(initial);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.select(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.type, editing.id]);

  if (editing.type === 'field') {
    const r = rects.get(editing.id);
    return r ? <RowEditor rect={r} tableId={editing.id} fieldId={editing.fieldId} startCell={editing.cell ?? 'name'} /> : null;
  }
  if ((editing.type === 'node' && !node) || (editing.type === 'edge' && !edge)) return null;

  const z = view.zoom;
  const toScreen = (x: number, y: number) => ({ x: view.x + x * z, y: view.y + y * z });
  const st = useEditor.getState();

  const finish = (mode: 'commit' | 'cancel') => {
    if (done.current) return;
    done.current = true;
    if (node && mode === 'commit' && value !== node.text) st.updateNode(node.id, { text: value });
    if (edge && mode === 'commit' && value !== (edge.label ?? '')) st.updateEdge(edge.id, { label: value.trim() || undefined });
    st.setEditing(null);
  };

  const multiline = !!node && (node.kind === 'note' || node.kind === 'text' || node.kind === 'comment' || node.kind === 'shape');
  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); finish('cancel'); }
    else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey || (node?.kind === 'shape' && !e.shiftKey))) { e.preventDefault(); finish('commit'); }
  };

  let box: { x: number; y: number; w: number; h: number };
  let fontSize = prefs.text.bodySize * z;
  let align: 'center' | 'left' = 'center';
  if (edge) {
    const rt = routes.get(edge.id);
    const m = rt ? toScreen(rt.mid.x, rt.mid.y) : { x: 0, y: 0 };
    fontSize = prefs.text.labelSize * z;
    box = { x: m.x - 90, y: m.y - fontSize - 4, w: 180, h: fontSize * 2 + 8 };
  } else {
    const r = rects.get(node!.id)!;
    const s = toScreen(r.x, r.y);
    if (node!.kind === 'table') {
      const m = tableMetrics(prefs, node);
      box = { x: s.x + 4, y: s.y + 4, w: r.w * z - 8, h: m.headerH * z - 8 };
      fontSize = prefs.text.titleSize * z;
    } else if (node!.kind === 'comment') {
      box = { x: s.x + r.w * z + 8, y: s.y - 4, w: 240, h: 90 };
      fontSize = 13;
      align = 'left';
    } else if (node!.kind === 'note' || node!.kind === 'text') {
      box = { x: s.x, y: s.y, w: Math.max(r.w * z, 160), h: Math.max(r.h * z, 60) };
      align = 'left';
    } else if (node!.kind === 'shape' && basicShape(node!.shape).label && basicShape(node!.shape).label !== 'center') {
      const lab = basicShape(node!.shape).label;
      box = lab === 'below' ? { x: s.x + (r.w * z) / 2 - 80, y: s.y + r.h * z + 4, w: 160, h: 30 } : { x: s.x + 6, y: s.y + 4, w: Math.max(160, r.w * z * 0.6), h: 28 };
      align = lab === 'below' ? 'center' : 'left';
    } else {
      const big = node!.kind === 'entity' || node!.kind === 'weak-entity' || node!.kind === 'entity-simple';
      fontSize = (big ? prefs.text.titleSize : prefs.text.bodySize) * z;
      const h = node!.kind === 'shape' ? Math.max(r.h * z * 0.7, fontSize * 2.2) : fontSize * 2.2;
      const w = Math.max(r.w * z * 0.8, 120);
      box = { x: s.x + (r.w * z - w) / 2, y: s.y + (r.h * z - h) / 2, w, h };
    }
  }

  const style: React.CSSProperties = {
    left: box.x, top: box.y, width: box.w, height: box.h, fontSize: Math.max(11, fontSize), textAlign: align,
    fontFamily: 'var(--diagram-font)',
  };
  const common = {
    ref,
    className: 'inline-editor',
    style,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setValue(e.target.value),
    onKeyDown,
    onBlur: () => finish('commit'),
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    spellCheck: node?.kind === 'note' || node?.kind === 'comment',
    placeholder: edge ? 'Label' : node?.kind === 'comment' ? 'Write a comment…' : '',
  };
  return multiline ? <textarea {...common} /> : <input {...common} />;
}
