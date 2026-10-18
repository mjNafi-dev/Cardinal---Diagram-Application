import React, { useMemo } from 'react';
import type { DEdge, DNode, Doc, EndMarker, Pt, Rect } from '../model/types';
import type { Prefs } from '../model/prefs';
import { FONT_STACKS } from '../model/prefs';
import { fillVar, lineVar } from '../model/palette';
import { tableMetrics, textWidth, wrapText, isPassThrough, keyLabel, isContainer } from '../geometry/geometry';
import { basicShape } from '../model/basicShapes';
import { orthoPath, simplify, type RoutedEdge } from '../routing/router';
import { LogicShape, sigColor } from './LogicShape';
import { circuitWires, logicPins, simulate, type Sig } from '../model/logic';

const FONT = 'var(--diagram-font)';

// ───────────────────────── hover focus ─────────────────────────

/** Opacity per element when hovering a node: connected = full, 2 hops = slightly dim, the rest dimmer. */
export function computeFocus(doc: Doc, hovered: string | null, prefs: Prefs): Map<string, number> | null {
  if (!hovered || !prefs.focus.enabled) return null;
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  if (!nodes.has(hovered)) return null;
  if (doc.mode === 'circuit' && nodes.get(hovered)!.kind === 'logic') return circuitFocus(doc, hovered, prefs);
  const adj = new Map<string, string[]>();
  for (const e of doc.edges) {
    const a = e.source.node, b = e.target.node;
    if (!a || !b) continue;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  // 0-1 BFS: stepping into a relationship diamond / specialization circle is free,
  // so in Chen diagrams the entity on the other side of a relationship counts as "directly connected".
  const dist = new Map<string, number>([[hovered, 0]]);
  const dq: string[] = [hovered];
  while (dq.length) {
    const cur = dq.shift()!;
    const dc = dist.get(cur)!;
    for (const nb of adj.get(cur) ?? []) {
      const w = isPassThrough(nodes.get(nb)!.kind) ? 0 : 1;
      const nd = dc + w;
      if (nd < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nd);
        w === 0 ? dq.unshift(nb) : dq.push(nb);
      }
    }
  }
  const op = (d: number | undefined) => (d === undefined ? prefs.focus.far : d <= 1 ? 1 : d === 2 ? prefs.focus.near : prefs.focus.far);
  const out = new Map<string, number>();
  for (const n of doc.nodes) out.set(n.id, op(dist.get(n.id)));
  for (const e of doc.edges) {
    const da = e.source.node ? dist.get(e.source.node) : undefined;
    const db = e.target.node ? dist.get(e.target.node) : undefined;
    out.set(e.id, op(da === undefined || db === undefined ? undefined : Math.max(da, db)));
  }
  return out;
}

/**
 * Circuits: hovering a part shows its signal path — everything that feeds it (upstream) and everything
 * it drives (downstream) stays solid, the rest fades. Two levels only, so sweeping the mouse doesn't flicker.
 */
function circuitFocus(doc: Doc, hovered: string, prefs: Prefs): Map<string, number> {
  const wires = circuitWires(doc);
  const cone = (forward: boolean) => {
    const seen = new Set([hovered]);
    const todo = [hovered];
    while (todo.length) {
      const cur = todo.pop()!;
      for (const w of wires) {
        const [a, b] = forward ? [w.from, w.to] : [w.to, w.from];
        if (a === cur && !seen.has(b)) { seen.add(b); todo.push(b); }
      }
    }
    return seen;
  };
  const up = cone(false), down = cone(true);
  const far = Math.min(prefs.focus.far, 0.35);
  const out = new Map<string, number>();
  for (const n of doc.nodes) out.set(n.id, up.has(n.id) || down.has(n.id) ? 1 : n.kind === 'logic' ? far : prefs.focus.near);
  const onPath = new Set(wires.filter((w) => (up.has(w.from) && up.has(w.to)) || (down.has(w.from) && down.has(w.to))).map((w) => w.id));
  for (const e of doc.edges) out.set(e.id, onPath.has(e.id) ? 1 : far);
  return out;
}

// ───────────────────────── nodes ─────────────────────────

