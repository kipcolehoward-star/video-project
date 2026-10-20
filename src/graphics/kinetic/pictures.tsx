/**
 * Picture layer for the kinetic style: icons drawn in code, public-domain art
 * shown as paper cards, and big counting years. Pure drawing; the scene
 * decides when (beats on narration words) and where (screen slots or map points).
 *
 * Illustration rule (user, 2026-10-20): icons are drawn here in SVG; pictures
 * are public-domain or openly licensed art fetched with `npm run image`, licence
 * checked per item. No AI-generated or paid art.
 */
import React from 'react';
import {Easing, Img, interpolate, spring} from 'remotion';
import type {LayoutContext, Rect} from '../../layouts/engine';
import {breathe, exit} from '../../animations/kinetic';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Where a picture sits: thirds of the text-safe area (above the caption band). */
export type Slot = 'top' | 'center' | 'bottom';
export const SLOTS: readonly Slot[] = ['top', 'center', 'bottom'];

/**
 * The box a slot gives a picture, full safe width. A map scene's subject sits at the frame centre, so `top`
 * takes the space above it (60% of the safe height; in 9:16 it ends about 100 px above the centre) and `bottom`
 * the smaller band between the centre and the captions (30%); `center` is 44% around the middle.
 */
export function slotRect(ctx: LayoutContext, slot: Slot): Rect {
  const {safe} = ctx;
  const h = safe.h * (slot === 'top' ? 0.6 : slot === 'bottom' ? 0.3 : 0.44);
  const y = slot === 'top' ? safe.y : slot === 'bottom' ? safe.y + safe.h - h : safe.y + (safe.h - h) / 2;
  return {x: safe.x, y, w: safe.w, h};
}

// ---------------------------------------------------------------------------
// Icons, each drawn in a 100 × 120 box (shields) or 100 × 100.
// ---------------------------------------------------------------------------

const SHIELD = 'M8,8 H92 V54 C92,86 72,104 50,114 C28,104 8,86 8,54 Z';

/** Arms of the Teutonic Order: a black cross on white ("argent, a cross sable"). */
function TeutonicShield({id}: {id: string}) {
  return (
    <svg viewBox="0 0 100 120" width="100%" height="100%" style={{overflow: 'visible'}}>
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={SHIELD} />
        </clipPath>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9d4c8" />
        </linearGradient>
      </defs>
      <path d={SHIELD} fill={`url(#${id}-shade)`} />
      <g clipPath={`url(#${id}-clip)`}>
        {/* Slightly flared arms, as on the order's 13th-century seals and banners. */}
        <path d="M42,8 H58 L56,46 L92,44 V60 L56,58 L58,114 H42 L44,58 L8,60 V44 L44,46 Z" fill="#141414" />
        <path d="M8,8 H92 V30 C60,22 36,26 8,40 Z" fill="#ffffff" opacity={0.28} />
      </g>
      <path d={SHIELD} fill="none" stroke="#c9a54a" strokeWidth={4.5} strokeLinejoin="round" />
      <path d={SHIELD} fill="none" stroke="#3a2c10" strokeWidth={1.2} strokeLinejoin="round" transform="translate(50 61) scale(1.045) translate(-50 -61)" />
    </svg>
  );
}

/** Drawn icons by name, with their width : height ratio. */
export const ICONS: Record<string, {ratio: number; draw: React.FC<{id: string}>}> = {
  'teutonic-shield': {ratio: 100 / 120, draw: TeutonicShield},
};

/**
 * An icon dropped onto the screen: falls in for `fall` frames, lands with a
 * squash and a small bounce (the landing is where its thud plays), then breathes.
 */
export function DroppedIcon({name, x, y, width, frame, start, end, fps, id}: {name: string; x: number; y: number; width: number; frame: number; start: number; end?: number; fps: number; id: string}) {
  const icon = ICONS[name];
  if (!icon || frame < start) return null;
  const fall = dropFrames(fps);
  const height = width / icon.ratio;
  const t = frame - start;
  const out = end !== undefined ? exit(frame, end, 8) : 1;
  if (out <= 0) return null;
  const dy = t < fall ? -(1 - Easing.in(Easing.quad)(t / fall)) * (y + height) : 0;
  // After landing: a spring from squashed (wide, low) back to round.
  const s = t < fall ? 1 : spring({frame: t - fall, fps, config: {damping: 9, stiffness: 260, mass: 0.6}});
  const squash = t < fall ? 1 : 1 - 0.22 * (1 - s);
  const grow = breathe(frame, start + fall, fps);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - width / 2,
        top: y - height / 2,
        width,
        height,
        opacity: out,
        transformOrigin: '50% 100%',
        transform: `translateY(${dy.toFixed(1)}px) scale(${((2 - squash) * grow).toFixed(4)}, ${(squash * grow).toFixed(4)})`,
        filter: `drop-shadow(0 ${(width * 0.04).toFixed(1)}px ${(width * 0.06).toFixed(1)}px rgba(0,0,0,0.55))`,
      }}
    >
      <icon.draw id={id} />
    </div>
  );
}

