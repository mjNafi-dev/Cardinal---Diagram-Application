import { Fragment, useMemo } from 'react';
import { Copy, Maximize, Minus, Plus, RotateCcw, Wand2 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { usePrefs } from '../store/prefs';
import type { DEdge, DNode } from '../model/types';
import {
  LOGIC, GATES, MAX_TABLE_INPUTS, expressionFor, inputCount, isGate, isInputPart, isOneInput, isOutputPart, logicDef, simulate, truthTable,
  type LogicType, type Sig,
} from '../model/logic';
import { NumberField, Swatches } from '../ui/controls';
import { ShapeIcon } from '../ui/previews';
import { toast } from '../ui/toast';
import { fitView } from './Canvas';
import { tidyUp } from './PropertiesPanel';

const sigText = (v: Sig | undefined) => (v === 1 ? '1' : v === 0 ? '0' : '?');
const SigBadge = ({ v }: { v: Sig | undefined }) => <span className={`sig-badge s${sigText(v)}`}>{sigText(v)}</span>;

/** Change a part's type or input count; wires on pins that no longer exist are removed. */
function setLogic(id: string, patch: Partial<Pick<DNode, 'logic' | 'inputs' | 'on'>>) {
  useEditor.getState().commit((d) => {
    const n = d.nodes.find((q) => q.id === id);
    if (!n) return;
    Object.assign(n, patch);
    if (isOneInput(n.logic) || !isGate(n.logic)) delete n.inputs;
    else n.inputs = Math.max(2, Math.min(8, n.inputs ?? 2));
    if (!isInputPart(n.logic)) delete n.on;
    const k = inputCount(n);
    const alive = (f?: string) => {
      if (!f) return true;
      if (f === 'o') return !isOutputPart(n.logic);
      return /^i\d+$/.test(f) ? Number(f.slice(1)) < k : true;
    };
    d.edges = d.edges.filter((e) => !((e.source.node === id && !alive(e.source.field)) || (e.target.node === id && !alive(e.target.field))));
  });
}

// ───────────────────────── one part selected ─────────────────────────

export function LogicProps({ n }: { n: DNode }) {
  const st = useEditor.getState();
  const doc = useEditor((s) => s.doc);
  const prefs = usePrefs((s) => s.prefs);
  const def = logicDef(n.logic);
  const sim = useMemo(() => simulate(doc), [doc]);
  const k = inputCount(n);
  const family: LogicType[] = isGate(n.logic) ? GATES : isInputPart(n.logic) ? ['switch', 'button', 'const1', 'const0'] : ['bulb', 'probe'];
  const setStyle = (patch: NonNullable<DNode['style']>) => st.updateNode(n.id, { style: { ...n.style, ...patch } });

  return (
    <>
      <div className="section">
        <div className="section-title"><span className="label">{def.name}</span></div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>{def.hint}</p>
        <div className="prop-row">
          <span className="lbl">Label</span>
          <div className="ctl"><input className="input sm" value={n.text} placeholder={isGate(n.logic) ? 'optional' : 'e.g. A'} onChange={(e) => st.updateNode(n.id, { text: e.target.value }, 'text:' + n.id)} /></div>
        </div>
        <div className="logic-types">
          {family.map((t) => (
            <button key={t} className={`logic-type${n.logic === t ? ' on' : ''}`} onClick={() => n.logic !== t && setLogic(n.id, { logic: t })} title={logicDef(t).hint}>
              <ShapeIcon kind="logic" logic={t} />
              <span>{logicDef(t).name}</span>
            </button>
          ))}
        </div>
        {isGate(n.logic) && !isOneInput(n.logic) && (
          <div className="prop-row" style={{ marginTop: 10 }}>
            <span className="lbl">Inputs</span>
            <div className="ctl" style={{ gap: 6 }}>
              <button className="icon-btn sm" disabled={k <= 2} onClick={() => setLogic(n.id, { inputs: k - 1 })} title="One input fewer"><Minus size={14} /></button>
              <b style={{ minWidth: 18, textAlign: 'center' }}>{k}</b>
              <button className="icon-btn sm" disabled={k >= 8} onClick={() => setLogic(n.id, { inputs: k + 1 })} title="One more input"><Plus size={14} /></button>
            </div>
          </div>
        )}
        {n.logic === 'switch' && (
          <div className="prop-row" style={{ marginTop: 10 }}>
            <span className="lbl">State</span>
            <div className="ctl">
              <div className="seg">
                <button className={!n.on ? 'on' : ''} onClick={() => st.setSwitch(n.id, false)}>0 · off</button>
                <button className={n.on ? 'on' : ''} onClick={() => st.setSwitch(n.id, true)}>1 · on</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title"><span className="label">Live values</span></div>
        <div className="pin-values">
          {Array.from({ length: k }, (_, i) => (
            <Fragment key={i}><span className="muted">{k === 1 ? 'Input' : `Input ${i + 1}`}</span><SigBadge v={sim.pins.get(n.id + ':i' + i)} /></Fragment>
          ))}
          {!isOutputPart(n.logic) && <><span className="muted">Output</span><SigBadge v={sim.pins.get(n.id + ':o')} /></>}
        </div>
        {isGate(n.logic) && <p className="faint" style={{ margin: '8px 0 0', fontSize: 12 }}>A <b>?</b> means an input has no wire yet.</p>}
      </div>

      <div className="section">
        <div className="section-title"><span className="label">Style</span></div>
        {n.logic === 'bulb' ? (
          <div className="prop-row"><span className="lbl">Light color</span><div className="ctl"><Swatches value={n.style?.fill} onChange={(c) => setStyle({ fill: c })} kind="line" /></div></div>
        ) : (
          <div className="prop-row"><span className="lbl">Fill</span><div className="ctl"><Swatches value={n.style?.fill} onChange={(c) => setStyle({ fill: c })} /></div></div>
        )}
        <div className="prop-row"><span className="lbl">Outline</span><div className="ctl"><Swatches value={n.style?.stroke} onChange={(c) => setStyle({ stroke: c })} kind="line" /></div></div>
        <div className="prop-row">
          <span className="lbl">Outline width</span>
          <div className="ctl"><NumberField value={n.style?.strokeWidth ?? prefs.shape.strokeWidth} min={0.5} max={5} step={0.5} slider onChange={(v) => setStyle({ strokeWidth: v })} /></div>
        </div>
        {n.style && Object.keys(n.style).length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => st.updateNode(n.id, { style: undefined })}>Reset style</button>}
      </div>
    </>
  );
}

// ───────────────────────── wires ─────────────────────────

export function WireProps({ edges }: { edges: DEdge[] }) {
  const st = useEditor.getState();
  const doc = useEditor((s) => s.doc);
  const prefs = usePrefs((s) => s.prefs);
  const sim = useMemo(() => simulate(doc), [doc]);
  const ids = edges.map((e) => e.id);
  const width = edges[0].style?.strokeWidth ?? prefs.line.width;
  return (
    <div className="section">
      <div className="section-title"><span className="label">{edges.length > 1 ? `${edges.length} wires` : 'Wire'}</span></div>
      {edges.length === 1 && (
        <div className="pin-values" style={{ marginBottom: 10 }}><span className="muted">Carries</span><SigBadge v={sim.wires.get(edges[0].id)} /></div>
      )}
      <div className="prop-row">
        <span className="lbl">Width</span>
        <div className="ctl"><NumberField value={width} min={1} max={6} step={0.5} slider onChange={(v) => st.commit((d) => { for (const x of d.edges) if (ids.includes(x.id)) x.style = { ...x.style, strokeWidth: v }; })} /></div>
      </div>
      <p className="faint" style={{ margin: '6px 0 0', fontSize: 12 }}>Green = 1, dark = 0, light grey = not driven. Drag a wire's end to another pin to move it.</p>
    </div>
  );
}

// ───────────────────────── nothing selected ─────────────────────────

export function CircuitDiagramProps() {
  const doc = useEditor((s) => s.doc);
  const st = useEditor.getState();
  const parts = doc.nodes.filter((n) => n.kind === 'logic');
  const gates = parts.filter((n) => isGate(n.logic)).length;
  const switches = parts.filter((n) => n.logic === 'switch' && n.on);
  return (
    <>
      <div className="section">
        <div className="section-title"><span className="label">Circuit</span></div>
        <p className="muted" style={{ margin: '0 0 10px' }}>{gates} gate{gates === 1 ? '' : 's'} · {parts.length - gates} input/output part{parts.length - gates === 1 ? '' : 's'} · {doc.edges.length} wire{doc.edges.length === 1 ? '' : 's'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => tidyUp()} disabled={!doc.nodes.length}><Wand2 size={14} /> Tidy up layout</button>
          <button className="btn btn-sm" onClick={() => fitView()}><Maximize size={14} /> Fit circuit to screen</button>
          <button className="btn btn-sm" disabled={!switches.length} onClick={() => switches.forEach((n) => st.setSwitch(n.id, false))}><RotateCcw size={14} /> Turn every switch off</button>
        </div>
      </div>
      <div className="section">
        <div className="section-title"><span className="label">How it works</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', fontSize: 12 }} className="muted">
          {[
            ['Click', 'flip a switch'],
            ['Hold', 'press a push button'],
            ['Drag a pin', 'draw a wire'],
            ['Drop on empty', 'add a connected part'],
            ['Drag', 'move (no flip)'],
            ['Delete', 'remove selection'],
            ['Ctrl D', 'duplicate'],
            ['Ctrl Z / Y', 'undo / redo'],
          ].map(([k, v]) => <Fragment key={k}><span className="kbd" style={{ justifySelf: 'start' }}>{k}</span><span>{v}</span></Fragment>)}
        </div>
      </div>
      <div className="section">
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>The <b>Truth table</b> tab lists every combination of your switches and the Boolean expression of each output.</p>
      </div>
    </>
  );
}

// ───────────────────────── truth table tab ─────────────────────────

export function TruthTablePanel() {
  const doc = useEditor((s) => s.doc);
  const st = useEditor.getState();
  const table = useMemo(() => truthTable(doc), [doc]);
  const sim = useMemo(() => simulate(doc), [doc]);
  const { inputs, outputs, rows } = table;
  const nameOf = (n: DNode, i: number, pre: string) => n.text.trim() || `${pre}${i + 1}`;
  const current = inputs.map((n) => (n.on ? 1 : 0));
  const isCurrent = (ins: (0 | 1)[]) => ins.every((v, i) => v === current[i]);

  if (!inputs.length || !outputs.length) {
    return (
      <div className="side-scroll"><div className="section">
        <div className="section-title"><span className="label">Truth table</span></div>
        <p className="muted" style={{ margin: 0 }}>
          Add at least one <b>switch</b> (or push button) and one <b>light bulb</b> (or digit display), and wire them through your gates.
          The table fills in by itself.
        </p>
        <div className="tt-legend">
          {LOGIC.filter((l) => l.id === 'switch' || l.id === 'bulb').map((l) => (
            <span key={l.id}><ShapeIcon kind="logic" logic={l.id} /> {l.name}</span>
          ))}
        </div>
      </div></div>
    );
  }

  const copy = () => {
    const head = [...inputs.map((n, i) => nameOf(n, i, 'In')), ...outputs.map((n, i) => nameOf(n, i, 'Out'))].join('\t');
    const body = rows.map((r) => [...r.ins, ...r.outs.map(sigText)].join('\t')).join('\n');
    navigator.clipboard.writeText(head + '\n' + body).then(() => toast('Truth table copied — paste it into Sheets, Excel or Word'), () => toast('Could not copy'));
  };
  const apply = (ins: (0 | 1)[]) => inputs.forEach((n, i) => st.setSwitch(n.id, ins[i] === 1));

  return (
    <div className="side-scroll">
      <div className="section">
        <div className="section-title"><span className="label">Expressions</span></div>
        <div className="tt-exprs">
          {outputs.map((o, i) => (
            <div key={o.id}><b>{nameOf(o, i, 'Out')}</b> = <span className="mono">{expressionFor(doc, o.id)}</span></div>
          ))}
        </div>
        <p className="faint" style={{ margin: '8px 0 0', fontSize: 11.5 }}>· = AND, + = OR, ⊕ = XOR, ¬ = NOT</p>
        {(outputs.some((o) => expressionFor(doc, o.id).includes('?')) || rows.some((r) => r.outs.some((v) => sigText(v) === '?'))) && (
          <p className="faint" style={{ margin: '4px 0 0', fontSize: 11.5 }}><b>?</b> means a gate input isn't connected to anything yet, so its value is unknown. Wire it up to fill it in.</p>
        )}
        {sim.unstable && <p className="tt-warn">This circuit has a feedback loop that never settles, so some values keep flipping.</p>}
      </div>
      <div className="section">
        <div className="section-title">
          <span className="label">Truth table</span>
          {rows.length > 0 && <button className="btn btn-sm btn-ghost" onClick={copy}><Copy size={13} /> Copy</button>}
        </div>
        {inputs.length > MAX_TABLE_INPUTS ? (
          <p className="muted" style={{ margin: 0 }}>That's {inputs.length} inputs — {2 ** inputs.length} rows. Tables are shown for up to {MAX_TABLE_INPUTS} inputs.</p>
        ) : (
          <>
            <div className="tt-wrap">
              <table className="tt">
                <thead>
                  <tr>
                    {inputs.map((n, i) => <th key={n.id}>{nameOf(n, i, 'In')}</th>)}
                    {outputs.map((n, i) => <th key={n.id} className={i === 0 ? 'out first' : 'out'}>{nameOf(n, i, 'Out')}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri} className={isCurrent(r.ins) ? 'now' : undefined} onClick={() => apply(r.ins)} title="Set the switches to this row">
                      {r.ins.map((v, i) => <td key={i}>{v}</td>)}
                      {r.outs.map((v, i) => <td key={'o' + i} className={`${i === 0 ? 'out first' : 'out'} s${sigText(v)}`}>{sigText(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="faint" style={{ margin: '8px 0 0', fontSize: 11.5 }}>The highlighted row is what the switches show right now. Click a row to set the switches to it.</p>
          </>
        )}
      </div>
    </div>
  );
}
