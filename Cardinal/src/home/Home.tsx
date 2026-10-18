import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Clock, Copy, FolderOpen, FolderPlus, Layers, MoreHorizontal, Pencil, Plus, Settings, Trash2, Upload, AlertTriangle, Search } from 'lucide-react';
import { useLibrary } from '../store/library';
import { getBackend } from '../store/backend';
import { Logo } from '../ui/Logo';
import { Modal } from '../ui/Modal';
import { PreferencesDialog } from '../ui/PreferencesDialog';
import { typingInField } from '../ui/shortcuts';
import { NewDiagramDialog } from './NewDiagramDialog';
import { navigate } from '../App';
import { PALETTE } from '../model/palette';
import type { DiagramFile, DiagramMeta, Project } from '../model/types';
import { toast } from '../ui/toast';
import { APP_VERSION } from '../version';

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
};

// ───────────────────────── diagram types ─────────────────────────

type TypeFilter = 'all' | 'db' | 'crowsfoot' | 'chen' | 'logic';
const typeOf = (d: DiagramMeta) => (d.mode === 'circuit' ? 'logic' : d.notation === 'chen' ? 'chen' : 'crowsfoot');
const TYPE_NAME = { logic: 'Logic circuit', chen: 'Chen / EER', crowsfoot: "Crow's Foot" } as const;
const passes = (d: DiagramMeta, f: TypeFilter) => f === 'all' || (f === 'db' ? typeOf(d) !== 'logic' : typeOf(d) === f);

/** Small line icon for a diagram type: crow's foot, Chen diamond, or a gate. */
export function TypeIcon({ type, size = 18 }: { type: 'logic' | 'chen' | 'crowsfoot'; size?: number }) {
  const st = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-label={TYPE_NAME[type]}>
      {type === 'crowsfoot' && <path d="M2 9H16M10.5 9L16 4.5M10.5 9L16 13.5M4.5 5.5V12.5" style={st} />}
      {type === 'chen' && <><path d="M9 3L16 9L9 15L2 9Z" style={st} /></>}
      {type === 'logic' && <path d="M1.5 6.5H5M1.5 11.5H5M5 4H9A5 5 0 0 1 9 14H5ZM14 9H16.5" style={st} />}
    </svg>
  );
}

function useTypeFilter(): [TypeFilter, (f: TypeFilter) => void] {
  const [f, setF] = useState<TypeFilter>(() => (localStorage.getItem('cardinal.typeFilter') as TypeFilter) || 'all');
  return [f, (v) => { setF(v); try { localStorage.setItem('cardinal.typeFilter', v); } catch {} }];
}

/** All · Database (→ All · Crow's Foot · Chen) · Logic */
function TypeFilterBar({ value, onChange, counts }: { value: TypeFilter; onChange: (f: TypeFilter) => void; counts: Record<'crowsfoot' | 'chen' | 'logic', number> }) {
  const db = value === 'db' || value === 'crowsfoot' || value === 'chen';
  return (
    <div className="type-filter">
      <div className="seg">
        <button className={value === 'all' ? 'on' : ''} onClick={() => onChange('all')}>All</button>
        <button className={db ? 'on' : ''} onClick={() => onChange('db')}><TypeIcon type="crowsfoot" size={15} /> Database diagrams <span className="n">{counts.crowsfoot + counts.chen}</span></button>
        <button className={value === 'logic' ? 'on' : ''} onClick={() => onChange('logic')}><TypeIcon type="logic" size={15} /> Logic circuits <span className="n">{counts.logic}</span></button>
      </div>
      {db && (
        <div className="seg sub">
          <button className={value === 'db' ? 'on' : ''} onClick={() => onChange('db')}>All</button>
          <button className={value === 'crowsfoot' ? 'on' : ''} onClick={() => onChange('crowsfoot')}>Crow&apos;s Foot <span className="n">{counts.crowsfoot}</span></button>
          <button className={value === 'chen' ? 'on' : ''} onClick={() => onChange('chen')}>Chen / EER <span className="n">{counts.chen}</span></button>
        </div>
      )}
    </div>
  );
}
const countTypes = (ds: DiagramMeta[]) => {
  const c = { crowsfoot: 0, chen: 0, logic: 0 };
  for (const d of ds) c[typeOf(d)]++;
  return c;
};

function Thumb({ meta }: { meta?: DiagramMeta }) {
  if (!meta?.thumb) return <Layers size={26} style={{ opacity: 0.25, width: 26, height: 26 }} />;
  return <div style={{ width: '100%', height: '100%', padding: 10 }} dangerouslySetInnerHTML={{ __html: meta.thumb }} />;
}

