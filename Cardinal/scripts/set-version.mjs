// Keeps every copy of the app version equal.
//   node scripts/set-version.mjs 0.2.0   → writes the version everywhere
//   node scripts/set-version.mjs --check → fails if any copy differs (used by the release workflow)
// Copies: .claude/project/data/meta.js, src/version.ts, package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(app, '..');

const files = {
  meta: path.join(repo, '.claude/project/data/meta.js'),
  versionTs: path.join(app, 'src/version.ts'),
  pkg: path.join(app, 'package.json'),
  tauri: path.join(app, 'src-tauri/tauri.conf.json'),
  cargo: path.join(app, 'src-tauri/Cargo.toml'),
};

const read = (f) => fs.readFileSync(f, 'utf8');
const metaJson = (src) => JSON.parse(src.slice(src.indexOf('/*DATA*/') + 8, src.lastIndexOf('/*END*/')));

export function currentVersions() {
  return {
    meta: metaJson(read(files.meta)).version,
    versionTs: read(files.versionTs).match(/APP_VERSION = '([^']+)'/)?.[1],
    pkg: JSON.parse(read(files.pkg)).version,
    tauri: JSON.parse(read(files.tauri)).version,
    cargo: read(files.cargo).match(/^version = "([^"]+)"/m)?.[1],
  };
}

function write(v) {
  const metaSrc = read(files.meta);
  const a = metaSrc.indexOf('/*DATA*/') + 8, b = metaSrc.lastIndexOf('/*END*/');
  const meta = metaJson(metaSrc);
  meta.version = v;
  fs.writeFileSync(files.meta, metaSrc.slice(0, a) + '\n' + JSON.stringify(meta, null, 2) + '\n' + metaSrc.slice(b));
  fs.writeFileSync(files.versionTs, read(files.versionTs).replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${v}'`));
  for (const f of [files.pkg, files.tauri]) {
    const j = JSON.parse(read(f));
    j.version = v;
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
  }
  fs.writeFileSync(files.cargo, read(files.cargo).replace(/^version = "[^"]+"/m, `version = "${v}"`));
}

const arg = process.argv[2];
if (arg === '--check') {
  const v = currentVersions();
  const distinct = new Set(Object.values(v));
  console.log(v);
  if (distinct.size !== 1) { console.error('Version copies differ — run: node scripts/set-version.mjs <version>'); process.exit(1); }
  const tag = process.argv[3]?.replace(/^v/, '');
  if (tag && tag !== v.pkg) { console.error(`Tag v${tag} does not match the app version ${v.pkg}`); process.exit(1); }
} else if (arg && /^\d+\.\d+\.\d+$/.test(arg)) {
  write(arg);
  console.log('Version set to', arg, currentVersions());
} else if (arg !== undefined || process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Usage: node scripts/set-version.mjs <x.y.z> | --check [tag]');
  process.exit(1);
}
