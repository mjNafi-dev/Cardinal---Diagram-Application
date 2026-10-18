import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Code2, Table2, Copy, Download, List, Maximize, Minus, Moon, PanelRightClose, PanelRightOpen, Pencil, Plus, Redo2, Settings, SlidersHorizontal, Sun, Trash2, Undo2, Wand2 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useLibrary } from '../store/library';
import { usePrefs } from '../store/prefs';
import { Canvas, fitView, isTyping, viewCenter, zoomBy } from './Canvas';
import { ToolRail, insertImage } from './ToolRail';
import { ShapesPanel } from './ShapesPanel';
import { PropertiesPanel, tidyUp } from './PropertiesPanel';
import { CodePanel } from './CodePanel';
import { TruthTablePanel } from './CircuitPanels';
import { ExportDialog } from './ExportDialog';
import { PreferencesDialog, type PrefsTab } from '../ui/PreferencesDialog';
import { toast } from '../ui/toast';
import { Logo } from '../ui/Logo';
import { layoutRef } from '../diagram/layout';
import { makeThumb } from '../diagram/thumb';
import { useResolvedTheme } from '../theme/useTheme';
import { NewDiagramDialog } from '../home/NewDiagramDialog';
import { navigate } from '../App';
import { isDesktop } from '../store/backend';
import { askConfirm } from '../ui/confirm';
import { emptyDoc, type DiagramFile, type DiagramMeta } from '../model/types';

let saveTimer: number | undefined;
/** below these window widths the shape library / the right panel hide on their own */
const NARROW = 1200;
const TINY = 1000;
let pasteViaEvent = false;
const TOOL_KEYS: Record<string, 'select' | 'note' | 'text' | 'line' | 'pen' | 'comment'> = { v: 'select', n: 'note', t: 'text', l: 'line', p: 'pen', c: 'comment' };

async function saveNow() {
  clearTimeout(saveTimer);
  const st = useEditor.getState();
  if (!st.meta || st.saveStatus === 'saved') return;
  const lay = layoutRef.current;
  const meta = { ...st.meta, notation: st.doc.notation, mode: st.doc.mode, updatedAt: Date.now(), thumb: lay ? makeThumb(st.doc, lay.rects, lay.routes) : st.meta.thumb };
  const file: DiagramFile = { meta, doc: st.doc };
  st.setSaveStatus('saving');
  const tick = st.dirtyTick;
  try {
    await useLibrary.getState().saveDiagram(file);
    useEditor.setState({ meta });
    if (useEditor.getState().dirtyTick === tick) st.setSaveStatus('saved');
    else st.setSaveStatus('unsaved');
  } catch {
    st.setSaveStatus('error');
  }
}

