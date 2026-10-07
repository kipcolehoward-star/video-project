/**
 * npm run posters -- --project <id> [--only <name,...>]
 *
 * Renders still images (thumbnails, channel logo, banner) from
 * projects/<id>/posters.json:
 *   [{"name": "thumbnail", "format": "1280x720", "scene": {<any storyboard scene>}, "at": <seconds?>}]
 * Each poster is its own one-scene storyboard at its own size, rendered at
 * `at` seconds (default: the scene's last frame, when every animation has
 * settled). Output: projects/<id>/output/<id>-<name>.png (+ .jpg for YouTube,
 * which rejects thumbnails over 2 MB).
 */
import fs from 'node:fs';
import path from 'node:path';
import {resolveFormat} from '../src/config/formats';
import type {SceneSpec} from '../src/config/project';
import {capture} from './lib/exec';
import {buildProps, loadProject, parseArgs, pickProject, rel} from './lib/project';
import {bundleProject, closeBrowser, renderStills} from './lib/remotion';

interface Poster {
  name: string;
  format: string;
  scene: SceneSpec<unknown>;
  at?: number;
}

const args = parseArgs();
const id = pickProject(args.str('project'));
const p = loadProject(id);
const file = path.join(p.dir, 'posters.json');
if (!fs.existsSync(file)) {
  console.error(`No posters.json in ${rel(p.dir)}`);
  process.exit(1);
}
const only = args.str('only')?.split(',');
const posters = (JSON.parse(fs.readFileSync(file, 'utf8')) as Poster[]).filter((x) => !only || only.includes(x.name));
const outDir = path.join(p.dir, 'output');
fs.mkdirSync(outDir, {recursive: true});

// Posters are silent single frames: no narration, transcript or audio.
const posterProject = (x: Poster) => ({
  ...p,
  storyboard: {scenes: [{...x.scene, narration: undefined, sfx: undefined, transitionIn: undefined}]},
  rawStoryboard: {scenes: [x.scene]},
  narration: null,
  transcript: null,
});
const propsFor = (x: Poster) => {
  const fmt = resolveFormat({format: x.format, fps: 30});
  const props = buildProps(posterProject(x) as typeof p, fmt, {captionStyle: 'none'});
  return {...props, audioMix: null};
};

const serveUrl = await bundleProject(p.dir, propsFor(posters[0]), {...p, rawStoryboard: {scenes: posters.map((x) => x.scene)}} as typeof p);
for (const x of posters) {
  const dur = x.scene.duration ?? 3;
  const frame = Math.max(0, Math.round((x.at ?? dur) * 30) - 1);
  const png = path.join(outDir, `${id}-${x.name}.png`);
  await renderStills({serveUrl, props: propsFor(x), frames: [frame], outputFor: () => png});
  const jpg = png.replace(/\.png$/, '.jpg');
  capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', png, '-q:v', '2', jpg]);
  console.log(`  ${x.name}: ${rel(png)} (+ .jpg, ${(fs.statSync(jpg).size / 1024).toFixed(0)} KB)`);
}
await closeBrowser();
