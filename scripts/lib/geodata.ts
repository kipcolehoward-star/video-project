/**
 * Copies the geo data a project actually uses into <project>/geo/ before
 * bundling (the project folder is Remotion's public dir):
 *   - layers named in atlas scenes (data/geo/*.json)
 *   - countries-10m when a camera zooms in close (or detail: "10m")
 *   - flag SVGs referenced by flagMasks / flagBadges (node_modules/flag-icons)
 * Throws with a clear message when data or a flag is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {AtlasData} from '../../src/scenes/AtlasScene';
import {ROOT, type LoadedProject} from './project';

const DATA = path.join(ROOT, 'data', 'geo');
const FLAGS = path.join(ROOT, 'node_modules', 'flag-icons', 'flags');

const layerSrc = (l: string) => (l === 'raster:bluemarble' ? path.join(DATA, 'raster', 'bluemarble-3600.jpg') : path.join(DATA, `${l}.json`));

export function geoNeeds(p: LoadedProject) {
  const layers = new Set<string>();
  const flags = new Set<string>(); // "4x3/ls", "1x1/ls"
  for (const s of p.rawStoryboard.scenes) {
    if (s.type !== 'atlas') continue;
    const d = s.data as AtlasData;
    if (d.background) continue;
    for (const l of d.layers ?? []) layers.add(l);
    // Portrait renders may zoom further (portraitZoom), so plan data for the larger zoom.
    const maxZoom = Math.max(...(d.camera ?? [{zoom: 1}]).map((k) => k.zoom)) * Math.max(1, d.portraitZoom ?? 1);
    if (d.detail === '10m' || (d.detail !== '50m' && maxZoom >= 7)) layers.add('countries-10m');
    if (d.basemap === 'satellite') layers.add('raster:bluemarble');
    if (d.paleo) {
      layers.add(`paleo/${d.paleo.model}`);
      if (d.paleo.boundaries) layers.add(`paleo/${d.paleo.model}-boundaries`);
    }
    for (const m of d.flagMasks ?? []) flags.add(`4x3/${m.iso.toLowerCase()}`);
    for (const b of d.flagBadges ?? []) flags.add(`1x1/${b.iso.toLowerCase()}`);
    for (const r of d.routes ?? []) for (const iso of [r.fromFlag, r.toFlag]) if (iso) flags.add(`1x1/${iso.toLowerCase()}`);
  }
  return {layers, flags};
}

/** Problems that would make a render fail (missing data or unknown flag codes). */
export function geoProblems(p: LoadedProject): string[] {
  const {layers, flags} = geoNeeds(p);
  const out: string[] = [];
  for (const l of layers) if (!fs.existsSync(layerSrc(l))) out.push(`map layer "${l}" missing — run ${l.startsWith('paleo/') ? 'npm run paleo:setup' : 'npm run geo:setup'}`);
  for (const f of flags) if (!fs.existsSync(path.join(FLAGS, `${f}.svg`))) out.push(`flag "${f.split('/')[1]}" not found in flag-icons (use ISO 3166-1 alpha-2, e.g. "ls", "za")`);
  return out;
}

export function ensureGeoData(p: LoadedProject) {
  const {layers, flags} = geoNeeds(p);
  if (!layers.size && !flags.size) return;
  const problems = geoProblems(p);
  if (problems.length) throw new Error(`Geo data:\n  ${problems.join('\n  ')}`);
  const out = path.join(p.dir, 'geo');
  for (const l of layers) {
    const src = layerSrc(l);
    const dst = l === 'raster:bluemarble' ? path.join(out, 'bluemarble.jpg') : path.join(out, `${l}.json`);
    fs.mkdirSync(path.dirname(dst), {recursive: true});
    if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(src).mtimeMs) fs.copyFileSync(src, dst);
  }
  for (const f of flags) {
    const dst = path.join(out, 'flags', `${f}.svg`);
    fs.mkdirSync(path.dirname(dst), {recursive: true});
    if (!fs.existsSync(dst)) fs.copyFileSync(path.join(FLAGS, `${f}.svg`), dst);
  }
}
