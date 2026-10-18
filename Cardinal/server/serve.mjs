// Production server: serves the built app (dist/) plus the storage API on a fixed port.
// Usage: node server/serve.mjs [--open]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createStorageMiddleware, resolveDataDir } from './storage.mjs';

const PORT = Number(process.env.CARDINAL_PORT || 5178);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const storage = createStorageMiddleware();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
  if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(file).pipe(res);
}

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('dist/ is missing — run "npm run build" first (build.bat does this).');
  process.exit(1);
}

const server = http.createServer((req, res) => storage(req, res, () => serveStatic(req, res)));

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Cardinal is already running at http://localhost:${PORT}`);
    if (process.argv.includes('--open')) openBrowser();
    process.exit(0);
  }
  throw e;
});

function openBrowser() {
  const url = `http://localhost:${PORT}`;
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Cardinal running at http://localhost:${PORT}`);
  console.log(`Projects are saved in ${resolveDataDir()}`);
  console.log('Keep this window open while you use Cardinal. Close it to stop.');
  if (process.argv.includes('--open')) openBrowser();
});
