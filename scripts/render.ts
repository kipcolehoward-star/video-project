/**
 * npm run render          -- [--project <id>] [--format 9:16] [--captions kinetic] [--guides]
 * npm run render:preview  -- ...   (half resolution, fast encode, to previews/)
 * npm run render:all-formats       (16:9, 9:16 and 1:1 from one bundle)
 *
 * Part of the timeline only (with its audio):
 *   --scenes s16-haleyville,s17-first-call     those scenes (and everything between)
 *   --from s10-why-911 --to s14-fire-chiefs    a scene range
 *   Scene ids may be given by prefix: --from s10 --to s14
 *
 * Long videos (> 2 min) render in ~60 s parts automatically: resumable (re-run
 * the same command after an interruption), stall watchdog, lossless join with
 * the master audio. --chunk <seconds> sets the part length, --no-chunks renders
 * in one pass, --keep-parts keeps the parts after joining.
 *
 * Format priority: --format(s) > VIDEO_FORMAT env > project.json.
 * Rebuilds a stale audio mix, validates before and runs QC after every render.
 */
import fs from 'node:fs';
import path from 'node:path';
import {formatSlug} from '../src/config/formats';
import {buildTimeline} from '../src/config/project';
import {checkAssets, checkFonts, checkGeo, checkLayout, checkNarration, checkStoryboard, hasErrors, printFindings} from './lib/checks';
import {buildMix} from './lib/mix';
import {buildProps, currentMix, loadProject, parseArgs, pickProject, rel, resolveProjectFormat} from './lib/project';
import {qcFile} from './lib/qc';
import {renderChunked} from './lib/chunked';
import {bundleProject, closeBrowser, RENDER_DEFAULTS, renderVideo} from './lib/remotion';

const args = parseArgs();
const id = pickProject(args.str('project'));
let p = loadProject(id);
const preview = args.bool('preview');
const guides = args.bool('guides');
const captions = args.str('captions');
const formats = (args.str('formats')?.split(',') ?? [args.str('format')]).map((s) => resolveProjectFormat(p.config, s));
const narrated = p.rawStoryboard.scenes.some((s) => s.narration?.trim());

// The mix depends only on the timeline, so one rebuild serves every format at this fps.
if (narrated && p.narration && !currentMix(p, formats[0].fps)) {
  console.log('Audio mix is missing or out of date — rebuilding…');
  const r = buildMix(p, formats[0].fps);
  console.log(`  ${r.file}: ${r.measured.outputI} LUFS, true peak ${r.measured.outputTP} dBTP`);
  p = loadProject(id);
}

// Validate every requested format before spending time rendering.
const pre = [
  ...checkFonts(),
  ...checkAssets(p),
  ...checkGeo(p),
  ...formats.flatMap((fmt) => [...checkStoryboard(p, fmt), ...checkLayout(p, fmt, captions), ...checkNarration(p, fmt, captions)]),
];
const problems = pre.filter((x) => x.level !== 'ok');
if (problems.length) printFindings('Pre-render validation', problems);
if (hasErrors(pre) && !args.bool('force')) {
  console.error('\nValidation failed. Fix the errors above (or pass --force to render anyway).');
  process.exit(1);
}

// Optional partial render: resolve scene ids (or unique prefixes) to a frame range.
function sceneIndex(key: string): number {
  const ids = p.storyboard.scenes.map((s) => s.id);
  const exact = ids.indexOf(key);
  if (exact >= 0) return exact;
  const matches = ids.filter((id) => id.startsWith(key));
  if (matches.length !== 1) throw new Error(`Scene "${key}" ${matches.length ? `is ambiguous (${matches.join(', ')})` : 'not found'}.`);
  return ids.indexOf(matches[0]);
}
const wanted = args.str('scenes')?.split(',').map(sceneIndex) ?? (args.str('from') || args.str('to') ? [sceneIndex(args.str('from') ?? p.storyboard.scenes[0].id), sceneIndex(args.str('to') ?? p.storyboard.scenes.at(-1)!.id)] : null);
let frameRange: [number, number] | undefined;
let rangeLabel = '';
if (wanted) {
  const {scenes} = buildTimeline(p.storyboard, formats[0].fps);
  const lo = Math.min(...wanted);
  const hi = Math.max(...wanted);
  frameRange = [scenes[lo].from, scenes[hi].from + scenes[hi].durationInFrames - 1];
  rangeLabel = `_${scenes[lo].scene.id.split('-')[0]}-${scenes[hi].scene.id.split('-')[0]}`;
  console.log(`Partial render: ${scenes[lo].scene.id} → ${scenes[hi].scene.id} (frames ${frameRange[0]}–${frameRange[1]}, ${((frameRange[1] - frameRange[0] + 1) / formats[0].fps).toFixed(1)}s)`);
}

const serveUrl = await bundleProject(p.dir, buildProps(p, formats[0]), p);
let failed = false;

for (const fmt of formats) {
  const outDir = path.join(p.dir, preview ? 'previews' : 'output');
  fs.mkdirSync(outDir, {recursive: true});
  const props = buildProps(p, fmt, {showGuides: guides, captionStyle: captions});
  const suffix = `${rangeLabel}${preview ? '_preview' : ''}${guides ? '_guides' : ''}${captions ? `_${captions}` : ''}`;
  const output = path.join(outDir, `${id}_${formatSlug(fmt)}${suffix}.mp4`);

  console.log(`\n▶ ${fmt.id}  ${fmt.width}x${fmt.height} @ ${fmt.fps}fps  (${fmt.orientation}, ${props.transcript ? `${props.captionStyle} captions` : 'no captions'}, ${props.audioMix ? 'mixed audio' : 'silent'})${preview ? '  [preview, 50% scale]' : ''}`);
  const concurrency = args.str('concurrency') ? Number(args.str('concurrency')) : undefined;
  const totalFrames = buildTimeline(p.storyboard, fmt.fps).durationInFrames;
  const range: [number, number] = frameRange ?? [0, totalFrames - 1];
  const seconds = (range[1] - range[0] + 1) / fmt.fps;
  const chunkSeconds = args.str('chunk') ? Number(args.str('chunk')) : 60;
  if (!args.bool('no-chunks') && (args.str('chunk') || seconds > 120)) {
    await renderChunked({
      serveUrl,
      props,
      output,
      preview,
      range,
      fps: fmt.fps,
      chunkSeconds,
      audioFile: props.audioMix ? path.join(p.dir, props.audioMix) : null,
      concurrency,
      keepParts: args.bool('keep-parts'),
    });
  } else {
    await renderVideo({serveUrl, props, output, preview, frameRange, concurrency});
  }

  const scale = preview ? RENDER_DEFAULTS.previewScale : 1;
  const findings = qcFile(output, {
    width: Math.round(fmt.width * scale),
    height: Math.round(fmt.height * scale),
    fps: fmt.fps,
    durationInFrames: frameRange ? frameRange[1] - frameRange[0] + 1 : buildTimeline(p.storyboard, fmt.fps).durationInFrames,
    // Loudness is only meaningful for the whole programme, not an excerpt.
    targetLufs: props.audioMix && !frameRange ? p.audio.targetLufs : undefined,
    truePeak: props.audioMix && !frameRange ? p.audio.truePeak : undefined,
    requireAudio: narrated,
  });
  printFindings(`QC ${rel(output)}`, findings);
  failed ||= hasErrors(findings);
}

await closeBrowser();
process.exit(failed ? 1 : 0);
