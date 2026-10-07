/**
 * Responsive layout engine.
 *
 * Pure functions: (format) -> named rectangles. No React, no DOM, so the
 * same code drives rendering AND the Node-side QC checks (safe zones,
 * overlaps). Layouts make *structural* decisions per orientation (row vs
 * column, chart direction, anchoring) — they never just scale coordinates.
 */
import type {Orientation, VideoFormat} from '../config/formats';
import type {CaptionStyle} from '../config/project';
import {resolveSafeZone, type Insets, type SafeZoneProfile} from '../config/safeZones';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * text    — must sit inside the safe zone and not overlap media or other text.
 * overlay — text deliberately placed over media (lower thirds); must be safe,
 *           must not overlap `text`.
 * media   — may bleed to the frame edge.
 */
export type RegionRole = 'text' | 'overlay' | 'media' | 'decor';

export interface Region extends Rect {
  role: RegionRole;
}

export interface TypeScale {
  display: number;
  h1: number;
  h2: number;
  body: number;
  label: number;
  caption: number;
  stat: number;
}

export interface LayoutContext {
  format: VideoFormat;
  W: number;
  H: number;
  /** Area scenes may put text in: the platform safe zone minus the caption band. */
  safe: Rect;
  /** The full platform safe zone. */
  platformSafe: Rect;
  /** Reserved for captions (bottom of the safe zone), or null when captions are off. */
  captionBand: Rect | null;
  captionStyle: CaptionStyle;
  /** px per design unit: short side / 1080. 4K => 2. */
  unit: number;
  gutter: number;
  type: TypeScale;
}

/**
 * Type sizes in design px (at a 1080px short side). Portrait is larger
 * relative to the frame because it is watched full-screen on a phone at
 * arm's length; landscape is read on larger screens with more width.
 */
const TYPE_SCALES: Record<Orientation, TypeScale> = {
  landscape: {display: 108, h1: 76, h2: 54, body: 36, label: 23, caption: 42, stat: 230},
  portrait: {display: 116, h1: 84, h2: 62, body: 42, label: 28, caption: 60, stat: 250},
  square: {display: 92, h1: 68, h2: 50, body: 34, label: 23, caption: 48, stat: 200},
};

export function createLayoutContext(
  format: VideoFormat,
  profile: SafeZoneProfile | Insets = 'auto',
  opts: {captionStyle?: CaptionStyle} = {},
): LayoutContext {
  const {width: W, height: H} = format;
  const z = resolveSafeZone(format, profile);
  const platformSafe: Rect = {
    x: W * z.left,
    y: H * z.top,
    w: W * (1 - z.left - z.right),
    h: H * (1 - z.top - z.bottom),
  };
  const unit = Math.min(W, H) / 1080;
  const base = TYPE_SCALES[format.orientation];
  const type = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * unit)])) as unknown as TypeScale;
  const gutter = Math.round(40 * unit);
  const captionStyle = opts.captionStyle ?? 'none';

  // Captions get a band at the bottom of the safe zone; scenes lay out above it.
  let captionBand: Rect | null = null;
  let safe = platformSafe;
  if (captionStyle !== 'none') {
    const m = captionMetrics(type, captionStyle);
    const h = Math.round(m.fontSize * m.lineHeight * m.maxLines + m.padY * 2);
    captionBand = {x: platformSafe.x, y: platformSafe.y + platformSafe.h - h, w: platformSafe.w, h};
    safe = {...platformSafe, h: platformSafe.h - h - gutter};
  }
  return {format, W, H, safe, platformSafe, captionBand, captionStyle, unit, gutter, type};
}

/** Caption typography per style. Shared by the overlay and the band reservation. */
export function captionMetrics(type: TypeScale, style: CaptionStyle) {
  if (style === 'kinetic') {
    return {fontSize: Math.round(type.caption * 1.3), lineHeight: 1.12, maxLines: 2, padY: Math.round(type.caption * 0.2)};
  }
  return {fontSize: type.caption, lineHeight: 1.3, maxLines: 2, padY: Math.round(type.caption * 0.3)};
}

const right = (r: Rect) => r.x + r.w;
const bottom = (r: Rect) => r.y + r.h;
const region = (role: RegionRole, r: Rect): Region => ({role, ...r});

// ---------------------------------------------------------------------------
// Title: documentary lower-left block in landscape, vertically centred in
// portrait (bottom is platform UI), bottom-anchored in square.
// ---------------------------------------------------------------------------
export function titleLayout(ctx: LayoutContext) {
  const {safe, format} = ctx;
  if (format.orientation === 'landscape') {
    return {
      align: 'end' as const,
      regions: {text: region('text', {x: safe.x, y: safe.y + safe.h * 0.3, w: safe.w * 0.64, h: safe.h * 0.7})},
    };
  }
  if (format.orientation === 'portrait') {
    return {
      align: 'center' as const,
      regions: {text: region('text', {x: safe.x, y: safe.y + safe.h * 0.12, w: safe.w, h: safe.h * 0.7})},
    };
  }
  return {
    align: 'end' as const,
    regions: {text: region('text', {x: safe.x, y: safe.y + safe.h * 0.25, w: safe.w * 0.92, h: safe.h * 0.75})},
  };
}

