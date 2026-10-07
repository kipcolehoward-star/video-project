import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {progress, riseIn} from '../animations/motion';
import {Backdrop} from '../components/Backdrop';
import {Region} from '../components/Region';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {Body, Headline, Kicker, Rule} from '../components/Typography';
import {titleLayout} from '../layouts/engine';
import {useCue, useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

export interface TitleData {
  kicker?: string;
  title: string;
  subtitle?: string;
  /** Narration word that reveals the title (kicker and rule appear at once). */
  cue?: string;
  /** Narration word that reveals the subtitle (defaults to just after the title). */
  subtitleCue?: string;
  /** Fade the whole scene to black over this many seconds at its end. */
  fadeOut?: number;
  /** Photo behind the title (asset id), dimmed for legibility. */
  background?: string;
  /** "hero" doubles the display size, for one-word punchlines. */
  size?: 'display' | 'hero';
}

const Title: React.FC<SceneProps<TitleData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const cueAt = useCue(scene);
  const {fps} = useVideoConfig();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const {align, regions} = titleLayout(ctx);
  const {kicker, title, subtitle, fadeOut, background} = scene.data;
  const rise = 28 * ctx.unit;
  const at = cueAt(scene.data.cue, 12);
  const subAt = cueAt(scene.data.subtitleCue, at + 10);
  const out = fadeOut ? interpolate(frame, [durationInFrames - fadeOut * fps, durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;

  return (
    <AbsoluteFill style={{background: fadeOut ? '#000' : theme.background}}>
      <AbsoluteFill style={{background: theme.background, opacity: out}}>
      {background ? <Backdrop asset={background} durationInFrames={durationInFrames} dim={0.6} /> : null}
      <Region rect={regions.text} justify={align}>
        <Rule progress={progress(frame, 4, 24)} width={120 * ctx.unit} />
        {kicker ? <Kicker style={riseIn(frame, 8, rise)}>{kicker}</Kicker> : null}
        <Headline size={scene.data.size ?? 'display'} style={riseIn(frame, at, rise, 24)}>
          {title}
        </Headline>
        {subtitle ? <Body style={riseIn(frame, subAt, rise, 24)}>{subtitle}</Body> : null}
      </Region>
      {guides ? <SafeZoneGuides regions={regions} /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const TitleScene: SceneDefinition<TitleData> = {
  component: Title,
  regions: (ctx) => titleLayout(ctx).regions,
  textBlocks: (ctx, d) => [
    {region: 'text', text: d.title, fontSize: d.size === 'hero' ? ctx.type.display * 2 : ctx.type.display, lineHeight: d.size === 'hero' ? 0.95 : 1.06},
    ...(d.subtitle ? [{region: 'text', text: d.subtitle, fontSize: ctx.type.body, lineHeight: 1.45}] : []),
  ],
  assetRefs: (d) => (d.background ? [d.background] : []),
  cues: (d) => [d.cue, d.subtitleCue].filter((c): c is string => Boolean(c)),
};
