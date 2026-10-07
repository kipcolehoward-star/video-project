import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {riseIn} from '../animations/motion';
import {Backdrop} from '../components/Backdrop';
import {Region} from '../components/Region';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {Headline, Kicker} from '../components/Typography';
import type {LayoutContext, Region as R} from '../layouts/engine';
import {useCue, useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/**
 * Full-bleed photograph with a slow push-in (focal-point aware) and an
 * optional lower-left title that appears on a narration cue.
 */
export interface PhotoData {
  media: string;
  kicker?: string;
  heading?: string;
  cue?: string;
  /** 0–1 darkening of the whole photo (default 0.25; text gets its own scrim). */
  dim?: number;
}

function regionsFor(ctx: LayoutContext): Record<string, R> {
  const {W, H, safe, format} = ctx;
  const land = format.orientation === 'landscape';
  return {
    media: {role: 'media', x: 0, y: 0, w: W, h: H},
    text: {role: 'overlay', x: safe.x, y: safe.y + safe.h * (land ? 0.45 : 0.5), w: safe.w * (land ? 0.62 : 1), h: safe.h * (land ? 0.55 : 0.5)},
  };
}

const Photo: React.FC<SceneProps<PhotoData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const cueAt = useCue(scene);
  const d = scene.data;
  const regions = regionsFor(ctx);
  const at = cueAt(d.cue, 10);
  const rise = 24 * ctx.unit;
  const hasText = Boolean(d.heading || d.kicker);

  return (
    <AbsoluteFill style={{background: theme.background}}>
      <Backdrop asset={d.media} durationInFrames={durationInFrames} dim={d.dim ?? 0.25} scrim={hasText ? 'bottom-left' : 'even'} />
      {hasText ? (
        <Region rect={regions.text} justify="end">
          {d.kicker ? <Kicker style={riseIn(frame, at, rise)}>{d.kicker}</Kicker> : null}
          {d.heading ? (
            <Headline size="h1" style={{...riseIn(frame, at + 4, rise), color: '#f4f1ea'}}>
              {d.heading}
            </Headline>
          ) : null}
        </Region>
      ) : null}
      {guides ? <SafeZoneGuides regions={regions} /> : null}
    </AbsoluteFill>
  );
};

export const PhotoScene: SceneDefinition<PhotoData> = {
  component: Photo,
  regions: (ctx) => regionsFor(ctx),
  textBlocks: (ctx, d) => (d.heading ? [{region: 'text', text: d.heading, fontSize: ctx.type.h1, lineHeight: 1.06}] : []),
  assetRefs: (d) => [d.media],
  cues: (d) => (d.cue ? [d.cue] : []),
};