/** Frames an icon takes to fall in (its landing sound is offset by the same time). */
export const dropFrames = (fps: number) => Math.round(0.25 * fps);
export const DROP_SECONDS = 0.25;

// ---------------------------------------------------------------------------
// Paper cards: public-domain art on a cream card that pops in and tilts.
// ---------------------------------------------------------------------------

export interface CardSpec {
  src: string;
  /** Picture width : height after the crop. */
  ratio: number;
  /** Fractions of the picture to show: [x, y, w, h]; default the whole picture. */
  crop?: [number, number, number, number];
  caption?: string;
  /** Resting angle in degrees (default -3). */
  tilt?: number;
}

/**
 * A card fitted inside `box`: swings in from a steeper angle with a spring,
 * the picture pushes in slowly while it is held, and it drops away quickly on exit.
 */
/** Card captions are set in the bundled serif (an old-print feel whatever the project's headline font). */
const CARD_FONT = '"Source Serif 4", Georgia, serif';

export function PaperCard({card, box, frame, start, end, fps, ctx}: {card: CardSpec; box: Rect; frame: number; start: number; end?: number; fps: number; ctx: LayoutContext}) {
  if (frame < start) return null;
  const pad = Math.round(14 * ctx.unit);
  const captionH = card.caption ? Math.round(ctx.type.label * 1.15 * 1.9) : 0;
  // Fit picture + border + caption inside the box (95% of it, so the small tilt stays inside).
  const maxW = box.w * 0.95 - pad * 2;
  const maxH = box.h * 0.95 - pad * 2 - captionH;
  const w = Math.min(maxW, maxH * card.ratio);
  const h = w / card.ratio;
  const s = spring({frame: frame - start, fps, config: {damping: 12, stiffness: 170, mass: 0.8}});
  const out = end !== undefined ? exit(frame, end, 8) : 1;
  if (out <= 0) return null;
  const tilt = card.tilt ?? -3;
  const angle = tilt + (1 - s) * (tilt < 0 ? -14 : 14);
  const scale = (0.55 + 0.45 * s) * (1 - 0.15 * (1 - out));
  const opacity = interpolate(frame, [start, start + 4], [0, 1], clamp) * out;
  const push = breathe(frame, start, fps, 0.08);
  const [cx, cy, cw, ch] = card.crop ?? [0, 0, 1, 1];
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x + box.w / 2,
        top: box.y + box.h / 2,
        transform: `translate(-50%, -50%) rotate(${angle.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
        opacity,
        padding: pad,
        paddingBottom: card.caption ? 0 : pad,
        background: '#f3ead6',
        borderRadius: 4 * ctx.unit,
        boxShadow: `0 ${10 * ctx.unit}px ${30 * ctx.unit}px rgba(0,0,0,0.55), inset 0 0 ${18 * ctx.unit}px rgba(120,90,40,0.25)`,
      }}
    >
      <div style={{width: w, height: h, overflow: 'hidden', position: 'relative', background: '#d8ccb0'}}>
        <Img
          src={card.src}
          style={{
            position: 'absolute',
            width: `${100 / cw}%`,
            height: `${100 / ch}%`,
            left: `${(-cx / cw) * 100}%`,
            top: `${(-cy / ch) * 100}%`,
            transform: `scale(${push.toFixed(4)})`,
            transformOrigin: `${(cx + cw / 2) * 100}% ${(cy + ch / 2) * 100}%`,
          }}
        />
      </div>
      {card.caption ? (
        <div style={{height: captionH, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: CARD_FONT, fontStyle: 'italic', fontWeight: 600, fontSize: Math.round(ctx.type.label * 1.2), color: '#3b2f1e', whiteSpace: 'nowrap'}}>
          {card.caption}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Years that count up to their value, then land.
// ---------------------------------------------------------------------------

/** Frames a year takes to count up (its ticking sound covers the same time). */
export const COUNT_SECONDS = 0.7;

export function CountingYear({value, from, x, y, frame, start, end, fps, fontSize, fontFamily, glow}: {value: number; from: number; x: number; y: number; frame: number; start: number; end?: number; fps: number; fontSize: number; fontFamily: string; glow: string}) {
  if (frame < start) return null;
  const n = Math.round(COUNT_SECONDS * fps);
  const t = Math.min(1, (frame - start) / n);
  const shown = Math.round(from + (value - from) * Easing.out(Easing.cubic)(t));
  const out = end !== undefined ? exit(frame, end, 8) : 1;
  if (out <= 0) return null;
  // Counting: slightly small and growing; on arrival it punches up and springs back to full size.
  const counting = frame - start < n;
  const land = counting ? 0 : spring({frame: frame - start - n, fps, config: {damping: 10, stiffness: 240, mass: 0.6}});
  const scale = (counting ? 0.82 + 0.1 * t : 1 + 0.15 * (1 - land)) * breathe(frame, start + n, fps);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${scale.toFixed(4)})`,
        opacity: interpolate(frame, [start, start + 3], [0, 1], clamp) * out,
        fontFamily,
        fontSize,
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
        color: '#ffffff',
        textShadow: `0 0 ${fontSize * 0.18}px ${glow}, 0 ${fontSize * 0.04}px ${fontSize * 0.12}px rgba(0,0,0,0.7)`,
      }}
    >
      {shown}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rubber stamps: a word pressed onto the screen at an angle.
