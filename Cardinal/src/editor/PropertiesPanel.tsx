import { Fragment, useMemo, useState } from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  ArrowDown, ArrowLeftRight, ArrowUp, Plus, Search, Trash2, Wand2, Pin, Maximize, Spline, MoveDiagonal,
} from 'lucide-react';
import { useEditor, newField } from '../store/editor';
import { usePrefs } from '../store/prefs';
import { CONNECTORS, equivalents, matchConnector, searchItems } from '../model/catalog';
import type { DEdge, DNode, EndMarker, Field, NodeKind, Notation, Routing } from '../model/types';
import { ConnectorPic } from '../ui/previews';
import { NotationToggle } from './ShapesPanel';
import { NumberField, Swatches } from '../ui/controls';
import { edgeRouting } from '../routing/router';
import { layoutRef } from '../diagram/layout';
import { tidyPositions } from '../diagram/tidy';
import { fitView } from './Canvas';
import { nodeRect } from '../geometry/geometry';
import { CircuitDiagramProps, LogicProps, WireProps } from './CircuitPanels';

const END_OPTIONS: { v: EndMarker; label: string }[] = [
  { v: 'none', label: 'None' },
  { v: '11', label: '11 · Mandatory one' },
  { v: '01', label: '01 · Optional one' },
  { v: '1M', label: '1M · Mandatory many' },
  { v: '0M', label: '0M · Optional many' },
  { v: 'one', label: 'One (single bar)' },
  { v: 'many', label: 'Many (crow’s foot only)' },
  { v: 'arrow', label: 'Arrow' },
  { v: 'triangle', label: 'Inheritance triangle' },
];

const KIND_SWITCH: NodeKind[][] = [
  ['attribute', 'key-attribute', 'partial-key-attribute', 'multivalued-attribute', 'derived-attribute'],
  ['entity', 'weak-entity'],
  ['relationship', 'identifying-relationship'],
  ['table', 'entity-simple'],
];
const KIND_LABEL: Partial<Record<NodeKind, string>> = {
  attribute: 'Simple', 'key-attribute': 'Key', 'partial-key-attribute': 'Partial key', 'multivalued-attribute': 'Multivalued', 'derived-attribute': 'Derived',
  entity: 'Strong', 'weak-entity': 'Weak', relationship: 'Regular', 'identifying-relationship': 'Identifying', table: 'Table', 'entity-simple': 'Title only',
};

export function PropertiesPanel() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const nodes = useMemo(() => doc.nodes.filter((n) => selection.includes(n.id)), [doc.nodes, selection]);
  const edges = useMemo(() => doc.edges.filter((e) => selection.includes(e.id)), [doc.edges, selection]);

  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const isWire = (e: DEdge) => byId.get(e.source.node ?? '')?.kind === 'logic' || byId.get(e.target.node ?? '')?.kind === 'logic';
  const wires = edges.length > 0 && edges.every(isWire);
  if (!nodes.length && !edges.length) return doc.mode === 'circuit' ? <CircuitDiagramProps /> : <DiagramProps />;
  return (
    <>
      {nodes.length === 1 && !edges.length && (nodes[0].kind === 'logic' ? <LogicProps n={nodes[0]} /> : <NodeProps n={nodes[0]} />)}
      {nodes.length > 1 && <MultiNodeProps nodes={nodes} />}
      {edges.length > 0 && (wires ? <WireProps edges={edges} /> : <EdgeProps edges={edges} />)}
      {nodes.length > 1 || (nodes.length && edges.length) ? null : null}
      <div className="section">
        <button className="btn btn-sm btn-danger" style={{ width: '100%' }} onClick={() => useEditor.getState().deleteSelection()}>
          <Trash2 size={14} /> Delete {selection.length > 1 ? `${selection.length} items` : nodes.length ? (nodes[0].kind === 'logic' ? 'part' : 'shape') : wires ? 'wire' : 'line'}
        </button>
      </div>
    </>
  );
}

// ───────────────────────── nothing selected ─────────────────────────

