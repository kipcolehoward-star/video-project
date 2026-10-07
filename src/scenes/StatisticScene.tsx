import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {EASE_OUT, progress, riseIn} from '../animations/motion';
import {Region} from '../components/Region';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {Body, Kicker} from '../components/Typography';
import {statLayout, type LayoutContext, type Rect} from '../layouts/engine';
import {useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

export interface StatisticData {
  kicker?: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  label: string;
  bars?: {label: string; value: number; highlight?: boolean}[];
}

/** Column chart in wide frames, horizontal bars in narrow ones. */
const Chart: React.FC<{rect: Rect; direction: 'columns' | 'bars'; bars: NonNullable<StatisticData['bars']>; decimals?: number}> = ({
  rect,
  direction,
  bars,
  decimals,
}) => {
  const frame = useCurrentFrame();
  const {type, unit, gutter} = useLayout();
  const theme = useTheme();
  const max = Math.max(...bars.map((b) => b.value));
  const labelStyle: React.CSSProperties = {fontFamily: theme.fonts.body, fontSize: type.label, color: theme.textMuted, fontWeight: 500};
  const valueStyle: React.CSSProperties = {fontFamily: theme.fonts.body, fontSize: type.label, color: theme.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums'};
  const color = (b: (typeof bars)[number]) => (b.highlight ? theme.accent : theme.chartMuted);

  if (direction === 'columns') {
    const labelH = type.label * 2.4;
    const valueH = type.label * 1.8;
    const plotH = rect.h - labelH - valueH;
    return (
      <div style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, display: 'flex', flexDirection: 'column'}}>
        <div style={{flex: 1, display: 'flex', gap: gutter, alignItems: 'flex-end', borderBottom: `${Math.max(1, Math.round(unit * 2))}px solid ${theme.rule}`}}>
          {bars.map((b, i) => {
            const p = progress(frame, 14 + i * 5, 26);
            return (
              <div key={b.label} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                <div style={{...valueStyle, opacity: p, height: valueH, display: 'flex', alignItems: 'center'}}>{formatValue(b.value * p, decimals)}</div>
                <div style={{width: '100%', height: (plotH * b.value * p) / max, background: color(b)}} />
              </div>
            );
          })}
        </div>
        <div style={{height: labelH, display: 'flex', gap: gutter}}>
          {bars.map((b) => (
            <div key={b.label} style={{...labelStyle, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{b.label}</div>
          ))}
        </div>
      </div>
    );
  }

  const rowH = Math.min(rect.h / bars.length, type.label * 5.5);
  return (
    <div style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
      {bars.map((b, i) => {
        const p = progress(frame, 14 + i * 5, 26);
        return (
          <div key={b.label} style={{height: rowH, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 * unit}}>
            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <span style={labelStyle}>{b.label}</span>
              <span style={{...valueStyle, opacity: p}}>{formatValue(b.value * p, decimals)}</span>
            </div>
            <div style={{height: Math.round(18 * unit), width: `${(100 * b.value * p) / max}%`, background: color(b)}} />
          </div>
        );
      })}
    </div>
  );
};

const formatValue = (v: number, decimals = 0) =>
  v.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});

/** Largest stat size (up to the type scale) whose number + suffix fit the region width. */
function statFontSize(ctx: LayoutContext, d: StatisticData): number {
  const {regions} = statLayout(ctx);
  const main = `${d.prefix ?? ''}${formatValue(d.value, d.decimals)}`.length;
  const suffix = (d.suffix ?? '').length;
  const em = 0.6 * (main + 0.4 * suffix + 0.15);
  return Math.min(ctx.type.stat, Math.floor(regions.number.w / em));
}

const Statistic: React.FC<SceneProps<StatisticData>> = ({scene}) => {
  const frame = useCurrentFrame();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const {chartDirection, regions} = statLayout(ctx);
  const d = scene.data;
  const count = interpolate(frame, [6, 40], [0, d.value], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_OUT});
  const rise = 24 * ctx.unit;

  return (
    <AbsoluteFill style={{background: theme.background}}>
      <Region rect={regions.number} justify={chartDirection === 'columns' ? 'center' : 'end'}>
        {d.kicker ? <Kicker style={riseIn(frame, 0, rise)}>{d.kicker}</Kicker> : null}
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: statFontSize(ctx, d),
            fontWeight: 600,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            color: theme.text,
            fontVariantNumeric: 'tabular-nums',
            ...riseIn(frame, 4, rise),
          }}
        >
          {d.prefix}
          {formatValue(count, d.decimals)}
          {d.suffix ? <span style={{fontSize: '0.4em', letterSpacing: 0, marginLeft: '0.15em'}}>{d.suffix}</span> : null}
        </div>
        <Body style={riseIn(frame, 12, rise)}>{d.label}</Body>
      </Region>
      {d.bars?.length ? <Chart rect={regions.chart} direction={chartDirection} bars={d.bars} decimals={d.decimals} /> : null}
      {guides ? <SafeZoneGuides regions={regions} /> : null}
    </AbsoluteFill>
  );
};

export const StatisticScene: SceneDefinition<StatisticData> = {
  component: Statistic,
  regions: (ctx) => statLayout(ctx).regions,
  textBlocks: (ctx, d) => [
    {region: 'number', text: `${d.prefix ?? ''}${formatValue(d.value, d.decimals)}`, fontSize: statFontSize(ctx, d), lineHeight: 0.95},
    {region: 'number', text: d.label, fontSize: ctx.type.body, lineHeight: 1.45},
  ],
};