function Menu({ items, onClose, at }: { items: { label: string; icon: React.ReactNode; danger?: boolean; onClick: () => void }[]; onClose: () => void; at: { x: number; y: number } }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [onClose]);
  return (
    <div className="menu" style={{ left: Math.min(at.x, window.innerWidth - 200), top: at.y }} onPointerDown={(e) => e.stopPropagation()}>
      {items.map((it) => (
        <button key={it.label} className={`menu-item${it.danger ? ' danger' : ''}`} onClick={() => { onClose(); it.onClick(); }}>{it.icon}<span className="grow">{it.label}</span></button>
      ))}
    </div>
  );
}

function Prompt({ title, initial, onDone, onClose, action = 'Save' }: { title: string; initial: string; onDone: (v: string) => void; onClose: () => void; action?: string }) {
  const [v, setV] = useState(initial);
  return (
    <Modal title={title} onClose={onClose} width={420} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onDone(v); onClose(); }}>{action}</button></>}>
      <input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === 'Enter') { onDone(v); onClose(); } }} />
    </Modal>
  );
}

function Confirm({ title, text, onYes, onClose }: { title: string; text: string; onYes: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} width={420} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onYes(); onClose(); }}>Delete</button></>}>
      <p style={{ margin: 0 }}>{text}</p>
    </Modal>
  );
}