function DiagramProps() {
  const doc = useEditor((s) => s.doc);
  const st = useEditor.getState();
  const tables = doc.nodes.filter((n) => n.kind !== 'text' && n.kind !== 'note').length;
  return (
    <>
      <div className="section">
        <div className="section-title"><span className="label">Diagram</span></div>
        <p className="muted" style={{ margin: '0 0 10px' }}>{tables} shape{tables === 1 ? '' : 's'} · {doc.edges.length} line{doc.edges.length === 1 ? '' : 's'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => tidyUp()} disabled={!doc.nodes.length}><Wand2 size={14} /> Tidy up layout</button>
          <button className="btn btn-sm" onClick={() => fitView()}><Maximize size={14} /> Fit diagram to screen</button>
          <button className="btn btn-sm" onClick={() => st.selectAll('edges')} disabled={!doc.edges.length}><Spline size={14} /> Select all lines</button>
        </div>
      </div>
      <div className="section">
        <div className="section-title"><span className="label">Quick keys</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', fontSize: 12 }} className="muted">
          {[
            ['Ctrl + K', 'find a shape to add'],
            ['Double-click', 'add shape / edit text'],
            ['Drag from a dot', 'connect two shapes'],
            ['Enter', 'next column (tables)'],
            ['Space + drag', 'pan'],
            ['Ctrl + wheel', 'zoom'],
            ['Ctrl + Z / Y', 'undo / redo'],
            ['Ctrl + D', 'duplicate'],
            ['Ctrl + A', 'select all'],
            ['Shift + click', 'add to selection'],
            ['Alt + drag', 'move without snapping'],
            ['F2', 'rename selected'],
            ['?', 'all shortcuts'],
          ].map(([k, v]) => (
            <Fragment key={k}><span className="kbd" style={{ justifySelf: 'start' }}>{k}</span><span>{v}</span></Fragment>
          ))}
        </div>
      </div>
      <div className="section">
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Typing a column: <span className="kbd">PK id INT</span>, <span className="kbd">FK customer_id INT</span>, or just <span className="kbd">name VARCHAR(80)</span>.
        </p>
      </div>
    </>
  );
}

export function tidyUp() {
  const st = useEditor.getState();
  const lay = layoutRef.current;
  if (!lay) return;
  const prefs = usePrefs.getState().prefs;
  const pos = tidyPositions(st.doc, lay.rects, prefs.canvas.gridSize);
  st.commit((d) => { for (const n of d.nodes) { const p = pos.get(n.id); if (p) { n.x = p.x; n.y = p.y; } } });
  setTimeout(() => fitView(), 30);
}

// ───────────────────────── single node ─────────────────────────

