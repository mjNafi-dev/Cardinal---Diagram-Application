import { useEffect, useState } from 'react';
import { FolderOpen, Download, Upload, RotateCcw } from 'lucide-react';
import { Modal } from './Modal';
import { usePrefs } from '../store/prefs';
import { FONT_STACKS, type FontChoice } from '../model/prefs';
import { NumberField, Swatches } from './controls';
import { getBackend, isDesktop } from '../store/backend';
import { Logo } from './Logo';
import { askConfirm } from './confirm';
import { SHORTCUTS, formatBytes } from './shortcuts';
import { useLibrary } from '../store/library';
import { download } from '../export/export';
import { toast } from './toast';
import { APP_VERSION } from '../version';
import type { Routing } from '../model/types';

export type PrefsTab = 'appearance' | 'text' | 'lines' | 'shapes' | 'behavior' | 'storage' | 'shortcuts' | 'about';
type Tab = PrefsTab;
const TABS: { id: Tab; name: string }[] = [
  { id: 'appearance', name: 'Appearance' },
  { id: 'text', name: 'Text' },
  { id: 'lines', name: 'Lines' },
  { id: 'shapes', name: 'Shapes' },
  { id: 'behavior', name: 'Behavior' },
  { id: 'storage', name: 'Storage' },
  { id: 'shortcuts', name: 'Shortcuts' },
  { id: 'about', name: 'About' },
];

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="form-row">
      <label>{label}{hint && <div className="faint" style={{ fontSize: 11.5 }}>{hint}</div>}</label>
      <div className="ctl">{children}</div>
    </div>
  );
}

