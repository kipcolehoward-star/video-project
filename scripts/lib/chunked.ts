/**
 * Chunked, resumable rendering for long videos on a low-memory machine.
 *
 * A single long render can stall (Chrome idle, nothing written) or be killed
 * by memory pressure. Here the timeline is split into exact, non-overlapping
 * frame ranges, each rendered silently into <output>.parts/ with a fresh
 * browser. Finished parts are recorded in parts.json, so re-running the same
 * command resumes where it stopped. A watchdog cancels and retries a part
 * that makes no progress. Parts are joined losslessly (stream copy) and the
 * master audio mix is muxed in, so there are no audio seams.
 */
import fs from 'node:fs';
import path from 'node:path';
import {makeCancelSignal} from '@remotion/renderer';
import type {MainProps} from '../../src/config/project';
import {capture} from './exec';
import {rel, sha1} from './project';
import {closeBrowser, renderVideo} from './remotion';

/**
 * FFmpeg output options for the master mix in a final MP4. AAC encoding overshoots sharp transients: the Kaliningrad
 * mix at -1.4 dBTP came out at +0.2 dBTP (2026-10-20). A limiter at -3 dBFS, run at 4x the sample rate so it also
 * catches peaks between samples, keeps the file under -1.5 dBTP; it touches only the hits (about -0.3 LU overall).
 */
export const MASTER_AUDIO = ['-af', 'aresample=192000,alimiter=limit=0.708:attack=1:release=50:level=false,aresample=48000', '-c:a', 'aac', '-b:a', '320k'];

export interface ChunkOptions {
  serveUrl: string;
  props: MainProps;
  output: string;
  preview?: boolean;
  /** Inclusive frame range to render (whole timeline if omitted). */
  range: [number, number];
  fps: number;
  /** Target part length in seconds. */
  chunkSeconds?: number;
  /** Absolute path of the master audio to mux in (null: silent video). */
  audioFile: string | null;
  /** Cancel and retry a part after this many seconds without progress. */
  stallSeconds?: number;
  concurrency?: number;
  keepParts?: boolean;
}

interface PartsManifest {
  key: string;
  parts: {range: [number, number]; file: string; done: boolean}[];
}

export async function renderChunked(o: ChunkOptions): Promise<void> {
  const chunk = Math.max(1, Math.round((o.chunkSeconds ?? 60) * o.fps));
  const dir = `${o.output}.parts`;
  const manifestFile = path.join(dir, 'parts.json');
  // Anything that changes the pixels invalidates finished parts.
  const key = sha1(JSON.stringify({props: o.props, preview: Boolean(o.preview), chunk, range: o.range}));

  let m: PartsManifest | null = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
  if (!m || m.key !== key) {
    if (m) console.log('  timeline or settings changed since the last attempt; starting the parts again');
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir, {recursive: true});
    const parts: PartsManifest['parts'] = [];
    for (let a = o.range[0], i = 1; a <= o.range[1]; a += chunk, i++) {
      parts.push({range: [a, Math.min(o.range[1], a + chunk - 1)], file: `part-${String(i).padStart(3, '0')}.mp4`, done: false});
    }
    m = {key, parts};
  }
  const save = () => fs.writeFileSync(manifestFile, JSON.stringify(m, null, 2));
  save();

  const total = m.parts.length;
  const already = m.parts.filter((x) => x.done && fs.existsSync(path.join(dir, x.file))).length;
  console.log(`  ${total} part(s) of ~${o.chunkSeconds ?? 60}s${already ? `, ${already} already done (resuming)` : ''} → ${rel(dir)}`);

  for (const [i, part] of m.parts.entries()) {
    const file = path.join(dir, part.file);
    if (part.done && fs.existsSync(file)) continue;
    console.log(`\n  part ${i + 1}/${total}: frames ${part.range[0]}–${part.range[1]}`);
    for (let attempt = 1; ; attempt++) {
      const {cancelSignal, cancel} = makeCancelSignal();
      let last = Date.now();
      let stalled = false;
      const watchdog = setInterval(() => {
        if (Date.now() - last > (o.stallSeconds ?? 240) * 1000) {
          stalled = true;
          cancel();
        }
      }, 5000);
      try {
        await renderVideo({
          serveUrl: o.serveUrl,
          props: o.props,
          output: file,
          preview: o.preview,
          frameRange: part.range,
          muted: true,
          cancelSignal,
          concurrency: o.concurrency,
          onProgress: () => (last = Date.now()),
        });
        clearInterval(watchdog);
        break;
      } catch (e) {
        clearInterval(watchdog);
        const why = stalled ? `stalled (no progress for ${o.stallSeconds ?? 240}s)` : (e as Error).message.split('\n')[0];
        if (attempt >= 3) throw new Error(`part ${i + 1} failed 3 times: ${why}`);
        console.warn(`\n  part ${i + 1} ${why}; restarting the browser and retrying (${attempt}/2)`);
      } finally {
        // A fresh browser per part releases Chrome's memory on a 4 GB machine.
        await closeBrowser();
      }
    }
    part.done = true;
    save();
  }

  // Join: stream-copy the video parts, mux the master audio once.
  const list = path.join(dir, 'concat.txt');
  fs.writeFileSync(list, m.parts.map((x) => `file '${x.file}'`).join('\n') + '\n');
  const inputs = ['-f', 'concat', '-safe', '0', '-i', list];
  // The master audio covers the whole timeline; seek to where the rendered range starts.
  if (o.audioFile) inputs.push(...(o.range[0] > 0 ? ['-ss', (o.range[0] / o.fps).toFixed(3)] : []), '-i', o.audioFile);
  const maps = o.audioFile ? ['-map', '0:v', '-map', '1:a', ...MASTER_AUDIO, '-shortest'] : ['-map', '0:v', '-an'];
  const args = ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, ...maps, '-c:v', 'copy', '-movflags', '+faststart', o.output];
  const r = capture('ffmpeg', args);
  if (r.code !== 0) throw new Error(`joining parts failed: ${r.stderr}`);

  const frames = Number(capture('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', o.output]).stdout.trim());
  const expected = o.range[1] - o.range[0] + 1;
  if (frames !== expected) throw new Error(`joined video has ${frames} frames, expected ${expected}`);
  console.log(`\n  joined ${total} part(s): ${frames} frames, ${o.audioFile ? 'master audio muxed' : 'silent'}`);
  if (!o.keepParts) fs.rmSync(dir, {recursive: true, force: true});
}
