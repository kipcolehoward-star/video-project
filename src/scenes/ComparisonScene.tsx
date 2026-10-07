import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {EASE_OUT, progress, riseIn} from '../animations/motion';
import {Region} from '../components/Region';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {Headline, Kicker} from '../components/Typography';
import {estimateTextHeight, itemsLayout, type LayoutContext} from '../layouts/engine';
import {useCue, useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/**
 * Values side by side (stacked in narrow frames), each counting up on its
 * narration cue. `lead` is a muted operator shown before the value ("=", "vs").
 */
export interface ComparisonData {
  kicker?: string;
  heading?: string;
  items: {
    label: string;
    value?: number;
    /** Show this text instead of a counted number (e.g. "9/11", "1968", "Rankin Fite"). */
    display?: string;
    unit?: string;
    signed?: boolean;
    lead?: string;
    note?: string;
    highlight?: boolean;
    cue?: string;
  }[];
}

/** True minus sign for negatives; explicit "+" when signed. */
export const formatSigned = (v: number, signed?: boolean) => {
  const abs = Math.abs(Math.round(v)).toLocaleString('en-US');
  if (v < 0) return `−${abs}`;
  return signed && v > 0 ? `+${abs}` : abs;
};

const layout = (ctx: LayoutContext, d: ComparisonData) =>
  itemsLayout(ctx, d.items.length, {heading: Boolean(d.heading || d.kicker), gap: ctx.gutter * 1.5});

const sizes = (ctx: LayoutContext) => ({
  value: Math.round(ctx.type.stat * (ctx.format.orientation === 'landscape' ? 0.62 : 0.5)),
  label: Math.round(ctx.type.h2 * 0.62),
  note: Math.round(ctx.type.body * 0.86),
});

/** Value size, shrunk when a long display string (e.g. a name) would overflow its column. */
function valueSizeFor(ctx: LayoutContext, d: ComparisonData, base: number): number {
  const {regions, direction} = layout(ctx, d);
  if (direction === 'column') return base;
  const w = regions.item0.w;
  const longest = Math.max(...d.items.map((it) => `${it.lead ?? ''}${it.display ?? formatSigned(it.value ?? 0, it.signed)}${it.unit ?? ''}`.length));
  return Math.min(base, Math.floor(w / (longest * 0.6)));
}

/** Content priority: notes are dropped (for every item) when any item's value + label + note won't fit. */
function showNotes(ctx: LayoutContext, d: ComparisonData): boolean {
  const {regions} = layout(ctx, d);
  const sz = sizes(ctx);
  return d.items.every((it, i) => {
    if (!it.note) return true;
    const r = regions[`item${i}`];
    const needed = valueSizeFor(ctx, d, sz.value) + 18 * ctx.unit + sz.label * 1.2 + 8 * ctx.unit + estimateTextHeight(it.note, sz.note, r.w, 1.4) + 40 * ctx.unit;
    return needed <= r.h;
  });
}

/** Height of the tallest item's content, so every item can share one top offset (centred, rules aligned). */
function contentHeight(ctx: LayoutContext, d: ComparisonData, withNotes: boolean): number {
  const {regions} = layout(ctx, d);
  const sz = sizes(ctx);
  const value = valueSizeFor(ctx, d, sz.value);
  return Math.max(
    ...d.items.map((it, i) => {
      const note = it.note && withNotes ? 8 * ctx.unit + estimateTextHeight(it.note, sz.note, regions[`item${i}`].w, 1.4) : 0;
      return Math.max(2, 3 * ctx.unit) + 36 * ctx.unit + value + 18 * ctx.unit + sz.label * 1.2 + note;
    }),
  );
}

const Comparison: React.FC<SceneProps<ComparisonData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const cueAt = useCue(scene);
  const d = scene.data;
  const {direction, regions} = layout(ctx, d);
  const sz = sizes(ctx);
  const valueSize = valueSizeFor(ctx, d, sz.value);
  const rise = 22 * ctx.unit;
  const ruleW = Math.max(2, Math.round(3 * ctx.unit));
  const withNotes = showNotes(ctx, d);

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
        const start = cueAt(it.cue, Math.round(12 + (i * durationInFrames * 0.6) / d.items.length));
        const p = progress(frame, start, 14);
        // Short count-up: a paused frame must not contradict the narration for long.
        const v = interpolate(frame, [start, start + 14], [0, it.value ?? 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_OUT});
        const color = it.highlight ? theme.accent : theme.text;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              display: 'flex',
              flexDirection: 'column',
              // Top-aligned so rules line up even when one item is taller (e.g. has a lead).
              justifyContent: direction !== 'column' ? 'flex-start' : 'center',
              paddingTop: direction !== 'column' ? Math.max(0, (r.h - contentHeight(ctx, d, withNotes)) / 2) : 0,
              boxSizing: 'border-box',
              opacity: p,
              transform: `translateY(${(1 - p) * rise}px)`,
            }}
          >
            {direction !== 'column' ? <div style={{height: ruleW, background: it.highlight ? theme.accent : theme.rule, marginBottom: 36 * ctx.unit}} /> : null}
            <div style={{display: 'flex', alignItems: 'baseline', gap: '0.2em', whiteSpace: 'nowrap'}}>
              {it.lead ? <span style={{fontFamily: theme.fonts.display, fontSize: valueSize * 0.6, color: theme.textMuted}}>{it.lead}</span> : null}
              <span style={{fontFamily: theme.fonts.display, fontSize: valueSize, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em', color, fontVariantNumeric: 'tabular-nums'}}>
                {it.display ?? formatSigned(v, it.signed)}
              </span>
              {it.unit ? <span style={{fontFamily: theme.fonts.display, fontSize: valueSize * 0.36, fontWeight: 600, color}}>{it.unit}</span> : null}
            </div>
            <div style={{fontFamily: theme.fonts.body, fontSize: sz.label, fontWeight: 600, color: theme.text, marginTop: 18 * ctx.unit}}>{it.label}</div>
            {it.note && withNotes ? <div style={{fontFamily: theme.fonts.body, fontSize: sz.note, color: theme.textMuted, marginTop: 8 * ctx.unit, lineHeight: 1.4}}>{it.note}</div> : null}
          </div>
        );
      })}
      {guides ? <SafeZoneGuides regions={regions} /> : null}
    </AbsoluteFill>
  );
};

export const ComparisonScene: SceneDefinition<ComparisonData> = {
  component: Comparison,
  regions: (ctx, d) => layout(ctx, d).regions,
  textBlocks: (ctx, d) => {
    const sz = sizes(ctx);
    const withNotes = showNotes(ctx, d);
    return [
      ...(d.heading ? [{region: 'heading', text: d.heading, fontSize: ctx.type.h1, lineHeight: 1.06}] : []),
      ...d.items.flatMap((it, i) => [
        {region: `item${i}`, text: `${it.lead ?? ''}${it.display ?? formatSigned(it.value ?? 0, it.signed)}`, fontSize: valueSizeFor(ctx, d, sz.value), lineHeight: 1},
        {region: `item${i}`, text: it.label, fontSize: sz.label, lineHeight: 1.2},
        ...(it.note && withNotes ? [{region: `item${i}`, text: it.note, fontSize: sz.note, lineHeight: 1.4}] : []),
      ]),
    ];
  },
  cues: (d) => d.items.flatMap((it) => (it.cue ? [it.cue] : [])),
};
