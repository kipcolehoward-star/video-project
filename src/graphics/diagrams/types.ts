import type React from 'react';
import type {Rect} from '../../layouts/engine';

export interface DiagramProps {
  rect: Rect;
  /** Maps a diagram cue name to the frame it should fire (narration-timed, with fallback). */
  cue: (name: string, fallback: number) => number;
  durationInFrames: number;
}

export type Diagram = React.FC<DiagramProps> & {cueNames?: string[]};
