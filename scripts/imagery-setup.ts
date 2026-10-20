/**
 * npm run imagery:setup -- --project <id> [--dry-run]
 * Downloads the satellite tiles that the project's glmap scenes with `imagery`
 * need into data/geo/imagery/s2cloudless-2016/<z>/<x>/<y>.jpg (gitignored;
 * tiles already there are skipped). Renders then copy them into the project,
 * so rendering never needs the network.
 *
 * Source: EOxCloudless 2016 (Sentinel-2 cloudless) by EOX IT Services, CC BY 4.0;
 * see data/geo/imagery/SOURCES.md. EOX publishes no bulk-download rules, so this
 * fetches only what the scenes can see, four tiles at a time.
 */
import fs from 'node:fs';
import path from 'node:path';
import {IMAGERY_CREDIT, IMAGERY_URL} from '../src/graphics/glmap/imagery';
import {IMAGERY_DIR, imageryTile, imageryTilesFor} from './lib/imagery';
import {loadProject, parseArgs, pickProject} from './lib/project';

const args = parseArgs();
const p = loadProject(pickProject(args.str('project')));
const tiles = imageryTilesFor(p);
if (!tiles.length) {
  console.log(`${p.id}: no glmap scene uses imagery; nothing to download.`);
  process.exit(0);
}
const missing = tiles.filter((t) => !fs.existsSync(imageryTile(t)));
const levels = [...new Set(tiles.map((t) => t.z))].sort((a, b) => a - b);
console.log(`${p.id}: ${tiles.length} imagery tiles needed (zoom ${levels[0]}–${levels.at(-1)}), ${missing.length} to download`);
if (args.bool('dry-run')) process.exit(0);

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
// Open-sea tiles come back as a tiny one-colour PNG (seen 2026-10-20). Kept under the .jpg name: browsers decode
// images by their content, and imagery is paired with the depth-drawn sea, which covers them anyway.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
let done = 0;
let bytes = 0;
async function fetchTile(t: {z: number; x: number; y: number}) {
  const url = IMAGERY_URL.replace('{z}', `${t.z}`).replace('{y}', `${t.y}`).replace('{x}', `${t.x}`);
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, {signal: AbortSignal.timeout(60_000)});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.subarray(0, 3).equals(JPEG) && !buf.subarray(0, 4).equals(PNG)) throw new Error('not a JPEG or PNG');
      const out = imageryTile(t);
      fs.mkdirSync(path.dirname(out), {recursive: true});
      fs.writeFileSync(out, buf);
      bytes += buf.length;
      done++;
      process.stdout.write(`\r  ${done}/${missing.length} tiles, ${(bytes / 1e6).toFixed(1)} MB`);
      return;
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${(e as Error).message}`);
      await new Promise((res) => setTimeout(res, 2000 * attempt));
    }
  }
}
// Four downloads at a time.
const queue = [...missing];
await Promise.all(
  Array.from({length: 4}, async () => {
    for (let t = queue.shift(); t; t = queue.shift()) await fetchTile(t);
  }),
);
if (missing.length) console.log('');

const today = new Date().toISOString().slice(0, 10);
const sourcesFile = path.join(path.dirname(IMAGERY_DIR), 'SOURCES.md');
fs.mkdirSync(path.dirname(sourcesFile), {recursive: true});
if (!fs.existsSync(sourcesFile) || missing.length) {
  fs.writeFileSync(
    sourcesFile,
    [
      '# Satellite imagery tiles (glmap imagery)',
      '',
      `EOxCloudless 2016 (Sentinel-2 cloudless), WMTS layer s2cloudless_3857: ${IMAGERY_URL}`,
      `Last downloaded: ${today}. Stored as s2cloudless-2016/<z>/<x>/<y>.jpg (256 px, Web Mercator).`,
      'Licence: Creative Commons Attribution 4.0 International (2016 layer only; 2018–2025 layers are CC BY-NC-SA 4.0).',
      'Source: https://cloudless.eox.at/license-non-commercial (checked 2026-10-20) and the layer abstract in',
      'https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml.',
      `Required attribution: ${IMAGERY_CREDIT}`,
      '',
    ].join('\n'),
  );
}
console.log(`ready: ${tiles.length} tiles in data/geo/imagery (credit line: npm run credits)`);
