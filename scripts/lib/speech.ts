/**
 * Voiceover (Piper) and transcription (whisper.cpp). Each scene's narration
 * is its own WAV, so editing one line only regenerates that line.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {alignScript, normWord, parseNarration, spokenText, type RecognizedWord} from '../../src/captions/words';
import type {NarrationManifest, Transcript} from '../../src/config/project';
import {capture} from './exec';
import {fileHash, NARRATION_MANIFEST, sha1, TRANSCRIPT_FILE, type LoadedProject} from './project';
import {TOOL_PATHS, TOOLS_DIR, VOICES} from './tools';
import {synthesize} from './tts/elevenlabs';

export function audioDuration(file: string): number {
  const r = capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const d = Number(r.stdout.trim());
  if (!Number.isFinite(d)) throw new Error(`ffprobe could not read ${file}: ${r.stderr}`);
  return d;
}

/** Hash of everything that changes the spoken audio for a scene. */
export function narrationTextHash(p: LoadedProject, narration: string) {
  const a = p.audio;
  const voiceKey =
    a.provider === 'elevenlabs'
      ? ['elevenlabs', a.voice, a.model, a.voiceSettings ?? null]
      : a.provider === 'edge'
        ? ['edge', a.voice, a.rate]
        : [a.voice, a.speaker ?? null, a.lengthScale];
  return sha1(JSON.stringify([spokenText(narration), ...voiceKey]));
}

const EDGE_LICENSE = {
  license:
    'Microsoft Edge online TTS via edge-tts — unofficial endpoint, no publishing rights granted; personal / non-monetised use only. To monetise, re-voice with Azure AI Speech (paid tier, same voice name).',
  attribution: null,
};
const EDGE_HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tts', 'edge_tts_cli.py');

const ELEVENLABS_LICENSE = {
  license: 'ElevenLabs output — commercial use requires a paid plan',
  attribution: 'Free plan only: put "elevenlabs.io" in the video title and do not monetise.',
};

export interface VoiceoverPlan {
  toGenerate: string[];
  characters: number;
}

/** Which scenes need (re)generating, and how many characters that bills. */
export function planVoiceover(p: LoadedProject, opts: {force?: boolean; only?: string} = {}): VoiceoverPlan {
  const prev = p.narration?.scenes ?? {};
  const toGenerate: string[] = [];
  let characters = 0;
  for (const s of p.rawStoryboard.scenes) {
    if (!s.narration?.trim()) continue;
    if (opts.only && opts.only !== s.id) continue;
    const cached = prev[s.id];
    const fresh = cached?.textHash === narrationTextHash(p, s.narration) && fs.existsSync(path.join(p.dir, cached.file));
    if (opts.force || !fresh) {
      toGenerate.push(s.id);
      characters += spokenText(s.narration).length;
    }
  }
  return {toGenerate, characters};
}

