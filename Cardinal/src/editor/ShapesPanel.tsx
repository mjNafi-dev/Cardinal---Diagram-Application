import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, Star, StarOff, X, MousePointerClick, Spline, Plus, PanelLeftClose } from 'lucide-react';
import { useEditor } from '../store/editor';
import { usePrefs } from '../store/prefs';
import { CONNECTORS, SHAPES, equivalents, searchItems, shapeById, connectorById, type ConnectorDef, type ShapeDef, type ShapeGroup } from '../model/catalog';
import type { Notation } from '../model/types';
import { ConnectorPic, ShapeIcon } from '../ui/previews';
import { placeConnector, viewCenter } from './Canvas';
import { toast } from '../ui/toast';

const NOTATION_NAME: Record<Notation, string> = { crowsfoot: "Crow's Foot", chen: 'Chen / EER' };
const DRAG = 'application/x-cardinal';

export function NotationToggle({ value, onChange }: { value: Notation; onChange: (n: Notation) => void }) {
  return (
    <div className="seg" role="tablist">
      <button className={value === 'crowsfoot' ? 'on' : ''} onClick={() => onChange('crowsfoot')}>Crow's Foot</button>
      <button className={value === 'chen' ? 'on' : ''} onClick={() => onChange('chen')}>Chen / EER</button>
    </div>
  );
}

// ───────────────────────── favorites + actions ─────────────────────────

const favKey = (it: { type: 'shape' | 'connector'; id: string }) => (it.type === 'shape' ? 'shape:' : 'conn:') + it.id;

function toggleFavorite(key: string, at?: number) {
  usePrefs.getState().set((p) => {
    const i = p.favorites.indexOf(key);
    if (i >= 0 && at === undefined) p.favorites.splice(i, 1);
    else {
      if (i >= 0) p.favorites.splice(i, 1);
      const pos = at === undefined ? p.favorites.length : Math.min(at, p.favorites.length);
      p.favorites.splice(pos, 0, key);
    }
  });
}

function placeShape(def: ShapeDef) {
  const st = useEditor.getState();
  const id = st.addPreset(def.id, viewCenter());
  if ((def.kind !== 'shape' && def.kind !== 'logic') || def.defaultText) st.setEditing({ type: 'node', id });
}

function useConnector(def: ConnectorDef) {
  const st = useEditor.getState();
  const edgeIds = new Set(st.doc.edges.map((e) => e.id));
  const n = st.selection.filter((s) => edgeIds.has(s)).length;
  st.applyConnector(def.id);
  toast(n ? `Applied “${def.name}” to ${n} line${n > 1 ? 's' : ''}` : `New connections will use “${def.name}”`);
}

type Ctx = { x: number; y: number; key: string } | null;

function ContextMenu({ ctx, onClose }: { ctx: NonNullable<Ctx>; onClose: () => void }) {
  const favs = usePrefs((s) => s.prefs.favorites);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close); };
  }, [onClose]);
  const isFav = favs.includes(ctx.key);
  const [type, id] = ctx.key.split(/:(.+)/);
  const shape = type === 'shape' ? shapeById(id) : undefined;
  const conn = type === 'conn' ? connectorById(id) : undefined;
  const st = useEditor.getState();
  const selEdges = st.selection.filter((s) => st.doc.edges.some((e) => e.id === s)).length;
  const item = (label: string, icon: React.ReactNode, fn: () => void) => (
    <button className="menu-item" onClick={() => { onClose(); fn(); }}>{icon}<span className="grow">{label}</span></button>
  );
  return (
    <div className="menu" style={{ left: ctx.x, top: Math.min(ctx.y, window.innerHeight - 200) }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="menu-label">{shape?.name ?? conn?.name}</div>
      {shape && item('Place on canvas', <MousePointerClick size={15} />, () => placeShape(shape))}
      {conn && item('Use for new connections', <MousePointerClick size={15} />, () => useConnector(conn))}
      {conn && selEdges > 0 && item(`Apply to ${selEdges} selected line${selEdges > 1 ? 's' : ''}`, <Spline size={15} />, () => useConnector(conn))}
      {conn && item('Place a loose line on canvas', <Plus size={15} />, () => placeConnector(conn.id, viewCenter()))}
      <div className="menu-sep" />
      {item(isFav ? 'Remove from favorites' : 'Add to favorites', isFav ? <StarOff size={15} /> : <Star size={15} />, () => toggleFavorite(ctx.key))}
    </div>
  );
}

// ───────────────────────── tiles ─────────────────────────

/** Makes a tile reachable with Tab and usable with Enter / Space, with a name for screen readers. */
function pressable(label: string, fn: () => void) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
  };
}

function dragProps(payload: object, onCtx: (e: React.MouseEvent) => void) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(DRAG, JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'copy'; },
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); onCtx(e); },
  };
}

