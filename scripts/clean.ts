/**
 * npm run clean -- [--project <id>]
 * Removes regenerable files only: previews and build caches.
 * Never touches output/ (final renders), assets, audio or project files.
 */
import fs from 'node:fs';
import path from 'node:path';
import {listProjects, parseArgs, projectDir, rel, ROOT} from './lib/project';

const args = parseArgs();
const ids = args.str('project') ? [args.str('project')!] : listProjects();
const targets = [
  ...ids.map((id) => path.join(projectDir(id), 'previews')),
  path.join(ROOT, 'node_modules', '.cache'),
];

for (const t of targets) {
  if (!fs.existsSync(t)) continue;
  if (t.endsWith('previews')) {
    for (const e of fs.readdirSync(t)) fs.rmSync(path.join(t, e), {recursive: true, force: true});
  } else {
    fs.rmSync(t, {recursive: true, force: true});
  }
  console.log(`cleaned ${rel(t)}`);
}
