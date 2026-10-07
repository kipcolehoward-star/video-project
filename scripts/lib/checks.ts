/**
 * Pre-render checks: storyboard integrity, assets, fonts, and layout
 * (safe zones, overlaps, likely text overflow) for any target format.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {VideoFormat} from '../../src/config/formats';
import {pagingFor} from '../../src/captions/Captions';
import {buildPages, findCue, globalWords, parseNarration} from '../../src/captions/words';
import {buildTimeline, narrationOffset, type CaptionStyle} from '../../src/config/project';
import {captionLayout, contains, createLayoutContext, estimateTextHeight, intersects, type LayoutContext, type Region} from '../../src/layouts/engine';
import {SCENES} from '../../src/scenes/registry';
import {buildProps, currentMix, fileHash, ROOT, type LoadedProject} from './project';
import {narrationTextHash} from './speech';
import {geoProblems} from './geodata';

/** The layout context the renderer will use for this project + format. */
export function layoutContextFor(p: LoadedProject, format: VideoFormat, captionStyle?: string): LayoutContext {
  const props = buildProps(p, format, {captionStyle});
  return createLayoutContext(format, p.config.safeZoneProfile, {captionStyle: props.transcript ? props.captionStyle : 'none'});
}

export type Level = 'error' | 'warn' | 'ok';
export interface Finding {
  level: Level;
  check: string;
  message: string;
}

const f = (level: Level, check: string, message: string): Finding => ({level, check, message});

export function checkStoryboard(p: LoadedProject, format: VideoFormat): Finding[] {
  const out: Finding[] = [];
  const ids = new Set<string>();
  if (!p.storyboard.scenes?.length) out.push(f('error', 'storyboard', 'storyboard.json has no scenes'));
  for (const s of p.storyboard.scenes ?? []) {
    if (ids.has(s.id)) out.push(f('error', 'storyboard', `duplicate scene id "${s.id}"`));
    ids.add(s.id);
    if (!SCENES[s.type]) out.push(f('error', 'storyboard', `scene "${s.id}": unknown type "${s.type}"`));
    if (!(s.duration > 0)) out.push(f('error', 'scene-timing', `scene "${s.id}": duration must be > 0`));
    // Narration cues must exist in this scene's narration, or the animation falls back to guessed timing.
    for (const cue of SCENES[s.type]?.cues?.(s.data) ?? []) {
      if (!s.narration) out.push(f('warn', 'cue', `scene "${s.id}": cue "${cue}" but the scene has no narration (using fallback timing)`));
      else if (findCue(parseNarration(s.narration), cue) < 0) out.push(f('error', 'cue', `scene "${s.id}": cue "${cue}" does not appear in its narration`));
    }
    for (const fx of s.sfx ?? []) {
      if (typeof fx.at === 'string' && (!s.narration || findCue(parseNarration(s.narration), fx.at) < 0)) {
        out.push(f('error', 'cue', `scene "${s.id}": sfx cue "${fx.at}" does not appear in its narration`));
      }
    }
    if (s.transitionIn?.type === 'fade' && (s.transitionIn.duration ?? 0.5) >= s.duration) {
      out.push(f('error', 'scene-timing', `scene "${s.id}": fade is longer than the scene`));
    }
  }
  const {durationInFrames} = buildTimeline(p.storyboard, format.fps);
  const seconds = durationInFrames / format.fps;
  out.push(f('ok', 'duration', `timeline ${seconds.toFixed(2)}s (${durationInFrames} frames @ ${format.fps}fps)`));
  const target = p.config.video.duration;
  if (target && Math.abs(target - seconds) > 0.5) {
    out.push(f('warn', 'duration', `timeline is ${seconds.toFixed(2)}s but project.json target is ${target}s`));
  }
  return out;
}

export function checkAssets(p: LoadedProject): Finding[] {
  const out: Finding[] = [];
  for (const [id, a] of Object.entries(p.assets)) {
    const abs = path.join(p.dir, a.path);
    if (!fs.existsSync(abs)) out.push(f('error', 'missing-asset', `asset "${id}": file not found (${a.path})`));
    if (!a.source || a.source.toLowerCase() === 'unknown') out.push(f('warn', 'asset-source', `asset "${id}": source unknown — verify before publishing`));
    if (!a.license || a.license.toLowerCase() === 'unknown') out.push(f('warn', 'asset-license', `asset "${id}": license unknown — verify before publishing`));
  }
  for (const s of p.storyboard.scenes ?? []) {
    const refs = SCENES[s.type]?.assetRefs?.(s.data) ?? [];
    for (const ref of refs) {
      const id = ref.replace(/^asset:/, '');
      if (!p.assets[id]) out.push(f('error', 'missing-asset', `scene "${s.id}" references "${id}" which is not in assets.json`));
    }
  }
  if (!out.some((x) => x.level !== 'ok')) out.push(f('ok', 'assets', `${Object.keys(p.assets).length} asset(s) present with source + license`));
  return out;
}

