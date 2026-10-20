import type {FormatSpec, VideoFormat} from './formats';
import type {Insets, SafeZoneProfile} from './safeZones';

/** projects/<id>/project.json */
export interface ProjectConfig {
  id: string;
  title: string;
  /** Format is per project. Overridable with VIDEO_FORMAT or --format. */
  video: FormatSpec & {duration?: number | null};
  safeZoneProfile?: SafeZoneProfile | Insets;
  theme?: string;
  /** "auto": documentary captions in landscape, kinetic in portrait/square. */
  captionStyle?: CaptionStyle | 'auto';
  audio?: AudioConfig;
  /** Subtle surface texture over the whole video: film grain or paper grain. */
  texture?: 'none' | 'grain' | 'paper';
  /**
   * "documentary" (default): restrained motion (animations/motion.ts).
   * "kinetic": Shorts where something happens every 1–2 s on the spoken word (animations/kinetic.ts);
   * validate errors when moments are more than 2 s apart, and qc errors on anything frozen for more than 1.5 s.
   */
  style?: 'documentary' | 'kinetic';
  /** Sound for each animation kind the scenes ask for ("pop", "slam", "whoosh"...): an asset id, or {asset, gainDb}. */
  sfxKit?: Record<string, string | {asset: string; gainDb?: number}>;
}

export type CaptionStyle = 'documentary' | 'kinetic' | 'educational' | 'none';

export interface AudioConfig {
  /**
   * "piper" (local, free, commercial OK), "edge" (Microsoft Edge online voices
   * via edge-tts: free, personal/non-monetised only), "elevenlabs" (API key;
   * commercial use needs a paid plan).
   */
  provider?: 'piper' | 'edge' | 'elevenlabs';
  /** Edge speaking rate, e.g. "+0%", "-5%". */
  rate?: string;
  /** Piper voice id (tools.ts VOICES) or ElevenLabs voice_id (npm run voices). */
  voice?: string;
  /** ElevenLabs model id, e.g. eleven_multilingual_v2, eleven_v4. */
  model?: string;
  /** ElevenLabs voice_settings (stability, similarity_boost, style, use_speaker_boost, speed). */
  voiceSettings?: Record<string, number | boolean>;
  /** Speaker id for multi-speaker voices. */
  speaker?: number;
  /** Piper speaking rate: >1 slower, <1 faster. */
  lengthScale?: number;
  /** Asset id of the background music bed, if any. */
  music?: string | null;
  /** Scene id where the music cuts dead (e.g. silence before a final line). */
  musicCutAt?: string;
  /** Seconds into the music file to start from (skip a quiet intro). */
  musicStart?: number;
  /** Fade-out at the end, seconds (default 2.5). 0 = none: for edits that already end on a resolve (Epidemic EditRecording). */
  musicFadeOut?: number;
  /** Music level when nobody is speaking, dB relative to its source. */
  musicDb?: number;
  /** Extra attenuation applied to music under narration, dB. */
  duckDb?: number;
  /** Integrated loudness target for the final mix. */
  targetLufs?: number;
  truePeak?: number;
}

export const AUDIO_DEFAULTS: Required<Omit<AudioConfig, 'music' | 'speaker' | 'voiceSettings' | 'musicCutAt' | 'musicStart' | 'musicFadeOut'>> = {
  provider: 'piper',
  rate: '+0%',
  voice: 'en_US-joe-medium',
  model: 'eleven_multilingual_v2',
  lengthScale: 1,
  musicDb: -16,
  duckDb: -12,
  // -16 LUFS: comfortable for narration, not squashed. Platforms normalise louder content down anyway.
  targetLufs: -16,
  truePeak: -1.5,
};

export function resolveCaptionStyle(config: ProjectConfig, format: VideoFormat, override?: string): CaptionStyle {
  const s = (override ?? config.captionStyle ?? 'auto') as CaptionStyle | 'auto';
  if (s !== 'auto') return s;
  return format.orientation === 'landscape' ? 'documentary' : 'kinetic';
}

export type AssetType =
  | 'narration'
  | 'broll'
  | 'photo'
  | 'illustration'
  | 'graphic'
  | 'music'
  | 'sfx'
  | 'ambient'
  | 'logo'
  | 'font';

/** projects/<id>/assets.json — one entry per asset, keyed by asset id. */
export interface AssetMeta {
  type: AssetType;
  /** Relative to the project directory. */
  path: string;
  /** Where it came from. Never invent this; use "unknown" if unknown. */
  source: string;
  license: string;
  /** Normalised 0–1 point of interest; crops keep this in frame. */
  focalPoint?: {x: number; y: number};
  author?: string;
  licenseUrl?: string;
  /** nasa | commons | pexels | ... when fetched by `npm run image`. */
  provider?: string;
  attributionRequired?: boolean;
  /** Ready-to-paste attribution line (npm run credits). */
  credit?: string;
  /** Date the asset was downloaded (YYYY-MM-DD). */
  retrieved?: string;
  original?: {width: number; height: number};
  /** For time-based media: in/out points within the source file (seconds). */
  start?: number;
  end?: number;
  notes?: string;
}

