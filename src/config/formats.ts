/**
 * Format system. The single source of truth for frame dimensions.
 *
 * Nothing else in the codebase may hard-code a width, height or aspect ratio.
 * Scenes ask the layout engine (src/layouts) for rectangles instead.
 */

export type Orientation = 'landscape' | 'portrait' | 'square';

export interface VideoFormat {
  /** Stable id, e.g. "16:9", "9:16", "4k-16:9", "custom-2560x1080". */
  id: string;
  aspectRatio: string;
  width: number;
  height: number;
  fps: number;
  orientation: Orientation;
}

interface Preset {
  aspectRatio: string;
  width: number;
  height: number;
  description: string;
}

export const FORMAT_PRESETS: Record<string, Preset> = {
  '16:9': {aspectRatio: '16:9', width: 1920, height: 1080, description: 'YouTube, documentary, explainer'},
  '9:16': {aspectRatio: '9:16', width: 1080, height: 1920, description: 'Shorts, TikTok, Reels'},
  '1:1': {aspectRatio: '1:1', width: 1080, height: 1080, description: 'Square social'},
  '4:5': {aspectRatio: '4:5', width: 1080, height: 1350, description: 'Instagram feed portrait'},
  '4k-16:9': {aspectRatio: '16:9', width: 3840, height: 2160, description: '4K UHD landscape'},
};

export const DEFAULT_FPS = 30;

/** Spec accepted from project.json, env (VIDEO_FORMAT) or CLI (--format). */
export interface FormatSpec {
  format?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function orientationOf(width: number, height: number): Orientation {
  const r = width / height;
  if (r > 1.1) return 'landscape';
  if (r < 0.9) return 'portrait';
  return 'square';
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Resolve any supported spec to concrete dimensions.
 *   "16:9" | "9:16" | "1:1" | "4:5" | "4k-16:9"  -> preset
 *   "2560x1080"                                  -> exact custom size
 *   "21:9"                                       -> custom ratio, long side 1920
 *   {width, height}                              -> exact custom size
 */
export function resolveFormat(spec: FormatSpec | string): VideoFormat {
  const s: FormatSpec = typeof spec === 'string' ? {format: spec} : spec;
  const fps = s.fps ?? DEFAULT_FPS;
  const key = s.format?.trim();

  let width: number;
  let height: number;
  let id: string;
  let aspectRatio: string;

  if (key && FORMAT_PRESETS[key]) {
    ({width, height, aspectRatio} = FORMAT_PRESETS[key]);
    id = key;
  } else if (key && /^\d+x\d+$/i.test(key)) {
    [width, height] = key.toLowerCase().split('x').map(Number);
    id = `custom-${width}x${height}`;
    aspectRatio = '';
  } else if (key && /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(key)) {
    const [rw, rh] = key.split(':').map(Number);
    const long = 1920;
    if (rw >= rh) {
      width = long;
      height = even((long * rh) / rw);
    } else {
      height = long;
      width = even((long * rw) / rh);
    }
    id = `custom-${key}`;
    aspectRatio = key;
  } else if ((!key || key === 'custom') && s.width && s.height) {
    width = s.width;
    height = s.height;
    id = `custom-${width}x${height}`;
    aspectRatio = '';
  } else {
    throw new Error(
      `Unknown video format "${key ?? ''}". Use one of ${Object.keys(FORMAT_PRESETS).join(', ')}, ` +
        `a ratio like "21:9", or exact dimensions like "2560x1080".`,
    );
  }

  if (width % 2 || height % 2) {
    throw new Error(`Video dimensions must be even for H.264/yuv420p (got ${width}x${height}).`);
  }
  if (!aspectRatio) {
    const g = gcd(width, height);
    aspectRatio = `${width / g}:${height / g}`;
  }

  return {id, aspectRatio, width, height, fps, orientation: orientationOf(width, height)};
}

/** Filesystem-safe slug for output file names. */
export const formatSlug = (f: VideoFormat) => `${f.id.replace(/:/g, 'x')}_${f.width}x${f.height}`;

/** Platform image specs for channel branding (YouTube): profile picture and banner. */
export const BRAND_SIZES = {
  logo: {width: 800, height: 800},
  banner: {width: 2560, height: 1440},
} as const;