// ---------------------------------------------------------------------------
// Split (media + text): side-by-side in landscape, stacked in portrait and
// square. Media bleeds to the frame edge; text stays inside the safe zone.
// ---------------------------------------------------------------------------
export function splitLayout(ctx: LayoutContext, opts: {mediaSide?: 'start' | 'end'} = {}) {
  const {W, H, safe, gutter, format} = ctx;
  if (format.orientation === 'landscape') {
    const mw = Math.round(W * 0.54);
    const media: Rect = opts.mediaSide === 'end' ? {x: W - mw, y: 0, w: mw, h: H} : {x: 0, y: 0, w: mw, h: H};
    const textX = opts.mediaSide === 'end' ? safe.x : right(media) + gutter * 2;
    const textRight = opts.mediaSide === 'end' ? media.x - gutter * 2 : right(safe);
    return {
      direction: 'row' as const,
      regions: {
        media: region('media', media),
        text: region('text', {x: textX, y: safe.y, w: textRight - textX, h: safe.h}),
      },
    };
  }
  const mediaShare = format.orientation === 'portrait' ? 0.48 : 0.5;
  const media: Rect = {x: 0, y: 0, w: W, h: Math.round(H * mediaShare)};
  const textY = bottom(media) + gutter * 1.5;
  return {
    direction: 'column' as const,
    regions: {
      media: region('media', media),
      text: region('text', {x: safe.x, y: textY, w: safe.w, h: bottom(safe) - textY}),
    },
  };
}

// ---------------------------------------------------------------------------
// Statistic: big number beside a column chart in landscape; number above a
// horizontal bar chart in portrait/square (bars read better in narrow frames).
// ---------------------------------------------------------------------------
export function statLayout(ctx: LayoutContext) {
  const {safe, gutter, format} = ctx;
  if (format.orientation === 'landscape') {
    const numW = safe.w * 0.42;
    const chartX = safe.x + numW + gutter * 2;
    return {
      chartDirection: 'columns' as const,
      regions: {
        number: region('text', {x: safe.x, y: safe.y + safe.h * 0.18, w: numW, h: safe.h * 0.64}),
        chart: region('text', {x: chartX, y: safe.y + safe.h * 0.14, w: right(safe) - chartX, h: safe.h * 0.72}),
      },
    };
  }
  const split = format.orientation === 'portrait' ? 0.42 : 0.5;
  const numH = safe.h * split;
  const chartY = safe.y + numH + gutter;
  return {
    chartDirection: 'bars' as const,
    regions: {
      number: region('text', {x: safe.x, y: safe.y, w: safe.w, h: numH}),
      chart: region('text', {x: safe.x, y: chartY, w: safe.w, h: bottom(safe) - chartY}),
    },
  };
}

// ---------------------------------------------------------------------------
// Items (steps, comparisons): optional heading, then n items — a row in
// landscape, a stacked column in portrait/square.
// ---------------------------------------------------------------------------
export function itemsLayout(ctx: LayoutContext, n: number, opts: {heading?: boolean; gap?: number} = {}) {
  const {safe, gutter, format} = ctx;
  const gap = opts.gap ?? gutter;
  const headH = opts.heading ? Math.round(safe.h * (format.orientation === 'landscape' ? 0.3 : 0.22)) : 0;
  const regions: Record<string, Region> = {};
  if (opts.heading) regions.heading = region('text', {x: safe.x, y: safe.y, w: safe.w, h: headH});
  const top = safe.y + headH + (opts.heading ? gutter : 0);
  const avail = bottom(safe) - top;

  // Structure by frame shape: wide frames read across, tall frames read down,
  // square frames use a row for few items and a 2x2 grid for four.
  const square = format.orientation === 'square';
  if (format.orientation === 'landscape' || (square && n <= 3)) {
    const w = (safe.w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) regions[`item${i}`] = region('text', {x: safe.x + i * (w + gap), y: top, w, h: avail});
    return {direction: 'row' as const, regions};
  }
  if (square && n === 4) {
    const w = (safe.w - gap) / 2;
    const h = (avail - gap * 0.75) / 2;
    for (let i = 0; i < n; i++) {
      regions[`item${i}`] = region('text', {x: safe.x + (i % 2) * (w + gap), y: top + Math.floor(i / 2) * (h + gap * 0.75), w, h});
    }
    return {direction: 'grid' as const, regions};
  }
  const h = (avail - gap * (n - 1) * 0.5) / n;
  for (let i = 0; i < n; i++) regions[`item${i}`] = region('text', {x: safe.x, y: top + i * (h + gap * 0.5), w: safe.w, h});
  return {direction: 'column' as const, regions};
}

