import React from 'react';
import type {Rect} from '../layouts/engine';

/** Absolutely positions children in a rect produced by the layout engine. */
export const Region: React.FC<{
  rect: Rect;
  justify?: 'start' | 'center' | 'end';
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({rect, justify = 'start', style, children}) => (
  <div
    style={{
      position: 'absolute',
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: justify === 'start' ? 'flex-start' : justify === 'end' ? 'flex-end' : 'center',
      ...style,
    }}
  >
    {children}
  </div>
);