export function ConnectorTile({ def, active, onClick, onCtx }: { def: ConnectorDef; active: boolean; onClick: () => void; onCtx?: (e: React.MouseEvent) => void }) {
  return (
    <div className={`conn-tile${active ? ' active' : ''}`} {...dragProps({ type: 'connector', id: def.id }, onCtx ?? (() => {}))} {...pressable(`${def.name} (${def.keyword})`, onClick)} title={[`${def.name} · keyword ${def.keyword}`, ...equivalents(def), 'Right-click for more'].join('\n')}>
      <div className="pic"><ConnectorPic def={def} width={104} /></div>
      <div className="nm"><span>{def.name}</span><span className="kw">{def.keyword}</span></div>
    </div>
  );
}

function ShapeTile({ def, onCtx, compact }: { def: ShapeDef; onCtx: (e: React.MouseEvent) => void; compact?: boolean }) {
  return (
    <div
      className={compact ? 'icon-tile' : 'shape-tile'}
      {...dragProps({ type: 'shape', id: def.id }, onCtx)}
      {...pressable(`Add ${def.name}`, () => placeShape(def))}
      title={`${def.name}${def.hint ? ' — ' + def.hint : ''}
Click to add, drag onto the canvas, right-click for more`}
    >
      <ShapeIcon kind={def.kind} text={def.defaultText} shape={def.shape} variant={def.variant} logic={def.logic} />
      {!compact && <span>{def.name}</span>}
    </div>
  );
}

// ───────────────────────── sections ─────────────────────────

const LS_COLLAPSE = 'cardinal.collapsed';
const DEFAULT_COLLAPSED = ['general', 'flowchart', 'arrows', 'containers', 'misc', 'lines'];

function useCollapsed() {
  const [set, setSet] = useState<Set<string>>(() => {
    try { const raw = localStorage.getItem(LS_COLLAPSE); return new Set(raw ? JSON.parse(raw) : DEFAULT_COLLAPSED); } catch { return new Set(DEFAULT_COLLAPSED); }
  });
  const toggle = (id: string) => setSet((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    try { localStorage.setItem(LS_COLLAPSE, JSON.stringify([...n])); } catch {}
    return n;
  });
  return { collapsed: set, toggle };
}

function Section({ id, title, count, collapsed, onToggle, children, extra, forceOpen, ...rest }: {
  id: string; title: string; count?: number; collapsed: boolean; onToggle: () => void; children: React.ReactNode; extra?: React.ReactNode; forceOpen?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const open = forceOpen || !collapsed;
  return (
    <div className="section lib-section" data-section={id} {...rest}>
      <button className="section-toggle" onClick={onToggle}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="label">{title}</span>
        {count !== undefined && <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>{count}</span>}
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}{extra}</div>}
    </div>
  );
}

const GENERAL_SECTIONS: { id: ShapeGroup; title: string }[] = [
  { id: 'general', title: 'General shapes' },
  { id: 'flowchart', title: 'Flowchart' },
  { id: 'arrows', title: 'Arrows' },
  { id: 'containers', title: 'Containers & frames' },
  { id: 'misc', title: 'People & more' },
];

const LOGIC_SECTIONS: { id: ShapeGroup; title: string }[] = [
  { id: 'logic-input', title: 'Inputs' },
  { id: 'logic-gate', title: 'Gates' },
  { id: 'logic-output', title: 'Outputs' },
];

const LOGIC_GROUPS = new Set<string>(LOGIC_SECTIONS.map((g) => g.id));
const ER_GROUPS = new Set<string>(['crowsfoot', 'chen']);

