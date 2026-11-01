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

/** A rain cloud with falling drops (seasonal rains). */
function RainCloud({id}: {id: string}) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{overflow: 'visible'}}>
      <defs>
        <linearGradient id={`${id}-cloud`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f6f8" />
          <stop offset="1" stopColor="#aeb8c4" />
        </linearGradient>
      </defs>
      {[18, 34, 50, 66, 82].map((x, k) => (
        <path key={k} d={`M${x - 4},${64 + (k % 2) * 8} q4,-9 8,0 a4.5,4.5 0 1 1 -8,0 z`} transform={`translate(${-6 + k * 1.5},${10 + (k % 2) * 6})`} fill="#3fa7e0" stroke="#0b2f4a" strokeWidth={1.4} />
      ))}
      <path d="M22,62 a14,14 0 0 1 2,-27.8 a20,20 0 0 1 37,-8 a16,16 0 0 1 21,15.8 a10,10 0 0 1 -2,20 z" fill={`url(#${id}-cloud)`} stroke="#3c4652" strokeWidth={2.2} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Everest beside Mauna Kea, to scale (4.6 units per km): Everest measured from sea level (8,849 m), Mauna Kea from
 * its base on the sea floor (about 6 km down; 10,210 m base to peak per NOAA), most of it under the water.
 */
function HeightCompare({id}: {id: string}) {
  const sea = 54;
  const k = 4.6;
  const everest = sea - 8.849 * k;
  const keaTop = sea - 4.207 * k;
  const keaBase = keaTop + 10.21 * k;
  const text = {fontFamily: 'Inter, sans-serif', fontWeight: 800, fill: '#ffffff', stroke: 'rgba(0,0,0,0.75)', strokeWidth: 0.9, paintOrder: 'stroke'} as const;
  const bar = (x: number, y1: number, y2: number, color: string) => (
    <g stroke={color} strokeWidth={1.1} strokeLinecap="round">
      <path d={`M${x},${y1} V${y2} M${x - 1.6},${y1} H${x + 1.6} M${x - 1.6},${y2} H${x + 1.6}`} />
    </g>
  );
  return (
    <svg viewBox="0 0 110 100" width="100%" height="100%" style={{overflow: 'visible'}}>
      <defs>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fa7e0" stopOpacity={0.55} />
          <stop offset="1" stopColor="#0b3a66" stopOpacity={0.8} />
        </linearGradient>
        <linearGradient id={`${id}-rock`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9aa0a6" />
          <stop offset="1" stopColor="#5b5249" />
        </linearGradient>
      </defs>
      {/* Land under Everest, sea floor under Mauna Kea. */}
      <rect x={0} y={sea} width={48} height={keaBase - sea + 4} fill="#6b5a45" />
      <rect x={48} y={keaBase} width={62} height={4} fill="#3d3328" />
      {/* Everest: a jagged peak with a snow cap. */}
      <path d={`M6,${sea} L16,${sea - 14} L20,${sea - 12} L27,${everest} L33,${sea - 20} L37,${sea - 17} L44,${sea} Z`} fill={`url(#${id}-rock)`} stroke="#2a2622" strokeWidth={0.8} strokeLinejoin="round" />
      <path d={`M27,${everest} L23.5,${everest + 9} L26,${everest + 7.5} L28,${everest + 10} L30.6,${everest + 8} Z`} fill="#f4f6f8" />
      {/* Mauna Kea: a broad shield volcano rising from the sea floor; the water is drawn over it. */}
      <path d={`M52,${keaBase} C62,${keaBase - 8} 68,${keaTop + 6} 77,${keaTop} C86,${keaTop + 6} 92,${keaBase - 8} 102,${keaBase} Z`} fill={`url(#${id}-rock)`} stroke="#2a2622" strokeWidth={0.8} strokeLinejoin="round" />
      <rect x={48} y={sea} width={62} height={keaBase - sea} fill={`url(#${id}-water)`} />
      <path d={`M0,${sea} H110`} stroke="#ffffff" strokeWidth={0.7} strokeDasharray="2 1.6" />
      <text x={5} y={sea + 5} fontSize={3.6} style={{...text, fontWeight: 600}}>sea level</text>
      {bar(3, everest, sea, '#ffcc00')}
      {bar(106, keaTop, keaBase, '#ffcc00')}
      <text x={27} y={everest - 9} fontSize={5.4} textAnchor="middle" style={text}>EVEREST</text>
      <text x={27} y={everest - 3} fontSize={5} textAnchor="middle" style={{...text, fill: '#ffcc00'}}>8,849 m</text>
      <text x={77} y={keaTop - 9} fontSize={5.4} textAnchor="middle" style={text}>MAUNA KEA</text>
      <text x={77} y={keaTop - 3} fontSize={5} textAnchor="middle" style={{...text, fill: '#ffcc00'}}>10,210 m</text>
    </svg>
  );
}

/** A small village house: stone walls, a pitched roof, one door. */
function VillageHouse() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <path d="M18,48 V92 H82 V48 Z" fill="#e7dcc3" stroke="#14181d" strokeWidth={4} strokeLinejoin="round" />
      <path d="M8,50 L50,14 L92,50 Z" fill="#b5482f" stroke="#14181d" strokeWidth={4} strokeLinejoin="round" />
      <rect x={42} y={64} width={16} height={28} rx={2} fill="#6b4a2b" stroke="#14181d" strokeWidth={3} />
      <rect x={25} y={58} width={11} height={11} fill="#7fb6d6" stroke="#14181d" strokeWidth={2.5} />
      <rect x={64} y={58} width={11} height={11} fill="#7fb6d6" stroke="#14181d" strokeWidth={2.5} />
    </svg>
  );
}

