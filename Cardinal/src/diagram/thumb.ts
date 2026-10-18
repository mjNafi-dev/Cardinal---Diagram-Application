import type { Doc, Rect } from '../model/types';
import type { RoutedEdge } from '../routing/router';
import { isDiamond, isEllipse, unionRects } from '../geometry/geometry';
import { basicShape } from '../model/basicShapes';
import { gatePaths, isGate, type GateType } from '../model/logic';

/** Tiny line-only preview for the project library cards (no text, ~1–4 KB). */
export function makeThumb(doc: Doc, rects: Map<string, Rect>, routes: Map<string, RoutedEdge>): string {
  const box = unionRects([...rects.values()]);
  if (!box) return '';
  const pad = 30;
  const vb = `${Math.round(box.x - pad)} ${Math.round(box.y - pad)} ${Math.round(box.w + pad * 2)} ${Math.round(box.h + pad * 2)}`;
  const sw = Math.max(1.5, Math.max(box.w, box.h) / 220);
  const r = (n: number) => Math.round(n);
  let body = '';
  for (const e of doc.edges) {
    const rt = routes.get(e.id);
    if (rt) body += `<path d="${rt.d}" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="${sw}"/>`;
  }
  for (const n of doc.nodes) {
    const b = rects.get(n.id);
    if (!b) continue;
    const common = `fill="var(--shape-fill)" stroke="currentColor" stroke-width="${sw}"`;
    if (isEllipse(n.kind) || n.kind === 'specialization') body += `<ellipse cx="${r(b.x + b.w / 2)}" cy="${r(b.y + b.h / 2)}" rx="${r(b.w / 2)}" ry="${r(b.h / 2)}" ${common}/>`;
    else if (isDiamond(n.kind)) body += `<path d="M${r(b.x + b.w / 2)},${r(b.y)}L${r(b.x + b.w)},${r(b.y + b.h / 2)}L${r(b.x + b.w / 2)},${r(b.y + b.h)}L${r(b.x)},${r(b.y + b.h / 2)}Z" ${common}/>`;
    else if (n.kind === 'shape') body += `<path d="${basicShape(n.shape).path(b)}" fill="${basicShape(n.shape).open ? 'none' : 'var(--shape-fill)'}" stroke="currentColor" stroke-width="${sw}"/>`;
    else if (n.kind === 'text' || n.kind === 'comment') continue;
    else if (n.kind === 'logic' && isGate(n.logic)) body += `<path d="${gatePaths(n.logic as GateType, b).body}" ${common}/>`;
    else if (n.kind === 'logic') body += `<rect x="${r(b.x + 8)}" y="${r(b.y + 6)}" width="${r(b.w - 16)}" height="${r(b.h - 12)}" rx="8" ${common}/>`;
    else if (n.kind === 'drawing' && n.points) body += `<path d="${n.points.map((p, i) => (i ? 'L' : 'M') + r(b.x + p[0] * b.w / (n.nw || 1)) + ',' + r(b.y + p[1] * b.h / (n.nh || 1))).join('')}" fill="none" stroke="currentColor" stroke-width="${sw}"/>`;
    else {
      body += `<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${r(b.h)}" rx="6" ${common}/>`;
      if (n.kind === 'table') body += `<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${r(Math.min(34, b.h))}" rx="6" fill="currentColor" fill-opacity=".14"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}