// ---------------------------------------------------------------------------
// Stack: optional heading band, then one body region (lists, statements).
// ---------------------------------------------------------------------------
export function stackLayout(ctx: LayoutContext, opts: {heading?: boolean} = {}) {
  const {safe, gutter, format} = ctx;
  const headH = opts.heading ? Math.round(safe.h * (format.orientation === 'landscape' ? 0.24 : 0.18)) : 0;
  const regions: Record<string, Region> = {};
  if (opts.heading) regions.heading = region('text', {x: safe.x, y: safe.y, w: safe.w, h: headH});
  const top = safe.y + headH + (opts.heading ? gutter : 0);
  // Landscape keeps a readable measure instead of spanning the full width.
  const w = format.orientation === 'landscape' ? safe.w * 0.78 : safe.w;
  regions.body = region('text', {x: safe.x, y: top, w, h: bottom(safe) - top});
  return {regions};
}

// ---------------------------------------------------------------------------
// Grid: heading + cards. 4 columns wide, 2 in portrait, 2–3 in square.
// ---------------------------------------------------------------------------
export function gridLayout(ctx: LayoutContext, n: number, opts: {heading?: boolean} = {}) {
  const {safe, gutter, format} = ctx;
  const headH = opts.heading ? Math.round(safe.h * (format.orientation === 'landscape' ? 0.2 : 0.14)) : 0;
  const regions: Record<string, Region> = {};
  if (opts.heading) regions.heading = region('text', {x: safe.x, y: safe.y, w: safe.w, h: headH});
  const cols = format.orientation === 'landscape' ? Math.min(4, Math.ceil(n / (n > 4 ? 2 : 1))) : format.orientation === 'portrait' ? 2 : Math.min(3, n);
  const rows = Math.ceil(n / cols);
  const top = safe.y + headH + (opts.heading ? gutter : 0);
  const gap = gutter * 0.75;
  const w = (safe.w - gap * (cols - 1)) / cols;
  const h = (bottom(safe) - top - gap * (rows - 1)) / rows;
  for (let i = 0; i < n; i++) {
    regions[`item${i}`] = region('text', {x: safe.x + (i % cols) * (w + gap), y: top + Math.floor(i / cols) * (h + gap), w, h});
  }
  return {cols, rows, regions};
}

// ---------------------------------------------------------------------------
// Lower third: anchored to the bottom-left of a host rect (usually media),
// clamped inside the safe zone.
// ---------------------------------------------------------------------------
export function lowerThirdLayout(ctx: LayoutContext, host: Rect): Region {
  const {safe, gutter, type, format} = ctx;
  const h = Math.round(type.h2 * 1.2 + type.label * 1.6 + gutter * 0.9);
  const x = Math.max(host.x + gutter, safe.x);
  const maxRight = Math.min(right(host) - gutter, right(safe));
  const w = Math.min(maxRight - x, format.orientation === 'landscape' ? safe.w * 0.42 : safe.w);
  const y = Math.min(bottom(host), bottom(safe)) - h - gutter;
  return region('overlay', {x, y, w, h});
}

// ---------------------------------------------------------------------------
// Captions: the reserved band (documentary/educational use a narrower measure
// in landscape for comfortable reading).
// ---------------------------------------------------------------------------
export function captionLayout(ctx: LayoutContext): Region | null {
  const band = ctx.captionBand;
  if (!band) return null;
  const narrow = ctx.format.orientation === 'landscape' && ctx.captionStyle !== 'kinetic';
  const w = narrow ? band.w * 0.72 : band.w;
  return region('overlay', {x: band.x + (band.w - w) / 2, y: band.y, w, h: band.h});
}

// ---------------------------------------------------------------------------
// Geometry helpers shared with QC.
// ---------------------------------------------------------------------------
export function contains(outer: Rect, inner: Rect, tolerance = 0.5): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    right(inner) <= right(outer) + tolerance &&
    bottom(inner) <= bottom(outer) + tolerance
  );
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y;
}

/** Rough wrapped-text height estimate, used by QC to flag likely overflow. */
export function estimateTextHeight(text: string, fontSize: number, boxWidth: number, lineHeight = 1.2, avgCharEm = 0.52) {
  const charsPerLine = Math.max(1, Math.floor(boxWidth / (fontSize * avgCharEm)));
  const words = text.split(/\s+/).filter(Boolean);
  let lines = 1;
  let len = 0;
  for (const w of words) {
    if (len > 0 && len + 1 + w.length > charsPerLine) {
      lines++;
      len = w.length;
    } else {
      len += (len > 0 ? 1 : 0) + w.length;
    }
  }
  return lines * fontSize * lineHeight;
}
