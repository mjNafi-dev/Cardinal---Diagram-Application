import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { jsPDF } from 'jspdf';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '../store/backend';
import { toast } from '../ui/toast';
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import mono400Url from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import mono700Url from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?url';
import { DiagramContent } from '../diagram/DiagramContent';
import { layoutRef } from '../diagram/layout';
import { FONT_STACKS, type Prefs } from '../model/prefs';
import { PALETTE, PALETTE_KEYS } from '../model/palette';
import { THEMES, resolveVars, type ThemeName } from '../theme/tokens';
import { unionRects } from '../geometry/geometry';
import { generateSql, type Dialect } from '../sql/sql';
import type { DiagramFile, Doc, Rect } from '../model/types';

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'sql' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  background: 'light' | 'dark' | 'transparent';
  scale: number;
  selectionOnly: boolean;
  dialect: Dialect;
}

const fontCache = new Map<string, string>();
async function fontData(url: string): Promise<string> {
  const hit = fontCache.get(url);
  if (hit) return hit;
  const buf = await (await fetch(url)).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const data = `data:font/woff2;base64,${btoa(bin)}`;
  fontCache.set(url, data);
  return data;
}

async function fontFaces(prefs: Prefs): Promise<string> {
  if (prefs.text.font === 'inter') return `@font-face{font-family:'Inter Variable';font-weight:100 900;src:url(${await fontData(interUrl)}) format('woff2');}`;
  if (prefs.text.font === 'mono')
    return `@font-face{font-family:'JetBrains Mono';font-weight:400;src:url(${await fontData(mono400Url)}) format('woff2');}@font-face{font-family:'JetBrains Mono';font-weight:700;src:url(${await fontData(mono700Url)}) format('woff2');}`;
  return '';
}

function paletteMap(theme: ThemeName): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PALETTE_KEYS) {
    out[`--pal-${k}-fill`] = PALETTE[k][theme].fill;
    out[`--pal-${k}-line`] = PALETTE[k][theme].line;
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Self-contained SVG of the diagram (all colors resolved, font embedded). */
export async function buildSvg(doc: Doc, prefs: Prefs, opts: Pick<ExportOptions, 'background' | 'selectionOnly'>, selection: string[]): Promise<{ svg: string; w: number; h: number } | null> {
  const lay = layoutRef.current;
  if (!lay) return null;
  let only: Set<string> | undefined;
  if (opts.selectionOnly && selection.length) {
    only = new Set(selection);
    for (const e of doc.edges) if (e.source.node && e.target.node && only.has(e.source.node) && only.has(e.target.node)) only.add(e.id);
  }
  const rects: Rect[] = [];
  for (const n of doc.nodes) if ((!only || only.has(n.id)) && n.kind !== 'comment') rects.push(lay.rects.get(n.id)!);
  for (const e of doc.edges) {
    if (only && !only.has(e.id)) continue;
    const rt = lay.routes.get(e.id);
    if (rt) for (const p of rt.points) rects.push({ x: p.x - 12, y: p.y - 12, w: 24, h: 24 });
  }
  const box = unionRects(rects.filter(Boolean));
  if (!box) return null;
  const pad = 28;
  const x = Math.floor(box.x - pad), y = Math.floor(box.y - pad);
  const w = Math.ceil(box.w + pad * 2), h = Math.ceil(box.h + pad * 2);
  const theme: ThemeName = opts.background === 'dark' ? 'dark' : 'light';

  const body = renderToStaticMarkup(createElement(DiagramContent, { doc, rects: lay.rects, routes: lay.routes, prefs, only }));
  const bg = opts.background === 'transparent' ? '' : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--canvas)"/>`;
  const style = `<style>${await fontFaces(prefs)}</style>`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${style}${bg}${body}</svg>`;
  svg = resolveVars(svg, theme, { '--diagram-font': FONT_STACKS[prefs.text.font].css.replace(/"/g, "'") }, paletteMap(theme));
  // canvas color is used for marker cut-outs; on transparent exports use the light canvas
  void THEMES;
  return { svg, w, h };
}

async function svgToPng(svg: string, w: number, h: number, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    img.src = url;
    await img.decode();
    await new Promise((r) => setTimeout(r, 60)); // let the embedded font settle
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Saves a file: a native "Save as" dialog in the desktop app, a normal download in the browser. False if cancelled. */
export async function download(blob: Blob, filename: string): Promise<boolean> {
  if (isDesktop()) {
    const saved = await invoke<string | null>('save_file', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-file-name': encodeURIComponent(filename) } });
    if (saved) toast(`Saved ${saved}`);
    return !!saved;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'diagram';

export async function runExport(file: DiagramFile, prefs: Prefs, opts: ExportOptions, selection: string[]): Promise<boolean> {
  const name = safeName(file.meta.name);
  if (opts.format === 'json') {
    return download(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${name}.cardinal.json`);
  }
  if (opts.format === 'sql') {
    return download(new Blob([generateSql(file.doc, opts.dialect)], { type: 'text/plain' }), `${name}.sql`);
  }
  const built = await buildSvg(file.doc, prefs, opts, selection);
  if (!built) throw new Error('Nothing to export yet');
  if (opts.format === 'svg') return download(new Blob([built.svg], { type: 'image/svg+xml' }), `${name}.svg`);
  const png = await svgToPng(built.svg, built.w, built.h, opts.format === 'pdf' ? Math.max(2, opts.scale) : opts.scale);
  if (opts.format === 'png') return download(png, `${name}.png`);
  const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(png); });
  const pdf = new jsPDF({ orientation: built.w >= built.h ? 'landscape' : 'portrait', unit: 'pt', format: [built.w, built.h] });
  pdf.addImage(dataUrl, 'PNG', 0, 0, built.w, built.h);
  return download(pdf.output('blob'), `${name}.pdf`);
}

export { esc };
