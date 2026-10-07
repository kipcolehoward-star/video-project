import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {EASE_IN_OUT, EASE_OUT, progress} from '../../animations/motion';
import {useLayout, useTheme} from '../../layouts/ProjectContext';
import type {DiagramProps} from './types';

/**
 * How a 911 call reaches help: phone -> cell tower -> 911 call center ->
 * police / fire / EMS. Line icons draw themselves; signal pulses travel
 * along the connecting curves. Cues: phone, tower, center, dispatch, close.
 */
type P = [number, number];
const VB = {w: 1600, h: 700};

/** Point on a quadratic Bézier. */
const qb = (a: P, c: P, b: P, t: number): P => [
  (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
  (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
];
const qPath = (a: P, c: P, b: P) => `M${a[0]},${a[1]} Q${c[0]},${c[1]} ${b[0]},${b[1]}`;

const LINKS = {
  phoneTower: {a: [215, 330] as P, c: [365, 220] as P, b: [470, 320] as P},
  towerCenter: {a: [575, 320] as P, c: [745, 220] as P, b: [850, 330] as P},
};
const RESPONDERS = [
  {label: 'Police', y: 140, icon: 'shield'},
  {label: 'Fire', y: 350, icon: 'flame'},
  {label: 'EMS', y: 560, icon: 'cross'},
] as const;
const branch = (y: number) => ({a: [995, 350] as P, c: [1180, (350 + y) / 2] as P, b: [1310, y] as P});

export const CallRouting: React.FC<DiagramProps> = ({rect, cue, durationInFrames}) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const {unit} = useLayout();
  const s = VB.w / rect.w; // viewBox units per px, keeps strokes visually constant
  const stroke = 3 * unit * s;
  const T = {
    phone: cue('phone', 12),
    tower: cue('tower', 70),
    center: cue('center', 128),
    dispatch: cue('dispatch', 175),
    close: cue('close', Math.round(durationInFrames * 0.8)),
  };

  // ---- primitives
  const draw = (start: number, len = 22) => progress(frame, start, len, EASE_OUT);
  const pop = (start: number) => {
    const p = progress(frame, start, 14);
    return {opacity: p, transform: `scale(${0.85 + 0.15 * p})`};
  };
  const line = (d: string, start: number, color = theme.text, len?: number) => (
    <path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw(start, len)} />
  );
  const label = (text: string, x: number, y: number, start: number, opts: {size?: number; color?: string; weight?: number} = {}) => (
    <text x={x} y={y} textAnchor="middle" fill={opts.color ?? theme.textMuted} opacity={progress(frame, start, 12)} style={{fontFamily: theme.fonts.body, fontSize: (opts.size ?? 34) * unit * s * 0.92, fontWeight: opts.weight ?? 600, letterSpacing: '0.02em'}}>
      {text}
    </text>
  );

  /** A connection: draws in, then a pulse travels it; settles to a muted line. */
  const link = (l: {a: P; c: P; b: P}, start: number, travel = 28, key?: string) => {
    const drawn = draw(start, travel);
    const t = interpolate(frame, [start + 6, start + 6 + travel], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT});
    const [px, py] = qb(l.a, l.c, l.b, t);
    const travelling = frame >= start + 6 && t < 1;
    const settled = progress(frame, start + 6 + travel, 20);
    return (
      <g key={key}>
        <path d={qPath(l.a, l.c, l.b)} fill="none" stroke={theme.accent} strokeOpacity={1 - 0.6 * settled} strokeWidth={stroke} strokeDasharray="10 12" strokeDashoffset={-frame * 1.5} opacity={drawn} />
        {travelling ? (
          <>
            <circle cx={px} cy={py} r={18} fill={theme.accent} opacity={0.18} />
            <circle cx={px} cy={py} r={8} fill={theme.accent} />
          </>
        ) : null}
      </g>
    );
  };

  // ---- icons (local coordinates, centred on 0,0, ~100 units)
  const phone = (
    <g>
      {line('M-26,-48 h52 a10,10 0 0 1 10,10 v76 a10,10 0 0 1 -10,10 h-52 a10,10 0 0 1 -10,-10 v-76 a10,10 0 0 1 10,-10 z', T.phone)}
      {line('M-12,-34 h24', T.phone + 6)}
      {line('M-4,32 h8', T.phone + 8)}
    </g>
  );
  const waves = [0, 1, 2].map((i) => {
    const start = T.phone + 26 + i * 8;
    const p = progress(frame, start, 18);
    const r = 34 + i * 16;
    return <path key={i} d={`M${r * 0.7},${-r * 0.7} A${r},${r} 0 0 1 ${r * 0.7},${r * 0.7}`} fill="none" stroke={theme.accent} strokeWidth={stroke} strokeLinecap="round" opacity={p * (frame < T.tower + 40 ? 1 : 0.35)} />;
  });
  const tower = (
    <g>
      {line('M-34,52 L0,-44 L34,52', T.tower, theme.text, 20)}
      {line('M-20,14 L20,14 M-26,32 L26,32 M-12,-12 L12,-12', T.tower + 8, theme.text, 16)}
      {line('M-16,-60 A22,22 0 0 0 -16,-28 M16,-60 A22,22 0 0 1 16,-28', T.tower + 14, theme.accent, 14)}
      {line('M-28,-70 A38,38 0 0 0 -28,-18 M28,-70 A38,38 0 0 1 28,-18', T.tower + 18, theme.accent, 14)}
    </g>
  );
  const center = (
    <g>
      {line('M-62,56 V-30 L0,-64 L62,-30 V56 Z', T.center, theme.text, 24)}
      <text x={0} y={22} textAnchor="middle" fill={theme.accent} opacity={progress(frame, T.center + 12, 12)} style={{fontFamily: theme.fonts.display, fontSize: 46, fontWeight: 600}}>
        911
      </text>
    </g>
  );
  const centerRing = progress(frame, T.center + 16, 30, EASE_OUT);
  const icons = {
    shield: 'M0,-40 L32,-28 V2 C32,24 16,38 0,46 C-16,38 -32,24 -32,2 V-28 Z',
    flame: 'M0,-44 C18,-22 30,-6 26,16 C22,36 8,44 0,44 C-8,44 -22,36 -26,16 C-28,0 -16,-12 -8,-24 C-6,-10 0,-6 4,-2 C6,-18 4,-30 0,-44 Z',
    cross: 'M-10,-38 H10 V-10 H38 V10 H10 V38 H-10 V10 H-38 V-10 H-10 Z',
  } as const;

  return (
    <div style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h}}>
      <svg viewBox={`0 0 ${VB.w} ${VB.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{overflow: 'visible'}}>
        {/* Caller */}
        <g transform="translate(150,330) scale(1.3)">
          <g style={{...pop(T.phone), transformOrigin: '0px 0px'}}>{phone}</g>
          {waves}
        </g>
        {label('Caller', 150, 462, T.phone + 10)}

        {link(LINKS.phoneTower, T.phone + 34)}
        <g transform="translate(522,330) scale(1.3)">
          <g style={{...pop(T.tower), transformOrigin: '0px 0px'}}>{tower}</g>
        </g>
        {label('Cell tower', 522, 462, T.tower + 10)}
        {label('Nearest tower picks up the call', 345, 175, T.tower + 16, {size: 28})}

        {link(LINKS.towerCenter, T.tower + 32)}
        <g transform="translate(920,340) scale(1.3)">
          <circle r={(70 + 90 * centerRing) / 1} fill="none" stroke={theme.accent} strokeWidth={stroke} opacity={centerRing > 0 && centerRing < 1 ? 1 - centerRing : 0} />
          <g style={{...pop(T.center), transformOrigin: '0px 0px'}}>{center}</g>
        </g>
        {label('911 call center', 920, 478, T.center + 10, {color: theme.text})}
        {label('Routed by location', 745, 175, T.center - 4, {size: 28})}
        {label('Call-taker decides who to send', 920, 520, T.center + 26, {size: 28})}

        {/* Dispatch: one call, the right responders */}
        {RESPONDERS.map((r, i) => {
          const start = T.dispatch + i * 12;
          return (
            <g key={r.label}>
              {link(branch(r.y), start, 24, r.label)}
              <g transform={`translate(1390,${r.y}) scale(1.3)`}>
                <g style={{...pop(start + 22), transformOrigin: '0px 0px'}}>
                  {line(icons[r.icon], start + 22, theme.text, 18)}
                </g>
              </g>
              {label(r.label, 1505, r.y + 12, start + 28, {color: theme.text, size: 36})}
            </g>
          );
        })}

        {label('One number. The right responders.', 800, 690, T.close, {size: 42, color: theme.text, weight: 600})}
      </svg>
    </div>
  );
};
