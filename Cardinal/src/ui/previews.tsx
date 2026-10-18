import type { ConnectorDef } from '../model/catalog';
import type { NodeKind } from '../model/types';
import { Marker } from '../diagram/DiagramContent';
import { basicShape } from '../model/basicShapes';
import { gatePaths, isGate, type GateType, type LogicType } from '../model/logic';

const S = { stroke: 'currentColor', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function ShapeIcon({ kind, text, shape, variant, logic }: { kind: NodeKind; text?: string; shape?: string; variant?: 'view' | 'enum'; logic?: LogicType }) {
  const W = 44, H = 30;
  const body = (() => {
    switch (kind) {
      case 'logic':
        return <LogicIcon t={logic} />;
      case 'shape': {
        const b = basicShape(shape);
        const sc = Math.min(38 / b.w, 24 / b.h);
        const r = { x: (W - b.w * sc) / 2, y: (H - b.h * sc) / 2, w: b.w * sc, h: b.h * sc };
        return (
          <>
            <path d={b.path(r)} style={{ ...S, strokeDasharray: b.id === 'frame' ? '3 2' : undefined }} />
            {b.extra && <path d={b.extra(r)} style={S} />}
          </>
        );
      }
      case 'associative-entity':
        return (<><rect x={4} y={6} width={36} height={18} rx={1} style={S} /><path d="M22 8 L37 15 L22 22 L7 15 Z" style={S} /></>);
      case 'table':
        if (variant === 'enum') return (<><rect x={4} y={2} width={36} height={26} rx={3} style={S} /><line x1={4} x2={40} y1={10} y2={10} style={S} /><circle cx={10} cy={16} r={1.3} fill="currentColor" /><circle cx={10} cy={22} r={1.3} fill="currentColor" /><line x1={14} x2={30} y1={16} y2={16} style={{ ...S, strokeOpacity: 0.55 }} /><line x1={14} x2={26} y1={22} y2={22} style={{ ...S, strokeOpacity: 0.55 }} /></>);
        return (
          <>
            <rect x={4} y={2} width={36} height={26} rx={3} style={{ ...S, strokeDasharray: variant === 'view' ? '3 2' : undefined }} />
            <rect x={4} y={2} width={36} height={8} rx={3} style={{ ...S, fill: 'currentColor', fillOpacity: 0.18 }} />
            <line x1={4} x2={40} y1={10} y2={10} style={S} />
            <line x1={9} x2={30} y1={16} y2={16} style={{ ...S, strokeOpacity: 0.55 }} />
            <line x1={9} x2={26} y1={22} y2={22} style={{ ...S, strokeOpacity: 0.55 }} />
          </>
        );
      case 'entity-simple':
        return <rect x={4} y={6} width={36} height={18} rx={4} style={{ ...S, fill: 'currentColor', fillOpacity: 0.14 }} />;
      case 'entity':
        return <rect x={4} y={6} width={36} height={18} rx={1} style={S} />;
      case 'weak-entity':
        return (<><rect x={3} y={5} width={38} height={20} rx={1} style={S} /><rect x={6.5} y={8.5} width={31} height={13} style={S} /></>);
      case 'relationship':
        return <path d="M22 3 L41 15 L22 27 L3 15 Z" style={S} />;
      case 'identifying-relationship':
        return (<><path d="M22 3 L41 15 L22 27 L3 15 Z" style={S} /><path d="M22 8 L33 15 L22 22 L11 15 Z" style={S} /></>);
      case 'attribute':
        return <ellipse cx={22} cy={15} rx={18} ry={10} style={S} />;
      case 'key-attribute':
        return (<><ellipse cx={22} cy={15} rx={18} ry={10} style={S} /><line x1={14} x2={30} y1={17} y2={17} style={S} /></>);
      case 'partial-key-attribute':
        return (<><ellipse cx={22} cy={15} rx={18} ry={10} style={S} /><line x1={14} x2={30} y1={17} y2={17} style={{ ...S, strokeDasharray: '2.5 2' }} /></>);
      case 'multivalued-attribute':
        return (<><ellipse cx={22} cy={15} rx={19} ry={11} style={S} /><ellipse cx={22} cy={15} rx={15} ry={7.5} style={S} /></>);
      case 'derived-attribute':
        return <ellipse cx={22} cy={15} rx={18} ry={10} style={{ ...S, strokeDasharray: '3 2.5' }} />;
      case 'specialization':
        return (<><circle cx={22} cy={15} r={11} style={S} /><text x={22} y={15} dy="0.35em" textAnchor="middle" fontSize={12} fontWeight={650} fill="currentColor">{text ?? 'd'}</text></>);
      case 'isa':
        return (<><path d="M22 3 L38 27 L6 27 Z" style={S} /><text x={22} y={21} dy="0.35em" textAnchor="middle" fontSize={7.5} fontWeight={700} fill="currentColor">ISA</text></>);
      case 'text':
        return <text x={22} y={15} dy="0.35em" textAnchor="middle" fontSize={15} fontWeight={600} fill="currentColor">Aa</text>;
      case 'note':
        return (<><path d="M8 3 H30 L37 10 V27 H8 Z" style={{ ...S, fill: 'currentColor', fillOpacity: 0.12 }} /><path d="M30 3 V10 H37" style={S} /></>);
    }
  })();
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>{body}</svg>;
}

export function ConnectorPic({ def, width = 120 }: { def: ConnectorDef; width?: number }) {
  const y = 15, x0 = 6, x1 = width - 6;
  const a = def.apply;
  const ms = { stroke: 'currentColor', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' as const };
  const line = a.total ? (
    <>
      <line x1={x0} x2={x1} y1={y - 2.2} y2={y - 2.2} style={ms} />
      <line x1={x0} x2={x1} y1={y + 2.2} y2={y + 2.2} style={ms} />
    </>
  ) : (
    <line x1={x0} x2={x1} y1={y} y2={y} style={{ ...ms, strokeDasharray: a.dashed ? '4 3' : undefined }} />
  );
  const mx = (x0 + x1) / 2;
  return (
    <svg width={width} height={30} viewBox={`0 0 ${width} 30`} style={{ overflow: 'visible' }}>
      {line}
      <Marker type={a.sourceEnd} p={{ x: x0, y }} u={{ x: 1, y: 0 }} style={ms} bg="var(--panel-2)" />
      <Marker type={a.targetEnd} p={{ x: x1, y }} u={{ x: -1, y: 0 }} style={ms} bg="var(--panel-2)" />
      {a.chenLabel && (
        <text x={mx} y={y - 7} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="currentColor" style={{ paintOrder: 'stroke', stroke: 'var(--panel-2)', strokeWidth: 3 }}>
          {a.chenLabel}
        </text>
      )}
      {a.subset && <path d={`M${mx - 5},${y - 7} C${mx + 8},${y - 7} ${mx + 8},${y + 7} ${mx - 5},${y + 7}`} style={ms} />}
    </svg>
  );
}

/** Library icon for a logic part (gate shapes are drawn at half size from the real geometry). */
function LogicIcon({ t }: { t?: LogicType }) {
  if (isGate(t)) {
    const one = t === 'not' || t === 'buf';
    const g = gatePaths(t as GateType, { x: 0, y: 0, w: 80, h: 40 });
    const w = { ...S, strokeWidth: 2.8 };
    return (
      <g transform="translate(2,5) scale(0.5)">
        {one ? <line x1={0} x2={16} y1={20} y2={20} style={w} /> : <><line x1={0} x2={14} y1={10} y2={10} style={w} /><line x1={0} x2={14} y1={30} y2={30} style={w} /></>}
        <line x1={68} x2={80} y1={20} y2={20} style={w} />
        <path d={g.body} style={w} />
        {g.extra && <path d={g.extra} style={w} />}
        {g.bubble && <circle cx={g.bubble.x} cy={g.bubble.y} r={4.5} style={w} />}
      </g>
    );
  }
  switch (t) {
    case 'switch':
      return (<><rect x={5} y={8} width={26} height={14} rx={7} style={{ ...S, fill: 'var(--sig-on)', stroke: 'var(--sig-on)' }} /><circle cx={24} cy={15} r={4.5} fill="#fff" /><line x1={31} x2={41} y1={15} y2={15} style={S} /></>);
    case 'button':
      return (<><rect x={7} y={5} width={20} height={20} rx={5} style={S} /><circle cx={17} cy={15} r={5.5} style={{ ...S, fill: 'currentColor', fillOpacity: 0.2 }} /><line x1={27} x2={40} y1={15} y2={15} style={S} /></>);
    case 'const1':
    case 'const0':
      return (<><rect x={9} y={6} width={18} height={18} rx={3} style={S} /><text x={18} y={15} dy="0.36em" textAnchor="middle" fontSize={12} fontWeight={700} fill="currentColor">{t === 'const1' ? '1' : '0'}</text><line x1={27} x2={38} y1={15} y2={15} style={S} /></>);
    case 'bulb':
      return (<><line x1={4} x2={15} y1={15} y2={15} style={S} /><circle cx={26} cy={15} r={10} style={{ ...S, fill: 'var(--bulb-on)', stroke: 'var(--bulb-on)' }} /><path d="M21 18 L23.5 12 L26 18 L28.5 12 L31 18" style={{ ...S, stroke: 'rgba(0,0,0,.4)', strokeWidth: 1.1 }} /></>);
    default:
      return (<><line x1={4} x2={15} y1={15} y2={15} style={S} /><rect x={15} y={4} width={22} height={22} rx={4} style={S} /><text x={26} y={15} dy="0.36em" textAnchor="middle" fontSize={13} fontWeight={700} fill="currentColor">1</text></>);
  }
}
