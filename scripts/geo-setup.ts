/**
 * npm run geo:setup [-- --force]
 *
 * Builds the map layers used by the atlas scene into data/geo/ (TopoJSON):
 *   admin1.json    states / provinces          Natural Earth 1:10m (public domain)
 *   rivers.json    rivers + lake centrelines   Natural Earth 1:10m (public domain)
 *   lakes.json     lakes                       Natural Earth 1:10m (public domain)
 *   disputed.json  disputed / breakaway areas  Natural Earth 1:10m (public domain)
 *   countries-10m.json  copied from world-atlas (Natural Earth 1:10m)
 *
 * Raw downloads go to tools/geo-src/ (gitignored). Natural Earth's default
 * "de facto" worldview is used; disputed areas are drawn as disputed.
 */
import fs from 'node:fs';
import path from 'node:path';
import {capture} from './lib/exec';
import {parseArgs, ROOT} from './lib/project';

const args = parseArgs();
const SRC = path.join(ROOT, 'tools', 'geo-src');
const OUT = path.join(ROOT, 'data', 'geo');
fs.mkdirSync(SRC, {recursive: true});
fs.mkdirSync(OUT, {recursive: true});
const mapshaper = path.join(ROOT, 'node_modules', 'mapshaper', 'bin', 'mapshaper');
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

interface Layer {
  out: string;
  url: string;
  shp: string;
  /** mapshaper commands between input and output */
  cmds: string[];
}

const NE = 'https://naciscdn.org/naturalearth/10m';
const LAYERS: Layer[] = [
  {
    out: 'admin1',
    url: `${NE}/cultural/ne_10m_admin_1_states_provinces.zip`,
    shp: 'ne_10m_admin_1_states_provinces.shp',
    // Plus England, Scotland, Wales and Northern Ireland, dissolved from the UK's subdivisions (Natural Earth's geonunit).
    cmds: [
      '-filter-fields', 'name,admin,adm0_a3,iso_a2,type_en,geonunit', '-simplify', '6%', 'keep-shapes',
      '-filter', 'adm0_a3 == "GBR"', '+', 'name=nations',
      '-dissolve', 'geonunit', 'target=nations', 'copy-fields=admin,adm0_a3,iso_a2',
      '-each', 'name = geonunit, type_en = "Country of the UK"', 'target=nations',
      '-merge-layers', 'target=*', 'force',
      '-filter-fields', 'name,admin,adm0_a3,iso_a2,type_en',
    ],
  },
  {
    out: 'rivers',
    url: `${NE}/physical/ne_10m_rivers_lake_centerlines.zip`,
    shp: 'ne_10m_rivers_lake_centerlines.shp',
    cmds: ['-filter-fields', 'name,scalerank,featurecla', '-simplify', '25%'],
  },
  {
    out: 'lakes',
    url: `${NE}/physical/ne_10m_lakes.zip`,
    shp: 'ne_10m_lakes.shp',
    cmds: ['-filter-fields', 'name,scalerank', '-simplify', '20%', 'keep-shapes'],
  },
  {
    out: 'disputed',
    url: `${NE}/cultural/ne_10m_admin_0_disputed_areas.zip`,
    shp: 'ne_10m_admin_0_disputed_areas.shp',
    cmds: ['-each', 'name = BRK_NAME || NAME, claimant = NAME || "", note = NOTE_BRK || ""', '-filter-fields', 'name,claimant,note', '-simplify', '40%', 'keep-shapes'],
  },
];

for (const l of LAYERS) {
  const out = path.join(OUT, `${l.out}.json`);
  if (fs.existsSync(out) && !args.bool('force')) {
    console.log(`  skip  ${l.out}.json`);
    continue;
  }
  const zip = path.join(SRC, path.basename(l.url));
  if (!fs.existsSync(zip)) {
    process.stdout.write(`  get   ${path.basename(l.url)} … `);
    const r = capture('curl', ['-sSLf', '-o', zip, l.url]);
    if (r.code !== 0) throw new Error(`download failed: ${r.stderr}`);
    console.log(`${(fs.statSync(zip).size / 1e6).toFixed(1)} MB`);
  }
  const dir = path.join(SRC, l.out);
  fs.mkdirSync(dir, {recursive: true});
  const x = capture(tar, ['-xf', zip, '-C', dir]);
  if (x.code !== 0) throw new Error(`extract failed: ${x.stderr}`);
  const r = capture(process.execPath, [mapshaper, path.join(dir, l.shp), ...l.cmds, '-rename-layers', l.out, '-o', 'format=topojson', 'quantization=100000', out]);
  if (r.code !== 0) throw new Error(`mapshaper failed for ${l.out}:\n${r.stderr.slice(-600)}`);
  console.log(`  built ${l.out}.json  ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
}

const c10 = path.join(ROOT, 'node_modules', 'world-atlas', 'countries-10m.json');
fs.copyFileSync(c10, path.join(OUT, 'countries-10m.json'));
console.log(`  copy  countries-10m.json  ${(fs.statSync(c10).size / 1e6).toFixed(2)} MB`);
fs.writeFileSync(
  path.join(OUT, 'SOURCES.md'),
  `# Map data sources\n\nAll layers: Natural Earth (https://www.naturalearthdata.com), public domain, 1:10m.\nBuilt by \`npm run geo:setup\` with mapshaper (simplified for video). Worldview: Natural Earth default (de facto).\ncountries-10m.json: world-atlas (ISC) packaging of Natural Earth.\n`,
);
console.log('\nDone. Layers are in data/geo/.');
