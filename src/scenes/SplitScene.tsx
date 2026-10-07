import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {riseIn} from '../animations/motion';
import {LowerThird} from '../components/LowerThird';
import {MediaFrame} from '../components/MediaFrame';
import {Region} from '../components/Region';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {Body, Headline, Kicker} from '../components/Typography';
import {estimateTextHeight, lowerThirdLayout, splitLayout, type LayoutContext} from '../layouts/engine';
import {useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/** Media + narration text. Row in landscape, stacked in portrait/square. */
export interface SplitData {
  media: string;
  mediaSide?: 'start' | 'end';
  kicker?: string;
  heading: string;
  body?: string;
  lowerThird?: {name: string; role?: string};
}

/**
 * Content priority: body copy is optional. In compact frames (and when the
 * caption band takes space) it is dropped rather than squeezed or overflowed.
 */
function showBody(ctx: LayoutContext, d: SplitData): boolean {
  if (!d.body) return false;
  const {text} = splitLayout(ctx, {mediaSide: d.mediaSide}).regions;
  const needed =
    (d.kicker ? ctx.type.label * 1.2 + 22 * ctx.unit : 0) +
    estimateTextHeight(d.heading, ctx.type.h1, text.w, 1.06) +
    26 * ctx.unit +
    estimateTextHeight(d.body, ctx.type.body, Math.min(text.w, ctx.type.body * 34), 1.45);
  return needed <= text.h;
}

function regionsFor(ctx: LayoutContext, d: SplitData) {
  const {regions} = splitLayout(ctx, {mediaSide: d.mediaSide});
  return d.lowerThird ? {...regions, lowerThird: lowerThirdLayout(ctx, regions.media)} : regions;
}

const Split: React.FC<SceneProps<SplitData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const d = scene.data;
  const {direction} = splitLayout(ctx, {mediaSide: d.mediaSide});
  const regions = regionsFor(ctx, d);
  const rise = 24 * ctx.unit;

  return (
    <AbsoluteFill style={{background: theme.background}}>
      <MediaFrame rect={regions.media} asset={d.media} durationInFrames={durationInFrames} />
      {/* Portrait/square: text sits below the media, top-aligned so it reads straight on from the image. */}
      <Region rect={regions.text} justify={direction === 'row' ? 'center' : 'start'}>
        {d.kicker ? <Kicker style={riseIn(frame, 6, rise)}>{d.kicker}</Kicker> : null}
        <Headline size="h1" style={riseIn(frame, 10, rise)}>
          {d.heading}
        </Headline>
        {showBody(ctx, d) ? <Body style={riseIn(frame, 18, rise)}>{d.body}</Body> : null}
      </Region>
      {d.lowerThird && 'lowerThird' in regions ? (
        <LowerThird region={regions.lowerThird} name={d.lowerThird.name} role={d.lowerThird.role} delay={24} />
      ) : null}
      {guides ? <SafeZoneGuides regions={regions} /> : null}
    </AbsoluteFill>
  );
};

export const SplitScene: SceneDefinition<SplitData> = {
  component: Split,
  regions: regionsFor,
  textBlocks: (ctx, d) => [
    {region: 'text', text: d.heading, fontSize: ctx.type.h1, lineHeight: 1.06},
    ...(showBody(ctx, d) ? [{region: 'text', text: d.body!, fontSize: ctx.type.body, lineHeight: 1.45}] : []),
  ],
  assetRefs: (d) => [d.media],
};