export function Home({ view, projectId }: { view: 'projects' | 'recent' | 'project'; projectId?: string }) {
  const lib = useLibrary();
  const [dialog, setDialog] = useState<React.ReactNode>(null);
  const [menu, setMenu] = useState<React.ReactNode>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useTypeFilter();
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  // keyboard: Ctrl+, preferences · / or Ctrl+K search · N new · ? shortcuts · Ctrl+S just reassures
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && e.key === ',') { e.preventDefault(); setDialog(<PreferencesDialog onClose={close} />); return; }
    if (mod && k === 's') { e.preventDefault(); toast('Everything is saved automatically'); return; }
    if (dialog || menu || typingInField()) return;
    if (e.key === '/' || (mod && k === 'k')) { e.preventDefault(); searchRef.current?.focus(); }
    else if (e.key === '?') { e.preventDefault(); setDialog(<PreferencesDialog initialTab="shortcuts" onClose={close} />); }
    else if (k === 'n' && !mod && !e.altKey) {
      e.preventDefault();
      if (project) setDialog(<NewDiagramDialog projectId={project.id} onClose={close} />);
      else newProject();
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const be = getBackend();
  const project = projectId ? lib.projects.find((p) => p.id === projectId) : undefined;
  const close = () => setDialog(null);

  const diagramsOf = (pid: string) => lib.diagrams.filter((d) => d.projectId === pid);
  const ql = q.trim().toLowerCase();
  const projectName = (pid: string) => lib.projects.find((p) => p.id === pid)?.name ?? '';
  const hitProjects = useMemo(() => (ql ? lib.projects.filter((p) => p.name.toLowerCase().includes(ql)) : []), [lib.projects, ql]);
  const hitDiagrams = useMemo(
    () => (ql ? lib.diagrams.filter((d) => d.name.toLowerCase().includes(ql) || projectName(d.projectId).toLowerCase().includes(ql) || TYPE_NAME[typeOf(d)].toLowerCase().includes(ql)) : []),
    [lib.diagrams, lib.projects, ql], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const newProject = () =>
    setDialog(<Prompt title="New project" initial="" action="Create" onClose={close} onDone={async (name) => {
      const p = await lib.createProject(name);
      navigate(`#/p/${p.id}`);
    }} />);

  const projectMenu = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu(<Menu at={{ x: e.clientX, y: e.clientY }} onClose={() => setMenu(null)} items={[
      { label: 'Open', icon: <FolderOpen size={15} />, onClick: () => navigate(`#/p/${p.id}`) },
      { label: 'Rename', icon: <Pencil size={15} />, onClick: () => setDialog(<Prompt title="Rename project" initial={p.name} onClose={close} onDone={(v) => v.trim() && lib.updateProject(p.id, { name: v.trim() })} />) },
      { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => setDialog(<Confirm title="Delete project?" text={`“${p.name}” and its ${diagramsOf(p.id).length} diagram(s) will be moved to the .trash folder.`} onClose={close} onYes={async () => { await lib.deleteProject(p.id); navigate('#/'); }} />) },
    ]} />);
  };

  const diagramMenu = (d: DiagramMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu(<Menu at={{ x: e.clientX, y: e.clientY }} onClose={() => setMenu(null)} items={[
      { label: 'Rename', icon: <Pencil size={15} />, onClick: () => setDialog(<Prompt title="Rename diagram" initial={d.name} onClose={close} onDone={(v) => v.trim() && lib.renameDiagram(d.id, v)} />) },
      { label: 'Duplicate', icon: <Copy size={15} />, onClick: () => lib.duplicateDiagram(d.id) },
      { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => setDialog(<Confirm title="Delete diagram?" text={`“${d.name}” will be moved to the .trash folder.`} onClose={close} onYes={() => lib.deleteDiagram(d.id)} />) },
    ]} />);
  };

  const importFile = async (f: File, pid: string) => {
    try {
      const data = JSON.parse(await f.text()) as DiagramFile;
      if (!data?.doc?.nodes) throw new Error();
      const m = await lib.createDiagram(pid, data.meta?.name ?? f.name.replace(/\.cardinal\.json$|\.json$/, ''), data.doc.notation ?? 'crowsfoot', data.doc);
      toast(`Imported “${m.name}”`);
    } catch {
      toast('That file is not a Cardinal diagram');
    }
  };

  const DiagramCard = ({ d, showProject }: { d: DiagramMeta; showProject?: boolean }) => (
    <div className="card" onClick={() => navigate(`#/d/${d.id}`)}>
      <div className="thumb"><Thumb meta={d} /></div>
      <div className="info">
        <span className="t">{d.name}</span>
        <span className="s">{showProject ? projectName(d.projectId) + ' · ' : ''}{TYPE_NAME[typeOf(d)]} · {ago(d.updatedAt)}</span>
        <span className="type-ico" title={TYPE_NAME[typeOf(d)]}><TypeIcon type={typeOf(d)} /></span>
      </div>
      <button className="icon-btn sm more" onClick={(e) => diagramMenu(d, e)} aria-label="More"><MoreHorizontal size={16} /></button>
    </div>
  );

  return (
    <div className="home">
      <aside className="home-side">
        <div className="brand" onClick={() => navigate('#/')}><Logo /> Cardinal</div>
        <div className="search side-search">
          <Search size={15} />
          <input ref={searchRef} className="input" placeholder="Search everything" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); searchRef.current?.blur(); } }} />
          {q ? <button className="icon-btn sm clear" onClick={() => setQ('')} aria-label="Clear search"><X size={14} /></button> : <span className="kbd hint-key">/</span>}
        </div>
        <button className={`nav-item${view === 'projects' ? ' on' : ''}`} onClick={() => navigate('#/')}><Layers size={16} /> All projects <span className="count">{lib.projects.length}</span></button>
        <button className={`nav-item${view === 'recent' ? ' on' : ''}`} onClick={() => navigate('#/recent')}><Clock size={16} /> Recent diagrams</button>
        <div className="label" style={{ padding: '16px 10px 6px' }}>Projects</div>
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {lib.projects.map((p) => (
            <button key={p.id} className={`nav-item${projectId === p.id ? ' on' : ''}`} onClick={() => navigate(`#/p/${p.id}`)}>
              <span className="pdot" style={{ background: p.color && p.color !== 'auto' ? PALETTE[p.color].light.line : 'var(--accent)' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span className="count">{diagramsOf(p.id).length}</span>
            </button>
          ))}
          <button className="nav-item" onClick={newProject}><FolderPlus size={16} /> New project</button>
        </div>
        <button className="nav-item" title="Preferences (Ctrl + ,)" onClick={() => setDialog(<PreferencesDialog onClose={close} />)}><Settings size={16} /> Preferences<span className="kbd" style={{ marginLeft: 'auto' }}>Ctrl ,</span></button>
        <div className="faint" style={{ fontSize: 11, padding: '6px 10px 0' }}>
          {be.kind === 'files' ? 'Saved in Documents › Cardinal' : 'Browser storage only'} · v{APP_VERSION}
        </div>
      </aside>

      <main className="home-main">
        {be.kind === 'browser' && (
          <div className="banner" style={{ marginTop: 20 }}>
            <AlertTriangle size={16} color="var(--accent)" />
            <span>Cardinal was opened without its helper, so projects live only in this browser. Start it from <b>build.bat</b> or <b>Start Cardinal.bat</b> to save real files.</span>
          </div>
        )}

        {ql && (() => {
          const ds = hitDiagrams.filter((d) => passes(d, filter));
          return (
            <>
              <div className="home-head"><h1>Search</h1><span className="muted">“{q.trim()}”</span></div>
              <div className="home-tools"><TypeFilterBar value={filter} onChange={setFilter} counts={countTypes(hitDiagrams)} /></div>
              {hitProjects.length > 0 && (
                <>
                  <div className="label home-label">Projects</div>
                  <div className="grid-cards">
                    {hitProjects.map((p) => (
                      <div key={p.id} className="card" onClick={() => { setQ(''); navigate(`#/p/${p.id}`); }}>
                        <div className="proj-thumb">{[0, 1, 2, 3].map((i) => <div key={i}>{diagramsOf(p.id)[i] ? <Thumb meta={diagramsOf(p.id)[i]} /> : null}</div>)}</div>
                        <div className="info"><span className="t">{p.name}</span><span className="s">{diagramsOf(p.id).length} diagrams</span></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="label home-label">Diagrams</div>
              {ds.length ? (
                <div className="grid-cards">{ds.map((d) => <DiagramCard key={d.id} d={d} showProject />)}</div>
              ) : (
                <div className="empty-state" style={{ padding: 30 }}>No diagrams match{filter !== 'all' ? ' with this filter' : ''}.</div>
              )}
            </>
          );
        })()}

        {!ql && view === 'projects' && (
          <>
            <div className="home-head">
              <h1>Projects</h1>
              <div className="spacer" />
              <button className="btn btn-primary" onClick={newProject}><Plus size={15} /> New project</button>
            </div>
            <p className="home-sub">Each project holds its diagrams, like pages in a notebook.</p>
            {lib.projects.length === 0 ? (
              <div className="empty-state">
                <Logo size={56} />
                <b style={{ fontSize: 16, color: 'var(--text)' }}>Welcome to Cardinal</b>
                <span>Create a project, then add ERD or EER diagrams to it.</span>
                <button className="btn btn-primary" onClick={newProject}><Plus size={15} /> Create your first project</button>
              </div>
            ) : (
              <div className="grid-cards">
                {lib.projects.map((p) => {
                  const ds = diagramsOf(p.id);
                  return (
                    <div key={p.id} className="card" onClick={() => navigate(`#/p/${p.id}`)}>
                      <div className="proj-thumb">
                        {[0, 1, 2, 3].map((i) => <div key={i}>{ds[i] ? <Thumb meta={ds[i]} /> : null}</div>)}
                      </div>
                      <div className="info">
                        <span className="t">{p.name}</span>
                        <span className="s">{ds.length} diagram{ds.length === 1 ? '' : 's'} · {ago(Math.max(p.updatedAt, ...ds.map((d) => d.updatedAt)))}</span>
                      </div>
                      <button className="icon-btn sm more" onClick={(e) => projectMenu(p, e)} aria-label="More"><MoreHorizontal size={16} /></button>
                    </div>
                  );
                })}
                <button className="card new" onClick={newProject}><FolderPlus size={22} /> New project</button>
              </div>
            )}
          </>
        )}

        {!ql && view === 'recent' && (
          <>
            <div className="home-head"><h1>Recent diagrams</h1></div>
            <p className="home-sub">Everything you've worked on, newest first.</p>
            <div className="home-tools"><TypeFilterBar value={filter} onChange={setFilter} counts={countTypes(lib.diagrams)} /></div>
            <div className="grid-cards">
              {lib.diagrams.filter((d) => passes(d, filter)).slice(0, 60).map((d) => <DiagramCard key={d.id} d={d} showProject />)}
            </div>
            {!lib.diagrams.length && <div className="empty-state">No diagrams yet.</div>}
          </>
        )}

        {!ql && view === 'project' && (project ? (
          <>
            <div className="home-head">
              <h1>{project.name}</h1>
              <button className="icon-btn" onClick={(e) => projectMenu(project, e)} aria-label="Project options"><MoreHorizontal size={18} /></button>
              <div className="spacer" />
              <button className="btn" onClick={() => importRef.current?.click()}><Upload size={15} /> Import</button>
              <button className="btn btn-primary" onClick={() => setDialog(<NewDiagramDialog projectId={project.id} onClose={close} />)}><Plus size={15} /> New diagram</button>
              <input ref={importRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f, project.id); }} />
            </div>
            <p className="home-sub">{diagramsOf(project.id).length} diagram{diagramsOf(project.id).length === 1 ? '' : 's'}</p>
            <div className="home-tools"><TypeFilterBar value={filter} onChange={setFilter} counts={countTypes(diagramsOf(project.id))} /></div>
            <div className="grid-cards">
              {diagramsOf(project.id).filter((d) => passes(d, filter)).map((d) => <DiagramCard key={d.id} d={d} />)}
              <button className="card new" onClick={() => setDialog(<NewDiagramDialog projectId={project.id} onClose={close} />)}><Plus size={22} /> New diagram</button>
            </div>
          </>
        ) : (
          <div className="empty-state">That project doesn't exist. <button className="btn" onClick={() => navigate('#/')}>All projects</button></div>
        ))}
      </main>
      {dialog}
      {menu}
    </div>
  );
}
