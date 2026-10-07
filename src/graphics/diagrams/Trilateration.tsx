import React from 'react';
import {useCurrentFrame} from 'remotion';
import {progress} from '../../animations/motion';
import {useLayout, useTheme} from '../../layouts/ProjectContext';
import type {DiagramProps} from './types';

/**
 * Trilateration, drawn in 2D for clarity (in reality the ranges are spheres).
 * Cues: ring1, ring2, ring3 (draw each range ring), fix (position resolved),
 * clock (fourth satellite for the receiver clock).
 */
type P = {x: number; y: number};
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

const YOU: P = {x: 540, y: 560};
const SATS: P[] = [
  {x: 250, y: 250},
  {x: 830, y: 300},
  {x: 290, y: 870},
];
const CLOCK_SAT: P = {x: 880, y: 830};

/** Both intersection points of two circles (assumes they intersect). */
function intersections(c1: P, r1: number, c2: P, r2: number): [P, P] {
  const d = dist(c1, c2);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const mx = c1.x + (a * (c2.x - c1.x)) / d;
  const my = c1.y + (a * (c2.y - c1.y)) / d;
  const ox = (h * (c2.y - c1.y)) / d;
  const oy = (h * (c2.x - c1.x)) / d;
  return [
    {x: mx + ox, y: my - oy},
    {x: mx - ox, y: my + oy},
  ];
}

export const Trilateration: React.FC<DiagramProps> = ({rect, cue, durationInFrames}) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const {unit} = useLayout();
  const step = durationInFrames / 6;
  const t = {
    ring1: cue('ring1', Math.round(step * 0.3)),
    ring2: cue('ring2', Math.round(step * 1.3)),
    ring3: cue('ring3', Math.round(step * 2.3)),
    fix: cue('fix', Math.round(step * 3.2)),
    clock: cue('clock', Math.round(step * 4.2)),
  };
  const rings = [t.ring1, t.ring2, t.ring3];
  const radii = SATS.map((s) => dist(s, YOU));
  const [pa, pb] = intersections(SATS[0], radii[0], SATS[1], radii[1]);
  const newest = rings.reduce((acc, f, i) => (frame >= f ? i : acc), -1);

  // viewBox units -> on-screen px is ~ rect/1000; keep strokes visually constant.
  const s = 1000 / Math.min(rect.w, rect.h);
  const stroke = 3 * unit * s;
  const label = (txt: string, at: P, op: number, dx = 26, color = theme.textMuted) => (
    <text
      x={at.x + dx}
      y={at.y + 9}
      fill={color}
      opacity={op}
      textAnchor={dx < 0 ? 'end' : 'start'}
      style={{fontFamily: theme.fonts.body, fontSize: 30 * unit * s * 0.9, fontWeight: 600}}
    >
      {txt}
    </text>
  );
  const sat = (p: P, op: number) => (
    <rect x={p.x - 13} y={p.y - 13} width={26} height={26} transform={`rotate(45 ${p.x} ${p.y})`} fill={theme.text} opacity={op} />
  );

  const twoPoints = progress(frame, t.ring2 + 14, 12) * (1 - progress(frame, t.fix, 12));
  const fixP = progress(frame, t.fix, 14);
  const clockP = progress(frame, t.clock, 16);

  return (
    <div style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h}}>
      <svg viewBox="0 0 1000 1000" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{overflow: 'visible'}}>
        {SATS.map((c, i) => {
          const p = progress(frame, rings[i], 26);
          return (
            <g key={i}>
              <circle
                cx={c.x}
                cy={c.y}
                r={radii[i]}
                fill="none"
                stroke={i === newest && fixP < 1 ? theme.accent : theme.rule}
                strokeWidth={stroke}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - p}
              />
              {sat(c, progress(frame, rings[i] - 8, 10))}
              {label(`${i + 1}`, c, progress(frame, rings[i] - 8, 10))}
            </g>
          );
        })}

        {/* After two rings: two candidate positions; they give way to the fix. */}
        {[pa, pb].map((q, i) => (
          <circle key={i} cx={q.x} cy={q.y} r={11} fill="none" stroke={theme.text} strokeWidth={stroke} opacity={twoPoints} />
        ))}

        {/* Fourth satellite: checks the receiver's clock. */}
        <g opacity={clockP}>
          <circle cx={CLOCK_SAT.x} cy={CLOCK_SAT.y} r={dist(CLOCK_SAT, YOU)} fill="none" stroke={theme.textMuted} strokeWidth={stroke} strokeDasharray="10 14" />
          {sat(CLOCK_SAT, 1)}
          {label('4 · clock', CLOCK_SAT, 1, -30)}
        </g>

        {/* Resolved position. */}
        <g opacity={fixP}>
          <circle cx={YOU.x} cy={YOU.y} r={14 + 26 * (1 - fixP)} fill="none" stroke={theme.accent} strokeWidth={stroke} opacity={0.6} />
          <circle cx={YOU.x} cy={YOU.y} r={12} fill={theme.accent} />
          {label('You', YOU, 1, 30, theme.text)}
        </g>
      </svg>
    </div>
  );
};