export async function generateVoiceover(p: LoadedProject, opts: {force?: boolean; only?: string} = {}): Promise<NarrationManifest> {
  const provider = p.audio.provider;
  const voice = p.audio.voice;
  let lic: {license: string; attribution: string | null};
  if (provider === 'elevenlabs') {
    lic = ELEVENLABS_LICENSE;
  } else if (provider === 'edge') {
    lic = EDGE_LICENSE;
    const check = spawnSync('python', ['-c', 'import edge_tts'], {encoding: 'utf8'});
    if (check.status !== 0) throw new Error('edge-tts is not installed for `python`. Install with: python -m pip install edge-tts');
  } else {
    const model = TOOL_PATHS.piperVoice(voice);
    if (!fs.existsSync(TOOL_PATHS.piper) || !fs.existsSync(model)) throw new Error(`Piper or voice "${voice}" missing. Run: npm run setup:tools`);
    const cleared = VOICES[voice];
    if (!cleared) console.warn(`  WARN  voice "${voice}" is not in the cleared list in scripts/lib/tools.ts — check its licence.`);
    lic = {license: cleared?.license ?? 'unknown', attribution: cleared?.attribution ?? null};
  }

  const outDir = path.join(p.dir, 'audio', 'narration');
  fs.mkdirSync(outDir, {recursive: true});
  const prev = p.narration?.scenes ?? {};
  const plan = new Set(planVoiceover(p, opts).toGenerate);
  const manifest: NarrationManifest = {
    provider,
    voice,
    model: provider === 'elevenlabs' ? p.audio.model : provider === 'edge' ? `rate ${p.audio.rate}` : undefined,
    speaker: provider === 'piper' ? p.audio.speaker : undefined,
    license: lic.license,
    attribution: lic.attribution,
    scenes: {},
  };
  const narrated = p.rawStoryboard.scenes.filter((s) => s.narration?.trim());

  for (const [i, s] of narrated.entries()) {
    const file = `audio/narration/${s.id}.wav`;
    const abs = path.join(p.dir, file);
    const textHash = narrationTextHash(p, s.narration!);
    if (!plan.has(s.id)) {
      if (prev[s.id]) {
        manifest.scenes[s.id] = prev[s.id];
        console.log(`  skip  ${s.id} (unchanged)`);
      }
      continue;
    }
    const t = Date.now();
    const text = spokenText(s.narration!);
    let timing: string | undefined;

    if (provider === 'elevenlabs') {
      const r = await synthesize(text, {
        voiceId: voice,
        modelId: p.audio.model,
        voiceSettings: p.audio.voiceSettings as never,
        previousText: i > 0 ? spokenText(narrated[i - 1].narration!) : undefined,
        nextText: i < narrated.length - 1 ? spokenText(narrated[i + 1].narration!) : undefined,
      });
      const mp3 = path.join(outDir, `${s.id}.mp3`);
      fs.writeFileSync(mp3, r.mp3);
      const conv = capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', mp3, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', abs]);
      if (conv.code !== 0) throw new Error(`ffmpeg could not decode ElevenLabs audio for "${s.id}": ${conv.stderr}`);
      if (r.words.length) {
        timing = `audio/narration/${s.id}.timing.json`;
        fs.writeFileSync(path.join(p.dir, timing), JSON.stringify({engine: `elevenlabs ${p.audio.model}`, words: r.words}, null, 2));
      }
    } else if (provider === 'edge') {
      const mp3 = path.join(outDir, `${s.id}.mp3`);
      timing = `audio/narration/${s.id}.timing.json`;
      const r = spawnSync('python', [EDGE_HELPER, voice, p.audio.rate, mp3, path.join(p.dir, timing)], {input: text, encoding: 'utf8'});
      if (r.status !== 0 || !fs.existsSync(mp3)) throw new Error(`edge-tts failed on scene "${s.id}": ${r.stderr.slice(-400)}`);
      const conv = capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', mp3, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', abs]);
      if (conv.code !== 0) throw new Error(`ffmpeg could not decode edge-tts audio for "${s.id}": ${conv.stderr}`);
    } else {
      const args = ['--model', TOOL_PATHS.piperVoice(voice), '--output_file', abs, '--sentence_silence', '0.3', '--length_scale', String(p.audio.lengthScale)];
      if (p.audio.speaker !== undefined) args.push('--speaker', String(p.audio.speaker));
      const r = spawnSync(TOOL_PATHS.piper, args, {input: text, encoding: 'utf8'});
      if (r.status !== 0 || !fs.existsSync(abs)) throw new Error(`Piper failed on scene "${s.id}": ${r.stderr}`);
    }
    const duration = audioDuration(abs);
    manifest.scenes[s.id] = {file, duration, textHash, ...(timing ? {timing} : {})};
    console.log(`  voice ${s.id}: ${duration.toFixed(2)}s (${((Date.now() - t) / 1000).toFixed(1)}s${provider === 'elevenlabs' ? `, ${text.length} chars` : ''})`);
    // Persist after every clip so a failure midway never re-bills finished scenes.
    fs.writeFileSync(path.join(p.dir, NARRATION_MANIFEST), JSON.stringify({...manifest, scenes: {...prev, ...manifest.scenes}}, null, 2));
  }

  // Remove audio for scenes that no longer have narration.
  for (const f of fs.readdirSync(outDir)) {
    const id = f.replace(/\.(wav|mp3|timing\.json)$/, '');
    if (/\.(wav|mp3|json)$/.test(f) && f !== 'manifest.json' && !manifest.scenes[id]) {
      fs.rmSync(path.join(outDir, f));
      console.log(`  rm    ${f} (scene has no narration)`);
    }
  }
  fs.writeFileSync(path.join(p.dir, NARRATION_MANIFEST), JSON.stringify(manifest, null, 2));
  return manifest;
}

interface WhisperToken {
  text: string;
  offsets: {from: number; to: number};
}

/**
 * Runs whisper.cpp; returns recognised words with times relative to the clip.
 * No script prompt: feeding whisper the exact text makes it skip/compress
 * speech it believes it has "already seen" (observed in testing). The script
 * is applied afterwards by alignment instead.
 */
export function recognize(wav: string, model = 'base.en'): RecognizedWord[] {
  const work = path.join(TOOLS_DIR, '.work');
  fs.mkdirSync(work, {recursive: true});
  const base = path.join(work, `${path.basename(wav, '.wav')}-${Date.now()}`);
  const wav16 = `${base}.16k.wav`;
  const duration = audioDuration(wav);
  // 1 s of trailing silence: whisper squashes timestamps when speech runs to the end of the file.
  const conv = capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-af', 'apad=pad_dur=1', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav16]);
  if (conv.code !== 0) throw new Error(`ffmpeg resample failed: ${conv.stderr}`);

  const args = ['-m', TOOL_PATHS.whisperModel(model), '-f', wav16, '-l', 'en', '-ojf', '-of', base, '-np', '-t', '4'];
  const r = capture(TOOL_PATHS.whisperCli, args);
  if (r.code !== 0 || !fs.existsSync(`${base}.json`)) throw new Error(`whisper-cli failed: ${r.stderr.slice(-400)}`);

  const data = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));
  const words: RecognizedWord[] = [];
  for (const seg of data.transcription) {
    for (const tok of seg.tokens as WhisperToken[]) {
      // Skip special tokens ([_BEG_], <|endoftext|>, ...).
      if (/^\s*(\[_|<\|)/.test(tok.text) || !tok.text.trim()) continue;
      const last = words[words.length - 1];
      // A leading space starts a new word; otherwise the token continues the previous one.
      if (!last || tok.text.startsWith(' ')) words.push({word: tok.text.trim(), start: tok.offsets.from / 1000, end: tok.offsets.to / 1000});
      else {
        last.word += tok.text;
        last.end = tok.offsets.to / 1000;
      }
    }
  }
  for (const f of [wav16, `${base}.json`]) fs.rmSync(f, {force: true});
  // Clamp to the real clip (padding and whisper's 30 s windows can push past it).
  for (const w of words) {
    w.start = Math.min(w.start, duration);
    w.end = Math.min(Math.max(w.end, w.start), duration);
  }
  return words;
}

