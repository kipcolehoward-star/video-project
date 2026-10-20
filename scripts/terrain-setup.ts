/**
 * npm run terrain:setup -- --project <id> [--dry-run]
 * Downloads the elevation tiles that the project's glmap scenes with `terrain`
 * need into data/geo/terrain/terrarium/<z>/<x>/<y>.png (gitignored; tiles
 * already there are skipped). Renders then copy them into the project, so
 * rendering never needs the network.
 *
 * Source: Terrain Tiles, AWS Open Data (https://registry.opendata.aws/terrain-tiles),
 * built from SRTM, GMTED2010 (USGS) and ETOPO1 (NOAA); see data/geo/terrain/SOURCES.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import {loadProject, parseArgs, pickProject} from './lib/project';
import {TERRAIN_DIR, TERRAIN_URL, terrainTilesFor} from './lib/terrain';

const args = parseArgs();
const p = loadProject(pickProject(args.str('project')));
const tiles = terrainTilesFor(p);
if (!tiles.length) {
  console.log(`${p.id}: no glmap scene uses terrain; nothing to download.`);
  process.exit(0);
}
const missing = tiles.filter((t) => !fs.existsSync(path.join(TERRAIN_DIR, 'terrarium', `${t.z}`, `${t.x}`, `${t.y}.png`)));
console.log(`${p.id}: ${tiles.length} elevation tiles needed, ${missing.length} to download`);
if (args.bool('dry-run')) process.exit(0);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
let done = 0;
let bytes = 0;
async function fetchTile(t: {z: number; x: number; y: number}) {
  const url = `${TERRAIN_URL}/${t.z}/${t.x}/${t.y}.png`;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, {signal: AbortSignal.timeout(60_000)});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.subarray(0, 4).equals(PNG)) throw new Error('not a PNG');
      const out = path.join(TERRAIN_DIR, 'terrarium', `${t.z}`, `${t.x}`, `${t.y}.png`);
      fs.mkdirSync(path.dirname(out), {recursive: true});
      fs.writeFileSync(out, buf);
      bytes += buf.length;
      done++;
      process.stdout.write(`\r  ${done}/${missing.length} tiles, ${(bytes / 1e6).toFixed(1)} MB`);
      return;
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${(e as Error).message}`);
    }
  }
}
// Six downloads at a time.
const queue = [...missing];
await Promise.all(Array.from({length: 6}, async () => {
  for (let t = queue.shift(); t; t = queue.shift()) await fetchTile(t);
}));
if (missing.length) console.log('');

const today = new Date().toISOString().slice(0, 10);
fs.mkdirSync(TERRAIN_DIR, {recursive: true});
const sourcesFile = path.join(TERRAIN_DIR, 'SOURCES.md');
if (!fs.existsSync(sourcesFile) || missing.length) {
  fs.writeFileSync(
    sourcesFile,
    [
      '# Elevation tiles (glmap terrain)',
      '',
      `Terrain Tiles (Mapzen/Tilezen, terrarium encoding), AWS Open Data: ${TERRAIN_URL}`,
      `Registry: https://registry.opendata.aws/terrain-tiles  Last downloaded: ${today}`,
      'Height in metres = R * 256 + G + B / 256 - 32768.',
      'Sources in this region: SRTM and GMTED2010 (U.S. Geological Survey; public domain, credit requested),',
      'ETOPO1 (NOAA NCEI; public domain, U.S. Government material). Attribution guide:',
      'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
      '',
    ].join('\n'),
  );
}
console.log(`ready: ${tiles.length} tiles in data/geo/terrain (credit line: npm run credits)`);
