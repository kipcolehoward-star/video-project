/**
 * npm run voice:test -- --voice <voice_id> [--models eleven_multilingual_v2,eleven_v4] ["text"]
 * Audition an ElevenLabs voice: renders one short line per model to
 * tools/samples/. Bills only the characters of the line (per model).
 */
import fs from 'node:fs';
import path from 'node:path';
import {capture} from './lib/exec';
import {parseArgs, rel} from './lib/project';
import {TOOLS_DIR} from './lib/tools';
import {synthesize} from './lib/tts/elevenlabs';

const args = parseArgs();
const voice = args.str('voice');
if (!voice) {
  console.error('Usage: npm run voice:test -- --voice <voice_id> [--models a,b] ["text"]');
  process.exit(2);
}
const text = args.positional.join(' ').trim() || "When someone is in danger in the United States, there's one number almost everyone knows.";
const models = (args.str('models') ?? 'eleven_multilingual_v2,eleven_v4').split(',');
const dir = path.join(TOOLS_DIR, 'samples');
fs.mkdirSync(dir, {recursive: true});

console.log(`Auditioning ${voice}: "${text}" (${text.length} chars × ${models.length} model(s))`);
for (const model of models) {
  try {
    const t = Date.now();
    const r = await synthesize(text, {voiceId: voice, modelId: model});
    const mp3 = path.join(dir, `elevenlabs_${voice}_${model}.mp3`);
    fs.writeFileSync(mp3, r.mp3);
    const dur = capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).stdout.trim();
    console.log(`  ok   ${model}: ${Number(dur).toFixed(2)}s, ${r.words.length} timed words (${((Date.now() - t) / 1000).toFixed(1)}s) -> ${rel(mp3)}`);
  } catch (e) {
    console.log(`  FAIL ${model}: ${(e as Error).message.slice(0, 220)}`);
  }
}
