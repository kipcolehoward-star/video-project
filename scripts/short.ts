/**
 * npm run short -- --project <long-id> --scenes s1a,s1b,s10a [--outro "Text"] [--id <short-id>] [--portrait-zoom 1.6] [--force]
 *
 * Scaffolds a 9:16 Short from scenes of an existing long-form project:
 * projects/<long-id>-short/ (or --id) with the chosen scenes (maps, cues, SFX),
 * the music bed, and a narrated outro card pointing to the full video. Only the
 * assets those scenes use are copied. Shorts defaults: −14 LUFS, kinetic
 * captions, Shorts safe zone. Then: edit narration if a line needs a bridge,
 * `npm run narrate -- --project <short-id>`, `npm run stills`, `npm run render`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {ProjectConfig, SceneSpec} from '../src/config/project';
import {loadProject, parseArgs, pickProject, projectDir, rel} from './lib/project';

const args = parseArgs();
const longId = pickProject(args.str('project'));
const long = loadProject(longId);
const keys = args.str('scenes')?.split(',').map((s) => s.trim()).filter(Boolean);
if (!keys?.length) {
  console.error('Usage: npm run short -- --project <id> --scenes s1a,s1b,s10a [--outro "Text"] [--id <short-id>] [--force]');
  process.exit(2);
}
const shortId = args.str('id') ?? `${longId}-short`;
const dir = projectDir(shortId);
if (fs.existsSync(dir) && !args.bool('force')) {
  console.error(`${rel(dir)} already exists (edit it, or pass --force to recreate it).`);
  process.exit(1);
}

// Scene ids or unique prefixes, in the order given (a Short may reorder).
const ids = long.rawStoryboard.scenes.map((s) => s.id);
const pick = (k: string) => {
  const m = ids.includes(k) ? [k] : ids.filter((id) => id.startsWith(k));
  if (m.length !== 1) throw new Error(`Scene "${k}" ${m.length ? `is ambiguous (${m.join(', ')})` : 'not found'} in ${longId}.`);
  return long.rawStoryboard.scenes[ids.indexOf(m[0])];
};
const scenes: SceneSpec<unknown>[] = keys.map((k) => structuredClone(pick(k)));
// The first scene starts the Short: no fade in from black.
delete (scenes[0] as {transitionIn?: unknown}).transitionIn;
// Portrait keeps the landscape framing's width, so maps look far away: zoom in.
const portraitZoom = Number(args.str('portrait-zoom') ?? 1.6);
for (const s of scenes) if (s.type === 'atlas') (s.data as {portraitZoom?: number}).portraitZoom ??= portraitZoom;

const named = /^the /i.test(long.config.title) ? `the ${long.config.title.slice(4)}` : long.config.title;
const outro = args.str('outro') ?? `This is ${named}. The full story is on the channel.`;
// Outro: back on the map (where the last map scene ended, pulled back a little),
// with the title and a pointer to the full video. Falls back to a title card.
type Cam = {lon: number; lat: number; zoom: number};
const lastMap = [...scenes].reverse().find((s) => s.type === 'atlas');
const lastCam = (lastMap?.data as {camera?: Cam[]} | undefined)?.camera?.at(-1);
const titleCue = long.config.title.split(' ').at(-1)!;
scenes.push(
  lastCam
    ? ({
        id: 'zz-outro',
        type: 'atlas',
        duration: 3,
        transitionIn: {type: 'fade', duration: 0.4},
        narrationOffset: 0.3,
        narrationTail: 1.2,
        narration: outro,
        data: {
          palette: 'dusk',
          grid: false,
          focusY: 0.55,
          portraitZoom,
          camera: [
            {at: 0, lon: lastCam.lon, lat: lastCam.lat, zoom: lastCam.zoom},
            {at: titleCue, lon: lastCam.lon, lat: lastCam.lat, zoom: lastCam.zoom * 0.85},
          ],
          texts: [
            {text: long.config.title.toUpperCase(), style: 'hero', at: titleCue, y: 0.3},
            {text: 'FULL VIDEO ON THE CHANNEL', style: 'sub', at: 'full', y: 0.42, tone: 'gold'},
          ],
        },
      } as SceneSpec<unknown>)
    : ({
        id: 'zz-outro',
        type: 'title',
        duration: 3,
        transitionIn: {type: 'fade', duration: 0.4},
        narrationOffset: 0.3,
        narrationTail: 1.2,
        narration: outro,
        data: {kicker: 'Full video on the channel', title: long.config.title, cue: titleCue},
      } as SceneSpec<unknown>),
);

// Assets: only what the chosen scenes and the music use.
const refs = new Set<string>();
const scan = (v: unknown) => {
  if (typeof v === 'string' && v.startsWith('asset:')) refs.add(v.slice(6));
  else if (Array.isArray(v)) v.forEach(scan);
  else if (v && typeof v === 'object') Object.values(v).forEach(scan);
};
scenes.forEach((s) => scan(s.data));
for (const s of scenes) for (const fx of s.sfx ?? []) refs.add(fx.asset);
const music = long.config.audio?.music;
if (music) refs.add(music);

fs.rmSync(dir, {recursive: true, force: true});
for (const sub of ['assets', 'audio', 'broll', 'graphics', 'output', 'previews']) fs.mkdirSync(path.join(dir, sub), {recursive: true});
const assets: Record<string, unknown> = {};
for (const ref of refs) {
  const meta = long.assets[ref];
  if (!meta) throw new Error(`Asset "${ref}" is not in ${longId}/assets.json`);
  const src = path.join(long.dir, meta.path);
  const dst = path.join(dir, meta.path);
  fs.mkdirSync(path.dirname(dst), {recursive: true});
  fs.copyFileSync(src, dst);
  assets[ref] = meta;
}

const config: ProjectConfig = {
  ...structuredClone(long.config),
  id: shortId,
  title: `${long.config.title} (Short)`,
  video: {format: '9:16', fps: long.config.video?.fps ?? 30, duration: null},
  // Shorts UI covers the bottom ~20% and right ~12%; keep the top clear of the title bar.
  safeZoneProfile: {top: 0.15, right: 0.12, bottom: 0.2, left: 0.06},
  captionStyle: 'kinetic',
  audio: {...structuredClone(long.config.audio), targetLufs: -14, musicCutAt: undefined, musicStart: undefined},
};
(config as ProjectConfig & {shortOf?: string}).shortOf = longId;

const w = (f: string, data: unknown) => fs.writeFileSync(path.join(dir, f), JSON.stringify(data, null, 2) + '\n');
w('project.json', config);
w('storyboard.json', {scenes});
w('assets.json', assets);
fs.writeFileSync(
  path.join(dir, 'brief.md'),
  `# ${config.title}\n\nShort cut of \`${longId}\` (scenes: ${scenes.slice(0, -1).map((s) => s.id).join(', ')} + outro).\nFacts and sources: see projects/${longId}/research.md.\n`,
);

const words = scenes.map((s) => s.narration ?? '').join(' ').split(/\s+/).filter(Boolean).length;
console.log(`Created ${rel(dir)}: ${scenes.length} scenes, ~${words} words (≈${Math.round(words / 2.6)} s of narration), ${refs.size} asset(s) copied.`);
console.log(`Next: check the narration flows (edit storyboard.json if a line needs a bridge), then\n  npm run narrate -- --project ${shortId}\n  npm run stills -- --project ${shortId} --formats 9:16\n  npm run render -- --project ${shortId}`);
