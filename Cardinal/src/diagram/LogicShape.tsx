import React from 'react';
import type { DNode, Rect } from '../model/types';
import type { Prefs } from '../model/prefs';
import { fillVar, lineVar } from '../model/palette';
import { gatePaths, isGate, logicPins, stubEnd, PIN, type GateType, type Sig } from '../model/logic';

const FONT = 'var(--diagram-font)';

export const sigColor = (v: Sig | undefined, fallback: string) =>
  v === 1 ? 'var(--sig-on)' : v === 0 ? 'var(--sig-off)' : v === null ? 'var(--sig-x)' : fallback;

/** "1,0,x" → values per pin (inputs first, then the output), as produced by DiagramContent. */
export const parseSigs = (s?: string): Sig[] => (s ? s.split(',').map((c) => (c === '1' ? 1 : c === '0' ? 0 : null)) : []);

/** Draws a logic part: gate, switch, button, constant, bulb or digit display. Pin stubs take the signal color. */
export function LogicShape({ n, r, prefs, sigs, hideText }: { n: DNode; r: Rect; prefs: Prefs; sigs?: string; hideText?: boolean }) {
  const t = n.logic;
  const vals = parseSigs(sigs);
  const pins = logicPins(n, r);
  const sw = n.style?.strokeWidth ?? prefs.shape.strokeWidth;
  const stroke = lineVar(n.style?.stroke ?? prefs.shape.stroke);
  const fill = fillVar(n.style?.fill ?? prefs.shape.fill);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const fs = n.style?.fontSize ?? prefs.text.bodySize;
  const outV = pins.findIndex((p) => p.dir === 'out');
  const out = outV >= 0 ? vals[outV] : undefined;
  const inV = vals[0];
  const pinW = Math.max(1.5, sw);

  const stubs = pins.map((p, i) => {
    const color = sigColor(vals[i], stroke);
    const x2 = p.dir === 'in' ? (isGate(t) ? stubEnd(t, r, p.y) : r.x + 14) : p.x - (isGate(t) ? PIN : t === 'const1' || t === 'const0' ? 14 : 16);
    return <line key={p.id} x1={p.x} y1={p.y} x2={x2} y2={p.y} style={{ stroke: color, strokeWidth: pinW, strokeLinecap: 'butt' }} />;
  });

  const labelStyle: React.CSSProperties = { fill: 'var(--ink-text)', fontFamily: FONT, fontSize: fs + 1, fontWeight: 600 };
  let label: React.ReactNode = null;
  if (!hideText && n.text) {
    if (t === 'switch' || t === 'button' || t === 'const1' || t === 'const0') label = <text x={r.x - 7} y={cy} dy="0.35em" textAnchor="end" style={labelStyle}>{n.text}</text>;
    else if (t === 'bulb' || t === 'probe') label = <text x={r.x + r.w + 7} y={cy} dy="0.35em" style={labelStyle}>{n.text}</text>;
    else label = <text x={cx} y={r.y + r.h + fs + 4} textAnchor="middle" style={{ ...labelStyle, fontSize: fs - 1, fontWeight: 500, fill: 'var(--ink-muted)' }}>{n.text}</text>;
  }

  let body: React.ReactNode;
  if (isGate(t)) {
    const g = gatePaths(t as GateType, r);
    body = (
      <>
        <path d={g.body} style={{ fill, stroke, strokeWidth: sw, strokeLinejoin: 'round' }} />
        {g.extra && <path d={g.extra} style={{ fill: 'none', stroke, strokeWidth: sw }} />}
        {g.bubble && <circle cx={g.bubble.x} cy={g.bubble.y} r={4.5} style={{ fill, stroke, strokeWidth: sw }} />}
      </>
    );
  } else if (t === 'switch') {
    const on = !!n.on;
    const x = r.x + 4, w = 40, h = 22, y = cy - h / 2;
    body = (
      <>
        <rect x={x} y={y} width={w} height={h} rx={h / 2} style={{ fill: on ? 'var(--sig-on)' : 'var(--switch-off)', stroke: on ? 'var(--sig-on)' : stroke, strokeWidth: Math.max(1, sw * 0.75), transition: 'fill 120ms' }} />
        <circle cx={on ? x + w - h / 2 : x + h / 2} cy={cy} r={h / 2 - 3.5} style={{ fill: '#fff', stroke: on ? 'none' : stroke, strokeWidth: 0.8, transition: 'cx 120ms' }} />
        <text x={on ? x + 10 : x + w - 10} y={cy} dy="0.35em" textAnchor="middle" style={{ fill: on ? '#fff' : 'var(--ink-muted)', fontFamily: FONT, fontSize: 10, fontWeight: 700, pointerEvents: 'none' }}>{on ? '1' : '0'}</text>
      </>
    );
  } else if (t === 'button') {
    const on = !!n.on;
    body = (
      <>
        <rect x={r.x + 6} y={r.y + 4} width={32} height={32} rx={7} style={{ fill, stroke, strokeWidth: sw }} />
        <circle cx={r.x + 22} cy={cy} r={10} style={{ fill: on ? 'var(--sig-on)' : 'var(--switch-off)', stroke: on ? 'var(--sig-on)' : stroke, strokeWidth: 1 }} />
      </>
    );
  } else if (t === 'const1' || t === 'const0') {
    body = (
      <>
        <rect x={r.x + 2} y={r.y + 8} width={24} height={24} rx={4} style={{ fill, stroke, strokeWidth: sw }} />
        <text x={r.x + 14} y={cy} dy="0.35em" textAnchor="middle" style={{ fill: sigColor(out, 'var(--ink-text)'), fontFamily: FONT, fontSize: 14, fontWeight: 700 }}>{t === 'const1' ? '1' : '0'}</text>
      </>
    );
  } else if (t === 'bulb') {
    const lit = inV === 1;
    const color = n.style?.fill && n.style.fill !== 'auto' ? lineVar(n.style.fill) : 'var(--bulb-on)';
    const bx = r.x + 31, R = 14;
    body = (
      <>
        {lit && <circle cx={bx} cy={cy} r={R + 6} style={{ fill: color, opacity: 0.22 }} />}
        <circle cx={bx} cy={cy} r={R} style={{ fill: lit ? color : fill, stroke: lit ? color : stroke, strokeWidth: sw, transition: 'fill 120ms' }} />
        <path d={`M${bx - 6},${cy + 4}L${bx - 3},${cy - 3}L${bx},${cy + 4}L${bx + 3},${cy - 3}L${bx + 6},${cy + 4}`} style={{ fill: 'none', stroke: lit ? 'rgba(0,0,0,.35)' : 'var(--ink-muted)', strokeWidth: 1.2, strokeLinejoin: 'round' }} />
      </>
    );
  } else {
    // probe: shows the digit
    body = (
      <>
        <rect x={r.x + 16} y={r.y + 4} width={30} height={32} rx={5} style={{ fill, stroke, strokeWidth: sw }} />
        <text x={r.x + 31} y={cy} dy="0.36em" textAnchor="middle" style={{ fill: sigColor(inV, 'var(--ink-muted)'), fontFamily: FONT, fontSize: 17, fontWeight: 700 }}>
          {inV === 1 ? '1' : inV === 0 ? '0' : '?'}
        </text>
      </>
    );
  }

  return (
    <g>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} style={{ fill: 'transparent' }} />
      {stubs}
      {body}
      {label}
    </g>
  );
}