/** A town hall: columns, a pediment, a clock tower and a flag, so it reads bigger and more official than the house. */
function TownHall() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%">
      <path d="M60,4 V20" stroke="#14181d" strokeWidth={3} />
      <path d="M60,4 L82,10 L60,16 Z" fill="#c60b1e" stroke="#14181d" strokeWidth={2} strokeLinejoin="round" />
      <rect x={48} y={20} width={24} height={26} fill="#efe6d1" stroke="#14181d" strokeWidth={3.5} />
      <circle cx={60} cy={33} r={8} fill="#ffffff" stroke="#14181d" strokeWidth={2.5} />
      <path d="M60,33 V27.5 M60,33 L64,35" stroke="#14181d" strokeWidth={2} strokeLinecap="round" />
      <path d="M12,62 L60,42 L108,62 Z" fill="#d8c79f" stroke="#14181d" strokeWidth={3.5} strokeLinejoin="round" />
      <rect x={16} y={62} width={88} height={7} fill="#efe6d1" stroke="#14181d" strokeWidth={3} />
      <rect x={18} y={69} width={84} height={37} fill="#e7dcc3" stroke="#14181d" strokeWidth={3} />
      {[24, 40, 72, 88].map((cx) => (
        <rect key={cx} x={cx} y={69} width={8} height={37} fill="#f7f1e2" stroke="#14181d" strokeWidth={2.5} />
      ))}
      <rect x={53} y={82} width={14} height={24} fill="#6b4a2b" stroke="#14181d" strokeWidth={2.5} />
      <rect x={10} y={106} width={100} height={8} rx={1} fill="#c9b98f" stroke="#14181d" strokeWidth={3} />
    </svg>
  );
}