const FONT_FILES = [
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  'node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2',
  'node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2',
  'node_modules/@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2',
];

export function checkGeo(p: LoadedProject): Finding[] {
  const probs = geoProblems(p);
  return probs.map((m) => f('error', 'geo-data', m));
}

export function checkFonts(): Finding[] {
  const missing = FONT_FILES.filter((x) => !fs.existsSync(path.join(ROOT, x)));
  return missing.length
    ? missing.map((m) => f('error', 'missing-font', `${m} not found — run npm install`))
    : [f('ok', 'fonts', `${FONT_FILES.length} bundled font files present`)];
}

export function checkLayout(p: LoadedProject, format: VideoFormat, captionStyle?: string): Finding[] {
  const out: Finding[] = [];
  const ctx = layoutContextFor(p, format, captionStyle);
  const captions = captionLayout(ctx);
  const frame = {x: 0, y: 0, w: ctx.W, h: ctx.H};
  let problems = 0;

  for (const s of p.storyboard.scenes ?? []) {
    const def = SCENES[s.type];
    if (!def) continue;
    const regions: Record<string, Region> = {...def.regions(ctx, s.data), ...(captions ? {captions} : {})};
    const entries = Object.entries(regions);
    const where = `[${format.id}] scene "${s.id}"`;

    for (const [name, r] of entries) {
      if (r.w <= 0 || r.h <= 0) {
        out.push(f('error', 'layout', `${where}: region "${name}" has no area (${Math.round(r.w)}x${Math.round(r.h)})`));
        problems++;
      }
      if (!contains(frame, r)) {
        out.push(f('error', 'layout', `${where}: region "${name}" extends outside the frame`));
        problems++;
      }
      // Scene text must clear the caption band; overlays (lower thirds, captions) only the platform safe zone.
      const zone = r.role === 'text' ? ctx.safe : ctx.platformSafe;
      if ((r.role === 'text' || r.role === 'overlay') && !contains(zone, r)) {
        out.push(f('error', 'safe-zone', `${where}: ${r.role} region "${name}" is outside the safe zone`));
        problems++;
      }
    }

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [an, a] = entries[i];
        const [bn, b] = entries[j];
        const roles = new Set([a.role, b.role]);
        const conflict =
          (a.role === 'text' && b.role === 'text') ||
          (roles.has('text') && roles.has('media')) ||
          (roles.has('text') && roles.has('overlay'));
        if (conflict && intersects(a, b)) {
          out.push(f('error', 'overlap', `${where}: "${an}" (${a.role}) overlaps "${bn}" (${b.role})`));
          problems++;
        }
      }
    }

    // Estimated text overflow, summed per region (+ ~1 line of spacing per extra block).
    const byRegion = new Map<string, number>();
    for (const t of def.textBlocks?.(ctx, s.data) ?? []) {
      const r = regions[t.region];
      if (!r) continue;
      const h = estimateTextHeight(t.text, t.fontSize, r.w, t.lineHeight ?? 1.2);
      byRegion.set(t.region, (byRegion.get(t.region) ?? 0) + h + (byRegion.has(t.region) ? ctx.type.label * 1.5 : 0));
    }
    for (const [name, needed] of byRegion) {
      const r = regions[name];
      if (needed > r.h) {
        out.push(f('warn', 'text-overflow', `${where}: text in "${name}" may overflow (~${Math.round(needed)}px needed, ${Math.round(r.h)}px available)`));
        problems++;
      }
    }
  }
  if (!problems) out.push(f('ok', 'layout', `[${format.id}] all scenes: text inside safe zone, no overlaps, no estimated overflow${captions ? ` (with ${ctx.captionStyle} captions)` : ''}`));
  return out;
}

export function printFindings(title: string, findings: Finding[]) {
  const icon = {ok: '  ok ', warn: ' WARN', error: 'ERROR'};
  console.log(`\n${title}`);
  for (const x of findings) console.log(`${icon[x.level]}  ${x.check.padEnd(14)} ${x.message}`);
}

export const hasErrors = (fs: Finding[]) => fs.some((x) => x.level === 'error');

