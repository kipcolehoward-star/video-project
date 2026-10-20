/**
 * Post-render QC on an encoded file, via ffprobe/ffmpeg.
 */
import fs from 'node:fs';
import {capture} from './exec';
import type {Finding} from './checks';

const f = (level: Finding['level'], check: string, message: string): Finding => ({level, check, message});

export interface Expected {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  /** When set, loudness and true peak are checked against these. */
  targetLufs?: number;
  truePeak?: number;
  /** Narrated videos must have an audio stream. */
  requireAudio?: boolean;
  /** Kinetic style: error on any stretch longer than this (seconds) where the picture does not change. */
  maxFreeze?: number;
}

export function qcFile(file: string, expected: Expected): Finding[] {
  const out: Finding[] = [];
  if (!fs.existsSync(file)) return [f('error', 'missing-media', `${file} does not exist`)];

  const probe = capture('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
  if (probe.code !== 0) return [f('error', 'probe', `ffprobe failed: ${probe.stderr.trim()}`)];
  const info = JSON.parse(probe.stdout);
  const v = info.streams.find((s: {codec_type: string}) => s.codec_type === 'video');
  const a = info.streams.find((s: {codec_type: string}) => s.codec_type === 'audio');
  if (!v) return [f('error', 'probe', 'no video stream')];

  // Resolution + aspect ratio
  const resOk = v.width === expected.width && v.height === expected.height;
  out.push(f(resOk ? 'ok' : 'error', 'resolution', `${v.width}x${v.height} (expected ${expected.width}x${expected.height})`));
  const ar = v.width / v.height;
  const arExp = expected.width / expected.height;
  out.push(f(Math.abs(ar - arExp) < 0.001 ? 'ok' : 'error', 'aspect-ratio', `${ar.toFixed(4)} (expected ${arExp.toFixed(4)})`));
  if (v.sample_aspect_ratio && !['1:1', '0:1', 'N/A'].includes(v.sample_aspect_ratio)) {
    out.push(f('error', 'aspect-ratio', `non-square pixels (SAR ${v.sample_aspect_ratio}) — would display stretched`));
  }

  // Frame rate
  const [n, d] = String(v.r_frame_rate).split('/').map(Number);
  const fps = n / (d || 1);
  out.push(f(Math.abs(fps - expected.fps) < 0.01 ? 'ok' : 'error', 'frame-rate', `${fps.toFixed(3)} fps (expected ${expected.fps})`));

  // Codec / pixel format for broad playback compatibility
  out.push(f(v.pix_fmt === 'yuv420p' ? 'ok' : 'warn', 'pixel-format', `${v.codec_name} ${v.pix_fmt}`));

  // Duration
  const dur = Number(info.format.duration);
  const expDur = expected.durationInFrames / expected.fps;
  const durOk = Math.abs(dur - expDur) <= 1.5 / expected.fps + 0.05;
  out.push(f(durOk ? 'ok' : 'error', 'final-duration', `${dur.toFixed(3)}s (expected ${expDur.toFixed(3)}s)`));

  // Black frames: thresholds tuned so dark documentary backgrounds are not flagged.
  const black = capture('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', 'blackdetect=d=0.25:pic_th=0.98:pix_th=0.03', '-an', '-f', 'null', '-']);
  const segs = [...black.stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `${m[1]}–${m[2]}s`);
  out.push(segs.length ? f('warn', 'black-frames', `black segments: ${segs.join(', ')}`) : f('ok', 'black-frames', 'none ≥0.25s'));

  // Frozen picture (kinetic style). Frames are compared 4 times a second, so a slow drift adds up to a measurable change.
  if (expected.maxFreeze) {
    const fz = capture('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', `fps=4,freezedetect=n=-50dB:d=${expected.maxFreeze}`, '-an', '-f', 'null', '-']);
    const starts = [...fz.stderr.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
    const ends = [...fz.stderr.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => Number(m[1]));
    const spans = starts.map((st, i) => `${st.toFixed(2)}–${ends[i] !== undefined ? ends[i].toFixed(2) : 'end'}s`);
    out.push(spans.length ? f('error', 'frozen', `picture frozen for more than ${expected.maxFreeze}s at ${spans.join(', ')}`) : f('ok', 'frozen', `nothing frozen for more than ${expected.maxFreeze}s`));
  }

  // Audio
  if (!a) {
    out.push(
      expected.requireAudio
        ? f('error', 'audio', 'no audio stream, but the project has narration')
        : f('warn', 'audio', 'no audio stream (expected for silent tests; required for real videos)'),
    );
  } else {
    const aDur = Number(a.duration ?? info.format.duration);
    out.push(f(Math.abs(aDur - dur) < 0.2 ? 'ok' : 'warn', 'audio-duration', `${aDur.toFixed(3)}s vs video ${dur.toFixed(3)}s`));
    const stats = capture('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'astats=metadata=0,ebur128=peak=true', '-f', 'null', '-']);
    const peak = stats.stderr.match(/Peak level dB:\s*(-?[\d.inf]+)/);
    const summary = stats.stderr.slice(stats.stderr.lastIndexOf('Summary:'));
    const lufs = summary.match(/I:\s*(-?[\d.]+) LUFS/);
    const tp = summary.match(/True peak:\s*Peak:\s*(-?[\d.inf]+) dBFS/);
    if (peak) {
      const pk = Number(peak[1]);
      out.push(f(pk >= -0.1 ? 'error' : pk > -1 ? 'warn' : 'ok', 'audio-clipping', `sample peak ${peak[1]} dBFS`));
    }
    if (lufs) {
      const i = Number(lufs[1]);
      const tgt = expected.targetLufs;
      out.push(f(tgt === undefined || Math.abs(i - tgt) <= 1 ? 'ok' : 'warn', 'loudness', `integrated ${i} LUFS${tgt !== undefined ? ` (target ${tgt} ±1)` : ''}`));
    }
    if (tp && expected.truePeak !== undefined) {
      const v = Number(tp[1]);
      out.push(f(v <= expected.truePeak + 0.5 ? 'ok' : 'warn', 'true-peak', `${v} dBTP (limit ${expected.truePeak})`));
    }
  }
  return out;
}