export function PreferencesDialog({ onClose, initialTab = 'appearance' }: { onClose: () => void; initialTab?: PrefsTab }) {
  const prefs = usePrefs((s) => s.prefs);
  const set = usePrefs((s) => s.set);
  const [tab, setTab] = useState<Tab>(initialTab);
  const be = getBackend();

  return (
    <Modal title="Preferences" onClose={onClose} width={680}
      footer={<>
        <button className="btn btn-ghost" onClick={async () => { if (await askConfirm('Reset preferences?', 'Every preference goes back to its default. Your diagrams are not touched.', 'Reset all')) usePrefs.getState().reset(); }}><RotateCcw size={14} /> Reset all</button>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </>}>
      <div style={{ display: 'flex', gap: 18, minHeight: 380 }}>
        <div style={{ width: 140, flex: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TABS.map((t) => <button key={t.id} className={`nav-item${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.name}</button>)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {tab === 'appearance' && (
            <div className="form-group">
              <Row label="Theme">
                <div className="seg" style={{ flex: 1 }}>
                  {(['system', 'light', 'dark'] as const).map((t) => <button key={t} className={prefs.theme === t ? 'on' : ''} onClick={() => set((p) => { p.theme = t; })}>{t[0].toUpperCase() + t.slice(1)}</button>)}
                </div>
              </Row>
              <Row label="Hover focus" hint="Dim shapes that aren't connected to the one under your mouse">
                <label className="check"><input type="checkbox" checked={prefs.focus.enabled} onChange={(e) => set((p) => { p.focus.enabled = e.target.checked; })} /> On</label>
              </Row>
              <Row label="2 steps away" hint="Opacity of shapes connected through one other shape">
                <NumberField value={Math.round(prefs.focus.near * 100)} min={10} max={100} step={5} slider onChange={(v) => set((p) => { p.focus.near = v / 100; })} />
              </Row>
              <Row label="Unconnected" hint="Opacity of everything else">
                <NumberField value={Math.round(prefs.focus.far * 100)} min={5} max={100} step={5} slider onChange={(v) => set((p) => { p.focus.far = v / 100; })} />
              </Row>
              <Row label="Grid">
                <label className="check"><input type="checkbox" checked={prefs.canvas.grid} onChange={(e) => set((p) => { p.canvas.grid = e.target.checked; })} /> Show dots</label>
              </Row>
            </div>
          )}
          {tab === 'text' && (
            <div className="form-group">
              <Row label="Diagram font">
                <select className="select" value={prefs.text.font} onChange={(e) => set((p) => { p.text.font = e.target.value as FontChoice; })}>
                  {(Object.keys(FONT_STACKS) as FontChoice[]).map((f) => <option key={f} value={f}>{FONT_STACKS[f].label}</option>)}
                </select>
              </Row>
              <Row label="Entity / table title" hint="Size in px">
                <NumberField value={prefs.text.titleSize} min={9} max={28} slider onChange={(v) => set((p) => { p.text.titleSize = v; })} />
              </Row>
              <Row label="Title weight">
                <div className="seg" style={{ flex: 1 }}>
                  {[[500, 'Medium'], [600, 'Semibold'], [650, 'Bold'], [750, 'Heavy']].map(([w, l]) => (
                    <button key={w} className={prefs.text.titleWeight === w ? 'on' : ''} onClick={() => set((p) => { p.text.titleWeight = w as number; })}>{l}</button>
                  ))}
                </div>
              </Row>
              <Row label="Columns & attributes">
                <NumberField value={prefs.text.bodySize} min={8} max={24} slider onChange={(v) => set((p) => { p.text.bodySize = v; })} />
              </Row>
              <Row label="Line labels">
                <NumberField value={prefs.text.labelSize} min={8} max={24} slider onChange={(v) => set((p) => { p.text.labelSize = v; })} />
              </Row>
              <Row label="Data types">
                <label className="check"><input type="checkbox" checked={prefs.text.typeColumn} onChange={(e) => set((p) => { p.text.typeColumn = e.target.checked; })} /> Show column types in tables</label>
              </Row>
            </div>
          )}
          {tab === 'lines' && (
            <div className="form-group">
              <Row label="Default line width" hint="Every line without its own width uses this">
                <NumberField value={prefs.line.width} min={0.5} max={8} step={0.5} slider onChange={(v) => set((p) => { p.line.width = v; })} />
              </Row>
              <Row label="Default line color">
                <Swatches value={prefs.line.color} kind="line" onChange={(k) => set((p) => { p.line.color = k; })} />
              </Row>
              <Row label="Crow's Foot routing">
                <RoutingSelect value={prefs.line.routingCrowsFoot} onChange={(r) => set((p) => { p.line.routingCrowsFoot = r; })} />
              </Row>
              <Row label="Chen routing">
                <RoutingSelect value={prefs.line.routingChen} onChange={(r) => set((p) => { p.line.routingChen = r; })} />
              </Row>
              <Row label="Corner rounding">
                <NumberField value={prefs.line.cornerRadius} min={0} max={20} slider onChange={(v) => set((p) => { p.line.cornerRadius = v; })} />
              </Row>
              <Row label="Line hops" hint="Little bridges where lines must cross">
                <label className="check"><input type="checkbox" checked={prefs.line.hops} onChange={(e) => set((p) => { p.line.hops = e.target.checked; })} /> On</label>
              </Row>
            </div>
          )}
          {tab === 'shapes' && (
            <div className="form-group">
              <Row label="Border width">
                <NumberField value={prefs.shape.strokeWidth} min={0.5} max={6} step={0.5} slider onChange={(v) => set((p) => { p.shape.strokeWidth = v; })} />
              </Row>
              <Row label="Border color">
                <Swatches value={prefs.shape.stroke} kind="line" onChange={(k) => set((p) => { p.shape.stroke = k; })} />
              </Row>
              <Row label="Fill (Chen shapes)">
                <Swatches value={prefs.shape.fill} onChange={(k) => set((p) => { p.shape.fill = k; })} />
              </Row>
              <Row label="Table header">
                <Swatches value={prefs.shape.headerFill} onChange={(k) => set((p) => { p.shape.headerFill = k; })} />
              </Row>
              <Row label="Corner radius" hint="Tables and boxes">
                <NumberField value={prefs.shape.radius} min={0} max={14} slider onChange={(v) => set((p) => { p.shape.radius = v; })} />
              </Row>
            </div>
          )}
          {tab === 'behavior' && (
            <div className="form-group">
              <Row label="Remember last style" hint="New lines/shapes copy the width & color you last set">
                <label className="check"><input type="checkbox" checked={prefs.rememberLast} onChange={(e) => set((p) => { p.rememberLast = e.target.checked; })} /> On</label>
              </Row>
              {(Object.keys(prefs.last.edge).length > 0 || Object.keys(prefs.last.node).length > 0) && (
                <Row label="Remembered">
                  <span className="muted" style={{ fontSize: 12 }}>
                    {prefs.last.edge.strokeWidth !== undefined && `line ${prefs.last.edge.strokeWidth}px `}
                    {prefs.last.edge.stroke && `· line ${prefs.last.edge.stroke} `}
                    {prefs.last.node.strokeWidth !== undefined && `· border ${prefs.last.node.strokeWidth}px `}
                    {prefs.last.node.fill && `· fill ${prefs.last.node.fill}`}
                  </span>
                  <button className="btn btn-sm btn-ghost" onClick={() => set((p) => { p.last = { edge: {}, node: {} }; })}>Forget</button>
                </Row>
              )}
              <Row label="Snap to grid">
                <label className="check"><input type="checkbox" checked={prefs.canvas.snap} onChange={(e) => set((p) => { p.canvas.snap = e.target.checked; })} /> On <span className="faint">(hold Alt to move freely)</span></label>
              </Row>
              <Row label="Grid size">
                <NumberField value={prefs.canvas.gridSize} min={4} max={40} slider onChange={(v) => set((p) => { p.canvas.gridSize = v; })} />
              </Row>
              <Row label="New diagrams use">
                <div className="seg" style={{ flex: 1 }}>
                  <button className={prefs.defaultNotation === 'crowsfoot' ? 'on' : ''} onClick={() => set((p) => { p.defaultNotation = 'crowsfoot'; })}>Crow's Foot</button>
                  <button className={prefs.defaultNotation === 'chen' ? 'on' : ''} onClick={() => set((p) => { p.defaultNotation = 'chen'; })}>Chen / EER</button>
                </div>
              </Row>
            </div>
          )}
          {tab === 'storage' && <StorageTab kind={be.kind} dataDir={be.dataDir} />}
          {tab === 'shortcuts' && (
            <div className="shortcut-list">
              {SHORTCUTS.map((g) => (
                <div key={g.group}>
                  <div className="label" style={{ margin: '0 0 6px' }}>{g.group}</div>
                  {g.keys.map(([k, v]) => <div key={k + v} className="shortcut-row"><span className="kbd">{k}</span><span>{v}</span></div>)}
                </div>
              ))}
            </div>
          )}
          {tab === 'about' && (
            <div className="about">
              <Logo size={64} />
              <b style={{ fontSize: 18 }}>Cardinal</b>
              <span className="muted">Version {APP_VERSION}{isDesktop() ? ' · desktop app' : ' · browser'}</span>
              <p className="muted" style={{ maxWidth: 380, margin: '6px 0 0' }}>
                ER diagrams, SQL and logic circuits that work offline. Your projects never leave this computer: no account, no cloud, no tracking.
              </p>
              <p className="faint" style={{ fontSize: 12, margin: '6px 0 0' }}>Made with React, Vite, CodeMirror and Tauri.</p>
            </div>
          )}
        </div>
      </div>
      <p className="faint" style={{ margin: '14px 0 0', fontSize: 11.5, textAlign: 'right' }}>Cardinal v{APP_VERSION}</p>
    </Modal>
  );
}

function RoutingSelect({ value, onChange }: { value: Routing; onChange: (r: Routing) => void }) {
  return (
    <div className="seg" style={{ flex: 1 }}>
      {([['orthogonal', 'Right angles'], ['straight', 'Straight'], ['curved', 'Curved']] as const).map(([v, l]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function StorageTab({ kind, dataDir }: { kind: 'files' | 'browser'; dataDir?: string }) {
  const [counts, setCounts] = useState<{ p: number; d: number } | null>(null);
  const [usage, setUsage] = useState<{ bytes: number; trashBytes?: number } | null>(null);
  useEffect(() => { getBackend().usage().then(setUsage, () => setUsage(null)); }, []);
  const lib = useLibrary();
  useEffect(() => { setCounts({ p: lib.projects.length, d: lib.diagrams.length }); }, [lib.projects.length, lib.diagrams.length]);

  const backup = async () => {
    const be = getBackend();
    const projects = await be.list('projects');
    const diagrams = await Promise.all((await be.list('diagrams')).map((d) => be.get('diagrams', d.id)));
    const blob = new Blob([JSON.stringify({ app: 'cardinal', version: 1, exportedAt: new Date().toISOString(), projects: projects.map((p) => p.meta), diagrams }, null, 1)], { type: 'application/json' });
    const day = new Date().toISOString().slice(0, 10);
    download(blob, `cardinal-backup-${day}.json`);
  };
  const restore = async (file: File) => {
    const data = JSON.parse(await file.text());
    if (data?.app !== 'cardinal') return toast('That is not a Cardinal backup file');
    const be = getBackend();
    for (const p of data.projects ?? []) await be.put('projects', p.id, p);
    for (const d of data.diagrams ?? []) if (d?.meta?.id) await be.put('diagrams', d.meta.id, d);
    await useLibrary.getState().refresh();
    toast(`Restored ${data.projects?.length ?? 0} projects, ${data.diagrams?.length ?? 0} diagrams`);
  };

  return (
    <div className="form-group">
      {kind === 'files' ? (
        <>
          <p style={{ marginTop: 0 }}>Your projects are saved as files on this computer{isDesktop() ? '' : '. Clearing browser data never touches them'}.</p>
          <div className="input mono" style={{ display: 'flex', alignItems: 'center', height: 'auto', padding: '8px 10px', fontSize: 12, wordBreak: 'break-all' }}>{dataDir}</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
            <button className="btn" onClick={() => getBackend().openFolder?.()}><FolderOpen size={15} /> Open folder</button>
            {usage && (
              <span className="muted" title="Disk space this folder takes right now">
                Using <b>{formatBytes(usage.bytes)}</b>{usage.trashBytes ? ` (${formatBytes(usage.trashBytes)} of it in .trash)` : ''}
              </span>
            )}
          </div>
          <p className="faint" style={{ fontSize: 12 }}>To back up, copy that folder somewhere safe, or keep it inside OneDrive/Google Drive. Deleted items go to its <span className="mono">.trash</span> subfolder.</p>
        </>
      ) : (
        <>
        {usage && <p className="muted" style={{ marginTop: 0 }}>This browser is using <b>{formatBytes(usage.bytes)}</b> for Cardinal.</p>}
        <p style={{ marginTop: 0, color: 'var(--danger)' }}>
          Cardinal was opened without its desktop app or helper, so projects are only stored in this browser. Open the Cardinal app (or start it with the launcher) so they're saved as real files.
        </p>
        </>
      )}
      {counts && <p className="muted">{counts.p} project{counts.p === 1 ? '' : 's'} · {counts.d} diagram{counts.d === 1 ? '' : 's'}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={backup}><Download size={15} /> Back up everything to one file</button>
        <label className="btn" style={{ cursor: 'pointer' }}>
          <Upload size={15} /> Restore from backup
          <input type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restore(f); }} />
        </label>
      </div>
    </div>
  );
}
