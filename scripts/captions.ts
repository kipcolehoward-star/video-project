/**
 * npm run captions -- [--project <id>]
 * Exports SRT + VTT subtitle files (for YouTube etc.) from transcript.json.
 * Burned-in captions are drawn by Remotion from the same data.
 */
import fs from 'node:fs';
import path from 'node:path';
import {buildPages, globalWords, SUBTITLE_FILE_PAGING, toSrt, toVtt} from '../src/captions/words';
import {loadProject, parseArgs, pickProject, rel, resolveProjectFormat} from './lib/project';

const args = parseArgs();
const p = loadProject(pickProject(args.str('project')));
if (!p.transcript) {
  console.error('No transcript.json. Run: npm run transcribe');
  process.exit(1);
}
const fmt = resolveProjectFormat(p.config, args.str('format'));
const pages = buildPages(globalWords(p.storyboard, p.transcript, fmt.fps), SUBTITLE_FILE_PAGING);
const outDir = path.join(p.dir, 'output');
fs.mkdirSync(outDir, {recursive: true});
const srt = path.join(outDir, `${p.id}.srt`);
const vtt = path.join(outDir, `${p.id}.vtt`);
fs.writeFileSync(srt, toSrt(pages));
fs.writeFileSync(vtt, toVtt(pages));
console.log(`${pages.length} cue(s)\n  ${rel(srt)}\n  ${rel(vtt)}\n`);
for (const pg of pages) {
  console.log(`  ${pg.start.toFixed(2).padStart(6)} – ${pg.end.toFixed(2).padEnd(6)} ${pg.lines.map((l) => l.map((w) => w.text).join(' ')).join(' / ')}`);
}
