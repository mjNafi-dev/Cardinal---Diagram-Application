import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Frame, Image as ImageIcon, MessageSquare, MousePointer2, PanelLeftClose, PanelLeftOpen, PenLine, Search, Shapes, StickyNote, Type } from 'lucide-react';
import { useEditor, type Tool } from '../store/editor';
import { PALETTE, PALETTE_KEYS } from '../model/palette';
import { SHAPES } from '../model/catalog';
import { ShapeIcon } from '../ui/previews';
import { viewCenter } from './Canvas';
import { uid, type ColorKey } from '../model/types';
import { toast } from '../ui/toast';

const FRAME_ITEMS = ['shape-frame', 'shape-container', 'shape-swimlane', 'shape-pool', 'cf-table', 'cf-junction', 'chen-aggregation'];
const PEN_WIDTHS = [1.5, 3, 5, 8, 12];

/** Read an image file, shrink it if huge, and drop it on the canvas. */
export async function insertImage(file: File, at = viewCenter()) {
  if (!file.type.startsWith('image/')) return toast('That file is not an image');
  const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const img = new Image();
  img.src = url;
  await img.decode();
  let src = url, w = img.naturalWidth, h = img.naturalHeight;
  const MAX = 1600;
  if ((w > MAX || h > MAX || url.length > 1_500_000) && !file.type.includes('svg')) {
    const k = Math.min(1, MAX / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    src = c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
    w = c.width; h = c.height;
  }
  const dw = Math.min(360, w), dh = Math.round((h * dw) / w);
  useEditor.getState().addRaw({ id: uid('n'), kind: 'image', text: '', src, x: Math.round(at.x - dw / 2), y: Math.round(at.y - dh / 2), w: dw, h: dh, nw: w, nh: h });
}

function Swatch({ k, on, onClick, size = 24 }: { k: ColorKey; on: boolean; onClick: () => void; size?: number }) {
  const bg = k === 'auto' ? 'var(--ink)' : `var(--pal-${k}-line)`;
  return <button className={`swatch${on ? ' on' : ''}`} style={{ width: size, height: size, background: bg, borderRadius: 7 }} title={k === 'auto' ? 'Ink' : PALETTE[k as Exclude<ColorKey, 'auto'>].name} onClick={onClick} />;
}

export function ToolRail({ libOpen, onToggleLib, onSearch }: { libOpen: boolean; onToggleLib: () => void; onSearch: () => void }) {
  const tool = useEditor((s) => s.tool);
  const opts = useEditor((s) => s.toolOpts);
  const [pop, setPop] = useState<null | 'note' | 'pen' | 'line' | 'frame'>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const st = useEditor.getState();

  useEffect(() => {
    if (!pop) return;
    const close = (e: PointerEvent) => { if (!railRef.current?.contains(e.target as Node)) setPop(null); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [pop]);
  useEffect(() => { if (tool === 'select') setPop(null); }, [tool]);

  const pick = (t: Tool, popover?: typeof pop) => {
    st.setTool(t);
    setPop(popover && pop !== popover ? popover : null);
  };
  const btn = (label: string, key: string, icon: React.ReactNode, active: boolean, onClick: () => void) => (
    <button className={`rail-btn${active ? ' on' : ''}`} title={key ? `${label} (${key})` : label} aria-label={label} onClick={onClick}>{icon}</button>
  );

  return (
    <div className="rail" ref={railRef}>
      {btn('Search shapes', '/', <Search size={18} />, false, onSearch)}
      <div className="rail-sep" />
      {btn('Select', 'V', <MousePointer2 size={18} />, tool === 'select', () => pick('select'))}
      {btn('Sticky note', 'N', <StickyNote size={18} />, tool === 'note', () => pick('note', 'note'))}
      {btn(libOpen ? 'Hide shape library' : 'Show shape library', '', <Shapes size={18} />, libOpen, onToggleLib)}
      {btn('Text', 'T', <Type size={18} />, tool === 'text', () => pick('text'))}
      {btn('Line', 'L', <ArrowUpRight size={18} />, tool === 'line', () => pick('line', 'line'))}
      {btn('Frames & containers', '', <Frame size={18} />, pop === 'frame', () => setPop(pop === 'frame' ? null : 'frame'))}
      {btn('Image', '', <ImageIcon size={18} />, false, () => fileRef.current?.click())}
      {btn('Pen', 'P', <PenLine size={18} />, tool === 'pen', () => pick('pen', 'pen'))}
      {btn('Comment', 'C', <MessageSquare size={18} />, tool === 'comment', () => pick('comment'))}
      <div className="spacer" />
      {btn(libOpen ? 'Collapse panel' : 'Expand panel', '', libOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />, false, onToggleLib)}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) insertImage(f); }} />

      {pop === 'note' && (
        <div className="rail-pop" style={{ top: 92 }}>
          <div className="menu-label">Sticky note color</div>
          <div className="pop-swatches">
            {PALETTE_KEYS.map((k) => (
              <button key={k} className={`note-swatch${opts.noteColor === k ? ' on' : ''}`} style={{ background: `var(--pal-${k}-fill)` }} title={PALETTE[k].name}
                onClick={() => { st.setToolOpts({ noteColor: k }); st.setTool('note'); }} />
            ))}
          </div>
          <p className="faint" style={{ margin: '8px 4px 2px', fontSize: 11.5 }}>Click on the canvas to place a note.</p>
        </div>
      )}
      {pop === 'pen' && (
        <div className="rail-pop" style={{ top: 330 }}>
          <div className="pen-widths">
            {PEN_WIDTHS.map((w) => (
              <button key={w} className={`pen-w${opts.penWidth === w ? ' on' : ''}`} title={`${w}px`} onClick={() => st.setToolOpts({ penWidth: w })}>
                <span style={{ width: Math.min(16, w + 2), height: Math.min(16, w + 2) }} />
              </button>
            ))}
          </div>
          <div className="pop-swatches" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {(['auto', ...PALETTE_KEYS] as ColorKey[]).map((k) => <Swatch key={k} k={k} on={opts.penColor === k} onClick={() => st.setToolOpts({ penColor: k })} />)}
          </div>
          <p className="faint" style={{ margin: '8px 4px 2px', fontSize: 11.5 }}>Draw on the canvas. Esc or V to stop.</p>
        </div>
      )}
      {pop === 'line' && (
        <div className="rail-pop" style={{ top: 196 }}>
          <div className="menu-label">Line</div>
          <div className="seg">
            <button className={opts.lineArrow ? 'on' : ''} onClick={() => st.setToolOpts({ lineArrow: true })}>Arrow</button>
            <button className={!opts.lineArrow ? 'on' : ''} onClick={() => st.setToolOpts({ lineArrow: false })}>Plain</button>
          </div>
          <p className="faint" style={{ margin: '8px 4px 2px', fontSize: 11.5 }}>Drag on the canvas. Start or end on a shape to attach.</p>
        </div>
      )}
      {pop === 'frame' && (
        <div className="rail-pop" style={{ top: 230, width: 230, padding: 5 }}>
          {FRAME_ITEMS.map((id) => {
            const d = SHAPES.find((s) => s.id === id)!;
            return (
              <button key={id} className="menu-item" onClick={() => { setPop(null); st.setTool('select'); const nid = st.addPreset(id, viewCenter()); if (d.defaultText || d.kind === 'table') st.setEditing({ type: 'node', id: nid }); }}>
                <span style={{ width: 30, display: 'flex', justifyContent: 'center', color: 'var(--text-2)' }}><ShapeIcon kind={d.kind} shape={d.shape} variant={d.variant} /></span>
                <span className="grow">{d.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
