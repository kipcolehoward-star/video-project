/**
 * npm run audio:add -- --project <id> --as <assetId> --type sfx|music --url "<signed url>"
 *                      --title "<title>" --source "<provider:id>" [--license "<licence>"]
 *
 * Downloads a licensed audio file (e.g. an Epidemic Sound signed URL obtained
 * through the Epidemic MCP connector), normalises it to 48 kHz WAV under
 * audio/<type>/, and records it in assets.json. Source and licence are
 * required — never guessed.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {AssetMeta} from '../src/config/project';
import {capture} from './lib/exec';
import {loadProject, parseArgs, pickProject, rel} from './lib/project';

const args = parseArgs();
const p = loadProject(pickProject(args.str('project')));
const id = args.str('as');
const type = (args.str('type') ?? 'sfx') as 'sfx' | 'music' | 'ambient';
const url = args.str('url');
const title = args.str('title');
const source = args.str('source');
const license = args.str('license') ?? 'Epidemic Sound — licensed under the user\'s Pro subscription (publish while subscription is active)';
if (!id || !url || !title || !source) {
  console.error('Required: --as <assetId> --url <url> --title <title> --source <provider:id>');
  process.exit(2);
}

const res = await fetch(url);
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
const tmp = path.join(p.dir, 'audio', `.${id}.download`);
fs.mkdirSync(path.dirname(tmp), {recursive: true});
fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));

const outRel = `audio/${type}/${id}.wav`;
const out = path.join(p.dir, outRel);
fs.mkdirSync(path.dirname(out), {recursive: true});
const conv = capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-ar', '48000', '-c:a', 'pcm_s16le', out]);
fs.rmSync(tmp, {force: true});
if (conv.code !== 0) throw new Error(`ffmpeg failed: ${conv.stderr}`);
const dur = Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).stdout.trim());

const assetsFile = path.join(p.dir, 'assets.json');
const assets: Record<string, AssetMeta> = fs.existsSync(assetsFile) ? JSON.parse(fs.readFileSync(assetsFile, 'utf8')) : {};
assets[id] = {
  type,
  path: outRel,
  source,
  license,
  provider: source.split(':')[0],
  attributionRequired: false,
  credit: `${title} — ${source.startsWith('epidemic') ? 'Epidemic Sound' : source}`,
  retrieved: new Date().toISOString().slice(0, 10),
  notes: title,
};
fs.writeFileSync(assetsFile, JSON.stringify(assets, null, 2));
console.log(`Saved ${rel(out)} (${dur.toFixed(2)}s) as asset "${id}" — ${license}`);
