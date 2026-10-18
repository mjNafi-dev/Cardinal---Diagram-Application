import dagre from '@dagrejs/dagre';
import type { Doc, Pt, Rect } from '../model/types';
import { isEllipse } from '../geometry/geometry';

/**
 * Auto-arrange: layered layout (parents → children, left to right) for the main shapes.
 * Chen attributes are kept orbiting their entity, so they move along with it.
 */
export function tidyPositions(doc: Doc, rects: Map<string, Rect>, gridSize = 10): Map<string, Pt> {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  // attribute → owner (first non-attribute neighbour)
  const owner = new Map<string, string>();
  for (const e of doc.edges) {
    const a = e.source.node, b = e.target.node;
    if (!a || !b) continue;
    const na = byId.get(a), nb = byId.get(b);
    if (!na || !nb) continue;
    if (isEllipse(na.kind) && !isEllipse(nb.kind) && !owner.has(a)) owner.set(a, b);
    if (isEllipse(nb.kind) && !isEllipse(na.kind) && !owner.has(b)) owner.set(b, a);
  }
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 120, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  // grow each main node's box to include its attributes so they don't collide
  const extent = new Map<string, Rect>();
  // free-form things (notes, pen strokes, comments, images, containers) keep their place
  const FREE = new Set(['text', 'note', 'comment', 'drawing', 'image', 'shape']);
  for (const n of doc.nodes) {
    if (owner.has(n.id) || FREE.has(n.kind)) continue;
    extent.set(n.id, { ...rects.get(n.id)! });
  }
  for (const [attr, own] of owner) {
    const r = rects.get(attr)!, o = extent.get(own);
    if (!o) continue;
    const x1 = Math.min(o.x, r.x), y1 = Math.min(o.y, r.y);
    const x2 = Math.max(o.x + o.w, r.x + r.w), y2 = Math.max(o.y + o.h, r.y + r.h);
    extent.set(own, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  }
  for (const [id, r] of extent) g.setNode(id, { width: r.w, height: r.h });
  doc.edges.forEach((e, i) => {
    const a = e.source.node, b = e.target.node;
    if (!a || !b || a === b || owner.has(a) || owner.has(b) || !extent.has(a) || !extent.has(b)) return;
    g.setEdge(a, b, {}, 'e' + i);
  });
  dagre.layout(g);
  const snap = (v: number) => Math.round(v / gridSize) * gridSize;
  const out = new Map<string, Pt>();
  for (const [id, ext] of extent) {
    const node = g.node(id);
    if (!node) continue;
    const r = rects.get(id)!;
    const nx = node.x - ext.w / 2, ny = node.y - ext.h / 2;
    const dx = snap(nx - ext.x), dy = snap(ny - ext.y);
    out.set(id, { x: r.x + dx, y: r.y + dy });
    for (const [attr, own] of owner) if (own === id) { const ar = rects.get(attr)!; out.set(attr, { x: ar.x + dx, y: ar.y + dy }); }
  }
  return out;
}