/** Narration audio, transcript, caption timing and mix freshness. */
export function checkNarration(p: LoadedProject, format: VideoFormat, captionStyle?: string): Finding[] {
  const out: Finding[] = [];
  const narrated = p.rawStoryboard.scenes.filter((s) => s.narration?.trim());
  if (!narrated.length) return [f('ok', 'narration', 'no narration in storyboard (silent video)')];

  const {scenes, durationInFrames} = buildTimeline(p.storyboard, format.fps);
  const total = durationInFrames / format.fps;
  let problems = 0;
  const bad = (level: Level, check: string, msg: string) => {
    out.push(f(level, check, msg));
    problems++;
  };

  scenes.forEach((t, i) => {
    const s = p.rawStoryboard.scenes[i];
    if (!s.narration?.trim()) return;
    const n = p.narration?.scenes[s.id];
    if (!n) return bad('error', 'narration', `scene "${s.id}": no voiceover - run npm run voiceover`);
    if (!fs.existsSync(path.join(p.dir, n.file))) return bad('error', 'narration', `scene "${s.id}": ${n.file} missing`);
    if (n.textHash !== narrationTextHash(p, s.narration)) bad('error', 'narration', `scene "${s.id}": narration text or voice changed since voiceover - run npm run voiceover`);
    const sceneSecs = t.durationInFrames / format.fps;
    if (narrationOffset(s, i) + n.duration > sceneSecs + 0.01) bad('error', 'narration-timing', `scene "${s.id}": voiceover (${n.duration.toFixed(2)}s) overruns the scene`);

    const tr = p.transcript?.scenes[s.id];
    if (!tr) return bad('error', 'caption-timing', `scene "${s.id}": no word timings - run npm run transcribe`);
    if (tr.audioHash !== fileHash(path.join(p.dir, n.file))) bad('error', 'caption-timing', `scene "${s.id}": transcript is older than the audio - run npm run transcribe`);
    const expected = parseNarration(s.narration).length;
    if (tr.words.length !== expected) bad('error', 'caption-timing', `scene "${s.id}": ${tr.words.length} timed words but script has ${expected}`);
    const ordered = tr.words.every((w, k) => w.end >= w.start && (k === 0 || w.start >= tr.words[k - 1].end - 1e-6));
    if (!ordered) bad('error', 'caption-timing', `scene "${s.id}": word timings out of order`);
    const last = tr.words[tr.words.length - 1];
    if (last && last.end > n.duration + 0.15) bad('error', 'caption-timing', `scene "${s.id}": last word ends after the audio`);
    const matched = tr.words.filter((w) => w.matched).length / Math.max(1, tr.words.length);
    if (matched < 0.8) bad('warn', 'narration', `scene "${s.id}": only ${(matched * 100).toFixed(0)}% of words recognised - listen for mispronunciation (heard: "${tr.recognized}")`);
  });

  // Caption pages exactly as they will render in this format.
  if (p.transcript) {
    const props = buildProps(p, format, {captionStyle});
    const style = props.captionStyle as CaptionStyle;
    if (style !== 'none') {
      const ctx = layoutContextFor(p, format, captionStyle);
      const pages = buildPages(globalWords(p.storyboard, p.transcript, format.fps), pagingFor(ctx, style));
      const minRead = style === 'kinetic' ? 0.2 : 0.7;
      const short = pages.filter((pg) => pg.end - pg.start < minRead);
      if (short.length) bad('warn', 'caption-timing', `[${format.id}] ${short.length} ${style} caption page(s) shorter than ${minRead}s (first at ${short[0].start.toFixed(2)}s)`);
      if (pages.some((pg, k) => k > 0 && pg.start < pages[k - 1].end - 1e-6)) bad('error', 'caption-timing', `[${format.id}] caption pages overlap`);
      if (pages.length && pages[pages.length - 1].end > total + 0.01) bad('error', 'caption-timing', `[${format.id}] captions run past the end of the video`);
      if (!problems) out.push(f('ok', 'captions', `[${format.id}] ${pages.length} ${style} caption page(s), timed from the voiceover`));
    }
  }

  if (!currentMix(p, format.fps)) bad('error', 'audio-mix', 'audio/mix.wav missing or out of date with the timeline - run npm run audio (render does this automatically)');
  if (p.narration?.attribution) out.push(f('warn', 'attribution', `voice requires credit: "${p.narration.attribution}"`));
  if (!problems) out.push(f('ok', 'narration', `${narrated.length} narrated scene(s): audio, word timings and mix are current`));
  return out;
}
