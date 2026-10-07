/**
 * Licensed image sourcing.
 *
 *   npm run image -- search "gps satellite" --project <id> [--source nasa|commons|pexels] [--limit 12]
 *       -> previews/image-search/sheet.png (numbered thumbnails) + results.json
 *   npm run image -- pick <n> --as <assetId> --project <id> [--focal 0.5,0.4] [--min 1600]
 *       -> assets/images/<assetId>.jpg + assets.json entry with source/author/licence
 */
import fs from 'node:fs';
import path from 'node:path';
import type {AssetMeta} from '../src/config/project';
import {capture} from './lib/exec';
import {download, downloadUrlFor, search, type Candidate} from './lib/media/sources';
import {loadProject, parseArgs, pickProject, rel} from './lib/project';

const args = parseArgs();
const [cmd, ...rest] = args.positional;
const p = loadProject(pickProject(args.str('project')));
const workDir = path.join(p.dir, 'previews', 'image-search');
const resultsFile = path.join(workDir, 'results.json');

if (cmd === 'search') {
  const query = rest.join(' ').trim();
  if (!query) usage();
  const source = args.str('source') ?? 'nasa';
  const limit = Number(args.str('limit') ?? 12);
  const results = await search(source, query, limit);
  fs.rmSync(workDir, {recursive: true, force: true});
  fs.mkdirSync(workDir, {recursive: true});
  fs.writeFileSync(resultsFile, JSON.stringify({query, source, results}, null, 2));
  if (!results.length) {
    console.log(`No ${source} results for "${query}".`);
    process.exit(0);
  }

  // Thumbnails -> numbered contact sheet.
  const thumbs: string[] = [];
  for (const [i, c] of results.entries()) {
    try {
      const f = path.join(workDir, `t${String(i + 1).padStart(2, '0')}.jpg`);
      fs.writeFileSync(f, await download(c.thumbUrl));
      thumbs.push(f);
    } catch {
      thumbs.push('');
    }
  }
  const sheet = buildSheet(thumbs.filter(Boolean), thumbs.map((t, i) => (t ? i + 1 : 0)).filter(Boolean));
  console.log(`${results.length} ${source} result(s) for "${query}"${sheet ? `\nsheet: ${rel(sheet)}` : ''}\n`);
  for (const [i, c] of results.entries()) {
    const size = c.width && c.height ? `${c.width}x${c.height}` : 'size on download';
    console.log(`${String(i + 1).padStart(2)}. ${c.title.slice(0, 70)}`);
    console.log(`    ${size} · ${c.author.slice(0, 50)} · ${c.license}${c.warning ? `\n    ! ${c.warning}` : ''}`);
  }
  console.log(`\nPick with: npm run image -- pick <n> --as <assetId> --project ${p.id}`);
} else if (cmd === 'pick') {
  const n = Number(rest[0]);
  const assetId = args.str('as');
  if (!n || !assetId) usage();
  if (!fs.existsSync(resultsFile)) throw new Error('No search results. Run an image search first.');
  const {results} = JSON.parse(fs.readFileSync(resultsFile, 'utf8')) as {results: Candidate[]};
  const c = results[n - 1];
  if (!c) throw new Error(`No result #${n}`);
  const min = Number(args.str('min') ?? 1600);

  const url = await downloadUrlFor(c);
  const raw = path.join(workDir, `pick${path.extname(new URL(url).pathname) || '.jpg'}`);
  fs.writeFileSync(raw, await download(url));
  const dims = capture('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', raw]).stdout.trim();
  const [w, h] = dims.split('x').map(Number);
  if (!w || !h) throw new Error(`Could not read the downloaded image (${dims})`);
  if (Math.max(w, h) < min) throw new Error(`Image is ${w}x${h}; below the ${min}px minimum for 1080p. Pick another or pass --min.`);

  // Normalise: JPEG, long side ≤ 3840 (keeps render memory low on this machine).
  const outRel = `assets/images/${assetId}.jpg`;
  const out = path.join(p.dir, outRel);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const scale = Math.max(w, h) > 3840 ? (w >= h ? 'scale=3840:-2' : 'scale=-2:3840') : 'null';
  const conv = capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-vf', scale, '-q:v', '2', out]);
  if (conv.code !== 0) throw new Error(`ffmpeg failed: ${conv.stderr}`);

  const [fx, fy] = (args.str('focal') ?? '0.5,0.5').split(',').map(Number);
  const meta: AssetMeta = {
    type: 'photo',
    path: outRel,
    source: c.pageUrl,
    license: c.license,
    licenseUrl: c.licenseUrl,
    author: c.author,
    provider: c.provider,
    attributionRequired: c.attributionRequired,
    credit: `${c.title} — ${c.author}${c.provider === 'nasa' ? '' : ` (${c.license})`}, via ${({nasa: 'NASA', commons: 'Wikimedia Commons', pexels: 'Pexels'} as const)[c.provider]}`,
    retrieved: new Date().toISOString().slice(0, 10),
    original: {width: w, height: h},
    focalPoint: {x: fx, y: fy},
    ...(c.warning ? {notes: c.warning} : {}),
  };
  const assetsFile = path.join(p.dir, 'assets.json');
  const assets = fs.existsSync(assetsFile) ? JSON.parse(fs.readFileSync(assetsFile, 'utf8')) : {};
  assets[assetId] = meta;
  fs.writeFileSync(assetsFile, JSON.stringify(assets, null, 2));
  fs.rmSync(raw, {force: true});
  console.log(`Saved ${outRel} (${w}x${h} original) as asset "${assetId}"`);
  console.log(`  ${meta.license}${meta.attributionRequired ? ' — attribution REQUIRED (npm run credits)' : ''}`);
  console.log(`  source: ${meta.source}`);
  console.log(`Use in storyboard: "media": "asset:${assetId}"`);
} else usage();

function usage(): never {
  console.error('Usage:\n  npm run image -- search "<query>" --project <id> [--source nasa|commons|pexels]\n  npm run image -- pick <n> --as <assetId> --project <id> [--focal x,y] [--min 1600]');
  process.exit(2);
}

/** 4-column grid of thumbnails, each labelled with its result number. */
function buildSheet(files: string[], numbers: number[]): string | null {
  if (!files.length) return null;
  const sheet = path.join(workDir, 'sheet.png');
  const cols = 4;
  const rows = Math.ceil(files.length / cols);
  const font = 'C\\:/Windows/Fonts/arialbd.ttf';
  const cells = files.map(
    (_, i) =>
      `[${i}:v]scale=420:236:force_original_aspect_ratio=decrease,pad=440:256:(ow-iw)/2:(oh-ih)/2:color=0x202020,` +
      `drawtext=fontfile='${font}':text='${numbers[i]}':x=10:y=8:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=6[c${i}]`,
  );
  const pads = Array.from({length: rows * cols - files.length}, (_, k) => `color=c=0x202020:s=440x256:d=1[e${k}]`);
  const all = [...files.map((_, i) => `[c${i}]`), ...pads.map((_, k) => `[e${k}]`)].join('');
  const layout = Array.from({length: rows * cols}, (_, i) => `${(i % cols) * 440}_${Math.floor(i / cols) * 256}`).join('|');
  const graph = [...cells, ...pads, `${all}xstack=inputs=${rows * cols}:layout=${layout}`].join(';');
  const r = capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', graph, '-frames:v', '1', sheet]);
  if (r.code !== 0) {
    console.warn(`(sheet not built: ${r.stderr.slice(0, 200)})`);
    return null;
  }
  return sheet;
}
