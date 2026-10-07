import React from 'react';
import {useLayout, useTheme} from '../layouts/ProjectContext';

type Props = {children: React.ReactNode; style?: React.CSSProperties};

/** Small uppercase label above a headline. */
export const Kicker: React.FC<Props> = ({children, style}) => {
  const {type, unit} = useLayout();
  const theme = useTheme();
  return (
    <div
      style={{
        fontFamily: theme.fonts.body,
        fontSize: type.label,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: theme.accent,
        marginBottom: 22 * unit,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** `hero`: twice display size, for one-word punchlines ("No.", "999", "9-1-1"). */
export const Headline: React.FC<Props & {size?: 'hero' | 'display' | 'h1' | 'h2'}> = ({children, size = 'h1', style}) => {
  const {type} = useLayout();
  const theme = useTheme();
  return (
    <div
      style={{
        fontFamily: theme.fonts.display,
        fontSize: size === 'hero' ? type.display * 2 : type[size],
        fontWeight: 600,
        lineHeight: size === 'hero' ? 0.95 : 1.06,
        letterSpacing: size === 'hero' ? '-0.03em' : '-0.015em',
        color: theme.text,
        textWrap: 'balance',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Body: React.FC<Props> = ({children, style}) => {
  const {type, unit} = useLayout();
  const theme = useTheme();
  return (
    <div
      style={{
        fontFamily: theme.fonts.body,
        fontSize: type.body,
        fontWeight: 400,
        lineHeight: 1.45,
        color: theme.textMuted,
        marginTop: 26 * unit,
        maxWidth: '34em',
        textWrap: 'pretty',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Thin accent rule. Grows in from the left. */
export const Rule: React.FC<{progress: number; width: number; style?: React.CSSProperties}> = ({progress, width, style}) => {
  const {unit} = useLayout();
  const theme = useTheme();
  return (
    <div
      style={{
        width: width * progress,
        height: Math.max(2, Math.round(3 * unit)),
        background: theme.accent,
        marginBottom: 28 * unit,
        ...style,
      }}
    />
  );
};
