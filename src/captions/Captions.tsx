import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CaptionStyle} from '../config/project';
import {captionLayout, captionMetrics, type LayoutContext} from '../layouts/engine';
import {useLayout, useTheme} from '../layouts/ProjectContext';
import {buildPages, type GlobalWord, type PagingOptions} from './words';

/** Paging per style, sized to the caption band of the current format. */
export function pagingFor(ctx: LayoutContext, style: CaptionStyle): PagingOptions {
  const region = captionLayout(ctx);
  const m = captionMetrics(ctx.type, style);
  const charsFit = region ? Math.floor(region.w / (m.fontSize * 0.54)) : 42;
  if (style === 'kinetic') {
    return {maxCharsPerLine: Math.min(charsFit, 22), maxLines: 2, maxWords: 3, pauseBreak: 0.35, minDuration: 0.3, hold: 0.4};
  }
  return {maxCharsPerLine: Math.min(charsFit, 42), maxLines: 2, pauseBreak: 0.6, minDuration: 1.0, hold: 0.8};
}

/** Burned-in captions, timed from transcript.json. Renders nothing without a transcript. */
export const Captions: React.FC<{words: GlobalWord[]; style: CaptionStyle}> = ({words, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ctx = useLayout();
  const theme = useTheme();
  const region = captionLayout(ctx);
  const pages = useMemo(() => buildPages(words, pagingFor(ctx, style)), [words, ctx, style]);
  if (!region || style === 'none' || !pages.length) return null;

  const t = frame / fps;
  const page = pages.find((p) => t >= p.start && t < p.end);
  if (!page) return null;

  const m = captionMetrics(ctx.type, style);
  const sinceStart = (t - page.start) * fps;
  const untilEnd = (page.end - t) * fps;
  const kinetic = style === 'kinetic';

  // Documentary: 3-frame fade. Kinetic: quick, small rise.
  const opacity = Math.min(interpolate(sinceStart, [0, 3], [0, 1], {extrapolateRight: 'clamp'}), interpolate(untilEnd, [0, 2], [0, 1], {extrapolateRight: 'clamp'}));
  const lift = kinetic ? interpolate(sinceStart, [0, 5], [10 * ctx.unit, 0], {extrapolateRight: 'clamp'}) : 0;

  const wordStyle = (w: GlobalWord): React.CSSProperties => {
    if (kinetic) {
      const active = t >= w.start && t < w.end + 0.05;
      const spoken = t >= w.start;
      return {color: active ? theme.accent : '#ffffff', opacity: spoken ? 1 : 0.6};
    }
    if (style === 'educational' && w.emphasis) return {color: theme.accent, fontWeight: 650};
    return {};
  };

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: region.x,
          top: region.y,
          width: region.w,
          height: region.h,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: kinetic ? 'center' : 'flex-end',
          opacity,
          transform: `translateY(${lift}px)`,
        }}
      >
        {page.lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily: theme.fonts.body,
              fontSize: m.fontSize,
              lineHeight: m.lineHeight,
              fontWeight: kinetic ? 750 : 500,
              letterSpacing: kinetic ? '-0.01em' : '0.005em',
              color: '#f4f1ea',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              ...(kinetic
                ? {textShadow: `0 ${2 * ctx.unit}px ${10 * ctx.unit}px rgba(0,0,0,0.65), 0 0 ${3 * ctx.unit}px rgba(0,0,0,0.8)`}
                : {background: 'rgba(12, 12, 14, 0.74)', padding: `${0.06 * m.fontSize}px ${0.35 * m.fontSize}px`}),
            }}
          >
            {line.map((w, k) => (
              <span key={k} style={wordStyle(w)}>
                {k > 0 ? ' ' : ''}
                {w.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
