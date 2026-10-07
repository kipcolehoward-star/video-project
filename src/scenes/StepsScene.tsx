import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {progress, riseIn} from '../animations/motion';
import {Region} from '../components/Region';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {Headline, Kicker} from '../components/Typography';
import {estimateTextHeight, itemsLayout, type LayoutContext} from '../layouts/engine';
import {useCue, useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/** A numbered process. Each step appears when the narrator reaches its cue word. */
export interface StepsData {
  kicker?: string;
  heading?: string;
  steps: {title: string; text?: string; cue?: string}[];
}

const sizes = (ctx: LayoutContext) => ({
  index: Math.round(ctx.type.h1 * 0.9),
  title: Math.round(ctx.type.h2 * 0.74),
  text: Math.round(ctx.type.body * 0.86),
});

const layout = (ctx: LayoutContext, d: StepsData) => itemsLayout(ctx, d.steps.length, {heading: Boolean(d.heading || d.kicker)});

/**
 * Content priority: step descriptions are dropped (for all steps, so they stay
 * consistent) when any step's title + description would not fit its slot.
 * In a row the number sits above the title; in a column it sits beside it.
 */
function showText(ctx: LayoutContext, d: StepsData): boolean {
  const {direction, regions} = layout(ctx, d);
  const sz = sizes(ctx);
  const row = direction !== 'column';
  return d.steps.every((s, i) => {
    if (!s.text) return true;
    const r = regions[`item${i}`];
    const w = row ? r.w : r.w - sz.index - ctx.gutter * 1.6;
    const needed =
      (row ? sz.index + 36 * ctx.unit + 3 * ctx.unit : 0) +
      estimateTextHeight(s.title, sz.title, w, 1.2) +
      10 * ctx.unit +
      estimateTextHeight(s.text, sz.text, w, 1.4);
    // 10% margin: matches QC's more conservative estimate (block spacing), so render and validation agree.
    return needed * 1.1 <= r.h;
  });
}

/** Tallest step content in a row/grid, so all steps share one centred top offset. */
function rowContentHeight(ctx: LayoutContext, d: StepsData, withText: boolean): number {
  const {regions} = layout(ctx, d);
  const sz = sizes(ctx);
  return Math.max(
    ...d.steps.map((s, i) => {
      const w = regions[`item${i}`].w;
      return 3 * ctx.unit + 18 * ctx.unit * 2 + sz.index + estimateTextHeight(s.title, sz.title, w, 1.2) + (s.text && withText ? 10 * ctx.unit + estimateTextHeight(s.text, sz.text, w, 1.4) : 0);
    }),
  );
}

const Steps: React.FC<SceneProps<StepsData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const cueAt = useCue(scene);
  const d = scene.data;
  const {direction, regions} = layout(ctx, d);
  const sz = sizes(ctx);
  const rise = 22 * ctx.unit;
  const row = direction !== 'column';
  const withText = showText(ctx, d);

  // Without a transcript, spread steps across the first 70% of the scene.
  const starts = d.steps.map((s, i) => cueAt(s.cue, Math.round(12 + (i * durationInFrames * 0.7) / d.steps.length)));
  const current = starts.reduce((acc, f, i) => (frame >= f ? i : acc), -1);

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
      {d.steps.map((s, i) => {
        const r = regions[`item${i}`];
        const p = progress(frame, starts[i], 16);
        const active = i === current;
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
              flexDirection: row ? 'column' : 'row',
              alignItems: row ? 'stretch' : 'center',
              gap: row ? 18 * ctx.unit : ctx.gutter * 0.8,
              paddingTop: row ? Math.max(0, (r.h - rowContentHeight(ctx, d, withText)) / 2) : 0,
              boxSizing: 'border-box',
              // Upcoming steps are faintly visible so the viewer sees the whole process.
              opacity: 0.15 + 0.85 * p,
            }}
          >
            {/* Rule grows in on reveal; accent while this step is being narrated. */}
            <div
              style={{
                width: row ? `${p * 100}%` : Math.max(2, Math.round(3 * ctx.unit)),
                height: row ? Math.max(2, Math.round(3 * ctx.unit)) : `${p * 100}%`,
                background: active ? theme.accent : theme.rule,
                alignSelf: row ? 'flex-start' : 'center',
              }}
            />
            <div
              style={{
                fontFamily: theme.fonts.display,
                fontSize: sz.index,
                fontWeight: 600,
                lineHeight: 1,
                color: active ? theme.accent : theme.textMuted,
                fontVariantNumeric: 'tabular-nums',
                minWidth: row ? undefined : sz.index,
              }}
            >
              {i + 1}
            </div>
            <div style={{transform: `translateY(${(1 - p) * rise}px)`}}>
              <div style={{fontFamily: theme.fonts.body, fontSize: sz.title, fontWeight: 600, lineHeight: 1.2, color: theme.text}}>{s.title}</div>
              {s.text && withText ? (
                <div style={{fontFamily: theme.fonts.body, fontSize: sz.text, lineHeight: 1.4, color: theme.textMuted, marginTop: 10 * ctx.unit}}>{s.text}</div>
              ) : null}
            </div>
          </div>
        );
      })}
      {guides ? <SafeZoneGuides regions={regions} /> : null}
    </AbsoluteFill>
  );
};

export const StepsScene: SceneDefinition<StepsData> = {
  component: Steps,
  regions: (ctx, d) => layout(ctx, d).regions,
  textBlocks: (ctx, d) => {
    const sz = sizes(ctx);
    const row = layout(ctx, d).direction !== 'column';
    const withText = showText(ctx, d);
    return [
      ...(d.heading ? [{region: 'heading', text: d.heading, fontSize: ctx.type.h1, lineHeight: 1.06}] : []),
      ...d.steps.flatMap((s, i) => [
        // In a column the number sits beside the title, so it adds no height.
        ...(row ? [{region: `item${i}`, text: String(i + 1), fontSize: sz.index, lineHeight: 1}] : []),
        {region: `item${i}`, text: s.title, fontSize: sz.title, lineHeight: 1.2},
        ...(s.text && withText ? [{region: `item${i}`, text: s.text, fontSize: sz.text, lineHeight: 1.4}] : []),
      ]),
    ];
  },
  cues: (d) => d.steps.flatMap((s) => (s.cue ? [s.cue] : [])),
};
