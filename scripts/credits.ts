/**
 * npm run credits -- [--project <id>]
 * Writes output/<id>-credits.txt: attribution lines for the video description,
 * built only from assets.json and the narration manifest (never invented).
 */
import fs from 'node:fs';
import path from 'node:path';
import {SCENES} from '../src/scenes/registry';
import {loadProject, parseArgs, pickProject, rel} from './lib/project';
import {IMAGERY_CREDIT_LINE, usesImagery} from './lib/imagery';
import {TERRAIN_CREDIT, usesTerrain} from './lib/terrain';

const args = parseArgs();
const p = loadProject(pickProject(args.str('project')));
const required: string[] = [];
const courtesy: string[] = [];

// Only assets that actually appear in the video (the resolved storyboard includes sounds implied by animations).
const used = new Set<string>();
for (const s of p.storyboard.scenes) {
  for (const ref of SCENES[s.type]?.assetRefs?.(s.data) ?? []) used.add(ref.replace(/^asset:/, ''));
  for (const fx of s.sfx ?? []) used.add(fx.asset.replace(/^asset:/, ''));
}
if (p.audio.music) used.add(p.audio.music);

for (const [id, a] of Object.entries(p.assets)) {
  if (a.type === 'font' || !used.has(id)) continue;
  const line = a.credit ?? `${id}: ${a.author ? `${a.author}, ` : ''}${a.license} — ${a.source}`;
  if (/generated in this repository/i.test(a.license)) continue;
  (a.attributionRequired ? required : courtesy).push(`${line}${a.source.startsWith('http') ? `\n  ${a.source}` : ''}`);
}
if (p.narration?.attribution) required.push(`Narration: ${p.narration.attribution}`);
if (usesTerrain(p)) required.push(TERRAIN_CREDIT);
if (usesImagery(p)) required.push(IMAGERY_CREDIT_LINE);

const text = [
  `Credits — ${p.config.title}`,
  '',
  ...(required.length ? ['Required attribution:', ...required.map((l) => `- ${l}`), ''] : []),
  ...(courtesy.length ? ['Also used (attribution not required, given as courtesy):', ...courtesy.map((l) => `- ${l}`), ''] : []),
  ...(!required.length && !courtesy.length ? ['No third-party assets.'] : []),
].join('\n');

const out = path.join(p.dir, 'output', `${p.id}-credits.txt`);
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, text);
console.log(text);
console.log(`\nwrote ${rel(out)}`);