export function EditorPage({ diagramId }: { diagramId: string }) {
  const meta = useEditor((s) => s.meta);
  const circuit = useEditor((s) => s.doc.mode === 'circuit');
  const [loaded, setLoaded] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [rightTab, setRightTab] = useState<'props' | 'sql'>(() => (localStorage.getItem('cardinal.rightTab') as 'props' | 'sql') || 'props');
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem('cardinal.rightW')) || 320);
  const [dialog, setDialog] = useState<'export' | 'prefs' | 'new' | null>(null);
  const [prefsTab, setPrefsTab] = useState<PrefsTab>('appearance');
  const libPref = () => localStorage.getItem('cardinal.libOpen') !== '0';
  const [libOpen, setLibOpen] = useState(() => libPref() && innerWidth >= NARROW);
  const [rightOpen, setRightOpen] = useState(() => innerWidth >= TINY);
  const searchRef = useRef<HTMLInputElement>(null);
  // only the user's own clicks are remembered; the automatic hiding below is not
  const toggleLib = () => { const v = !libOpen; setLibOpen(v); localStorage.setItem('cardinal.libOpen', v ? '1' : '0'); };
  // narrow windows: tuck the side panels away so the canvas keeps its room, and bring them back when the window widens
  useEffect(() => {
    let narrow = innerWidth < NARROW, tiny = innerWidth < TINY;
    const onResize = () => {
      const n = innerWidth < NARROW, t = innerWidth < TINY;
      if (n !== narrow) setLibOpen(!n && libPref());
      if (t !== tiny) setRightOpen(!t);
      narrow = n; tiny = t;
    };
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);
  const [searchTick, setSearchTick] = useState(0);
  const openSearch = () => { setLibOpen(true); setSearchTick((t) => t + 1); };
  // focus the library search once the panel is on screen (it may have just been opened)
  useEffect(() => { if (searchTick) { searchRef.current?.focus(); searchRef.current?.select(); } }, [searchTick]);

  // load
  useEffect(() => {
    let alive = true;
    setLoaded('loading');
    (async () => {
      await saveNow();
      const file = await useLibrary.getState().loadDiagram(diagramId);
      if (!alive) return;
      if (!file) return setLoaded('missing');
      useEditor.getState().load(file);
      setLoaded('ok');
    })();
    return () => { alive = false; };
  }, [diagramId]);

  // autosave
  useEffect(() => {
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.dirtyTick !== prev.dirtyTick) {
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveNow, 700);
      }
    });
    const flush = () => { void saveNow(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);
    return () => { unsub(); window.removeEventListener('beforeunload', flush); document.removeEventListener('visibilitychange', flush); void saveNow(); };
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      // these work even while typing in a box
      if (mod && e.key === ',') { e.preventDefault(); setPrefsTab('appearance'); setDialog('prefs'); return; }
      if (mod && k === 's') { e.preventDefault(); if (!dialog) void saveNow().then(() => toast('Saved')); return; }
      if (dialog || isTyping()) return;
      const st = useEditor.getState();
      if (mod && k === 'k') { e.preventDefault(); openSearch(); return; }
      if (mod && k === 'e') { e.preventDefault(); setDialog('export'); return; }
      if (e.key === '?') { e.preventDefault(); setPrefsTab('shortcuts'); setDialog('prefs'); return; }
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(); }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); st.redo(); }
      else if (mod && k === 'c') { st.copySelection(); }
      else if (mod && k === 'x') { st.copySelection(); st.deleteSelection(); }
      else if (mod && k === 'v') { pasteViaEvent = false; setTimeout(() => { if (!pasteViaEvent) useEditor.getState().paste(); }, 60); }
      else if (mod && k === 'd') { e.preventDefault(); st.duplicateSelection(); }
      else if (mod && k === 'a') { e.preventDefault(); st.selectAll(); }
      else if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomBy(1.2); }
      else if (mod && k === '-') { e.preventDefault(); zoomBy(1 / 1.2); }
      else if (mod && k === '0') { e.preventDefault(); fitView(); }
      else if (mod && k === '1') { e.preventDefault(); zoomBy(1 / st.view.zoom); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); st.deleteSelection(); }
      else if (e.key === 'Escape') { if (st.tool !== 'select') st.setTool('select'); else { st.select([]); st.setEditing(null); } }
      else if (!mod && !e.altKey && TOOL_KEYS[k]) { e.preventDefault(); st.setTool(TOOL_KEYS[k]); }
      else if (!mod && e.key === '/') { e.preventDefault(); openSearch(); }
      else if ((e.key === 'Enter' || e.key === 'F2') && st.selection.length === 1) {
        e.preventDefault();
        const id = st.selection[0];
        if (st.doc.nodes.some((n) => n.id === id)) st.setEditing({ type: 'node', id });
        else st.setEditing({ type: 'edge', id });
      } else if (e.key.startsWith('Arrow') && st.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? usePrefs.getState().prefs.canvas.gridSize * 2 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.nudgeSelection(dx, dy);
      }
    };
    // Ctrl+V: an image on the clipboard becomes an image shape; otherwise paste copied shapes
    const onPaste = (e: ClipboardEvent) => {
      if (dialog || isTyping()) return;
      pasteViaEvent = true;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      e.preventDefault();
      if (file) insertImage(file, viewCenter());
      else useEditor.getState().paste();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); };
  }, [dialog]);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const sx = e.clientX, sw = rightW;
    const move = (ev: PointerEvent) => setRightW(Math.max(260, Math.min(760, sw - (ev.clientX - sx))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [rightW]);
  useEffect(() => { localStorage.setItem('cardinal.rightW', String(rightW)); }, [rightW]);
  useEffect(() => { localStorage.setItem('cardinal.rightTab', rightTab); }, [rightTab]);
  const sqlJump = useEditor((s) => s.sqlJump);
  useEffect(() => { if (sqlJump) { setRightOpen(true); setRightTab('sql'); setRightW((w) => Math.max(w, 420)); } }, [sqlJump]);

  if (loaded === 'missing') {
    return (
      <div className="empty-state" style={{ height: '100%', justifyContent: 'center' }}>
        <Logo size={48} />
        <b>That diagram doesn't exist any more.</b>
        <button className="btn btn-primary" onClick={() => navigate('#/')}>Back to projects</button>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar circuit={circuit} onExport={() => setDialog('export')} onPrefs={() => { setPrefsTab('appearance'); setDialog('prefs'); }} sqlOpen={rightTab === 'sql'} onToggleSql={() => {
        if (!rightOpen) { setRightOpen(true); setRightTab('sql'); if (rightW < 400) setRightW(420); return; }
        setRightTab(rightTab === 'sql' ? 'props' : 'sql'); if (rightTab !== 'sql' && rightW < 400) setRightW(420);
      }} />
      <div className="editor-body">
        <ToolRail libOpen={libOpen} onToggleLib={toggleLib} onSearch={openSearch} />
        {libOpen && <ShapesPanel searchRef={searchRef} />}
        {loaded === 'ok' ? <Canvas /> : <div className="canvas-wrap" />}
        {!rightOpen && (
          <button className="right-reopen" title="Show the side panel" aria-label="Show the side panel" onClick={() => setRightOpen(true)}><PanelRightOpen size={17} /></button>
        )}
        {rightOpen && <aside className="side right" style={{ width: rightW }}>
          <div className="resize-grip" onPointerDown={startResize} />
          <div className="tabs">
            <button className={`tab${rightTab === 'props' ? ' on' : ''}`} onClick={() => setRightTab('props')}><SlidersHorizontal size={14} /> Properties</button>
            <button className={`tab${rightTab === 'sql' ? ' on' : ''}`} onClick={() => { setRightTab('sql'); if (rightW < 400) setRightW(420); }}>
              {circuit ? <><Table2 size={14} /> Truth table</> : <><Code2 size={14} /> SQL</>}
            </button>
            <div className="spacer" />
            <button className="icon-btn sm" title="Hide the side panel" aria-label="Hide the side panel" onClick={() => setRightOpen(false)}><PanelRightClose size={15} /></button>
          </div>
          {rightTab === 'props' ? <div className="side-scroll"><PropertiesPanel /></div> : loaded !== 'ok' ? null : circuit ? <TruthTablePanel /> : <CodePanel key={meta?.id} />}
        </aside>}
      </div>
      <PagesBar />
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'prefs' && <PreferencesDialog initialTab={prefsTab} onClose={() => setDialog(null)} />}

    </div>
  );
}

