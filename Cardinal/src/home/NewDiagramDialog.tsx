import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useLibrary } from '../store/library';
import { usePrefs } from '../store/prefs';
import { sampleChen, sampleCircuit, sampleCrowsFoot } from '../model/samples';
import { emptyDoc, type DiagramMode, type Notation } from '../model/types';
import { navigate } from '../App';
import { ShapeIcon } from '../ui/previews';

export function NewDiagramDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const prefs = usePrefs((s) => s.prefs);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<DiagramMode>(() => (localStorage.getItem('cardinal.newMode') === 'circuit' ? 'circuit' : 'er'));
  const [notation, setNotation] = useState<Notation>(prefs.defaultNotation);
  const [sample, setSample] = useState(false);
  const create = async () => {
    try { localStorage.setItem('cardinal.newMode', mode); } catch {}
    const doc = mode === 'circuit'
      ? (sample ? sampleCircuit() : emptyDoc(notation, 'circuit'))
      : sample ? (notation === 'chen' ? sampleChen() : sampleCrowsFoot()) : undefined;
    const fallback = sample ? (mode === 'circuit' ? 'Half adder' : 'Example') : mode === 'circuit' ? 'Untitled circuit' : 'Untitled diagram';
    const m = await useLibrary.getState().createDiagram(projectId, name || fallback, notation, doc);
    onClose();
    navigate(`#/d/${m.id}`);
  };
  return (
    <Modal title="New diagram" onClose={onClose} width={520}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={create}>Create</button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input className="input" autoFocus placeholder={mode === 'circuit' ? 'Circuit name' : 'Diagram name'} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
        <div className="notation-pick">
          <button className={`notation-card${mode === 'er' ? ' on' : ''}`} onClick={() => setMode('er')}>
            <div className="pic"><ShapeIcon kind="table" /><svg width="34" height="30"><line x1="2" x2="32" y1="15" y2="15" stroke="currentColor" strokeWidth="1.4" /><path d="M20 15 L32 9 M20 15 L32 21" stroke="currentColor" strokeWidth="1.4" /></svg><ShapeIcon kind="table" /></div>
            <b>Database diagram</b>
            <span className="faint" style={{ fontSize: 12 }}>ER diagrams: tables, entities, relationships, SQL.</span>
          </button>
          <button className={`notation-card${mode === 'circuit' ? ' on' : ''}`} onClick={() => setMode('circuit')}>
            <div className="pic"><ShapeIcon kind="logic" logic="switch" /><ShapeIcon kind="logic" logic="and" /><ShapeIcon kind="logic" logic="bulb" /></div>
            <b>Logic circuit</b>
            <span className="faint" style={{ fontSize: 12 }}>Gates, switches and bulbs. Live simulation and truth tables.</span>
          </button>
        </div>
        {mode === 'er' && (
          <div className="sub-pick">
            <span className="faint" style={{ fontSize: 12 }}>Start with</span>
            <div className="seg">
              <button className={notation === 'crowsfoot' ? 'on' : ''} title="Tables with columns and crow's-foot line ends. Can export SQL." onClick={() => setNotation('crowsfoot')}>Crow&apos;s Foot</button>
              <button className={notation === 'chen' ? 'on' : ''} title="Entities (rectangles), relationships (diamonds) and attributes (ovals), the lecture-style notation." onClick={() => setNotation('chen')}>Chen / EER</button>
            </div>
            <span className="faint" style={{ fontSize: 11.5 }}>
              {notation === 'chen' ? 'Rectangles, diamonds and ovals, like lecture slides.' : 'Tables with columns. Turns into SQL.'} You can switch any time.
            </span>
          </div>
        )}
        <label className="check"><input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} /> Start from an example{mode === 'circuit' ? ' (half adder)' : ''}</label>
      </div>
    </Modal>
  );
}
