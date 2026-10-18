// Prints GitHub release notes (markdown) for one version, taken from .claude/project/data/versions.js.
//   node scripts/release-notes.mjs 0.2.0 > notes.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = fs.readFileSync(path.join(repo, '.claude/project/data/versions.js'), 'utf8');
const data = JSON.parse(src.slice(src.indexOf('/*DATA*/') + 8, src.lastIndexOf('/*END*/')));

const want = (process.argv[2] || '').replace(/^v/, '');
const entry = data.versions.find((v) => v.version === want);
if (!entry) {
  console.error(`No version ${want} in versions.js. Promote the pending list first ("build").`);
  process.exit(1);
}

const lines = [
  `## What's new in Cardinal ${entry.version}`,
  '',
  ...entry.items.map((it) => `- ${it.text}`),
  '',
  '## Download',
  '',
  '| | File |',
  '|---|---|',
  '| **Windows** 10/11 | `Cardinal-Windows-Setup.exe` |',
  '| **macOS** 10.15+ (Intel and Apple Silicon) | `Cardinal-macOS.dmg` |',
  '',
  "Cardinal isn't code-signed (that costs money every year), so your computer will warn you the first time:",
  '',
  '- **Windows:** SmartScreen says "Windows protected your PC" → click **More info** → **Run anyway**.',
  '- **Mac:** open the .dmg, drag Cardinal to Applications, open it once (it gets blocked) → **System Settings → Privacy & Security** → scroll down → **Open Anyway**.',
  '',
  'Your projects live in `Documents/Cardinal` and never leave your computer.',
];
console.log(lines.join('\n'));