function TopBar({ circuit, onExport, onPrefs, sqlOpen, onToggleSql }: { circuit: boolean; onExport: () => void; onPrefs: () => void; sqlOpen: boolean; onToggleSql: () => void }) {
  const meta = useEditor((s) => s.meta);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const status = useEditor((s) => s.saveStatus);
  const zoom = useEditor((s) => s.view.zoom);
  const project = useLibrary((s) => s.projects.find((p) => p.id === meta?.projectId));
  const theme = useResolvedTheme((s) => s.theme);
  const [name, setName] = useState(meta?.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setName(meta?.name ?? ''), [meta?.name, meta?.id]);
  const st = useEditor.getState();

  const commitName = () => {
    const m = useEditor.getState().meta;
    if (!m || !name.trim() || name === m.name) return setName(m?.name ?? '');
    useEditor.setState({ meta: { ...m, name: name.trim() }, saveStatus: 'unsaved', dirtyTick: useEditor.getState().dirtyTick + 1 });
  };

  return (
    <header className="topbar">
      <div className="brand" onClick={() => navigate('#/')} title="All projects"><Logo /> </div>
      <div className="crumbs">
        <button className="crumb-btn" onClick={() => navigate(`#/p/${meta?.projectId}`)}>{project?.name ?? 'Project'}</button>
        <span className="sep">/</span>
        <input
          ref={inputRef}
          className="title-input"
          value={name}
          size={Math.max(8, name.length + 1)}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.blur(); if (e.key === 'Escape') { setName(meta?.name ?? ''); setTimeout(() => inputRef.current?.blur()); } }}
        />
      </div>
      <div className={`save-status ${status}`} title={status === 'error' ? (isDesktop() ? 'Could not save. Check that Documents › Cardinal exists and is not read-only.' : 'Could not save. Is the Cardinal window still open?') : status === 'saved' ? 'All changes saved' : 'Saving your changes…'}>
        <span className="dot" /><span className="save-text">{status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : 'Unsaved'}</span>
      </div>
      <div className="spacer" />
      <button className="icon-btn" title="Undo (Ctrl + Z)" disabled={!canUndo} onClick={() => st.undo()}><Undo2 size={17} /></button>
      <button className="icon-btn" title="Redo (Ctrl + Y)" disabled={!canRedo} onClick={() => st.redo()}><Redo2 size={17} /></button>
      <div className="divider-v" />
      <button className="btn btn-ghost" title="Arrange everything neatly" onClick={() => tidyUp()}><Wand2 size={15} /> Tidy up</button>
      {circuit
        ? <button className={`btn ${sqlOpen ? '' : 'btn-ghost'}`} title="Truth table and Boolean expressions" onClick={onToggleSql}><Table2 size={15} /> Truth table</button>
        : <button className={`btn ${sqlOpen ? '' : 'btn-ghost'}`} title="SQL code panel" onClick={onToggleSql}><Code2 size={15} /> SQL</button>}
      <div className="divider-v" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <button className="icon-btn sm" title="Zoom out (Ctrl + minus)" onClick={() => zoomBy(1 / 1.2)}><Minus size={15} /></button>
        <button className="btn btn-ghost btn-sm" style={{ minWidth: 52 }} title="Zoom level · click to fit (Ctrl + 0)" onClick={() => fitView()}>{Math.round(zoom * 100)}%</button>
        <button className="icon-btn sm" title="Zoom in (Ctrl + plus)" onClick={() => zoomBy(1.2)}><Plus size={15} /></button>
        <button className="icon-btn sm" title="Fit to screen (Ctrl + 0)" onClick={() => fitView()}><Maximize size={14} /></button>
      </div>
      <div className="divider-v" />
      <button className="icon-btn" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={() => usePrefs.getState().set((p) => { p.theme = theme === 'dark' ? 'light' : 'dark'; })}>
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <button className="icon-btn" title="Preferences (Ctrl + ,)" onClick={onPrefs}><Settings size={17} /></button>
      <button className="btn btn-primary" onClick={onExport}><Download size={15} /> Export</button>
    </header>
  );
}