// ---------------------------------------------------------------------------

export function StampMark({text, x, y, frame, start, end, fps, fontSize, fontFamily, color}: {text: string; x: number; y: number; frame: number; start: number; end?: number; fps: number; fontSize: number; fontFamily: string; color: string}) {
  if (frame < start) return null;
  const out = end !== undefined ? exit(frame, end, 8) : 1;
  if (out <= 0) return null;
  // Comes down from large and lands hard, with a slight overshoot.
  const s = spring({frame: frame - start, fps, config: {damping: 14, stiffness: 320, mass: 0.6}});
  const scale = (2.3 - 1.3 * s) * breathe(frame, start, fps);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(-9deg) scale(${scale.toFixed(4)})`,
        opacity: interpolate(frame, [start, start + 3], [0, 0.95], clamp) * out,
        fontFamily,
        fontSize,
        fontWeight: 900,
        letterSpacing: '0.08em',
        color,
        border: `${Math.round(fontSize * 0.09)}px solid ${color}`,
        borderRadius: fontSize * 0.12,
        boxShadow: `inset 0 0 0 ${Math.round(fontSize * 0.05)}px rgba(0,0,0,0), 0 0 ${fontSize * 0.3}px rgba(0,0,0,0.45)`,
        padding: `${(fontSize * 0.08).toFixed(1)}px ${(fontSize * 0.35).toFixed(1)}px`,
        background: 'rgba(20,10,10,0.35)',
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
      }}
    >
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A walking figure (SVG, feet at x/y, `h` px tall), legs and arms swinging with `phase`.
// ---------------------------------------------------------------------------

export function Walker({x, y, h, phase, facing, color, opacity}: {x: number; y: number; h: number; phase: number; facing: 1 | -1; color: string; opacity: number}) {
  const u = h / 24;
  const swing = Math.sin(phase) * 28;
  const leg = (a: number) => `M0,${-9 * u} l${(Math.sin((a * Math.PI) / 180) * 9 * u).toFixed(2)},${(Math.cos((a * Math.PI) / 180) * 9 * u).toFixed(2)}`;
  const arm = (a: number) => `M0,${-17 * u} l${(Math.sin((a * Math.PI) / 180) * 7 * u).toFixed(2)},${(Math.cos((a * Math.PI) / 180) * 7 * u).toFixed(2)}`;
  return (
    <g transform={`translate(${x.toFixed(1)},${(y - Math.abs(Math.cos(phase)) * u).toFixed(1)}) scale(${facing},1)`} opacity={opacity} stroke={color} strokeLinecap="round" fill="none">
      <g stroke="rgba(0,0,0,0.55)" strokeWidth={4.6 * u}>
        <path d={leg(swing)} />
        <path d={leg(-swing)} />
        <path d={arm(-swing)} />
        <path d={arm(swing)} />
        <path d={`M0,${-19 * u} L0,${-9 * u}`} />
      </g>
      <g strokeWidth={2.6 * u}>
        <path d={leg(swing)} />
        <path d={leg(-swing)} />
        <path d={arm(-swing)} />
        <path d={arm(swing)} />
        <path d={`M0,${-19 * u} L0,${-9 * u}`} />
      </g>
      <circle cy={-22 * u} r={2.8 * u} fill={color} stroke="rgba(0,0,0,0.55)" strokeWidth={1.2 * u} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Colour grades for the whole map: an old-map warmth for history, a cold one for war.
// ---------------------------------------------------------------------------

export type Tone = 'warm' | 'cold' | 'none';
export const TONES: readonly Tone[] = ['warm', 'cold', 'none'];

/** CSS filter for a mix of tones (amounts 0–1). */
export function toneFilter(warm: number, cold: number): string | undefined {
  if (warm < 0.001 && cold < 0.001) return undefined;
  const f = (v: number) => v.toFixed(3);
  // Warm is lifted as well as browned (sepia alone turned the sea nearly black); cold is darker and drained.
  return `sepia(${f(0.72 * warm)}) saturate(${f(1 - 0.1 * warm - 0.55 * cold)}) hue-rotate(${f(-6 * warm + 12 * cold)}deg) brightness(${f(1 + 0.14 * warm - 0.12 * cold)}) contrast(${f(1 - 0.06 * warm + 0.08 * cold)})`;
}
