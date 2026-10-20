/**
 * npm run qc -- <file.mp4> --project <id> [--format 9:16] [--preview | --scale 0.25]
 * Post-render QC for an existing file (render runs this automatically).
 */
import path from 'node:path';
import {buildTimeline} from '../src/config/project';
import {hasErrors, printFindings} from './lib/checks';
import {loadProject, parseArgs, pickProject, rel, resolveProjectFormat} from './lib/project';
import {qcFile} from './lib/qc';
import {RENDER_DEFAULTS} from './lib/remotion';

const args = parseArgs();
const file = args.positional[0];
if (!file) {
  console.error('Usage: npm run qc -- <file.mp4> [--project <id>] [--format 9:16] [--preview | --scale 0.25]');
  process.exit(2);
}
const p = loadProject(pickProject(args.str('project')));
const fmt = resolveProjectFormat(p.config, args.str('format'));
const scale = args.str('scale') ? Number(args.str('scale')) : args.bool('preview') ? RENDER_DEFAULTS.previewScale : 1;
const findings = qcFile(path.resolve(file), {
  width: Math.round(fmt.width * scale),
  height: Math.round(fmt.height * scale),
  fps: fmt.fps,
  durationInFrames: buildTimeline(p.storyboard, fmt.fps).durationInFrames,
  targetLufs: p.narration ? p.audio.targetLufs : undefined,
  truePeak: p.narration ? p.audio.truePeak : undefined,
  requireAudio: p.rawStoryboard.scenes.some((s) => s.narration?.trim()),
  maxFreeze: p.config.style === 'kinetic' ? 1.5 : undefined,
});
printFindings(`QC ${rel(path.resolve(file))} against ${fmt.id}`, findings);
process.exit(hasErrors(findings) ? 1 : 0);
