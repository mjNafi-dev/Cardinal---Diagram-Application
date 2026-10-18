import { create } from 'zustand';
import { emptyDoc, uid, type DiagramFile, type DiagramMeta, type Doc, type Notation, type Project } from '../model/types';
import { getBackend } from './backend';
import { usePrefs } from './prefs';
import { nodeRect } from '../geometry/geometry';
import { Router } from '../routing/router';
import { makeThumb } from '../diagram/thumb';

function thumbOf(doc: Doc): string | undefined {
  if (!doc.nodes.length) return undefined;
  try {
    const prefs = usePrefs.getState().prefs;
    const rects = new Map(doc.nodes.map((n) => [n.id, nodeRect(n, prefs)]));
    return makeThumb(doc, rects, new Router().route({ doc, rects, prefs }));
  } catch {
    return undefined;
  }
}

interface LibraryState {
  loaded: boolean;
  projects: Project[];
  diagrams: DiagramMeta[];
  refresh(): Promise<void>;
  createProject(name: string): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;
  createDiagram(projectId: string, name: string, notation: Notation, doc?: Doc): Promise<DiagramMeta>;
  renameDiagram(id: string, name: string): Promise<void>;
  duplicateDiagram(id: string): Promise<DiagramMeta | null>;
  deleteDiagram(id: string): Promise<void>;
  loadDiagram(id: string): Promise<DiagramFile | null>;
  saveDiagram(file: DiagramFile): Promise<void>;
}

const thumbTried = new Set<string>();
const byUpdated = <T extends { updatedAt: number }>(a: T, b: T) => b.updatedAt - a.updatedAt;

export const useLibrary = create<LibraryState>((set, get) => ({
  loaded: false,
  projects: [],
  diagrams: [],

  async refresh() {
    const be = getBackend();
    const [p, d] = await Promise.all([be.list('projects'), be.list('diagrams')]);
    set({
      loaded: true,
      projects: p.map((x) => ({ ...x.meta, id: x.id }) as Project).sort(byUpdated),
      diagrams: d.map((x) => ({ ...x.meta, id: x.id }) as DiagramMeta).sort(byUpdated),
    });
    // diagrams that never got a preview (imported, made from SQL, or saved by an older version) get one now, quietly
    const missing = get().diagrams.filter((x) => !x.thumb && !thumbTried.has(x.id));
    if (missing.length) void (async () => {
      for (const m of missing) {
        thumbTried.add(m.id);
        try {
          const file = await be.get<DiagramFile>('diagrams', m.id);
          const thumb = file?.doc ? thumbOf(file.doc) : undefined;
          if (!file || !thumb) continue;
          await be.put('diagrams', m.id, { ...file, meta: { ...file.meta, thumb } });
          set({ diagrams: get().diagrams.map((x) => (x.id === m.id ? { ...x, thumb } : x)) });
        } catch { /* keep the placeholder */ }
      }
    })();
  },

  async createProject(name) {
    const now = Date.now();
    const p: Project = { id: uid('p'), name: name.trim() || 'Untitled project', createdAt: now, updatedAt: now };
    await getBackend().put('projects', p.id, p);
    set({ projects: [p, ...get().projects] });
    return p;
  },

  async updateProject(id, patch) {
    const p = get().projects.find((x) => x.id === id);
    if (!p) return;
    const next = { ...p, ...patch, updatedAt: Date.now() };
    await getBackend().put('projects', id, next);
    set({ projects: get().projects.map((x) => (x.id === id ? next : x)).sort(byUpdated) });
  },

  async deleteProject(id) {
    const be = getBackend();
    for (const d of get().diagrams.filter((x) => x.projectId === id)) await be.del('diagrams', d.id);
    await be.del('projects', id);
    set({ projects: get().projects.filter((x) => x.id !== id), diagrams: get().diagrams.filter((x) => x.projectId !== id) });
  },

  async createDiagram(projectId, name, notation, doc) {
    const now = Date.now();
    const meta: DiagramMeta = { id: uid('d'), projectId, name: name.trim() || 'Untitled diagram', notation, createdAt: now, updatedAt: now, thumb: doc ? thumbOf(doc) : undefined };
    if (doc?.mode === 'circuit') meta.mode = 'circuit';
    await getBackend().put('diagrams', meta.id, { meta, doc: doc ?? emptyDoc(notation) } satisfies DiagramFile);
    set({ diagrams: [meta, ...get().diagrams] });
    get().updateProject(projectId, {});
    return meta;
  },

  async renameDiagram(id, name) {
    const file = await get().loadDiagram(id);
    if (!file) return;
    file.meta = { ...file.meta, name: name.trim() || file.meta.name, updatedAt: Date.now() };
    await get().saveDiagram(file);
  },

  async duplicateDiagram(id) {
    const file = await get().loadDiagram(id);
    if (!file) return null;
    const m = await get().createDiagram(file.meta.projectId, file.meta.name + ' copy', file.meta.notation, file.doc);
    return m;
  },

  async deleteDiagram(id) {
    await getBackend().del('diagrams', id);
    set({ diagrams: get().diagrams.filter((x) => x.id !== id) });
  },

  async loadDiagram(id) {
    return getBackend().get<DiagramFile>('diagrams', id);
  },

  async saveDiagram(file) {
    await getBackend().put('diagrams', file.meta.id, file);
    const others = get().diagrams.filter((x) => x.id !== file.meta.id);
    set({ diagrams: [file.meta, ...others].sort(byUpdated) });
  },
}));