export interface Transition {
  type: 'cut' | 'fade';
  /** Seconds. Fades overlap the previous scene by this amount. */
  duration?: number;
}

export interface SceneSpec<T = Record<string, unknown>> {
  id: string;
  type: string;
  /**
   * Seconds. With narration this is a minimum: the scene is extended to
   * fit narrationOffset + voiceover + narrationTail.
   */
  duration: number;
  transitionIn?: Transition;
  /** Voiceover text. Wrap keywords in *asterisks* to emphasise them in captions. */
  narration?: string;
  /** Seconds after scene start before the voiceover begins. */
  narrationOffset?: number;
  /** Seconds held after the voiceover ends. */
  narrationTail?: number;
  /** Sound effects. `at`: seconds from scene start, or a narration cue word ("lesotho", "wild#2"). */
  sfx?: {asset: string; at: number | string; gainDb?: number; offset?: number}[];
  data: T;
}

/** audio/narration/manifest.json, written by `npm run voiceover`. */
export interface NarrationManifest {
  provider?: 'piper' | 'edge' | 'elevenlabs';
  voice: string;
  model?: string;
  speaker?: number;
  license: string;
  attribution: string | null;
  scenes: Record<string, {file: string; duration: number; textHash: string; /** TTS-engine word timings (json), when the provider returns them. */ timing?: string}>;
}

export interface TimedWord {
  /** Display text from the script (punctuation kept, markup removed). */
  text: string;
  /** Seconds, relative to the start of the scene's voiceover. */
  start: number;
  end: number;
  emphasis?: boolean;
  /** false when the time was interpolated because whisper missed the word. */
  matched?: boolean;
}

/** transcript.json, written by `npm run transcribe`. */
export interface Transcript {
  engine: string;
  scenes: Record<string, {audioHash: string; words: TimedWord[]; recognized: string}>;
}

export interface Storyboard {
  scenes: SceneSpec[];
}

/** Everything the Remotion composition needs. Built in Node, passed as props. */
export interface MainProps {
  project: ProjectConfig;
  format: VideoFormat;
  storyboard: Storyboard;
  assets: Record<string, AssetMeta>;
  showGuides?: boolean;
  captionStyle: CaptionStyle;
  narration: NarrationManifest | null;
  transcript: Transcript | null;
  /** Path (relative to project dir) of the final mix, if built. */
  audioMix: string | null;
  [key: string]: unknown;
}

export interface TimedScene {
  scene: SceneSpec;
  from: number;
  durationInFrames: number;
  fadeInFrames: number;
}

/** Converts the storyboard (seconds) into frame-accurate placements. */
export function buildTimeline(storyboard: Storyboard, fps: number): {scenes: TimedScene[]; durationInFrames: number} {
  const scenes: TimedScene[] = [];
  let cursor = 0;
  for (const scene of storyboard.scenes) {
    const durationInFrames = Math.max(1, Math.round(scene.duration * fps));
    const t = scene.transitionIn;
    const fadeInFrames = t?.type === 'fade' && scenes.length > 0 ? Math.round((t.duration ?? 0.5) * fps) : 0;
    const from = Math.max(0, cursor - fadeInFrames);
    scenes.push({scene, from, durationInFrames, fadeInFrames});
    cursor = from + durationInFrames;
  }
  return {scenes, durationInFrames: Math.max(1, cursor)};
}

export const DEFAULT_NARRATION_TAIL = 0.6;

/** Seconds from scene start to the first syllable of its voiceover. */
export function narrationOffset(scene: SceneSpec<unknown>, index: number): number {
  if (scene.narrationOffset !== undefined) return scene.narrationOffset;
  const fade = scene.transitionIn?.type === 'fade' && index > 0 ? (scene.transitionIn.duration ?? 0.5) : 0;
  return index === 0 ? 0.5 : fade + 0.25;
}

/**
 * Extends scene durations so each voiceover fits. Pure; used in Node when
 * building props, so Remotion, the mixer and QC all see the same timeline.
 */
export function resolveDurations(storyboard: Storyboard, narration: NarrationManifest | null): Storyboard {
  if (!narration) return storyboard;
  return {
    ...storyboard,
    scenes: storyboard.scenes.map((s, i) => {
      const n = s.narration ? narration.scenes[s.id] : undefined;
      if (!n) return s;
      const needed = narrationOffset(s, i) + n.duration + (s.narrationTail ?? DEFAULT_NARRATION_TAIL);
      return {...s, duration: Math.max(s.duration, Math.ceil(needed * 10) / 10)};
    }),
  };
}

/** Absolute start (seconds) of each scene's voiceover on the final timeline. */
export function narrationStarts(storyboard: Storyboard, fps: number): Record<string, number> {
  const {scenes} = buildTimeline(storyboard, fps);
  return Object.fromEntries(scenes.map((t, i) => [t.scene.id, t.from / fps + narrationOffset(t.scene, i)]));
}
