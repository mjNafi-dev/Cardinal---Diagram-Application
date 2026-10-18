import { useState } from 'react';
import { Database, FileCode2, FileImage, FileJson, FileText } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useEditor } from '../store/editor';
import { usePrefs } from '../store/prefs';
import { runExport, type ExportFormat } from '../export/export';
import { DIALECTS, type Dialect } from '../sql/sql';
import { toast } from '../ui/toast';
import { isDesktop } from '../store/backend';

const FORMATS: { id: ExportFormat; name: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'png', name: 'PNG image', desc: 'For reports and slides', icon: <FileImage size={18} /> },
  { id: 'svg', name: 'SVG vector', desc: 'Sharp at any size', icon: <FileCode2 size={18} /> },
  { id: 'pdf', name: 'PDF', desc: 'Single page, fits the diagram', icon: <FileText size={18} /> },
  { id: 'sql', name: 'SQL code', desc: 'CREATE TABLE statements', icon: <Database size={18} /> },
  { id: 'json', name: 'Cardinal file', desc: 'Backup / share (.cardinal.json)', icon: <FileJson size={18} /> },
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const prefs = usePrefs((s) => s.prefs);
  const selection = useEditor((s) => s.selection);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [bg, setBg] = useState(prefs.exportBg);
  const [scale, setScale] = useState(prefs.exportScale);
  const [selOnly, setSelOnly] = useState(false);
  const [dialect, setDialect] = useState<Dialect>(() => (localStorage.getItem('cardinal.sqlDialect') as Dialect) || 'mysql');
  const [busy, setBusy] = useState(false);
  const image = format === 'png' || format === 'svg' || format === 'pdf';

  const go = async () => {
    const st = useEditor.getState();
    if (!st.meta) return;
    setBusy(true);
    try {
      usePrefs.getState().set((p) => { p.exportBg = bg; p.exportScale = scale; });
      if (!(await runExport({ meta: st.meta, doc: st.doc }, prefs, { format, background: bg, scale, selectionOnly: selOnly, dialect }, selection))) return; // Save as cancelled
      if (!isDesktop()) toast('Exported'); // the desktop app already said where it saved
      onClose();
    } catch (e: any) {
      toast(e?.message ?? 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export" onClose={onClose} width={560}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={go} disabled={busy}>{busy ? 'Exporting…' : 'Export'}</button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {FORMATS.map((f) => (
          <button key={f.id} className={`notation-card${format === f.id ? ' on' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} onClick={() => setFormat(f.id)}>
            <span style={{ color: format === f.id ? 'var(--accent)' : 'var(--text-2)' }}>{f.icon}</span>
            <span style={{ display: 'flex', flexDirection: 'column' }}><b style={{ fontWeight: 650 }}>{f.name}</b><span className="faint" style={{ fontSize: 12 }}>{f.desc}</span></span>
          </button>
        ))}
      </div>
      {image && (
        <>
          <div className="form-row">
            <label>Background</label>
            <div className="ctl">
              <div className="seg" style={{ flex: 1 }}>
                {(['light', 'dark', 'transparent'] as const).map((b) => <button key={b} className={bg === b ? 'on' : ''} onClick={() => setBg(b)}>{b[0].toUpperCase() + b.slice(1)}</button>)}
              </div>
            </div>
          </div>
          {format !== 'svg' && (
            <div className="form-row">
              <label>Resolution</label>
              <div className="ctl">
                <div className="seg" style={{ flex: 1 }}>
                  {[1, 2, 3, 4].map((s) => <button key={s} className={scale === s ? 'on' : ''} onClick={() => setScale(s)}>{s}×</button>)}
                </div>
              </div>
            </div>
          )}
          <div className="form-row">
            <label>Content</label>
            <div className="ctl">
              <label className="check"><input type="checkbox" checked={selOnly} disabled={!selection.length} onChange={(e) => setSelOnly(e.target.checked)} /> Only the selected shapes</label>
            </div>
          </div>
        </>
      )}
      {format === 'sql' && (
        <div className="form-row">
          <label>Dialect</label>
          <div className="ctl">
            <select className="select" value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
              {DIALECTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
      )}
    </Modal>
  );
}
