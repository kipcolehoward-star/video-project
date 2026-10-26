/**
 * Node-side project loading. Builds the exact props the Remotion composition
 * receives, so every stage (validate, render, qc) sees the same data.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveFormat, type VideoFormat} from '../../src/config/formats';
import {SCENES} from '../../src/scenes/registry';
import {
  AUDIO_DEFAULTS,
  narrationStarts,
  resolveCaptionStyle,
  resolveDurations,
  type AssetMeta,
  type AudioConfig,
  type MainProps,
  type NarrationManifest,
  type ProjectConfig,
  type Storyboard,
  type Transcript,
} from '../../src/config/project';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECTS_DIR = path.join(ROOT, 'projects');

export function projectDir(id: string) {
  return path.join(PROJECTS_DIR, id);
}

function readJson<T>(file: string, fallback?: T): T {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing file: ${path.relative(ROOT, file)}`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e) {
    throw new Error(`Invalid JSON in ${path.relative(ROOT, file)}: ${(e as Error).message}`);
  }
}

export function listProjects(): string[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR)
    .filter((d) => fs.existsSync(path.join(PROJECTS_DIR, d, 'project.json')));
}

/** --project flag > ACTIVE_PROJECT env > the only project if there is one. */
export function pickProject(flag?: string): string {
  const id = flag ?? process.env.ACTIVE_PROJECT;
  if (id) {
    if (!fs.existsSync(path.join(projectDir(id), 'project.json'))) {
      throw new Error(`Project "${id}" not found. Available: ${listProjects().join(', ') || '(none)'}`);
    }
    return id;
  }
  const all = listProjects();
  if (all.length === 1) return all[0];
  throw new Error(`Specify a project with --project <id>. Available: ${all.join(', ') || '(none)'}`);
}

export interface LoadedProject {
  id: string;
  dir: string;
  config: ProjectConfig;
  /** As written in storyboard.json. */
  rawStoryboard: Storyboard;
  /** With durations extended to fit narration. Use this everywhere downstream. */
  storyboard: Storyboard;
  assets: Record<string, AssetMeta>;
  narration: NarrationManifest | null;
  transcript: Transcript | null;
  audio: Required<Omit<AudioConfig, 'music' | 'speaker' | 'voiceSettings' | 'musicCutAt' | 'musicStart' | 'musicFadeOut' | 'maxPause'>> & Pick<AudioConfig, 'music' | 'speaker' | 'voiceSettings' | 'musicCutAt' | 'musicStart' | 'musicFadeOut' | 'maxPause'>;
}

export const NARRATION_MANIFEST = 'audio/narration/manifest.json';
export const TRANSCRIPT_FILE = 'transcript.json';
export const MIX_FILE = 'audio/mix.wav';
export const MIX_META = 'audio/mix.json';

export function loadProject(id: string): LoadedProject {
  const dir = projectDir(id);
  const config = readJson<ProjectConfig>(path.join(dir, 'project.json'));
  const rawStoryboard = readJson<Storyboard>(path.join(dir, 'storyboard.json'));
  const narration = readJson<NarrationManifest | null>(path.join(dir, NARRATION_MANIFEST), null);
  return {
    id,
    dir,
    config,
    rawStoryboard,
    storyboard: withImpliedSounds(resolveDurations(rawStoryboard, narration), config),
    assets: readJson<Record<string, AssetMeta>>(path.join(dir, 'assets.json'), {}),
    narration,
    transcript: readJson<Transcript | null>(path.join(dir, TRANSCRIPT_FILE), null),
    audio: {...AUDIO_DEFAULTS, ...config.audio},
  };
}

/**
 * Adds the sounds scene animations imply (SceneDefinition.sounds, e.g. a pop
 * for every highlight) as ordinary sfx, using project.json `sfxKit`. Kinds
 * missing from the kit are left out here and reported by validate.
 */
