import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {EASE_IN_OUT, EASE_OUT, progress} from '../../animations/motion';
import {useLayout, useTheme} from '../../layouts/ProjectContext';
import type {DiagramProps} from './types';

/**
 * Cross-section of a shallow strait with the deepest ship that fits.
 * Defaults are the Strait of Malacca: ~25 m minimum depth, Malaccamax
 * draught ~20.5 m (Wikipedia "Malaccamax"). Vertical scale is true to the
 * numbers; the hull length is not (it's a profile, not a plan).
 * Cues: seabed, depth, ship, name.
 */
const VB = {w: 1600, h: 700};
const SURFACE = 150;
const PX_PER_M = 17.5;
const DEPTH_M = 25;
const DRAUGHT_M = 20.5;
const SEABED = SURFACE + DEPTH_M * PX_PER_M; // 587.5
const KEEL = SURFACE + DRAUGHT_M * PX_PER_M; // 508.75

// Hull profile (bow on the right), deck 70 px above the waterline.
const HULL = `M150,${SURFACE - 70} L1080,${SURFACE - 70} Q1170,${SURFACE - 60} 1200,${SURFACE + 40} Q1190,${KEEL - 40} 1110,${KEEL} L230,${KEEL} Q160,${KEEL - 10} 150,${KEEL - 120} Z`;
const BRIDGE = `M170,${SURFACE - 70} L170,${SURFACE - 160} L290,${SURFACE - 160} L290,${SURFACE - 70} Z`;
const seabedPath = () => {
  const pts: string[] = [];
  for (let x = 0; x <= VB.w; x += 40) {
    const y = SEABED + 6 * Math.sin(x / 90) + 4 * Math.sin(x / 37 + 1);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M${pts.join(' L')} L${VB.w},${VB.h} L0,${VB.h} Z`;
};

export const ChannelDepth: React.FC<DiagramProps> = ({rect, cue, durationInFrames}) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const {unit} = useLayout();
  const s = VB.w / rect.w;
  const stroke = 3 * unit * s;
  const T = {
    seabed: cue('seabed', 10),
    depth: cue('depth', 50),
    ship: cue('ship', 110),
    name: cue('name', Math.round(durationInFrames * 0.75)),
  };
  const fade = (start: number, len = 12) => progress(frame, start, len);
  const shipX = interpolate(frame, [T.ship, T.ship + 40], [-1500, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT});
  const text = (t: string, x: number, y: number, start: number, o: {size?: number; color?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number} = {}) => (
    <text x={x} y={y} textAnchor={o.anchor ?? 'start'} fill={o.color ?? theme.textMuted} opacity={fade(start)} style={{fontFamily: theme.fonts.body, fontSize: (o.size ?? 34) * unit * s * 0.92, fontWeight: o.weight ?? 600, letterSpacing: '0.02em'}}>
      {t}
    </text>
  );
  /** Vertical dimension line with end ticks, drawing downward. */
  const dim = (x: number, y0: number, y1: number, start: number, color: string) => {
    const p = progress(frame, start, 22, EASE_OUT);
    const y = y0 + (y1 - y0) * p;
    return (
      <g stroke={color} strokeWidth={stroke} strokeLinecap="round" opacity={p > 0 ? 1 : 0}>
        <line x1={x - 18} x2={x + 18} y1={y0} y2={y0} />
        <line x1={x} x2={x} y1={y0} y2={y} />
        {p >= 1 ? <line x1={x - 18} x2={x + 18} y1={y1} y2={y1} /> : null}
      </g>
    );
  };

  const water = fade(0, 16);
  return (
    <svg viewBox={`0 0 ${VB.w} ${VB.h}`} width={rect.w} height={rect.h} style={{position: 'absolute', left: rect.x, top: rect.y, overflow: 'visible'}}>
      {/* Water column and surface */}
      <rect x={0} y={SURFACE} width={VB.w} height={VB.h - SURFACE} fill="#1b3a52" opacity={0.55 * water} />
      <line x1={0} x2={VB.w} y1={SURFACE} y2={SURFACE} stroke={theme.text} strokeOpacity={0.5 * water} strokeWidth={stroke} />
      {text('Sea level', 20, SURFACE - 18, 0, {size: 28})}

      {/* Seabed */}
      <path d={seabedPath()} fill={theme.chartMuted} opacity={fade(T.seabed, 16)} />

      {/* Ship slides in from the left */}
      <g transform={`translate(${shipX},0)`} opacity={frame >= T.ship ? 1 : 0}>
        <path d={HULL} fill="#c9c3b8" stroke={theme.text} strokeWidth={stroke} strokeLinejoin="round" />
        <path d={BRIDGE} fill="#c9c3b8" stroke={theme.text} strokeWidth={stroke} strokeLinejoin="round" />
        {/* Below-waterline tint so the draught reads at a glance */}
        <path d={HULL} fill="#7a2e22" opacity={0.55} clipPath="url(#below)" />
        <line x1={150} x2={1200} y1={SURFACE} y2={SURFACE} stroke={theme.text} strokeOpacity={0.6} strokeWidth={stroke * 0.7} />
      </g>
      <defs>
        <clipPath id="below">
          <rect x={-2000} y={SURFACE} width={6000} height={VB.h} />
        </clipPath>
      </defs>

      {/* Depth of the channel */}
      {dim(1440, SURFACE, SEABED, T.depth, theme.text)}
      {text('≈ 25 m', 1470, (SURFACE + SEABED) / 2 + 12, T.depth + 16, {size: 44, color: theme.text, weight: 700})}
      {text('minimum depth', 1470, (SURFACE + SEABED) / 2 + 58, T.depth + 20, {size: 26})}

      {/* Draught of the largest ship */}
      {dim(1260, SURFACE, KEEL, T.ship + 40, theme.accent)}
      {text('20.5 m', 1290, KEEL - 40, T.ship + 52, {size: 40, color: theme.accent, weight: 700})}
      {text('draught', 1290, KEEL - 2, T.ship + 56, {size: 26})}

      {/* The few metres to spare */}
      <rect x={230} y={KEEL} width={880} height={SEABED - KEEL - 6} fill={theme.accent} opacity={0.22 * fade(T.name, 16)} />
      {text('MALACCAMAX', 660, SURFACE - 100, T.name, {size: 52, color: theme.text, weight: 800, anchor: 'middle'})}
      {text('Only a few metres under the keel', 660, VB.h - 20, T.name + 10, {size: 30, color: theme.accent, anchor: 'middle'})}
    </svg>
  );
};