/** Drawn icons by name, with their width : height ratio. */
export const ICONS: Record<string, {ratio: number; draw: React.FC<{id: string}>}> = {
  'teutonic-shield': {ratio: 100 / 120, draw: TeutonicShield},
  'rain-cloud': {ratio: 1, draw: RainCloud},
  'height-compare': {ratio: 1.1, draw: HeightCompare},
  'village-house': {ratio: 1, draw: VillageHouse},
  'town-hall': {ratio: 1, draw: TownHall},
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

// ---------------------------------------------------------------------------
// Story objects on the map: pure SVG, drawn inside the map's overlay (never a CSS filter, see CLAUDE.md).
// ---------------------------------------------------------------------------

/**
 * A toy side-on river steamer, centred on its waterline: bobs, its paddle wheel turns, its funnel smokes and foam
 * trails behind it. `tilt` in degrees (positive = bow down); `moving` switches the foam off once it leaves the water.
 */
export function RiverBoat({x, y, width, frame, fps, tilt = 0, flip = false, opacity = 1, moving = true}: {x: number; y: number; width: number; frame: number; fps: number; tilt?: number; flip?: boolean; opacity?: number; moving?: boolean}) {
  const s = frame / fps;
  const scale = width / 100;
  const bob = Math.sin(s * 5) * 1.3;
  const rock = Math.sin(s * 3.6) * 2 + tilt;
  const spokes = (s * 260) % 360;
  return (
    <g opacity={opacity} transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${(flip ? -scale : scale).toFixed(3)},${scale.toFixed(3)}) translate(0,${bob.toFixed(2)}) rotate(${rock.toFixed(2)})`}>
      {moving
        ? [0, 1, 2].map((k) => {
            const age = (s * 1.6 + k / 3) % 1;
            const len = 12 + age * 20;
            return <path key={k} d={`M${-48 - age * 26},${9 + k * 3} h${-len}`} stroke="#ffffff" strokeOpacity={0.85 * (1 - age)} strokeWidth={2.4} strokeLinecap="round" fill="none" />;
          })
        : null}
      {[0, 1, 2, 3].map((k) => {
        const age = (s * 0.9 + k / 4) % 1;
        return <circle key={k} cx={-1 - age * 30} cy={-54 - age * 34} r={4 + age * 9} fill="#eceff1" fillOpacity={0.8 * (1 - age)} />;
      })}
      {/* flag: the same colours the channel uses for Germany */}
      <path d="M-40,-8 V-42" stroke="#ffffff" strokeWidth={1.6} />
      <rect x={-60} y={-42} width={20} height={4.4} fill="#111111" />
      <rect x={-60} y={-37.6} width={20} height={4.4} fill="#dd0000" />
      <rect x={-60} y={-33.2} width={20} height={4.4} fill="#ffce00" />
      {/* funnel */}
      <rect x={-6} y={-52} width={10} height={26} fill="#16191d" stroke="#ffffff" strokeWidth={1.2} />
      <rect x={-6} y={-46} width={10} height={4} fill="#ffcc00" />
      {/* cabin */}
      <rect x={-28} y={-28} width={46} height={21} rx={1.5} fill="#f3ead6" stroke="#ffffff" strokeWidth={1.2} />
      <rect x={-32} y={-31} width={54} height={4.5} rx={1} fill="#16191d" />
      {[-23, -12, 7].map((wx) => (
        <rect key={wx} x={wx} y={-23} width={6.5} height={7} rx={1} fill="#27445c" />
      ))}
      {/* hull */}
      <path d="M-46,-8 L54,-8 L42,11 L-40,11 Z" fill="#16191d" stroke="#ffffff" strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M-43,5 L46,5 L42,11 L-40,11 Z" fill="#b3261e" />
      {/* paddle wheel */}
      <g transform={`translate(-3,1) rotate(${spokes.toFixed(1)})`}>
        <circle r={13} fill="#c8372d" stroke="#ffffff" strokeWidth={1.6} />
        {[0, 60, 120].map((a) => (
          <path key={a} d="M-12,0 H12" transform={`rotate(${a})`} stroke="#ffffff" strokeWidth={2} />
        ))}
      </g>
    </g>
  );
}

/**
 * A cartoon waterfall hanging from its lip at (x, y): dark rock at the edges, blue-white water running down in many thin
 * streaks of different speeds, mist piling up at the foot. `grow` (0-1) runs it down from the lip.
 * Not to scale: it is drawn far wider than the real falls would be at this zoom.
 */
export function FallsCascade({x, y, width, height, frame, fps, id, grow}: {x: number; y: number; width: number; height: number; frame: number; fps: number; id: string; grow: number}) {
  const s = frame / fps;
  const left = x - width / 2;
  const h = height * grow;
  const n = 30;
  const inset = width * 0.05;
  const body = `M${left},${y} H${left + width} L${left + width - inset},${y + h} H${left + inset} Z`;
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6f6fd" />
          <stop offset="0.55" stopColor="#a5d6ee" />
          <stop offset="1" stopColor="#63a9d2" />
        </linearGradient>
      </defs>
      <path d={body} fill="#2b2622" stroke="#2b2622" strokeWidth={width * 0.05} strokeLinejoin="round" />
      <path d={body} fill={`url(#${id})`} />
      {Array.from({length: n}, (_, k) => {
        const u = (k + 0.5) / n;
        const vary = ((k * 13) % 7) / 6;
        const dash = height * (0.14 + vary * 0.3);
        return (
          <path
            key={k}
            d={`M${(left + width * u).toFixed(1)},${y.toFixed(1)} L${(left + inset + (width - 2 * inset) * u).toFixed(1)},${(y + h).toFixed(1)}`}
            stroke="#ffffff"
            strokeOpacity={0.5 + vary * 0.45}
            strokeWidth={width * (0.006 + vary * 0.016)}
            strokeLinecap="round"
            strokeDasharray={`${dash.toFixed(1)} ${(height * (0.05 + (1 - vary) * 0.09)).toFixed(1)}`}
            strokeDashoffset={(-(s * height * (1.6 + vary * 1.3) + k * height * 0.13)).toFixed(1)}
            fill="none"
          />
        );
      })}
      <path d={`M${left.toFixed(1)},${y.toFixed(1)} H${(left + width).toFixed(1)}`} stroke="#ffffff" strokeWidth={width * 0.022} strokeLinecap="round" />
      {grow > 0.6
        ? Array.from({length: 16}, (_, k) => {
            const puff = Math.sin(s * 2.6 + k * 1.7);
            const back = k % 2 === 0;
            const r = width * ((back ? 0.11 : 0.075) + 0.018 * puff + (k % 3) * 0.012);
            return <circle key={k} cx={left + (width * k) / 15} cy={y + h + width * ((back ? -0.03 : 0.035) + 0.018 * puff)} r={r} fill="#ffffff" fillOpacity={(back ? 0.42 : 0.72) * Math.min(1, (grow - 0.6) / 0.4)} />;
          })
        : null}
    </g>
  );
}

/** White water thrown up at (x, y) when something lands, `t` seconds after the landing; nothing after `life` seconds. */
export function SplashBurst({x, y, size, t, life = 0.8}: {x: number; y: number; size: number; t: number; life?: number}) {
  if (t < 0 || t > life) return null;
  const k = t / life;
  return (
    <g>
      <ellipse cx={x} cy={y} rx={size * (0.25 + 0.75 * k)} ry={size * (0.08 + 0.2 * k)} fill="none" stroke="#ffffff" strokeOpacity={1 - k} strokeWidth={size * 0.05} />
      {Array.from({length: 14}, (_, i) => {
        const a = -Math.PI / 2 + ((i - 6.5) / 6.5) * 1.15;
        const v = size * (2 + ((i * 5) % 4) * 0.55);
        const dx = Math.cos(a) * v * t;
        const dy = Math.sin(a) * v * t + 2.6 * size * t * t;
        return <circle key={i} cx={x + dx} cy={y + dy} r={size * (0.075 + ((i * 3) % 4) * 0.022) * (1 - k * 0.6)} fill="#ffffff" fillOpacity={1 - k * k} />;
      })}
    </g>
  );
}

/** A neon circle snapping down onto its target (`grow` 0-1), then breathing. Soft strokes instead of a blur (see CLAUDE.md). */
export function NeonRing({x, y, radius, grow, frame, fps, opacity = 1}: {x: number; y: number; radius: number; grow: number; frame: number; fps: number; opacity?: number}) {
  const r = radius * (1 + 3 * (1 - grow)) * (1 + 0.025 * Math.sin((frame / fps) * 7));
  const w = radius * 0.05;
  return (
    <g opacity={opacity * Math.min(1, grow * 3)} fill="none">
      <circle cx={x} cy={y} r={r} stroke="#2ff3ff" strokeOpacity={0.14} strokeWidth={w * 6} />
      <circle cx={x} cy={y} r={r} stroke="#2ff3ff" strokeOpacity={0.3} strokeWidth={w * 3} />
      <circle cx={x} cy={y} r={r} stroke="#e8feff" strokeWidth={w} />
    </g>
  );
}

/** A red X that draws itself, one stroke after the other, over whatever is at (x, y). */
export function StrikeMark({x, y, size, frame, start, end, fps, W, H}: {x: number; y: number; size: number; frame: number; start: number; end?: number; fps: number; W: number; H: number}) {
  if (frame < start) return null;
  const out = end !== undefined ? exit(frame, end, 8) : 1;
  if (out <= 0) return null;
  const n = Math.max(1, Math.round(0.12 * fps));
  const a = Math.min(1, (frame - start + 1) / n);
  const b = Math.min(1, Math.max(0, (frame - start - n + 1) / n));
  const h = size / 2;
  const line = (x0: number, y0: number, x1: number, y1: number, k: number) => (k > 0 ? <path d={`M${x0},${y0} L${x0 + (x1 - x0) * k},${y0 + (y1 - y0) * k}`} stroke="#e0241b" strokeWidth={size * 0.09} strokeLinecap="round" fill="none" /> : null);
  return (
    <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, opacity: out}}>
      {line(x - h, y - h, x + h, y + h, a)}
      {line(x + h, y - h, x - h, y + h, b)}
    </svg>
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

export function CountingYear({value, from, x, y, frame, start, end, fps, fontSize, fontFamily, glow, grouped = false, suffix}: {value: number; from: number; x: number; y: number; frame: number; start: number; end?: number; fps: number; fontSize: number; fontFamily: string; glow: string; grouped?: boolean; suffix?: string}) {
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
      {grouped ? shown.toLocaleString('en-US') : shown}
      {suffix ? <span style={{fontSize: '0.55em', marginLeft: '0.12em'}}>{suffix}</span> : null}
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
