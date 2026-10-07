import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {riseIn} from '../animations/motion';
import {Region} from '../components/Region';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {Body, Headline, Kicker} from '../components/Typography';
import {CallRouting} from '../graphics/diagrams/CallRouting';
import {ChannelDepth} from '../graphics/diagrams/ChannelDepth';
import {Trilateration} from '../graphics/diagrams/Trilateration';
import type {DiagramProps} from '../graphics/diagrams/types';
import {estimateTextHeight, splitLayout, stackLayout, type LayoutContext, type Rect} from '../layouts/engine';
import {useCue, useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/** Diagram library. Add new explanatory diagrams here. */
export const DIAGRAMS: Record<string, React.FC<DiagramProps>> = {
  trilateration: Trilateration,
  'call-routing': CallRouting,
  'channel-depth': ChannelDepth,
};

/**
 * Animated diagram + text, using the split layout (diagram takes the media
 * slot). `cues` maps diagram cue names to narration words.
 */
export interface DiagramData {
  diagram: string;
  cues?: Record<string, string>;
  mediaSide?: 'start' | 'end';
  /** 'split' (default): diagram beside text. 'full': heading on top, diagram across the frame. */
  layout?: 'split' | 'full';
  kicker?: string;
  heading: string;
  body?: string;
}

/**
 * Where the diagram may draw: the media slot, kept clear of the caption band
 * (the slot's background still bleeds to the frame edge).
 */
export function diagramDrawRect(ctx: LayoutContext, media: Rect): Rect {
  const band = ctx.captionBand;
  const top = Math.max(media.y, ctx.platformSafe.y * 0.5);
  const bottom = band && band.y < media.y + media.h ? band.y - ctx.gutter : media.y + media.h;
  return {x: media.x, y: top, w: media.w, h: Math.max(0, bottom - top)};
}

const relativeTo = (r: Rect, origin: Rect): Rect => ({...r, x: r.x - origin.x, y: r.y - origin.y});

function showBody(ctx: LayoutContext, d: DiagramData): boolean {
  if (!d.body) return false;
  const {text} = splitLayout(ctx, {mediaSide: d.mediaSide}).regions;
  const needed =
    (d.kicker ? ctx.type.label * 1.2 + 22 * ctx.unit : 0) +
    estimateTextHeight(d.heading, ctx.type.h1, text.w, 1.06) +
    26 * ctx.unit +
    estimateTextHeight(d.body, ctx.type.body, Math.min(text.w, ctx.type.body * 34), 1.45);
  return needed <= text.h;
}

const DiagramView: React.FC<SceneProps<DiagramData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const cueAt = useCue(scene);
  const d = scene.data;
  const Diagram = DIAGRAMS[d.diagram];
  if (d.layout === 'full') {
    const {regions: st} = stackLayout(ctx, {heading: true});
    const area = {...st.body, w: ctx.safe.w};
    return (
      <AbsoluteFill style={{background: theme.background}}>
        <Region rect={st.heading} justify="end">
          {d.kicker ? <Kicker style={riseIn(frame, 0, 24 * ctx.unit)}>{d.kicker}</Kicker> : null}
          <Headline size="h1" style={riseIn(frame, 4, 24 * ctx.unit)}>
            {d.heading}
          </Headline>
        </Region>
        <Diagram rect={area} durationInFrames={durationInFrames} cue={(name, fallback) => cueAt(d.cues?.[name], fallback)} />
        {guides ? <SafeZoneGuides regions={{...st, body: {...area, role: 'media'}}} /> : null}
      </AbsoluteFill>
    );
  }
  const {direction, regions} = splitLayout(ctx, {mediaSide: d.mediaSide});
  if (!Diagram) throw new Error(`Unknown diagram "${d.diagram}" in scene "${scene.id}". Available: ${Object.keys(DIAGRAMS).join(', ')}`);
  const rise = 24 * ctx.unit;

  return (
    <AbsoluteFill style={{background: theme.background}}>
      {/* The panel clips; inside it the diagram is laid out clear of the caption band, but strokes may run to the panel edge. */}
      <div style={{position: 'absolute', left: regions.media.x, top: regions.media.y, width: regions.media.w, height: regions.media.h, background: theme.surface, overflow: 'hidden'}}>
        <Diagram rect={relativeTo(diagramDrawRect(ctx, regions.media), regions.media)} durationInFrames={durationInFrames} cue={(name, fallback) => cueAt(d.cues?.[name], fallback)} />
      </div>
      <Region rect={regions.text} justify={direction === 'row' ? 'center' : 'start'}>
        {d.kicker ? <Kicker style={riseIn(frame, 6, rise)}>{d.kicker}</Kicker> : null}
        <Headline size="h1" style={riseIn(frame, 10, rise)}>
          {d.heading}
        </Headline>
        {showBody(ctx, d) ? <Body style={riseIn(frame, 18, rise)}>{d.body}</Body> : null}
      </Region>
      {guides ? <SafeZoneGuides regions={regions} /> : null}
    </AbsoluteFill>
  );
};

export const DiagramScene: SceneDefinition<DiagramData> = {
  component: DiagramView,
  regions: (ctx, d) => {
    if (d.layout !== 'full') return splitLayout(ctx, {mediaSide: d.mediaSide}).regions;
    const {regions: st} = stackLayout(ctx, {heading: true});
    return {heading: st.heading, body: {...st.body, w: ctx.safe.w, role: 'media' as const}};
  },
  textBlocks: (ctx, d) => d.layout === 'full' ? [{region: 'heading', text: d.heading, fontSize: ctx.type.h1, lineHeight: 1.06}] : [
    {region: 'text', text: d.heading, fontSize: ctx.type.h1, lineHeight: 1.06},
    ...(showBody(ctx, d) ? [{region: 'text', text: d.body!, fontSize: ctx.type.body, lineHeight: 1.45}] : []),
  ],
  cues: (d) => Object.values(d.cues ?? {}),
};
