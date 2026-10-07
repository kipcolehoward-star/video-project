/**
 * npm run tools:check -- [--voice en_US-joe-medium] [--model base.en]
 *
 * End-to-end check of the local speech toolchain:
 *   Piper TTS -> WAV -> FFmpeg (16 kHz mono) -> whisper.cpp -> word timings
 * Compares the transcript with the input sentence and reports speed.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {capture} from './lib/exec';
import {parseArgs, rel} from './lib/project';
import {TOOL_PATHS, TOOLS_DIR, VOICES} from './lib/tools';

const args = parseArgs();
const voice = args.str('voice') ?? 'en_US-joe-medium';
const model = args.str('model') ?? 'base.en';
// No spelled-out numbers: whisper writes them as digits, which a plain word diff counts as errors.
const SENTENCE = 'The first transcontinental railroad joined the coasts of America with a single line of track.';

const work = path.join(TOOLS_DIR, '.check');
fs.mkdirSync(work, {recursive: true});
const wav = path.join(work, 'tts.wav');
const wav16 = path.join(work, 'tts16k.wav');
const jsonBase = path.join(work, 'transcript');

let failed = false;
const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => {
  failed = true;
  console.log(`  FAIL  ${m}`);
};

for (const [name, p] of Object.entries({
  piper: TOOL_PATHS.piper,
  voice: TOOL_PATHS.piperVoice(voice),
  'whisper-cli': TOOL_PATHS.whisperCli,
  'whisper model': TOOL_PATHS.whisperModel(model),
})) {
  if (fs.existsSync(p)) ok(`${name}: ${rel(p)}`);
  else bad(`${name} missing: ${rel(p)} — run npm run setup:tools`);
}
if (failed) process.exit(1);

const lic = VOICES[voice];
console.log(`        voice licence: ${lic ? `${lic.license}${lic.attribution ? ` — credit: "${lic.attribution}"` : ''}` : 'NOT in the cleared list (scripts/lib/tools.ts) — check its MODEL_CARD'}`);

// 1. Piper
let t = Date.now();
const tts = spawnSync(TOOL_PATHS.piper, ['--model', TOOL_PATHS.piperVoice(voice), '--output_file', wav], {input: SENTENCE, encoding: 'utf8'});
const ttsSecs = (Date.now() - t) / 1000;
if (tts.status !== 0 || !fs.existsSync(wav)) {
  bad(`piper failed: ${tts.stderr}`);
  process.exit(1);
}
const dur = Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).stdout.trim());
ok(`piper: ${dur.toFixed(2)}s of speech in ${ttsSecs.toFixed(2)}s (${(dur / ttsSecs).toFixed(1)}x real time)`);

// 2. Resample for whisper (expects 16 kHz mono PCM)
const conv = capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav16]);
if (conv.code !== 0) {
  bad(`ffmpeg resample failed: ${conv.stderr}`);
  process.exit(1);
}

// 3. whisper.cpp with token-level timestamps
t = Date.now();
const w = capture(TOOL_PATHS.whisperCli, ['-m', TOOL_PATHS.whisperModel(model), '-f', wav16, '-l', 'en', '-ojf', '-of', jsonBase, '-np', '-t', '4']);
const sttSecs = (Date.now() - t) / 1000;
if (w.code !== 0 || !fs.existsSync(`${jsonBase}.json`)) {
  bad(`whisper-cli failed: ${w.stderr.slice(-500)}`);
  process.exit(1);
}
ok(`whisper.cpp (${model}): transcribed in ${sttSecs.toFixed(2)}s (${(dur / sttSecs).toFixed(1)}x real time)`);

// 4. Words from tokens: a token starting with a space begins a new word.
interface Tok {text: string; offsets: {from: number; to: number}; p: number}
const data = JSON.parse(fs.readFileSync(`${jsonBase}.json`, 'utf8'));
const words: {word: string; start: number; end: number; p: number}[] = [];
for (const seg of data.transcription) {
  for (const tok of seg.tokens as Tok[]) {
    if (tok.text.startsWith('[_')) continue;
    const last = words[words.length - 1];
    if (!last || tok.text.startsWith(' ')) words.push({word: tok.text.trim(), start: tok.offsets.from / 1000, end: tok.offsets.to / 1000, p: tok.p});
    else {
      last.word += tok.text;
      last.end = tok.offsets.to / 1000;
      last.p = Math.min(last.p, tok.p);
    }
  }
}
const transcript = words.map((x) => x.word).join(' ');
console.log(`\n  in:  ${SENTENCE}\n  out: ${transcript}\n`);

// Word-level accuracy (order-aware, numerals vs words normalised loosely).
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
const a = norm(SENTENCE);
const b = norm(transcript);
const dp = Array.from({length: a.length + 1}, (_, i) => Array.from({length: b.length + 1}, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
for (let i = 1; i <= a.length; i++)
  for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
const wer = dp[a.length][b.length] / a.length;
(wer <= 0.1 ? ok : bad)(`word error rate ${(wer * 100).toFixed(0)}%`);

console.log('\n  word timings (s):');
for (const x of words) console.log(`    ${x.start.toFixed(2).padStart(6)} – ${x.end.toFixed(2).padEnd(6)} ${x.word.padEnd(18)} p=${x.p.toFixed(2)}`);

const monotonic = words.every((x, i) => x.end >= x.start && (i === 0 || x.start >= words[i - 1].start));
(monotonic ? ok : bad)('timings are monotonic');
(words.length && words[words.length - 1].end <= dur + 0.3 ? ok : bad)(`last word ends within audio (${words.at(-1)?.end.toFixed(2)}s ≤ ${dur.toFixed(2)}s)`);

console.log(failed ? '\nTools check FAILED' : '\nTools check passed');
process.exit(failed ? 1 : 0);
