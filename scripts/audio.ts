/**
 * npm run audio -- [--project <id>] [--force]
 * Builds audio/mix.wav: narration + ducked music + SFX, loudness-normalised.
 */
import {currentMix, loadProject, parseArgs, pickProject, resolveProjectFormat} from './lib/project';
import {buildMix} from './lib/mix';

const args = parseArgs();
const p = loadProject(pickProject(args.str('project')));
const fmt = resolveProjectFormat(p.config, args.str('format'));
if (!args.bool('force') && currentMix(p, fmt.fps)) {
  console.log('  skip  audio/mix.wav is current (use --force to rebuild)');
  process.exit(0);
}
console.log(`Mixing "${p.id}" (target ${p.audio.targetLufs} LUFS, true peak ${p.audio.truePeak} dBTP)`);
const r = buildMix(p, fmt.fps);
console.log(`  ${r.narrationClips} narration clip(s), music: ${r.music ?? 'none'}, ${r.sfx} SFX, ${r.duration}s`);
if (r.music) console.log(`  music ducked ${p.audio.duckDb} dB during: ${r.duckedSpans.map(([a, b]) => `${a}–${b}s`).join(', ') || '(no narration)'}`);
console.log(`  loudness ${r.measured.inputI} -> ${r.measured.outputI} LUFS, true peak ${r.measured.outputTP} dBTP`);
console.log(`  wrote ${r.file}`);