function NodeProps({ n }: { n: DNode }) {
  const st = useEditor.getState();
  const prefs = usePrefs((s) => s.prefs);
  const group = KIND_SWITCH.find((g) => g.includes(n.kind));
  const rememberNode = (patch: DNode['style']) => {
    if (prefs.rememberLast) usePrefs.getState().set((p) => { p.last.node = { ...p.last.node, ...patch }; });
  };
  const setStyle = (patch: NonNullable<DNode['style']>, remember = true) => {
    st.updateNode(n.id, { style: { ...n.style, ...patch } });
    if (remember) rememberNode(patch);
  };
  const isText = n.kind === 'text' || n.kind === 'note' || n.kind === 'comment' || n.kind === 'image' || n.kind === 'drawing';
  const isPen = n.kind === 'drawing';

  return (
    <>
      <div className="section">
        <div className="section-title"><span className="label">{KIND_LABEL[n.kind] && group ? 'Shape' : n.kind === 'note' ? 'Note' : n.kind === 'text' ? 'Text' : 'Shape'}</span></div>
        {n.kind === 'note' || n.kind === 'text' ? (
          <textarea className="textarea" value={n.text} onChange={(e) => st.updateNode(n.id, { text: e.target.value }, 'text:' + n.id)} rows={4} />
        ) : (
          <input className="input" value={n.text} onChange={(e) => st.updateNode(n.id, { text: e.target.value }, 'text:' + n.id)} placeholder="Name" />
        )}
        {group && (
          <div className="seg" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            {group.map((k) => (
              <button key={k} className={n.kind === k ? 'on' : ''} onClick={() => {
                st.updateNode(n.id, { kind: k, ...(k === 'table' && !n.fields ? { fields: [newField('id', 'INT', { pk: true })] } : {}) });
              }}>{KIND_LABEL[k]}</button>
            ))}
          </div>
        )}
        {n.kind === 'specialization' && (
          <div className="seg" style={{ marginTop: 8 }}>
            {[['d', 'Disjoint (d)'], ['o', 'Overlap (o)'], ['∪', 'Union (∪)']].map(([v, l]) => (
              <button key={v} className={n.text === v ? 'on' : ''} onClick={() => st.updateNode(n.id, { text: v })}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {n.kind === 'table' && <FieldsEditor n={n} />}

      <div className="section">
        <div className="section-title"><span className="label">Style</span></div>
        {!isText && (
          <div className="prop-row">
            <span className="lbl">{n.kind === 'table' || n.kind === 'entity-simple' ? 'Header' : 'Fill'}</span>
            <div className="ctl"><Swatches value={n.style?.fill} onChange={(k) => setStyle({ fill: k })} /></div>
          </div>
        )}
        {n.kind === 'note' && (
          <div className="prop-row">
            <span className="lbl">Color</span>
            <div className="ctl"><Swatches value={n.style?.fill} onChange={(k) => setStyle({ fill: k }, false)} /></div>
          </div>
        )}
        <div className="prop-row">
          <span className="lbl">{n.kind === 'text' ? 'Text color' : isPen ? 'Ink color' : 'Border'}</span>
          <div className="ctl"><Swatches value={n.style?.stroke} onChange={(k) => setStyle({ stroke: k }, n.kind !== 'text')} kind="line" /></div>
        </div>
        {(!isText || isPen) && (
          <div className="prop-row">
            <span className="lbl">{isPen ? 'Pen width' : 'Border width'}</span>
            <div className="ctl">
              <NumberField value={n.style?.strokeWidth ?? (isPen ? 3 : prefs.shape.strokeWidth)} min={0.5} max={isPen ? 16 : 6} step={0.5} slider onChange={(v) => setStyle({ strokeWidth: v }, !isPen)} />
            </div>
          </div>
        )}
        <div className="prop-row">
          <span className="lbl">Text size</span>
          <div className="ctl">
            <NumberField value={n.style?.fontSize ?? (n.kind === 'text' ? prefs.text.bodySize + 1 : prefs.text.bodySize)} min={8} max={40} slider onChange={(v) => setStyle({ fontSize: v }, false)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {n.style && Object.keys(n.style).length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => st.updateNode(n.id, { style: undefined })}>Reset style</button>
          )}
          {(n.w !== undefined || n.h !== undefined) && (
            <button className="btn btn-sm btn-ghost" onClick={() => st.updateNode(n.id, { w: undefined, h: undefined })}><MoveDiagonal size={13} /> Auto size</button>
          )}
        </div>
      </div>
    </>
  );
}

function FieldsEditor({ n }: { n: DNode }) {
  const st = useEditor.getState();
  const doc = useEditor((s) => s.doc);
  const fields = n.fields ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const edit = (fid: string, patch: Partial<Field>, coalesce?: string) =>
    st.commit((d) => {
      const f = d.nodes.find((q) => q.id === n.id)!.fields!.find((q) => q.id === fid)!;
      Object.assign(f, patch);
      for (const k of Object.keys(patch) as (keyof Field)[]) if (patch[k] === undefined) delete f[k];
    }, coalesce);
  const move = (i: number, dir: number) =>
    st.commit((d) => {
      const fs = d.nodes.find((q) => q.id === n.id)!.fields!;
      const j = i + dir;
      if (j < 0 || j >= fs.length) return;
      [fs[i], fs[j]] = [fs[j], fs[i]];
    });
  const otherTables = doc.nodes.filter((t) => t.kind === 'table' && t.id !== n.id);

  return (
    <div className="section">
      <div className="section-title">
        <span className="label">Columns</span>
        <button className="btn btn-sm btn-ghost" onClick={() => {
          const f = newField('', '');
          st.commit((d) => { d.nodes.find((q) => q.id === n.id)!.fields!.push(f); });
          st.setEditing({ type: 'field', id: n.id, fieldId: f.id, cell: 'key' });
        }}><Plus size={13} /> Add</button>
      </div>
      <div className="field-list">
        {fields.map((f, i) => (
          <div key={f.id}>
            <div className="field-row">
              <button className={`keytog${f.pk ? ' on' : ''}`} title="Primary key" onClick={() => edit(f.id, { pk: !f.pk || undefined })}>PK</button>
              <button className={`keytog${f.fk ? ' on' : ''}`} title="Foreign key" onClick={() => edit(f.id, { fk: !f.fk || undefined })}>FK</button>
              <input className="input" value={f.name} placeholder="name" onChange={(e) => edit(f.id, { name: e.target.value }, 'fn:' + f.id)} />
              <input className="input mono" style={{ width: 92, flex: 'none' }} value={f.type} placeholder="type" onChange={(e) => edit(f.id, { type: e.target.value }, 'ft:' + f.id)} />
              <button className="icon-btn sm" title="More" onClick={() => setOpen(open === f.id ? null : f.id)} style={{ fontWeight: 700 }}>⋯</button>
            </div>
            {open === f.id && (
              <div style={{ padding: '6px 4px 8px 4px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <label className="check"><input type="checkbox" checked={f.nullable !== false && !f.pk} disabled={f.pk} onChange={(e) => edit(f.id, { nullable: e.target.checked })} /> Nullable</label>
                  <label className="check"><input type="checkbox" checked={!!f.unique} onChange={(e) => edit(f.id, { unique: e.target.checked || undefined })} /> Unique</label>
                </div>
                {(f.fk || f.ref) && (
                  <select className="select sm" value={f.ref ? `${f.ref.node}|${f.ref.field}` : ''} onChange={(e) => {
                    const [node, field] = e.target.value.split('|');
                    edit(f.id, { ref: node ? { node, field } : undefined, fk: true });
                  }}>
                    <option value="">References… (auto)</option>
                    {otherTables.flatMap((t) => (t.fields ?? []).map((tf) => (
                      <option key={t.id + tf.id} value={`${t.id}|${tf.id}`}>{t.text}.{tf.name}</option>
                    )))}
                  </select>
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /> Up</button>
                  <button className="btn btn-sm btn-ghost" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /> Down</button>
                  <div className="spacer" />
                  <button className="btn btn-sm btn-ghost btn-danger" onClick={() => st.commit((d) => { const t = d.nodes.find((q) => q.id === n.id)!; t.fields = t.fields!.filter((q) => q.id !== f.id); })}><Trash2 size={13} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!fields.length && <p className="faint" style={{ margin: 0 }}>No columns yet.</p>}
      </div>
    </div>
  );
}

// ───────────────────────── multiple nodes ─────────────────────────

function MultiNodeProps({ nodes }: { nodes: DNode[] }) {
  const st = useEditor.getState();
  const prefs = usePrefs((s) => s.prefs);
  const align = (mode: 'l' | 'c' | 'r' | 't' | 'm' | 'b') => {
    const rects = nodes.map((n) => ({ n, r: nodeRect(n, prefs) }));
    const x1 = Math.min(...rects.map((x) => x.r.x)), x2 = Math.max(...rects.map((x) => x.r.x + x.r.w));
    const y1 = Math.min(...rects.map((x) => x.r.y)), y2 = Math.max(...rects.map((x) => x.r.y + x.r.h));
    st.commit((d) => {
      for (const { n, r } of rects) {
        const t = d.nodes.find((q) => q.id === n.id)!;
        if (mode === 'l') t.x = x1;
        if (mode === 'r') t.x = x2 - r.w;
        if (mode === 'c') t.x = Math.round((x1 + x2) / 2 - r.w / 2);
        if (mode === 't') t.y = y1;
        if (mode === 'b') t.y = y2 - r.h;
        if (mode === 'm') t.y = Math.round((y1 + y2) / 2 - r.h / 2);
      }
    });
  };
  const ids = nodes.map((n) => n.id);
  const setAll = (patch: NonNullable<DNode['style']>) =>
    st.commit((d) => { for (const n of d.nodes) if (ids.includes(n.id)) n.style = { ...n.style, ...patch }; });
  return (
    <div className="section">
      <div className="section-title"><span className="label">{nodes.length} shapes</span></div>
      <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
        <button className="icon-btn sm" title="Align left" onClick={() => align('l')}><AlignStartVertical size={15} /></button>
        <button className="icon-btn sm" title="Align centers" onClick={() => align('c')}><AlignCenterVertical size={15} /></button>
        <button className="icon-btn sm" title="Align right" onClick={() => align('r')}><AlignEndVertical size={15} /></button>
        <div className="divider-v" />
        <button className="icon-btn sm" title="Align top" onClick={() => align('t')}><AlignStartHorizontal size={15} /></button>
        <button className="icon-btn sm" title="Align middles" onClick={() => align('m')}><AlignCenterHorizontal size={15} /></button>
        <button className="icon-btn sm" title="Align bottom" onClick={() => align('b')}><AlignEndHorizontal size={15} /></button>
      </div>
      <div className="prop-row"><span className="lbl">Fill</span><div className="ctl"><Swatches value={undefined} onChange={(k) => setAll({ fill: k })} /></div></div>
      <div className="prop-row"><span className="lbl">Border</span><div className="ctl"><Swatches value={undefined} onChange={(k) => setAll({ stroke: k })} kind="line" /></div></div>
      <div className="prop-row">
        <span className="lbl">Border width</span>
        <div className="ctl"><NumberField value={nodes[0].style?.strokeWidth ?? prefs.shape.strokeWidth} min={0.5} max={6} step={0.5} slider onChange={(v) => setAll({ strokeWidth: v })} /></div>
      </div>
    </div>
  );
}

// ───────────────────────── edges ─────────────────────────

function CardinalityPicker({ edges }: { edges: DEdge[] }) {
  const panelNotation = useEditor((s) => s.panelNotation);
  const current = edges.length === 1 ? matchConnector(edges[0]) : undefined;
  const [notation, setNotation] = useState<Notation>(current?.group === 'chen' ? 'chen' : current?.group === 'crowsfoot' ? 'crowsfoot' : panelNotation);
  const [q, setQ] = useState('');
  const items = searchItems(CONNECTORS.filter((c) => c.group === notation || c.group === 'shared'), q);
  const apply = (id: string) => useEditor.getState().applyConnector(id);
  return (
    <div className="section">
      <div className="section-title"><span className="label">Relationship type</span></div>
      <NotationToggle value={notation} onChange={setNotation} />
      <div className="search" style={{ margin: '8px 0' }}>
        <Search size={14} />
        <input className="input sm" style={{ paddingLeft: 28 }} placeholder="e.g. 11:0M, 1 0..*, 1:N" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && items[0]) apply(items[0].id); }} />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, margin: '0 -4px' }}>
        {items.map((c) => (
          <button key={c.id} className={`menu-item${current?.id === c.id ? ' hl' : ''}`} style={{ height: 'auto', padding: '5px 6px', gap: 6 }} onClick={() => apply(c.id)} title={[c.name, ...equivalents(c)].join('\n')}>
            <span style={{ color: 'var(--text)', flex: 'none' }}><ConnectorPic def={c} width={64} /></span>
            <span className="grow" style={{ fontSize: 12, lineHeight: 1.25 }}>{c.name}</span>
            <span className="kw">{c.keyword}</span>
          </button>
        ))}
        {!items.length && <span className="faint" style={{ padding: 6 }}>No match.</span>}
      </div>
    </div>
  );
}

function EdgeProps({ edges }: { edges: DEdge[] }) {
  const st = useEditor.getState();
  const prefs = usePrefs((s) => s.prefs);
  const doc = useEditor((s) => s.doc);
  const e = edges[0];
  const ids = edges.map((x) => x.id);
  const single = edges.length === 1;
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  const routing = edgeRouting(e, nodeById.get(e.source.node ?? ''), nodeById.get(e.target.node ?? ''), prefs);
  const width = e.style?.strokeWidth ?? prefs.line.width;
  const rememberEdge = (patch: NonNullable<DEdge['style']>) => {
    if (prefs.rememberLast) usePrefs.getState().set((p) => { p.last.edge = { ...p.last.edge, ...patch }; });
  };
  const setStyle = (patch: NonNullable<DEdge['style']>) => {
    st.commit((d) => { for (const x of d.edges) if (ids.includes(x.id)) x.style = { ...x.style, ...patch }; });
    rememberEdge(patch);
  };
  const isCf = !e.chenLabel && !e.total && !e.subset;
  const pinned = !!(e.source.side || e.target.side);

  return (
    <>
      <CardinalityPicker edges={edges} />
      {single && (
        <div className="section">
          <div className="section-title">
            <span className="label">Ends</span>
            <button className="btn btn-sm btn-ghost" title="Swap start and end" onClick={() => st.updateEdge(e.id, { source: e.target, target: e.source, sourceEnd: e.targetEnd, targetEnd: e.sourceEnd })}>
              <ArrowLeftRight size={13} /> Swap
            </button>
          </div>
          {isCf && (
            <>
              <div className="prop-row">
                <span className="lbl">At start</span>
                <div className="ctl">
                  <select className="select sm" value={e.sourceEnd ?? 'none'} onChange={(ev) => st.updateEdge(e.id, { sourceEnd: ev.target.value as EndMarker })}>
                    {END_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="prop-row">
                <span className="lbl">At end</span>
                <div className="ctl">
                  <select className="select sm" value={e.targetEnd ?? 'none'} onChange={(ev) => st.updateEdge(e.id, { targetEnd: ev.target.value as EndMarker })}>
                    {END_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          {!isCf && (
            <>
              <div className="prop-row">
                <span className="lbl">Cardinality</span>
                <div className="ctl"><input className="input sm" value={e.chenLabel ?? ''} placeholder="1, N, M or (0,N)" onChange={(ev) => st.updateEdge(e.id, { chenLabel: ev.target.value || undefined }, 'cl:' + e.id)} /></div>
              </div>
              <div className="prop-row">
                <span className="lbl" />
                <div className="ctl" style={{ gap: 14 }}>
                  <label className="check"><input type="checkbox" checked={!!e.total} onChange={(ev) => st.updateEdge(e.id, { total: ev.target.checked || undefined })} /> Total (double line)</label>
                  <label className="check"><input type="checkbox" checked={!!e.subset} onChange={(ev) => st.updateEdge(e.id, { subset: ev.target.checked || undefined })} /> ⊂</label>
                </div>
              </div>
            </>
          )}
          <div className="prop-row">
            <span className="lbl">Label</span>
            <div className="ctl"><input className="input sm" value={e.label ?? ''} placeholder="e.g. places" onChange={(ev) => st.updateEdge(e.id, { label: ev.target.value || undefined }, 'lb:' + e.id)} /></div>
          </div>
          {pinned && (
            <button className="btn btn-sm btn-ghost" onClick={() => st.updateEdge(e.id, { source: { node: e.source.node, x: e.source.x, y: e.source.y }, target: { node: e.target.node, x: e.target.x, y: e.target.y } })}>
              <Pin size={13} /> Unpin sides (automatic)
            </button>
          )}
        </div>
      )}
      <div className="section">
        <div className="section-title"><span className="label">Line{edges.length > 1 ? `s (${edges.length})` : ''}</span></div>
        <div className="prop-row">
          <span className="lbl">Routing</span>
          <div className="ctl">
            <select className="select sm" value={e.routing ?? ''} onChange={(ev) => st.updateEdges(ids, { routing: (ev.target.value || undefined) as Routing | undefined })}>
              <option value="">Automatic ({routing})</option>
              <option value="orthogonal">Right angles</option>
              <option value="straight">Straight</option>
              <option value="curved">Curved</option>
            </select>
          </div>
        </div>
        <div className="prop-row">
          <span className="lbl">Width</span>
          <div className="ctl"><NumberField value={width} min={0.5} max={8} step={0.5} slider onChange={(v) => setStyle({ strokeWidth: v })} /></div>
        </div>
        <div className="prop-row">
          <span className="lbl">Color</span>
          <div className="ctl"><Swatches value={e.style?.stroke} onChange={(k) => setStyle({ stroke: k })} kind="line" /></div>
        </div>
        <div className="prop-row">
          <span className="lbl" />
          <div className="ctl"><label className="check"><input type="checkbox" checked={!!e.dashed} onChange={(ev) => st.updateEdges(ids, { dashed: ev.target.checked || undefined })} /> Dashed</label></div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" title="Use this width for every line that has no custom width, now and in future diagrams"
            onClick={() => {
              usePrefs.getState().set((p) => { p.line.width = width; });
              st.commit((d) => { for (const x of d.edges) if (x.style?.strokeWidth === width) { delete x.style.strokeWidth; } });
            }}>Make {width}px the default</button>
          {edges.some((x) => x.style && Object.keys(x.style).length) && (
            <button className="btn btn-sm btn-ghost" onClick={() => st.commit((d) => { for (const x of d.edges) if (ids.includes(x.id)) delete x.style; })}>Reset style</button>
          )}
        </div>
      </div>
    </>
  );
}
