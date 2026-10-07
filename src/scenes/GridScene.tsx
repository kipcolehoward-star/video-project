import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {progress, riseIn} from '../animations/motion';
import {Region} from '../components/Region';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {Headline, Kicker} from '../components/Typography';
import {gridLayout, type LayoutContext} from '../layouts/engine';
import {useCue, useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/** Reference cards (e.g. country + emergency numbers), revealed in sequence. */
export interface GridData {
  kicker?: string;
  heading?: string;
  items: {label: string; value: string; note?: string; cue?: string}[];
}

const layout = (ctx: LayoutContext, d: GridData) => gridLayout(ctx, d.items.length, {heading: Boolean(d.heading || d.kicker)});

const sizes = (ctx: LayoutContext, d: GridData) => {
  const {regions} = layout(ctx, d);
  const card = regions.item0;
  const longest = Math.max(...d.items.map((it) => it.value.length));
  return {
    label: Math.round(ctx.type.label * 1.05),
    value: Math.min(Math.round(ctx.type.h1 * 1.1), Math.floor((card.w - ctx.gutter) / (longest * 0.58))),
    note: Math.round(ctx.type.body * 0.66),
  };
};

const Grid: React.FC<SceneProps<GridData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const cueAt = useCue(scene);
  const d = scene.data;
  const {regions} = layout(ctx, d);
  const sz = sizes(ctx, d);
  const rise = 20 * ctx.unit;

  return (
    <AbsoluteFill style={{background: theme.background}}>
      {regions.heading ? (
        <Region rect={regions.heading} justify="end">
          {d.kicker ? <Kicker style={riseIn(frame, 0, rise)}>{d.kicker}</Kicker> : null}
          {d.heading ? (
            <Headline size="h1" style={riseIn(frame, 4, rise)}>
              {d.heading}
            </Headline>
          ) : null}
        </Region>
      ) : null}
      {d.items.map((it, i) => {
        const r = regions[`item${i}`];
        // Sequential reveal across the first half of the scene unless cued.
        const p = progress(frame, cueAt(it.cue, Math.round(16 + (i * durationInFrames * 0.5) / d.items.length)), 14);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              boxSizing: 'border-box',
              padding: ctx.gutter * 0.6,
              background: theme.surface,
              borderTop: `${Math.max(2, Math.round(3 * ctx.unit))}px solid ${theme.accent}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              opacity: p,
              transform: `translateY(${(1 - p) * rise}px)`,
            }}
          >
            <div style={{fontFamily: theme.fonts.body, fontSize: sz.label, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: theme.textMuted}}>{it.label}</div>
            <div>
              <div style={{fontFamily: theme.fonts.display, fontSize: sz.value, fontWeight: 600, lineHeight: 1, color: theme.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap'}}>{it.value}</div>
              {it.note ? <div style={{fontFamily: theme.fonts.body, fontSize: sz.note, lineHeight: 1.35, color: theme.textMuted, marginTop: 10 * ctx.unit}}>{it.note}</div> : null}
            </div>
          </div>
        );
      })}
      {guides ? <SafeZoneGuides regions={regions} /> : null}
    </AbsoluteFill>
  );
};

export const GridScene: SceneDefinition<GridData> = {
  component: Grid,
  regions: (ctx, d) => layout(ctx, d).regions,
  textBlocks: (ctx, d) => {
    const sz = sizes(ctx, d);
    return [
      ...(d.heading ? [{region: 'heading', text: d.heading, fontSize: ctx.type.h1, lineHeight: 1.06}] : []),
      ...d.items.flatMap((it, i) => [
        {region: `item${i}`, text: it.label, fontSize: sz.label, lineHeight: 1.2},
        {region: `item${i}`, text: it.value, fontSize: sz.value, lineHeight: 1},
        ...(it.note ? [{region: `item${i}`, text: it.note, fontSize: sz.note, lineHeight: 1.35}] : []),
      ]),
    ];
  },
  cues: (d) => d.items.flatMap((it) => (it.cue ? [it.cue] : [])),
};