function withImpliedSounds(sb: Storyboard, config: ProjectConfig): Storyboard {
  const kit = config.sfxKit ?? {};
  return {
    ...sb,
    scenes: sb.scenes.map((s) => {
      const implied = (SCENES[s.type]?.sounds?.(s.data) ?? []).flatMap(({kind, at, offset, span}) => {
        const k = kit[kind];
        if (!k) return [];
        const {asset, gainDb, fit} = typeof k === 'string' ? {asset: k, gainDb: undefined, fit: undefined} : k;
        // Fit the sound to the motion: audible part = first 40% of the move, peak at 10% (see ProjectConfig.sfxKit).
        if (fit && span) {
          const tempo = Math.min(2, Math.max(0.5, fit.span / (0.4 * span)));
          offset = (offset ?? 0) + 0.1 * span - fit.peak / tempo;
          return [{asset, at, offset, ...(tempo !== 1 ? {tempo} : {}), ...(gainDb !== undefined ? {gainDb} : {})}];
        }
        return [{asset, at, ...(offset ? {offset} : {}), ...(gainDb !== undefined ? {gainDb} : {})}];
      });
      return implied.length ? {...s, sfx: [...(s.sfx ?? []), ...implied]} : s;
    }),
  };
}

export const sha1 = (data: string | Buffer) => crypto.createHash('sha1').update(data).digest('hex').slice(0, 16);
export const fileHash = (file: string) => (fs.existsSync(file) ? sha1(fs.readFileSync(file)) : 'missing');

/**
 * Identifies everything the mix depends on (timeline, narration audio,
 * music, SFX, levels). The mix is stale when this changes.
 */
export function mixKey(p: LoadedProject, fps: number): string {
  const starts = narrationStarts(p.storyboard, fps);
  const parts = {
    starts,
    total: p.storyboard.scenes.reduce((n, s) => n + s.duration, 0),
    narration: Object.fromEntries(Object.entries(p.narration?.scenes ?? {}).map(([k, v]) => [k, fileHash(path.join(p.dir, v.file))])),
    sfx: p.storyboard.scenes.map((s) => s.sfx ?? []),
    // Cue-timed SFX move when word timings change.
    timing: p.storyboard.scenes.some((s) => (s.sfx ?? []).some((x) => typeof x.at === 'string')) ? fileHash(path.join(p.dir, TRANSCRIPT_FILE)) : null,
    music: p.audio.music ? fileHash(path.join(p.dir, p.assets[p.audio.music]?.path ?? '')) : null,
    levels: [p.audio.musicDb, p.audio.duckDb, p.audio.targetLufs, p.audio.truePeak, p.audio.musicCutAt ?? null, p.audio.musicStart ?? 0, ...(p.audio.musicFadeOut !== undefined ? [p.audio.musicFadeOut] : [])],
    transitions: p.storyboard.scenes.map((s) => s.transitionIn ?? null),
  };
  return sha1(JSON.stringify(parts));
}

/** The mix file, if it exists and matches the current timeline/inputs. */
export function currentMix(p: LoadedProject, fps: number): string | null {
  const meta = readJson<{key: string} | null>(path.join(p.dir, MIX_META), null);
  if (!meta || !fs.existsSync(path.join(p.dir, MIX_FILE))) return null;
  return meta.key === mixKey(p, fps) ? MIX_FILE : null;
}

/** Priority: --format flag > VIDEO_FORMAT env > project.json video.format. */
export function resolveProjectFormat(config: ProjectConfig, override?: string): VideoFormat {
  const fromCli = override ?? process.env.VIDEO_FORMAT;
  if (fromCli) return resolveFormat({format: fromCli, fps: config.video.fps});
  return resolveFormat(config.video);
}

export function buildProps(
  p: LoadedProject,
  format: VideoFormat,
  opts: {showGuides?: boolean; captionStyle?: string} = {},
): MainProps {
  return {
    project: p.config,
    format,
    storyboard: p.storyboard,
    assets: p.assets,
    showGuides: opts.showGuides ?? false,
    captionStyle: resolveCaptionStyle(p.config, format, opts.captionStyle),
    narration: p.narration,
    transcript: p.transcript,
    audioMix: currentMix(p, format.fps),
  };
}

/** Minimal flag parser: --key value, --flag, positional args. */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=', 2);
      if (inline !== undefined) flags[k] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  const str = (k: string) => (typeof flags[k] === 'string' ? (flags[k] as string) : undefined);
  return {flags, positional, str, bool: (k: string) => flags[k] === true || flags[k] === 'true'};
}

export const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');