/** Bottom page tabs, Google-Sheets style: + adds a page, ≡ lists them all, the active tab has a ∨ menu. */
function PagesBar() {
  const meta = useEditor((s) => s.meta);
  const diagrams = useLibrary((s) => s.diagrams);
  const notation = usePrefs((s) => s.prefs.defaultNotation);
  const [menu, setMenu] = useState<{ kind: 'list' | 'page'; x: number; y: number; page?: DiagramMeta } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);
  if (!meta) return <div className="pagesbar" />;
  const pages = diagrams.filter((d) => d.projectId === meta.projectId).sort((a, b) => a.createdAt - b.createdAt);
  const nameOf = (d: DiagramMeta) => (d.id === meta.id ? meta.name : d.name);
  const lib = useLibrary.getState();

  const addPage = async () => {
    await saveNow();
    let n = pages.length + 1;
    while (pages.some((p) => p.name === `Page ${n}`)) n++;
    const cur = useEditor.getState().doc;
    const m = await lib.createDiagram(meta.projectId, `Page ${n}`, notation, cur.mode === 'circuit' ? emptyDoc(notation, 'circuit') : undefined);
    navigate(`#/d/${m.id}`);
  };
  const rename = (d: DiagramMeta, name: string) => {
    const v = name.trim();
    setRenaming(null);
    if (!v || v === nameOf(d)) return;
    if (d.id === meta.id) {
      useEditor.setState({ meta: { ...useEditor.getState().meta!, name: v }, saveStatus: 'unsaved', dirtyTick: useEditor.getState().dirtyTick + 1 });
      useLibrary.setState({ diagrams: useLibrary.getState().diagrams.map((x) => (x.id === d.id ? { ...x, name: v } : x)) });
    } else lib.renameDiagram(d.id, v);
  };
  const duplicate = async (d: DiagramMeta) => {
    await saveNow();
    const m = await lib.duplicateDiagram(d.id);
    if (m) navigate(`#/d/${m.id}`);
  };
  const remove = async (d: DiagramMeta) => {
    if (!(await askConfirm('Delete page?', `“${nameOf(d)}” will be moved to the .trash folder.`))) return;
    const rest = pages.filter((p) => p.id !== d.id);
    if (d.id === meta.id) useEditor.setState({ saveStatus: 'saved' });
    await lib.deleteDiagram(d.id);
    if (d.id === meta.id) navigate(rest.length ? `#/d/${rest[0].id}` : `#/p/${meta.projectId}`);
  };
  const openMenu = (e: React.MouseEvent, kind: 'list' | 'page', page?: DiagramMeta) => {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ kind, x: r.left, y: r.top, page });
  };

  return (
    <div className="pagesbar">
      <button className="icon-btn sm" title="Add page" onClick={addPage}><Plus size={16} /></button>
      <button className="icon-btn sm" title="All pages" onClick={(e) => openMenu(e, 'list')}><List size={16} /></button>
      <div className="divider-v" />
      {pages.map((d) => (
        renaming === d.id ? (
          <input key={d.id} className="page-rename" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
            onBlur={() => rename(d, draft)} onKeyDown={(e) => { if (e.key === 'Enter') rename(d, draft); if (e.key === 'Escape') setRenaming(null); }} />
        ) : (
          <button key={d.id} className={`page-tab${d.id === meta.id ? ' on' : ''}`}
            onClick={(e) => (d.id === meta.id ? openMenu(e, 'page', d) : navigate(`#/d/${d.id}`))}
            onDoubleClick={() => { setRenaming(d.id); setDraft(nameOf(d)); }}
            onContextMenu={(e) => openMenu(e, 'page', d)}
            title="Double-click to rename · right-click for options">
            {nameOf(d)}
            {d.id === meta.id && <ChevronDown size={13} />}
          </button>
        )
      ))}
      {menu && (
        <div className="menu" style={{ left: menu.x, bottom: window.innerHeight - menu.y + 6 }} onPointerDown={(e) => e.stopPropagation()}>
          {menu.kind === 'list' ? (
            <>
              <div className="menu-label">Pages in this project</div>
              {pages.map((d) => (
                <button key={d.id} className="menu-item" onClick={() => { setMenu(null); if (d.id !== meta.id) navigate(`#/d/${d.id}`); }}>
                  <span style={{ width: 16 }}>{d.id === meta.id && <Check size={14} />}</span><span className="grow">{nameOf(d)}</span>
                  <span className="faint" style={{ fontSize: 11 }}>{d.mode === 'circuit' ? 'Logic' : d.notation === 'chen' ? 'Chen' : 'CF'}</span>
                </button>
              ))}
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { setMenu(null); addPage(); }}><Plus size={15} /><span className="grow">Add page</span></button>
            </>
          ) : menu.page && (
            <>
              <button className="menu-item" onClick={() => { setMenu(null); setRenaming(menu.page!.id); setDraft(nameOf(menu.page!)); }}><Pencil size={15} /><span className="grow">Rename</span></button>
              <button className="menu-item" onClick={() => { setMenu(null); duplicate(menu.page!); }}><Copy size={15} /><span className="grow">Duplicate</span></button>
              <div className="menu-sep" />
              <button className="menu-item danger" onClick={() => { setMenu(null); remove(menu.page!); }}><Trash2 size={15} /><span className="grow">Delete</span></button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
