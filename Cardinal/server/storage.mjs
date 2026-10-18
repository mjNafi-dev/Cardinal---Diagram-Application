// Cardinal local storage API.
// Every document is a real JSON file under the data folder (default: Documents\Cardinal),
// so projects survive browser data being cleared and can be backed up by copying the folder.
//
//   GET    /api/ping                      -> { ok, dataDir }
//   GET    /api/store/:collection         -> [ { id, meta } ]   (meta = file.meta || whole file)
//   GET    /api/store/:collection/:id     -> file contents
//   PUT    /api/store/:collection/:id     -> writes file (atomic: tmp + rename)
//   DELETE /api/store/:collection/:id     -> moves file to .trash (never hard-deletes)
//   POST   /api/open-folder               -> opens the data folder in Explorer
//   GET    /api/usage                     -> { bytes, trashBytes } disk space used by the data folder

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';

const COLLECTIONS = new Set(['projects', 'diagrams', 'settings']);
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

function documentsDir() {
  // Documents may be redirected (e.g. into OneDrive) — ask Windows where it really is.
  if (process.platform === 'win32') {
    try {
      const out = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v Personal',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      const m = out.match(/Personal\s+REG_\w+\s+(.+)/);
      if (m) {
        const p = m[1].trim().replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? '');
        if (p && fs.existsSync(p)) return p;
      }
    } catch {}
  }
  const d = path.join(os.homedir(), 'Documents');
  return fs.existsSync(d) ? d : os.homedir();
}

export function resolveDataDir() {
  return process.env.CARDINAL_DATA || path.join(documentsDir(), 'Cardinal');
}

function dirSize(p) {
  let total = 0;
  for (const e of fs.existsSync(p) ? fs.readdirSync(p, { withFileTypes: true }) : []) {
    const f = path.join(p, e.name);
    try { total += e.isDirectory() ? dirSize(f) : fs.statSync(f).size; } catch {}
  }
  return total;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 50 * 1024 * 1024) reject(new Error('Body too large'));
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createStorageMiddleware(dataDir = resolveDataDir()) {
  for (const c of COLLECTIONS) fs.mkdirSync(path.join(dataDir, c), { recursive: true });

  return async function storage(req, res, next) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return next();
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

    try {
      if (parts[1] === 'ping') return send(res, 200, { ok: true, dataDir });
      if (parts[1] === 'usage') return send(res, 200, { bytes: dirSize(dataDir), trashBytes: dirSize(path.join(dataDir, '.trash')) });

      if (parts[1] === 'open-folder' && req.method === 'POST') {
        if (process.platform === 'win32') spawn('explorer.exe', [dataDir], { detached: true, stdio: 'ignore' }).unref();
        return send(res, 200, { ok: true });
      }

      if (parts[1] !== 'store') return send(res, 404, { error: 'Unknown endpoint' });
      const collection = parts[2];
      const id = parts[3];
      if (!COLLECTIONS.has(collection)) return send(res, 400, { error: 'Unknown collection' });
      const dir = path.join(dataDir, collection);

      if (!id) {
        if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
        const out = [];
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith('.json')) continue;
          try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            out.push({ id: f.slice(0, -5), meta: data.meta ?? data });
          } catch {}
        }
        return send(res, 200, out);
      }

      if (!ID_RE.test(id)) return send(res, 400, { error: 'Bad id' });
      const file = path.join(dir, id + '.json');

      if (req.method === 'GET') {
        if (!fs.existsSync(file)) return send(res, 404, { error: 'Not found' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.end(fs.readFileSync(file, 'utf8'));
      }

      if (req.method === 'PUT') {
        const body = await readBody(req);
        JSON.parse(body); // validate before touching the disk
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, body, 'utf8');
        fs.renameSync(tmp, file);
        return send(res, 200, { ok: true });
      }

      if (req.method === 'DELETE') {
        if (fs.existsSync(file)) {
          const trash = path.join(dataDir, '.trash', collection);
          fs.mkdirSync(trash, { recursive: true });
          fs.renameSync(file, path.join(trash, `${id}.${Date.now()}.json`));
        }
        return send(res, 200, { ok: true });
      }

      return send(res, 405, { error: 'Method not allowed' });
    } catch (e) {
      return send(res, 500, { error: String(e?.message ?? e) });
    }
  };
}
