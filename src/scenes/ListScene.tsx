import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {progress, riseIn} from '../animations/motion';
import {Backdrop} from '../components/Backdrop';
import {Region} from '../components/Region';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {Headline, Kicker} from '../components/Typography';
import {estimateTextHeight, stackLayout, type LayoutContext} from '../layouts/engine';
import {useCue, useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/**
 * Lines revealed one by one on narration cues.
 *   display   big statement lines ("SHORT", "MEMORABLE", ...)
 *   numbered  recap list: current item bright, earlier items dimmed
 *   pairs     "POLICE → LOCAL NUMBER" rows (text + sub)
 */
export interface ListData {
  style?: 'display' | 'numbered' | 'pairs';
  kicker?: string;
  heading?: string;
  items: {text: string; sub?: string; cue?: string}[];
  background?: string;
}

const layout = (ctx: LayoutContext, d: ListData) => stackLayout(ctx, {heading: Boolean(d.heading || d.kicker)});

/** Font size so all lines fit the body region (display shrinks before overflowing). */
function sizeFor(ctx: LayoutContext, d: ListData): number {
  const {body} = layout(ctx, d).regions;
  const n = d.items.length;
  if (d.style === 'numbered') {
    const base = Math.round(ctx.type.h2 * 0.78);
    const need = d.items.reduce((h, it) => h + estimateTextHeight(it.text, base, body.w - base * 2, 1.25) + base * 0.55, 0);
    return need <= body.h ? base : Math.floor(base * (body.h / need));
  }
  if (d.style === 'pairs') return Math.min(ctx.type.h1, Math.floor(body.h / (n * 1.7)));
  const longest = Math.max(...d.items.map((it) => it.text.length));
  return Math.min(ctx.type.display, Math.floor(body.h / (n * 1.15)), Math.floor(body.w / (longest * 0.56)));
}

const List: React.FC<SceneProps<ListData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const cueAt = useCue(scene);
  const d = scene.data;
  const style = d.style ?? 'display';
  const {regions} = layout(ctx, d);
  const size = sizeFor(ctx, d);
  const rise = 24 * ctx.unit;
  const starts = d.items.map((it, i) => cueAt(it.cue, Math.round(14 + (i * durationInFrames * 0.75) / d.items.length)));
  const current = starts.reduce((acc, f, i) => (frame >= f ? i : acc), -1);

  return (
    <AbsoluteFill style={{background: theme.background}}>
      {d.background ? <Backdrop asset={d.background} durationInFrames={durationInFrames} dim={0.62} /> : null}
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
      <Region rect={regions.body} justify={style === 'numbered' ? 'start' : 'center'}>
        {d.items.map((it, i) => {
          const p = progress(frame, starts[i], 16);
          if (style === 'numbered') {
            const active = i === current;
            return (
              <div key={i} style={{display: 'flex', gap: size * 0.7, marginBottom: size * 0.55, opacity: p * (active ? 1 : 0.42), transform: `translateY(${(1 - p) * rise}px)`}}>
                <div style={{fontFamily: theme.fonts.display, fontSize: size, fontWeight: 600, color: active ? theme.accent : theme.textMuted, minWidth: size * 1.2, fontVariantNumeric: 'tabular-nums'}}>{i + 1}.</div>
                <div style={{fontFamily: theme.fonts.body, fontSize: size, fontWeight: active ? 600 : 500, lineHeight: 1.25, color: theme.text}}>{it.text}</div>
              </div>
            );
          }
          if (style === 'pairs') {
            return (
              <div key={i} style={{display: 'flex', alignItems: 'baseline', gap: ctx.gutter, marginBottom: size * 0.5, opacity: p, transform: `translateY(${(1 - p) * rise}px)`}}>
                <div style={{fontFamily: theme.fonts.display, fontSize: size, fontWeight: 600, color: theme.text, minWidth: size * 6.2}}>{it.text}</div>
                <div style={{flex: 1, height: Math.max(2, Math.round(2 * ctx.unit)), background: theme.rule, alignSelf: 'center', transform: `scaleX(${p})`, transformOrigin: 'left'}} />
                <div style={{fontFamily: theme.fonts.body, fontSize: size * 0.55, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.accent}}>{it.sub}</div>
              </div>
            );
          }
          return (
            <div key={i} style={{fontFamily: theme.fonts.display, fontSize: size, fontWeight: 600, lineHeight: 1.08, letterSpacing: '-0.015em', color: i === current ? theme.text : theme.textMuted, opacity: p, transform: `translateY(${(1 - p) * rise}px)`}}>
              {it.text}
            </div>
          );
        })}
      </Region>
      {guides ? <SafeZoneGuides regions={regions} /> : null}
    </AbsoluteFill>
  );
};

export const ListScene: SceneDefinition<ListData> = {
  component: List,
  regions: (ctx, d) => layout(ctx, d).regions,
  // Body text is size-fitted to its region (sizeFor), so only the heading can overflow.
  textBlocks: (ctx, d) => (d.heading ? [{region: 'heading', text: d.heading, fontSize: ctx.type.h1, lineHeight: 1.06}] : []),
  assetRefs: (d) => (d.background ? [d.background] : []),
  cues: (d) => d.items.flatMap((it) => (it.cue ? [it.cue] : [])),
};