export function ShapesPanel({ searchRef, onCollapse }: { searchRef?: React.RefObject<HTMLInputElement>; onCollapse?: () => void }) {
  const circuit = useEditor((s) => s.doc.mode === 'circuit');
  const notation = useEditor((s) => s.panelNotation);
  const setNotation = useEditor((s) => s.setPanelNotation);
  const active = useEditor((s) => s.activeConnector);
  const favorites = usePrefs((s) => s.prefs.favorites);
  const [q, setQ] = useState('');
  const [ctx, setCtx] = useState<Ctx>(null);
  const [favOver, setFavOver] = useState(false);
  const ownRef = useRef<HTMLInputElement>(null);
  const input = searchRef ?? ownRef;
  const { collapsed, toggle } = useCollapsed();
  const searching = !!q.trim();

  const openCtx = (key: string) => (e: React.MouseEvent) => setCtx({ x: e.clientX, y: e.clientY, key });

  const erShapes = useMemo(() => (circuit ? [] : searchItems(SHAPES.filter((s) => s.group === notation), q)), [notation, q, circuit]);
  const textShapes = useMemo(() => searchItems(SHAPES.filter((s) => s.group === 'text'), q), [q]);
  const conns = useMemo(() => (circuit ? [] : searchItems(CONNECTORS.filter((c) => c.group === notation), q)), [notation, q, circuit]);
  const logic = useMemo(() => Object.fromEntries(LOGIC_SECTIONS.map((g) => [g.id, circuit ? searchItems(SHAPES.filter((s) => s.group === g.id), q) : []])), [q, circuit]);
  const lines = useMemo(() => searchItems(CONNECTORS.filter((c) => c.group === 'shared'), q), [q]);
  const general = useMemo(() => Object.fromEntries(GENERAL_SECTIONS.map((g) => [g.id, searchItems(SHAPES.filter((s) => s.group === g.id), q)])), [q]);
  const other: Notation = notation === 'chen' ? 'crowsfoot' : 'chen';
  const otherHits = useMemo(
    () => (searching && !circuit ? searchItems(CONNECTORS.filter((c) => c.group === other), q).length + searchItems(SHAPES.filter((s) => s.group === other), q).length : 0),
    [q, other, searching, circuit],
  );

  const favItems = favorites
    .map((k) => {
      const [type, id] = k.split(/:(.+)/);
      return type === 'shape' ? { k, shape: shapeById(id) } : { k, conn: connectorById(id) };
    })
    .filter((x) => x.shape || x.conn)
    // only show favorites that belong in this kind of diagram (no ER tables in a circuit, no gates in an ER diagram)
    .filter((x) => (x.shape ? (circuit ? !ER_GROUPS.has(x.shape.group) : !LOGIC_GROUPS.has(x.shape.group)) : !circuit || x.conn!.group === 'shared'))
    .filter((x) => !searching || searchItems([x.shape ?? x.conn!], q).length);

  const dropOnFav = (e: React.DragEvent, at?: number) => {
    const raw = e.dataTransfer.getData(DRAG);
    setFavOver(false);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    const item = JSON.parse(raw);
    if (item.type !== 'shape' && item.type !== 'connector') return;
    const key = favKey(item);
    const already = usePrefs.getState().prefs.favorites.includes(key);
    toggleFavorite(key, at ?? usePrefs.getState().prefs.favorites.length);
    if (!already) toast('Added to favorites');
  };
  const favDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setFavOver(true);
  };

  const logicHits = Object.values(logic).flat();
  const anyResults = logicHits.length + erShapes.length + textShapes.length + conns.length + lines.length + Object.values(general).reduce((a, l) => a + l.length, 0) + favItems.length > 0;

  return (
    <aside className="side lib" style={{ width: 296 }}>
      <div className="side-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{circuit ? <div className="lib-title">Logic circuit parts</div> : <NotationToggle value={notation} onChange={setNotation} />}</div>
          {onCollapse && <button className="icon-btn sm" title="Hide the shape library" aria-label="Hide the shape library" onClick={onCollapse}><PanelLeftClose size={15} /></button>}
        </div>
        <div className="search">
          <Search size={15} />
          <input
            ref={input}
            className="input"
            placeholder={circuit ? 'Search… try AND, XOR, bulb' : 'Search… try 11:0M, 1..*, (0,N), 1:N'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setQ(''); input.current?.blur(); }
              if (e.key === 'Enter' && searching) {
                if (logicHits[0]) placeShape(logicHits[0]);
                else if (conns[0]) useConnector(conns[0]);
                else if (erShapes[0]) placeShape(erShapes[0]);
              }
            }}
          />
          {q && (
            <button className="icon-btn sm" style={{ position: 'absolute', right: 3, top: 3 }} onClick={() => setQ('')} aria-label="Clear search"><X size={14} /></button>
          )}
        </div>
      </div>
      <div className="side-scroll">
        {/* Favorites: drop anything here (hidden while a search finds none of them) */}
        {(!searching || favItems.length > 0) && <Section
          id="favorites" title="Favorites" count={favItems.length} collapsed={collapsed.has('favorites')} onToggle={() => toggle('favorites')} forceOpen={searching && favItems.length > 0}
          onDragOver={favDragOver} onDragLeave={() => setFavOver(false)} onDrop={(e) => dropOnFav(e)}
          className={`section lib-section fav${favOver ? ' over' : ''}`}
        >
          {favItems.length ? (
            <div className="fav-grid">
              {favItems.map((x, i) => (
                <div key={x.k} className={x.conn ? 'fav-conn' : undefined} onDragOver={favDragOver} onDrop={(e) => dropOnFav(e, i)}>
                  {x.shape ? (
                    <ShapeTile def={x.shape} compact onCtx={openCtx(x.k)} />
                  ) : (
                    <div className={`icon-tile conn${active.crowsfoot === x.conn!.id || active.chen === x.conn!.id ? ' active' : ''}`}
                      {...dragProps({ type: 'connector', id: x.conn!.id }, openCtx(x.k))}
                      {...pressable(`${x.conn!.name} (${x.conn!.keyword})`, () => useConnector(x.conn!))} title={[`${x.conn!.name} · ${x.conn!.keyword}`, ...equivalents(x.conn!)].join('\n')}>
                      <ConnectorPic def={x.conn!} width={84} />
                      <span className="kw-mini">{x.conn!.keyword}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="faint fav-empty">Right-click anything below → Add to favorites, or drag it here.</p>
          )}
        </Section>}

        {LOGIC_SECTIONS.map((g) => logic[g.id].length > 0 && (
          <Section key={g.id} id={g.id} title={g.title} count={logic[g.id].length} collapsed={collapsed.has(g.id)} onToggle={() => toggle(g.id)} forceOpen={searching}
            extra={g.id === 'logic-gate' ? <p className="faint" style={{ fontSize: 11.5, margin: '10px 2px 0' }}>Select a gate to change its type or number of inputs on the right.</p> : undefined}>
            <div className="shape-grid">
              {logic[g.id].map((s) => <ShapeTile key={s.id} def={s} onCtx={openCtx('shape:' + s.id)} />)}
            </div>
          </Section>
        ))}

        {erShapes.length > 0 && (
          <Section id={'er-' + notation} title={notation === 'chen' ? 'Chen & EER shapes' : "Crow's Foot shapes"} count={erShapes.length} collapsed={collapsed.has('er-' + notation)} onToggle={() => toggle('er-' + notation)} forceOpen={searching}>
            <div className="shape-grid">
              {erShapes.map((s) => <ShapeTile key={s.id} def={s} onCtx={openCtx('shape:' + s.id)} />)}
            </div>
          </Section>
        )}

        {conns.length > 0 && (
          <Section id={'conn-' + notation} title={notation === 'chen' ? 'Relationship lines' : 'Cardinalities'} count={conns.length} collapsed={collapsed.has('conn-' + notation)} onToggle={() => toggle('conn-' + notation)} forceOpen={searching}
            extra={<p className="faint" style={{ fontSize: 11.5, margin: '10px 2px 0' }}>
              {notation === 'chen'
                ? 'Click: use for new connections and apply to selected lines. Drag onto a line to restyle it.'
                : 'Keyword = start:end, each as min max (0/1 = optional/mandatory, 1/M = one/many). You can also search UML (1 0..*), (min,max) ((0,N) (1,1)), ratios (1:N) or words (one and only one to zero or many).'}
            </p>}>
            <div className="conn-list">
              {conns.map((c) => <ConnectorTile key={c.id} def={c} active={active[notation] === c.id} onClick={() => useConnector(c)} onCtx={openCtx('conn:' + c.id)} />)}
            </div>
          </Section>
        )}

        {textShapes.length > 0 && (
          <Section id="text" title="Text & notes" collapsed={collapsed.has('text')} onToggle={() => toggle('text')} forceOpen={searching}>
            <div className="shape-grid">
              {textShapes.map((s) => <ShapeTile key={s.id} def={s} onCtx={openCtx('shape:' + s.id)} />)}
            </div>
          </Section>
        )}

        {GENERAL_SECTIONS.map((g) => general[g.id].length > 0 && (
          <Section key={g.id} id={g.id} title={g.title} count={general[g.id].length} collapsed={collapsed.has(g.id)} onToggle={() => toggle(g.id)} forceOpen={searching}>
            <div className="icon-grid">
              {general[g.id].map((s) => <ShapeTile key={s.id} def={s} compact onCtx={openCtx('shape:' + s.id)} />)}
            </div>
          </Section>
        ))}

        {lines.length > 0 && (
          <Section id="lines" title="Other lines" count={lines.length} collapsed={collapsed.has('lines')} onToggle={() => toggle('lines')} forceOpen={searching}>
            <div className="conn-list">
              {lines.map((c) => <ConnectorTile key={c.id} def={c} active={false} onClick={() => useConnector(c)} onCtx={openCtx('conn:' + c.id)} />)}
            </div>
          </Section>
        )}

        {!anyResults && <div className="empty-state" style={{ padding: '30px 16px' }}><span>No matches{circuit ? '' : ` in ${NOTATION_NAME[notation]}`}.</span></div>}
        {otherHits > 0 && (
          <div className="section">
            <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => setNotation(other)}>
              {otherHits} match{otherHits > 1 ? 'es' : ''} in {NOTATION_NAME[other]} →
            </button>
          </div>
        )}
      </div>
      {ctx && <ContextMenu ctx={ctx} onClose={() => setCtx(null)} />}
    </aside>
  );
}