export function transcribeProject(p: LoadedProject, opts: {force?: boolean; verify?: boolean} = {}): Transcript {
  if (!p.narration) throw new Error('No narration yet. Run: npm run voiceover');
  const prev = p.transcript?.scenes ?? {};
  const engines = new Set<string>();
  const out: Transcript = {engine: '', scenes: {}};

  for (const s of p.rawStoryboard.scenes) {
    const n = p.narration.scenes[s.id];
    if (!s.narration || !n) continue;
    const wav = path.join(p.dir, n.file);
    const audioHash = fileHash(wav);
    const script = parseNarration(s.narration);
    const t = Date.now();

    // Engine timing (ElevenLabs) is exact: the voice reports when it spoke each character.
    if (n.timing && fs.existsSync(path.join(p.dir, n.timing))) {
      const timing = JSON.parse(fs.readFileSync(path.join(p.dir, n.timing), 'utf8')) as {engine: string; words: RecognizedWord[]};
      const words = alignScript(script, splitGroupedWords(timing.words), n.duration);
      out.scenes[s.id] = {audioHash, words, recognized: timing.words.map((w) => w.word).join(' ')};
      engines.add(`${timing.engine} (character alignment)`);
      const matched = words.filter((w) => w.matched).length;
      console.log(`  words ${s.id}: ${matched}/${words.length} from voice-engine timing`);
      if (opts.verify) verifyWithWhisper(s.id, wav, words);
      continue;
    }

    if (!fs.existsSync(TOOL_PATHS.whisperCli)) throw new Error('whisper.cpp missing. Run: npm run setup:tools');
    if (!opts.force && prev[s.id]?.audioHash === audioHash) {
      out.scenes[s.id] = prev[s.id];
      engines.add('whisper.cpp b5454 ggml-base.en (timing) + script text (display)');
      console.log(`  skip  ${s.id} (audio unchanged)`);
      continue;
    }
    const rec = recognize(wav);
    const words = alignScript(script, rec, n.duration);
    const matched = words.filter((w) => w.matched).length;
    out.scenes[s.id] = {audioHash, words, recognized: rec.map((r) => r.word).join(' ')};
    engines.add('whisper.cpp b5454 ggml-base.en (timing) + script text (display)');
    console.log(`  words ${s.id}: ${matched}/${words.length} matched exactly (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    const misses = words.filter((w) => !w.matched).map((w) => w.text);
    if (misses.length) console.log(`        timed by alignment/interpolation: ${misses.join(', ')}`);
  }
  out.engine = [...engines].join('; ');
  fs.writeFileSync(path.join(p.dir, TRANSCRIPT_FILE), JSON.stringify(out, null, 2));
  return out;
}

/**
 * Some engines report a phrase as one boundary ("in 1968", "September 11").
 * Split it into words, sharing the boundary's time by word length, so each
 * word can match the script exactly.
 */
function splitGroupedWords(words: RecognizedWord[]): RecognizedWord[] {
  return words.flatMap((w) => {
    const parts = w.word.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return [w];
    const total = parts.reduce((n, x) => n + x.length, 0);
    let t = w.start;
    return parts.map((part) => {
      const d = ((w.end - w.start) * part.length) / total;
      const out = {word: part, start: t, end: t + d};
      t += d;
      return out;
    });
  });
}

/** Independent check: whisper's word starts vs the engine's, for words both agree on. */
function verifyWithWhisper(id: string, wav: string, words: {text: string; start: number}[]) {
  if (!fs.existsSync(TOOL_PATHS.whisperCli)) return;
  const rec = recognize(wav);
  const diffs: number[] = [];
  let j = 0;
  for (const w of words) {
    const k = rec.findIndex((r, idx) => idx >= j && normWord(r.word) === normWord(w.text));
    if (k >= 0) {
      diffs.push(Math.abs(rec[k].start - w.start));
      j = k + 1;
    }
  }
  if (!diffs.length) return console.log(`        verify: no comparable words`);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const max = Math.max(...diffs);
  console.log(`        verify (whisper): ${diffs.length} words compared, mean start diff ${(mean * 1000).toFixed(0)} ms, max ${(max * 1000).toFixed(0)} ms`);
}
