/**
 * Audio mix (FFmpeg): narration + ducked music bed + SFX -> loudness-normalised
 * audio/mix.wav, which Remotion plays as a single track.
 *
 * Ducking is deterministic: narration timing is known exactly, so music
 * follows a smooth volume envelope (ramps down before speech, back up after)
 * rather than a compressor reacting to the signal.
 */
import fs from 'node:fs';
import path from 'node:path';
import {findCue} from '../../src/captions/words';
import {buildTimeline, narrationStarts} from '../../src/config/project';
import {capture} from './exec';
import {MIX_FILE, MIX_META, mixKey, type LoadedProject} from './project';

const RAMP_DOWN = 0.25;
const RAMP_UP = 0.6;
/** Gaps shorter than this between narration clips stay ducked (no pumping). */
const BRIDGE = 1.2;

export interface MixReport {
  file: string;
  duration: number;
  narrationClips: number;
  music: string | null;
  sfx: number;
  duckedSpans: [number, number][];
  measured: {inputI: number; inputTP: number; outputI: number; outputTP: number};
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function buildMix(p: LoadedProject, fps: number): MixReport {
  const {scenes, durationInFrames} = buildTimeline(p.storyboard, fps);
  const T = durationInFrames / fps;
  const starts = narrationStarts(p.storyboard, fps);
  const work = path.join(p.dir, 'audio', '.mixwork');
  fs.mkdirSync(work, {recursive: true});

  const inputs: string[] = [];
  const chains: string[] = [];
  const mixLabels: string[] = [];

  // --- Narration: gentle cleanup only (high-pass, light 2.5:1 compression).
  const clips = scenes
    .filter((t) => t.scene.narration && p.narration?.scenes[t.scene.id])
    .map((t) => ({id: t.scene.id, file: path.join(p.dir, p.narration!.scenes[t.scene.id].file), start: starts[t.scene.id], dur: p.narration!.scenes[t.scene.id].duration}));
  clips.forEach((c, i) => {
    inputs.push('-i', c.file);
    chains.push(
      `[${countInputs(inputs) - 1}:a]aresample=48000,aformat=channel_layouts=mono,highpass=f=70,` +
        `acompressor=threshold=-20dB:ratio=2.5:attack=10:release=180,adelay=${Math.round(c.start * 1000)}:all=1[n${i}]`,
    );
  });
  if (clips.length) {
    chains.push(`${clips.map((_, i) => `[n${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,aformat=channel_layouts=stereo[narr]`);
    mixLabels.push('[narr]');
  }

  // --- Ducked spans: narration intervals, bridged across short gaps.
  const spans: [number, number][] = [];
  for (const c of clips) {
    const last = spans[spans.length - 1];
    if (last && c.start - last[1] < BRIDGE) last[1] = Math.max(last[1], c.start + c.dur);
    else spans.push([c.start, c.start + c.dur]);
  }

  // --- Music bed.
  let musicName: string | null = null;
  if (p.audio.music) {
    const asset = p.assets[p.audio.music];
    if (!asset) throw new Error(`project.json audio.music = "${p.audio.music}" is not in assets.json`);
    musicName = p.audio.music;
    inputs.push('-stream_loop', '-1', '-i', path.join(p.dir, asset.path));
    const idx = countInputs(inputs) - 1;
    const g = Math.pow(10, p.audio.duckDb / 20);
    // duck(t) = max over spans of a trapezoid: 0 outside, 1 inside, linear ramps.
    const trap = ([a, b]: [number, number]) =>
      `clip((t-${r3(a - RAMP_DOWN)})/${RAMP_DOWN},0,1)*clip((${r3(b + RAMP_UP)}-t)/${RAMP_UP},0,1)`;
    const duck = spans.length ? spans.map(trap).reduce((acc, e) => `max(${acc},${e})`) : '0';
    // Music ends with a slow fade at the end, or cuts dead at a chosen scene.
    const cut = p.audio.musicCutAt ? scenes.find((t) => t.scene.id === p.audio.musicCutAt) : undefined;
    if (p.audio.musicCutAt && !cut) throw new Error(`audio.musicCutAt "${p.audio.musicCutAt}" is not a scene id`);
    const end = cut ? cut.from / fps : T;
    const fadeLen = p.audio.musicFadeOut ?? 2.5;
    const fadeOut = cut
      ? `afade=t=out:st=${r3(Math.max(0, end - 0.06))}:d=0.06,apad,atrim=0:${r3(T)}`
      : fadeLen > 0
        ? `afade=t=out:st=${r3(Math.max(0, T - fadeLen))}:d=${r3(fadeLen)}`
        : 'apad';
    chains.push(
      `[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${r3(p.audio.musicStart ?? 0)},asetpts=PTS-STARTPTS,atrim=0:${r3(end)},` +
        `afade=t=in:d=1.5,${fadeOut},` +
        `volume=${p.audio.musicDb}dB,volume='1-${r3(1 - g)}*(${duck})':eval=frame[music]`,
    );
    mixLabels.push('[music]');
  }

  // --- SFX at scene-relative times.
  let sfxCount = 0;
  scenes.forEach((t) => {
    for (const fx of t.scene.sfx ?? []) {
      const asset = p.assets[fx.asset.replace(/^asset:/, '')];
      if (!asset) throw new Error(`scene "${t.scene.id}" sfx "${fx.asset}" is not in assets.json`);
      inputs.push('-i', path.join(p.dir, asset.path));
      const idx = countInputs(inputs) - 1;
      let at: number;
      if (typeof fx.at === 'number') at = t.from / fps + fx.at;
      else {
        // Cue word: lands exactly when the narrator says it.
        const words = p.transcript?.scenes[t.scene.id]?.words;
        const k = words ? findCue(words, fx.at) : -1;
        if (!words || k < 0) throw new Error(`scene "${t.scene.id}" sfx cue "${fx.at}" not found in its transcript (run npm run transcribe)`);
        at = starts[t.scene.id] + words[k].start;
      }
      at = Math.max(0, at + (fx.offset ?? 0));
      // A music cut means true silence: SFX already ringing at the cut stop with it.
      const cutScene = p.audio.musicCutAt ? scenes.find((sc) => sc.scene.id === p.audio.musicCutAt) : undefined;
      const cutAt = cutScene ? cutScene.from / fps : null;
      const gate = cutAt !== null && at < cutAt ? `,afade=t=out:st=${r3(Math.max(0, cutAt - at - 0.06))}:d=0.06,atrim=0:${r3(Math.max(0.01, cutAt - at))}` : '';
      const tempo = fx.tempo ? `,atempo=${r3(fx.tempo)}` : '';
      chains.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo${tempo},volume=${fx.gainDb ?? -6}dB${gate},adelay=${Math.round(at * 1000)}:all=1[fx${sfxCount}]`);
      mixLabels.push(`[fx${sfxCount++}]`);
    }
  });

  if (!mixLabels.length) throw new Error('Nothing to mix: no narration, music or SFX.');

  // Silent base track fixes the exact length.
  chains.push(`anullsrc=r=48000:cl=stereo,atrim=0:${r3(T)}[base]`);
  chains.push(`[base]${mixLabels.join('')}amix=inputs=${mixLabels.length + 1}:normalize=0:duration=first[mix]`);

  const graphFile = path.join(work, 'graph.txt');
  fs.writeFileSync(graphFile, chains.join(';\n'));
  const premix = path.join(work, 'premix.wav');
  run(['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-/filter_complex', graphFile, '-map', '[mix]', '-t', String(r3(T)), '-c:a', 'pcm_s24le', premix], 'premix');

  // --- Two-pass loudness normalisation (EBU R128).
  const target = `I=${p.audio.targetLufs}:TP=${p.audio.truePeak}:LRA=11`;
  const pass1 = capture('ffmpeg', ['-hide_banner', '-nostats', '-i', premix, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
  const json = pass1.stderr.slice(pass1.stderr.lastIndexOf('{'), pass1.stderr.lastIndexOf('}') + 1);
  const m = JSON.parse(json);
  const out = path.join(p.dir, MIX_FILE);
  const pass2 = capture('ffmpeg', [
    '-y', '-hide_banner', '-nostats', '-i', premix,
    '-af',
    `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json,aresample=48000`,
    '-c:a', 'pcm_s16le', out,
  ]);
  if (pass2.code !== 0) throw new Error(`loudnorm pass 2 failed: ${pass2.stderr.slice(-400)}`);
  const m2 = JSON.parse(pass2.stderr.slice(pass2.stderr.lastIndexOf('{'), pass2.stderr.lastIndexOf('}') + 1));

  fs.rmSync(work, {recursive: true, force: true});
  const report: MixReport = {
    file: MIX_FILE,
    duration: r3(T),
    narrationClips: clips.length,
    music: musicName,
    sfx: sfxCount,
    duckedSpans: spans.map(([a, b]) => [r3(a), r3(b)]),
    measured: {inputI: Number(m.input_i), inputTP: Number(m.input_tp), outputI: Number(m2.output_i), outputTP: Number(m2.output_tp)},
  };
  fs.writeFileSync(path.join(p.dir, MIX_META), JSON.stringify({key: mixKey(p, fps), ...report}, null, 2));
  return report;
}

function countInputs(args: string[]) {
  return args.filter((a) => a === '-i').length;
}

function run(args: string[], label: string) {
  const r = capture('ffmpeg', args);
  if (r.code !== 0) throw new Error(`ffmpeg ${label} failed:\n${r.stderr.slice(-800)}`);
}