interface NodeProps {
  n: DNode;
  r: Rect;
  prefs: Prefs;
  interactive?: boolean;
  hideText?: boolean;
  hideField?: string;
  /** comments: show the text card */
  open?: boolean;
  /** logic parts: signal per pin ("1,0,x") */
  sigs?: string;
  /** SQL problems for this table (shown as a warning triangle) */
  warn?: string;
}

export const NodeShape = React.memo(function NodeShape({ n, r, prefs, interactive, hideText, hideField, open, sigs, warn }: NodeProps) {
  const t = prefs.text;
  const fam = FONT_STACKS[t.font].css;
  const sw = n.style?.strokeWidth ?? prefs.shape.strokeWidth;
  const stroke = lineVar(n.style?.stroke ?? prefs.shape.stroke);
  const fill = fillVar(n.style?.fill ?? prefs.shape.fill);
  const shapeStyle: React.CSSProperties = { fill, stroke, strokeWidth: sw };
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const fs = n.style?.fontSize ?? t.bodySize;
  const titleSize = n.style?.fontSize ? n.style.fontSize + 1 : t.titleSize;

  const label = (text: string, opts: { size?: number; weight?: number; x?: number; y?: number; underline?: 'solid' | 'dashed' } = {}) => {
    if (hideText) return null;
    const size = opts.size ?? fs + 1;
    const weight = opts.weight ?? 500;
    const x = opts.x ?? cx, y = opts.y ?? cy;
    const tw = opts.underline ? textWidth(text, size, weight, fam) : 0;
    return (
      <g>
        <text x={x} y={y} dy="0.35em" textAnchor="middle" style={{ fill: 'var(--ink-text)', fontFamily: FONT, fontSize: size, fontWeight: weight }}>
          {text}
        </text>
        {opts.underline && (
          <line x1={x - tw / 2} x2={x + tw / 2} y1={y + size * 0.62} y2={y + size * 0.62}
            style={{ stroke: 'var(--ink-text)', strokeWidth: 1.1, strokeDasharray: opts.underline === 'dashed' ? '3 2' : undefined }} />
        )}
      </g>
    );
  };

  switch (n.kind) {
    case 'logic':
      return <LogicShape n={n} r={r} prefs={prefs} sigs={sigs} hideText={hideText} />;
    case 'table': {
      const m = tableMetrics(prefs, n);
      const rad = Math.min(prefs.shape.radius, 12);
      const hh = m.headerH;
      const header = fillVar(n.style?.fill ?? prefs.shape.headerFill, 'var(--panel-3)');
      const fields = n.fields ?? [];
      return (
        <g>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={rad} style={{ fill: 'var(--shape-fill)' }} />
          <path d={`M${r.x},${r.y + hh}V${r.y + rad}Q${r.x},${r.y} ${r.x + rad},${r.y}H${r.x + r.w - rad}Q${r.x + r.w},${r.y} ${r.x + r.w},${r.y + rad}V${r.y + hh}Z`} style={{ fill: header }} />
          {fields.length > 0 && n.variant !== 'enum' && m.keyW > 4 && <line x1={r.x + m.keyW} x2={r.x + m.keyW} y1={r.y + hh} y2={r.y + r.h} style={{ stroke: 'var(--row-line)', strokeWidth: 1 }} />}
          {fields.map((f, i) => {
            const ry = r.y + hh + 3 + i * m.rowH;
            const my = ry + m.rowH / 2;
            const key = n.variant === 'enum' ? '' : keyLabel(f);
            return (
              <g key={f.id}>
                {i > 0 && <line x1={r.x + 1} x2={r.x + r.w - 1} y1={ry} y2={ry} style={{ stroke: 'var(--row-line)', strokeWidth: 1 }} />}
                {interactive && <rect data-field={f.id} x={r.x} y={ry} width={r.w} height={m.rowH} style={{ fill: 'transparent' }} />}
                {hideField !== f.id && (
                  <>
                    {key && (
                      <text x={r.x + m.keyW / 2} y={my} dy="0.35em" textAnchor="middle" style={{ fill: 'var(--key)', fontFamily: FONT, fontSize: fs - 2.5, fontWeight: 700, letterSpacing: 0.3, pointerEvents: 'none' }}>
                        {key}
                      </text>
                    )}
                    <text x={r.x + m.keyW + 9} y={my} dy="0.35em" style={{ fill: 'var(--ink-text)', fontFamily: FONT, fontSize: fs, fontWeight: f.pk ? 650 : 450, textDecoration: f.pk ? 'underline' : undefined, pointerEvents: 'none' }}>
                      {f.name}
                    </text>
                    {t.typeColumn && f.type && n.variant !== 'enum' && (
                      <text x={r.x + r.w - 10} y={my} dy="0.35em" textAnchor="end" style={{ fill: 'var(--ink-muted)', fontFamily: FONT, fontSize: fs - 1, pointerEvents: 'none' }}>
                        {f.type}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
          {fields.length === 0 && interactive && (
            <text x={cx} y={r.y + hh + 3 + m.rowH / 2} dy="0.35em" textAnchor="middle" style={{ fill: 'var(--ink-muted)', fontFamily: FONT, fontSize: fs - 1, fontStyle: 'italic', pointerEvents: 'none' }}>
              Double-click to add a column
            </text>
          )}
          <line x1={r.x} x2={r.x + r.w} y1={r.y + hh} y2={r.y + hh} style={{ stroke, strokeWidth: Math.max(1, sw * 0.8) }} />
          <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={rad} style={{ fill: 'none', stroke, strokeWidth: sw, strokeDasharray: n.variant === 'view' ? '6 4' : undefined }} />
          {n.variant && !hideText && (
            <text x={r.x + 8} y={r.y + 9} dy="0.35em" style={{ fill: 'var(--ink-muted)', fontFamily: FONT, fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6 }}>
              {n.variant === 'view' ? 'VIEW' : 'ENUM'}
            </text>
          )}
          {label(n.text, { size: titleSize, weight: t.titleWeight, y: r.y + hh / 2 + (n.variant ? 3 : 0) })}
          {warn && interactive && <WarnBadge x={r.x + r.w - 22} y={r.y + hh / 2 - 8} id={n.id} text={warn} />}
        </g>
      );
    }
    case 'entity-simple':
      return (
        <g>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={prefs.shape.radius} style={{ ...shapeStyle, fill: fillVar(n.style?.fill ?? prefs.shape.headerFill, 'var(--panel-3)') }} />
          {label(n.text, { size: titleSize, weight: t.titleWeight })}
        </g>
      );
    case 'entity':
    case 'weak-entity':
      return (
        <g>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={2} style={shapeStyle} />
          {n.kind === 'weak-entity' && <rect x={r.x + 5} y={r.y + 5} width={r.w - 10} height={r.h - 10} rx={1} style={{ ...shapeStyle, fill: 'none' }} />}
          {label(n.text, { size: titleSize, weight: t.titleWeight })}
        </g>
      );
    case 'relationship':
    case 'identifying-relationship': {
      const d = (ins: number) => {
        const kx = ins * (r.w / r.h) * 1.1, ky = ins * 1.1;
        return `M${cx},${r.y + ky}L${r.x + r.w - kx},${cy}L${cx},${r.y + r.h - ky}L${r.x + kx},${cy}Z`;
      };
      return (
        <g>
          <path d={d(0)} style={{ ...shapeStyle, strokeLinejoin: 'round' }} />
          {n.kind === 'identifying-relationship' && <path d={d(6)} style={{ ...shapeStyle, fill: 'none', strokeLinejoin: 'round' }} />}
          {label(n.text, { size: fs + 1, weight: 600 })}
        </g>
      );
    }
    case 'attribute':
    case 'key-attribute':
    case 'partial-key-attribute':
    case 'multivalued-attribute':
    case 'derived-attribute':
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx={r.w / 2} ry={r.h / 2} style={{ ...shapeStyle, strokeDasharray: n.kind === 'derived-attribute' ? '5 4' : undefined }} />
          {n.kind === 'multivalued-attribute' && <ellipse cx={cx} cy={cy} rx={r.w / 2 - 5} ry={r.h / 2 - 5} style={{ ...shapeStyle, fill: 'none' }} />}
          {label(n.text, {
            size: fs,
            weight: n.kind === 'key-attribute' ? 600 : 450,
            underline: n.kind === 'key-attribute' ? 'solid' : n.kind === 'partial-key-attribute' ? 'dashed' : undefined,
          })}
        </g>
      );
    case 'specialization':
      return (
        <g>
          <circle cx={cx} cy={cy} r={r.w / 2} style={shapeStyle} />
          {label(n.text, { size: fs + 3, weight: 600 })}
        </g>
      );
    case 'isa':
      return (
        <g>
          <path d={`M${cx},${r.y}L${r.x + r.w},${r.y + r.h}L${r.x},${r.y + r.h}Z`} style={{ ...shapeStyle, strokeLinejoin: 'round' }} />
          {label(n.text, { size: fs - 1, weight: 650, y: r.y + r.h * 0.66 })}
        </g>
      );
    case 'text': {
      if (hideText) return interactive ? <rect x={r.x} y={r.y} width={r.w} height={r.h} style={{ fill: 'transparent' }} /> : null;
      const size = n.style?.fontSize ?? t.bodySize + 1;
      const lines = (n.text || ' ').split('\n');
      return (
        <g>
          {interactive && <rect x={r.x} y={r.y} width={r.w} height={r.h} style={{ fill: 'transparent' }} />}
          <text x={r.x + 6} y={r.y + 4} style={{ fill: n.style?.stroke && n.style.stroke !== 'auto' ? lineVar(n.style.stroke) : 'var(--ink-text)', fontFamily: FONT, fontSize: size, fontWeight: 450 }}>
            {lines.map((l, i) => (
              <tspan key={i} x={r.x + 6} dy={i === 0 ? size * 1.05 : size * 1.4}>{l || ' '}</tspan>
            ))}
          </text>
        </g>
      );
    }
    case 'associative-entity':
      return (
        <g>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={2} style={shapeStyle} />
          <path d={`M${cx},${r.y + 4}L${r.x + r.w - 6},${cy}L${cx},${r.y + r.h - 4}L${r.x + 6},${cy}Z`} style={{ ...shapeStyle, fill: 'none', strokeLinejoin: 'round' }} />
          {label(n.text, { size: fs + 1, weight: 600 })}
        </g>
      );
    case 'shape': {
      const b = basicShape(n.shape);
      const container = !!b.container;
      const shapeFill = b.open ? 'none' : b.id === 'frame' ? fillVar(n.style?.fill, 'none') : fillVar(n.style?.fill ?? prefs.shape.fill);
      const st: React.CSSProperties = { fill: shapeFill, stroke, strokeWidth: sw, strokeLinejoin: 'round', strokeDasharray: b.id === 'frame' ? '7 5' : undefined };
      const size = n.style?.fontSize ?? (container ? t.bodySize + 1 : t.bodySize + 1);
      let text: React.ReactNode = null;
      if (!hideText && n.text) {
        const tstyle: React.CSSProperties = { fill: 'var(--ink-text)', fontFamily: FONT, fontSize: size, fontWeight: container ? 650 : 500 };
        if (b.label === 'header') {
          text = <text x={r.x + 12} y={r.y + 16} dy="0.35em" style={tstyle}>{n.text}</text>;
        } else if (b.label === 'side') {
          text = <text x={r.x + 17} y={cy} dy="0.35em" textAnchor="middle" transform={`rotate(-90 ${r.x + 17} ${cy})`} style={tstyle}>{n.text}</text>;
        } else if (b.label === 'below') {
          text = <text x={cx} y={r.y + r.h + size + 4} textAnchor="middle" style={{ ...tstyle, paintOrder: 'stroke', stroke: 'var(--canvas)', strokeWidth: 4, strokeLinejoin: 'round' }}>{n.text}</text>;
        } else {
          const lines = wrapText(n.text, Math.max(30, r.w - 16), size, 500, fam);
          const lh = size * 1.3;
          const y0 = cy - ((lines.length - 1) * lh) / 2;
          text = (
            <text textAnchor="middle" style={tstyle}>
              {lines.map((l, i) => <tspan key={i} x={cx} y={y0 + i * lh} dy="0.35em">{l || ' '}</tspan>)}
            </text>
          );
        }
      }
      return (
        <g>
          {(b.open || interactive) && b.open && <rect x={r.x} y={r.y} width={r.w} height={r.h} style={{ fill: 'transparent' }} />}
          <path d={b.path(r)} style={st} />
          {b.extra && <path d={b.extra(r)} style={{ ...st, fill: 'none' }} />}
          {text}
        </g>
      );
    }
    case 'image':
      return (
        <g>
          {n.src ? <image href={n.src} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" /> : <rect x={r.x} y={r.y} width={r.w} height={r.h} style={{ fill: 'var(--panel-3)' }} />}
          {n.style?.strokeWidth ? <rect x={r.x} y={r.y} width={r.w} height={r.h} style={{ fill: 'none', stroke, strokeWidth: n.style.strokeWidth }} /> : null}
        </g>
      );
    case 'drawing': {
      const P = n.points ?? [];
      const sx = r.w / (n.nw || r.w || 1), sy = r.h / (n.nh || r.h || 1);
      const pt = (i: number) => ({ x: r.x + P[i][0] * sx, y: r.y + P[i][1] * sy });
      let d = '';
      if (P.length) {
        d = `M${pt(0).x},${pt(0).y}`;
        for (let i = 1; i < P.length - 1; i++) {
          const a = pt(i), b = pt(i + 1);
          d += `Q${a.x},${a.y} ${(a.x + b.x) / 2},${(a.y + b.y) / 2}`;
        }
        if (P.length > 1) d += `L${pt(P.length - 1).x},${pt(P.length - 1).y}`;
        else d += `l0.01,0`;
      }
      const w = n.style?.strokeWidth ?? 3;
      return (
        <g>
          {interactive && <path d={d} style={{ fill: 'none', stroke: 'transparent', strokeWidth: w + 12, strokeLinecap: 'round' }} />}
          <path d={d} style={{ fill: 'none', stroke: lineVar(n.style?.stroke), strokeWidth: w, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
        </g>
      );
    }
    case 'comment': {
      if (!interactive) return null;
      const lines = n.text ? wrapText(n.text, 210, 12.5, 450, fam) : ['Empty comment — double-click to write'];
      return (
        <g>
          <path d={`M${r.x + 6},${r.y}H${r.x + r.w - 6}Q${r.x + r.w},${r.y} ${r.x + r.w},${r.y + 6}V${r.y + r.h - 9}Q${r.x + r.w},${r.y + r.h - 4} ${r.x + r.w - 6},${r.y + r.h - 4}H${r.x + 12}L${r.x + 5},${r.y + r.h + 3}V${r.y + r.h - 4}Q${r.x},${r.y + r.h - 4} ${r.x},${r.y + r.h - 9}V${r.y + 6}Q${r.x},${r.y} ${r.x + 6},${r.y}Z`}
            style={{ fill: 'var(--accent)', stroke: 'var(--panel)', strokeWidth: 1.5 }} />
          <path d={`M${r.x + 8},${r.y + 10}H${r.x + r.w - 8}M${r.x + 8},${r.y + 16}H${r.x + r.w - 12}`} style={{ stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' }} />
          {open && !hideText && (
            <g>
              <rect x={r.x + r.w + 8} y={r.y - 4} width={234} height={lines.length * 17 + 16} rx={8} style={{ fill: 'var(--panel)', stroke: 'var(--border-strong)', strokeWidth: 1, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.15))' }} />
              <text x={r.x + r.w + 20} y={r.y + 8} style={{ fill: n.text ? 'var(--text)' : 'var(--text-3)', fontFamily: FONT, fontSize: 12.5 }}>
                {lines.map((l, i) => <tspan key={i} x={r.x + r.w + 20} dy={i === 0 ? 10 : 17}>{l || ' '}</tspan>)}
              </text>
            </g>
          )}
        </g>
      );
    }
    case 'note':
    default: {
      const fold = 14;
      const size = n.style?.fontSize ?? t.bodySize;
      const lines = hideText ? [] : wrapText(n.text, r.w - 24, size, 450, fam);
      const nf = n.style?.fill && n.style.fill !== 'auto' ? fillVar(n.style.fill) : 'var(--note-fill)';
      return (
        <g>
          <path d={`M${r.x},${r.y}H${r.x + r.w - fold}L${r.x + r.w},${r.y + fold}V${r.y + r.h}H${r.x}Z`} style={{ fill: nf, stroke: 'var(--note-line)', strokeWidth: 1 }} />
          <path d={`M${r.x + r.w - fold},${r.y}V${r.y + fold}H${r.x + r.w}`} style={{ fill: 'none', stroke: 'var(--note-line)', strokeWidth: 1 }} />
          <text x={r.x + 12} y={r.y + 10} style={{ fill: 'var(--ink-text)', fontFamily: FONT, fontSize: size }}>
            {lines.map((l, i) => (
              <tspan key={i} x={r.x + 12} dy={i === 0 ? size * 1.15 : size * 1.4}>{l || ' '}</tspan>
            ))}
          </text>
        </g>
      );
    }
  }
});

/** Amber triangle with "!" — click opens the SQL line. */
function WarnBadge({ x, y, id, text }: { x: number; y: number; id: string; text: string }) {
  return (
    <g data-sqlwarn={id} style={{ cursor: 'pointer' }}>
      <title>{text + '\n(click to see it in the SQL)'}</title>
      <rect x={x - 3} y={y - 3} width={22} height={22} rx={5} style={{ fill: 'transparent' }} />
      <path d={`M${x + 8},${y + 1}L${x + 16},${y + 15}H${x}Z`} style={{ fill: 'var(--warn)', stroke: 'var(--warn)', strokeWidth: 2, strokeLinejoin: 'round' }} />
      <path d={`M${x + 8},${y + 5.5}V${y + 10}M${x + 8},${y + 12.6}V${y + 12.8}`} style={{ stroke: '#1B1D21', strokeWidth: 1.8, strokeLinecap: 'round' }} />
    </g>
  );
}

// ───────────────────────── edges ─────────────────────────

function offsetPolyline(P: Pt[], o: number): Pt[] {
  const n = P.length;
  const normals: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = P[i + 1].x - P[i].x, dy = P[i + 1].y - P[i].y;
    const l = Math.hypot(dx, dy) || 1;
    normals.push({ x: -dy / l, y: dx / l });
  }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) out.push({ x: P[0].x + normals[0].x * o, y: P[0].y + normals[0].y * o });
    else if (i === n - 1) out.push({ x: P[i].x + normals[i - 1].x * o, y: P[i].y + normals[i - 1].y * o });
    else {
      const a = normals[i - 1], b = normals[i];
      const dot = a.x * b.x + a.y * b.y;
      const k = o / (1 + dot || 1);
      out.push({ x: P[i].x + (a.x + b.x) * k, y: P[i].y + (a.y + b.y) * k });
    }
  }
  return out;
}

export function Marker({ type, p, u, style, bg = 'var(--canvas)' }: { type: EndMarker | undefined; p: Pt; u: Pt; style: React.CSSProperties; bg?: string }) {
  if (!type || type === 'none') return null;
  const n = { x: -u.y, y: u.x };
  const at = (d: number, s = 0) => ({ x: p.x + u.x * d + n.x * s, y: p.y + u.y * d + n.y * s });
  const line = (a: Pt, b: Pt, k: string) => <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={style} />;
  const bar = (d: number, k: string) => line(at(d, 8), at(d, -8), k);
  const foot = () => [line(at(16), at(0, 9), 'f1'), line(at(16), at(0, -9), 'f2'), line(at(16), at(0), 'f3')];
  const circle = (d: number) => <circle key="c" cx={at(d).x} cy={at(d).y} r={5.5} style={{ ...style, fill: bg }} />;
  const parts: React.ReactNode[] = [];
  switch (type) {
    case '11': parts.push(bar(9, 'b1'), bar(17, 'b2')); break;
    case '01': parts.push(bar(9, 'b1'), circle(22)); break;
    case '1M': parts.push(...foot(), bar(22, 'b1')); break;
    case '0M': parts.push(...foot(), circle(24)); break;
    case 'one': parts.push(bar(11, 'b1')); break;
    case 'many': parts.push(...foot()); break;
    case 'arrow': {
      const a = at(12, 6), b = at(12, -6);
      parts.push(<path key="a" d={`M${p.x},${p.y}L${a.x},${a.y}L${b.x},${b.y}Z`} style={{ ...style, fill: style.stroke as string, strokeLinejoin: 'round' }} />);
      break;
    }
    case 'triangle': {
      const a = at(15, 9), b = at(15, -9);
      parts.push(<path key="t" d={`M${p.x},${p.y}L${a.x},${a.y}L${b.x},${b.y}Z`} style={{ ...style, fill: bg, strokeLinejoin: 'round' }} />);
      break;
    }
  }
  return <g>{parts}</g>;
}

interface EdgeProps {
  e: DEdge;
  route: RoutedEdge;
  prefs: Prefs;
  interactive?: boolean;
  hideLabel?: boolean;
  /** wires: the value they carry (undefined = not a wire) */
  signal?: Sig;
}

export const EdgeShape = React.memo(function EdgeShape({ e, route, prefs, interactive, hideLabel, signal }: EdgeProps) {
  const sw = e.style?.strokeWidth ?? prefs.line.width;
  const color = sigColor(signal, lineVar(e.style?.stroke ?? prefs.line.color));
  const style: React.CSSProperties = { stroke: color, strokeWidth: sw, fill: 'none', strokeLinecap: 'round' };
  const lineStyle: React.CSSProperties = { ...style, strokeDasharray: e.dashed ? `${sw * 3} ${sw * 2.5}` : undefined };
  const markerStyle: React.CSSProperties = { ...style, strokeWidth: Math.max(1.2, sw * 0.85) };

  let main: React.ReactNode;
  if (e.total && route.routing !== 'curved') {
    const g = Math.max(2.2, sw * 1.2);
    const P = route.points;
    const mk = (o: number) => (route.routing === 'orthogonal' ? orthoPath(simplify(offsetPolyline(P, o)), prefs.line.cornerRadius, undefined) : (() => { const Q = offsetPolyline(P, o); return `M${Q[0].x},${Q[0].y}L${Q[1].x},${Q[1].y}`; })());
    const thin = { ...lineStyle, strokeWidth: Math.max(1, sw * 0.75) };
    main = (
      <>
        <path d={mk(g)} style={thin} />
        <path d={mk(-g)} style={thin} />
      </>
    );
  } else if (e.total) {
    main = (
      <>
        <path d={route.d} style={{ ...lineStyle, strokeWidth: sw * 2 + 3 }} />
        <path d={route.d} style={{ ...lineStyle, stroke: 'var(--canvas)', strokeWidth: 3 }} />
      </>
    );
  } else main = <path d={route.d} style={lineStyle} />;

  const nrm = { x: -Math.sin(route.midAngle), y: Math.cos(route.midAngle) };
  // keep labels above / left of the line
  const flip = nrm.y > 0.01 || (Math.abs(nrm.y) <= 0.01 && nrm.x > 0) ? -1 : 1;
  const off = (d: number) => ({ x: route.mid.x + nrm.x * d * flip, y: route.mid.y + nrm.y * d * flip });
  const labelStyle: React.CSSProperties = {
    fill: 'var(--ink-text)', fontFamily: FONT, fontSize: prefs.text.labelSize, fontWeight: 500,
    paintOrder: 'stroke', stroke: 'var(--canvas)', strokeWidth: 4, strokeLinejoin: 'round',
  };

  let subset: React.ReactNode = null;
  if (e.subset) {
    // ⊂ opens toward the source (superclass / circle side)
    const P = route.points;
    const toSrc = { x: -Math.cos(route.midAngle), y: -Math.sin(route.midAngle) };
    const n = { x: -toSrc.y, y: toSrc.x };
    const m = route.mid;
    const A = { x: m.x + n.x * 7 + toSrc.x * 5, y: m.y + n.y * 7 + toSrc.y * 5 };
    const B = { x: m.x - n.x * 7 + toSrc.x * 5, y: m.y - n.y * 7 + toSrc.y * 5 };
    const C1 = { x: A.x - toSrc.x * 13, y: A.y - toSrc.y * 13 };
    const C2 = { x: B.x - toSrc.x * 13, y: B.y - toSrc.y * 13 };
    void P;
    subset = <path d={`M${A.x},${A.y}C${C1.x},${C1.y} ${C2.x},${C2.y} ${B.x},${B.y}`} style={{ ...style, strokeWidth: Math.max(1.4, sw) }} />;
  }

  return (
    <g>
      {main}
      <Marker type={e.sourceEnd} p={route.start} u={route.srcDir} style={markerStyle} />
      <Marker type={e.targetEnd} p={route.end} u={route.tgtDir} style={markerStyle} />
      {subset}
      {e.chenLabel && (
        <text x={off(e.subset ? 18 : 13).x} y={off(e.subset ? 18 : 13).y} dy="0.35em" textAnchor="middle" style={{ ...labelStyle, fontWeight: 650 }}>
          {e.chenLabel}
        </text>
      )}
      {e.label && !hideLabel && (
        <text x={e.chenLabel ? off(-13).x : route.mid.x} y={e.chenLabel ? off(-13).y : route.mid.y} dy="0.35em" textAnchor="middle" style={labelStyle}>
          {e.label}
        </text>
      )}
      {interactive && <path data-edge={e.id} d={route.d} style={{ stroke: 'transparent', strokeWidth: Math.max(14, sw + 10), fill: 'none', pointerEvents: 'stroke' }} />}
    </g>
  );
});

// ───────────────────────── whole diagram ─────────────────────────

interface ContentProps {
  doc: Doc;
  rects: Map<string, Rect>;
  routes: Map<string, RoutedEdge>;
  prefs: Prefs;
  focus?: Map<string, number> | null;
  interactive?: boolean;
  editingNode?: string;
  editingField?: string;
  editingEdge?: string;
  only?: Set<string>;
  openComments?: Set<string>;
  /** node id → SQL problem text */
  warnings?: Map<string, string>;
}

export function DiagramContent({ doc, rects, routes, prefs, focus, interactive, editingNode, editingField, editingEdge, only, openComments, warnings }: ContentProps) {
  const sim = useMemo(() => (doc.nodes.some((n) => n.kind === 'logic') ? simulate(doc) : null), [doc]);
  const sigsOf = (n: DNode) => {
    if (!sim || n.kind !== 'logic') return undefined;
    const r = rects.get(n.id);
    if (!r) return undefined;
    return logicPins(n, r).map((p) => { const v = sim.pins.get(n.id + ':' + p.id); return v === 1 ? '1' : v === 0 ? '0' : 'x'; }).join(',');
  };
  const fade = (id: string): React.CSSProperties | undefined =>
    interactive ? { opacity: focus?.get(id) ?? 1, transition: 'opacity 140ms ease' } : undefined;
  // containers sit behind everything; comments float on top
  const back = doc.nodes.filter((n) => isContainer(n));
  const front = doc.nodes.filter((n) => !isContainer(n) && n.kind !== 'comment');
  const pins = doc.nodes.filter((n) => n.kind === 'comment');
  const nodeEl = (n: DNode) => {
    if (only && !only.has(n.id)) return null;
    const r = rects.get(n.id);
    if (!r) return null;
    return (
      <g key={n.id} data-node={interactive ? n.id : undefined} style={fade(n.id)}>
        <NodeShape n={n} r={r} prefs={prefs} interactive={interactive} hideText={editingNode === n.id} hideField={editingField} open={openComments?.has(n.id)} sigs={sigsOf(n)} warn={warnings?.get(n.id)} />
      </g>
    );
  };
  return (
    <>
      <g className="containers">{back.map(nodeEl)}</g>
      <g className="edges">
        {doc.edges.map((e) => {
          if (only && !only.has(e.id)) return null;
          const route = routes.get(e.id);
          if (!route) return null;
          return (
            <g key={e.id} style={fade(e.id)}>
              <EdgeShape e={e} route={route} prefs={prefs} interactive={interactive} hideLabel={editingEdge === e.id} signal={sim?.wires.get(e.id)} />
            </g>
          );
        })}
      </g>
      <g className="nodes">{front.map(nodeEl)}</g>
      {interactive && <g className="comments">{pins.map(nodeEl)}</g>}
    </>
  );
}
