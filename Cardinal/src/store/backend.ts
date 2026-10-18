/**
 * Storage backends.
 *  - files:   real JSON files in Documents\Cardinal, written by the desktop app (Tauri)
 *             or by the local Node server when Cardinal runs in a browser
 *  - browser: IndexedDB fallback, only used if neither is there
 */
import { invoke } from '@tauri-apps/api/core';

export type Collection = 'projects' | 'diagrams' | 'settings';

export interface Backend {
  kind: 'files' | 'browser';
  dataDir?: string;
  list(col: Collection): Promise<{ id: string; meta: any }[]>;
  get<T = any>(col: Collection, id: string): Promise<T | null>;
  put(col: Collection, id: string, data: unknown): Promise<void>;
  del(col: Collection, id: string): Promise<void>;
  openFolder?(): Promise<void>;
  /** Disk space used, in bytes (trashBytes: how much of it is in .trash). */
  usage(): Promise<{ bytes: number; trashBytes?: number }>;
}

class FileBackend implements Backend {
  kind = 'files' as const;
  constructor(public dataDir: string) {}
  async list(col: Collection) {
    const r = await fetch(`/api/store/${col}`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  async get(col: Collection, id: string) {
    const r = await fetch(`/api/store/${col}/${id}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  async put(col: Collection, id: string, data: unknown) {
    const r = await fetch(`/api/store/${col}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error(await r.text());
  }
  async del(col: Collection, id: string) {
    const r = await fetch(`/api/store/${col}/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(await r.text());
  }
  async openFolder() {
    await fetch('/api/open-folder', { method: 'POST' });
  }
  async usage() {
    return (await fetch('/api/usage')).json();
  }
}

/** True inside the desktop app. */
export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Same files and layout as FileBackend, but read and written by the desktop app itself (src-tauri/src/storage.rs). */
class TauriBackend implements Backend {
  kind = 'files' as const;
  constructor(public dataDir: string) {}
  list(col: Collection) {
    return invoke<{ id: string; meta: any }[]>('store_list', { col });
  }
  async get(col: Collection, id: string) {
    const text = await invoke<string | null>('store_get', { col, id });
    return text == null ? null : JSON.parse(text);
  }
  async put(col: Collection, id: string, data: unknown) {
    await invoke('store_put', { col, id, body: JSON.stringify(data) });
  }
  async del(col: Collection, id: string) {
    await invoke('store_del', { col, id });
  }
  async openFolder() {
    await invoke('open_data_folder');
  }
  usage() {
    return invoke<{ bytes: number; trashBytes: number }>('store_usage');
  }
}

class BrowserBackend implements Backend {
  kind = 'browser' as const;
  private db: Promise<IDBDatabase>;
  constructor() {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open('cardinal', 1);
      req.onupgradeneeded = () => {
        for (const c of ['projects', 'diagrams', 'settings']) req.result.createObjectStore(c);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(col: Collection, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(col, mode).objectStore(col));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async list(col: Collection) {
    const db = await this.db;
    return new Promise<{ id: string; meta: any }[]>((resolve, reject) => {
      const out: { id: string; meta: any }[] = [];
      const req = db.transaction(col).objectStore(col).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        out.push({ id: String(c.key), meta: (c.value as any)?.meta ?? c.value });
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }
  async get(col: Collection, id: string) {
    return ((await this.tx(col, 'readonly', (s) => s.get(id))) as any) ?? null;
  }
  async put(col: Collection, id: string, data: unknown) {
    await this.tx(col, 'readwrite', (s) => s.put(structuredClone(data), id));
  }
  async del(col: Collection, id: string) {
    await this.tx(col, 'readwrite', (s) => s.delete(id));
  }
  async usage() {
    return { bytes: (await navigator.storage?.estimate?.())?.usage ?? 0 };
  }
}

let backend: Backend | null = null;

export async function initBackend(): Promise<Backend> {
  if (backend) return backend;
  if (isDesktop()) {
    try {
      const j = await invoke<{ dataDir: string }>('store_ping');
      backend = new TauriBackend(j.dataDir);
      return backend;
    } catch {}
  }
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2000);
    const r = await fetch('/api/ping', { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      backend = new FileBackend(j.dataDir);
      return backend;
    }
  } catch {}
  backend = new BrowserBackend();
  return backend;
}

export const getBackend = () => {
  if (!backend) throw new Error('Backend not initialised');
  return backend;
};
