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
import type {GlMapData} from '../../src/scenes/GlMapScene';
import {ROOT, type LoadedProject} from './project';
import {imageryTile, imageryTilesFor} from './imagery';
import {TERRAIN_DIR, terrainTilesFor} from './terrain';

const DATA = path.join(ROOT, 'data', 'geo');
const FLAGS = path.join(ROOT, 'node_modules', 'flag-icons', 'flags');

const layerSrc = (l: string) => (l === 'raster:bluemarble' ? path.join(DATA, 'raster', 'bluemarble-3600.jpg') : path.join(DATA, `${l}.json`));

export function geoNeeds(p: LoadedProject) {
  const layers = new Set<string>();
  const flags = new Set<string>(); // "4x3/ls", "1x1/ls"
  for (const s of p.rawStoryboard.scenes) {
    if (s.type === 'journey') {
      // Journey scenes always show the satellite globe; close fits (small countries) need 10m borders.
      layers.add('raster:bluemarble');
      layers.add('countries-10m');
      continue;
    }
    if (s.type === 'glmap') {
      // MapLibre draws regional close-ups, so it always gets the 1:10m land.
      layers.add('countries-10m');
      // Highlight beats may name a province/state (e.g. Kaliningrad), and leave out disputed areas.
      if ((s.data as unknown as GlMapData).beats?.some((b) => b.do === 'highlight')) {
        layers.add('admin1');
        layers.add('disputed');
        layers.add('lakes');
      }
      if ((s.data as unknown as GlMapData).beats?.some((b) => b.do === 'river')) layers.add('rivers');
      // Highlights and moved countries can show the country's flag inside its border.
      for (const b of (s.data as unknown as GlMapData).beats ?? []) if ((b.do === 'highlight' || b.do === 'move') && b.flag && !b.flag.startsWith('asset:')) flags.add(`4x3/${b.flag.toLowerCase()}`);
      continue;
    }
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
  const tiles = terrainTilesFor(p);
  const missing = tiles.filter((t) => !fs.existsSync(terrainSrc(t))).length;
  if (missing) out.push(`${missing} of ${tiles.length} elevation tiles missing — run npm run terrain:setup -- --project ${p.id}`);
  const images = imageryTilesFor(p);
  const missingImages = images.filter((t) => !fs.existsSync(imageryTile(t))).length;
  if (missingImages) out.push(`${missingImages} of ${images.length} satellite imagery tiles missing — run npm run imagery:setup -- --project ${p.id}`);
  return out;
}

const terrainSrc = (t: {z: number; x: number; y: number}) => path.join(TERRAIN_DIR, 'terrarium', `${t.z}`, `${t.x}`, `${t.y}.png`);

export function ensureGeoData(p: LoadedProject) {
  const {layers, flags} = geoNeeds(p);
  const tiles = terrainTilesFor(p);
  const images = imageryTilesFor(p);
  if (!layers.size && !flags.size && !tiles.length && !images.length) return;
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
  // Elevation tiles for glmap terrain: only the ones the scenes can see.
  for (const t of tiles) {
    const dst = path.join(out, 'terrain', `${t.z}`, `${t.x}`, `${t.y}.png`);
    if (fs.existsSync(dst)) continue;
    fs.mkdirSync(path.dirname(dst), {recursive: true});
    fs.copyFileSync(terrainSrc(t), dst);
  }
  // Satellite imagery tiles for glmap imagery, likewise.
  for (const t of images) {
    const dst = path.join(out, 'imagery', `${t.z}`, `${t.x}`, `${t.y}.jpg`);
    if (fs.existsSync(dst)) continue;
    fs.mkdirSync(path.dirname(dst), {recursive: true});
    fs.copyFileSync(imageryTile(t), dst);
  }
}
