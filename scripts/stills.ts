/**
 * npm run stills -- [--project <id>] [--formats 16:9,9:16,1:1] [--guides] [--at mid|<seconds,...>]
 *
 * Renders one still per scene (default: the midpoint of each scene's
 * settled section) for each format, then builds a side-by-side contact
 * sheet per scene with FFmpeg. Fast way to review layouts without a full render.
 */
import fs from 'node:fs';
import path from 'node:path';
import {formatSlug} from '../src/config/formats';
import {buildTimeline} from '../src/config/project';
import {capture} from './lib/exec';
import {buildProps, loadProject, parseArgs, pickProject, rel, resolveProjectFormat} from './lib/project';
import {bundleProject, closeBrowser, renderStills} from './lib/remotion';

const args = parseArgs();
const id = pickProject(args.str('project'));
const p = loadProject(id);
const guides = args.bool('guides');
const formats = (args.str('formats') ?? '16:9,9:16,1:1').split(',').map((s) => resolveProjectFormat(p.config, s));
const outDir = path.join(p.dir, 'previews', 'stills');
fs.mkdirSync(outDir, {recursive: true});

const serveUrl = await bundleProject(p.dir, buildProps(p, formats[0]), p);
const perScene: Record<string, string[]> = {};

for (const fmt of formats) {
  const {scenes} = buildTimeline(p.storyboard, fmt.fps);
  // ~75% through each scene: entrance animations have settled. `--at 1.5,12` = those seconds instead.
  const atList = args.str('at') && args.str('at') !== 'mid' ? args.str('at')!.split(',').map((x) => Math.round(Number(x) * fmt.fps)) : null;
  const frames = atList ?? scenes.map((s) => s.from + Math.floor(s.durationInFrames * 0.75));
  console.log(`▶ ${fmt.id}: frames ${frames.join(', ')}`);
  const files = await renderStills({
    serveUrl,
    props: buildProps(p, fmt, {showGuides: guides}),
    frames,
    outputFor: (fr) => path.join(outDir, `${formatSlug(fmt)}_f${String(fr).padStart(5, '0')}${guides ? '_guides' : ''}.png`),
  });
  if (!atList) files.forEach((file, i) => (perScene[scenes[i].scene.id] ??= []).push(file));
  else console.log(files.map((f) => `  ${rel(f)}`).join('\n'));
}

await closeBrowser();

// Contact sheet per scene: all formats side by side at equal height.
const H = 720;
for (const [sceneId, files] of Object.entries(perScene)) {
  if (files.length < 2) continue; // one format: the stills themselves are the review
  const sheet = path.join(outDir, `sheet_${sceneId}${guides ? '_guides' : ''}.png`);
  const inputs = files.flatMap((x) => ['-i', x]);
  const scaled = files.map((_, i) => `[${i}:v]scale=-2:${H},pad=iw+40:ih+40:20:20:color=0x2a2a2a[v${i}]`).join(';');
  const stack = files.map((_, i) => `[v${i}]`).join('') + `hstack=inputs=${files.length}`;
  const r = capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', `${scaled};${stack}`, sheet]);
  console.log(r.code === 0 ? `  sheet: ${rel(sheet)}` : `  sheet failed: ${r.stderr}`);
}
