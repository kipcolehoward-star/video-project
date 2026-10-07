import type React from 'react';
import type {SceneSpec} from '../config/project';
import type {LayoutContext, Region} from '../layouts/engine';

export interface SceneProps<T> {
  scene: SceneSpec<T>;
  durationInFrames: number;
}

/** Text that QC should check for overflow inside a region. */
export interface TextBlock {
  region: string;
  text: string;
  fontSize: number;
  lineHeight?: number;
}

export interface SceneDefinition<T> {
  component: React.FC<SceneProps<T>>;
  /** Pure: the regions this scene will occupy for a given format. */
  regions: (ctx: LayoutContext, data: T) => Record<string, Region>;
  /** Pure: text blocks per region, for overflow estimation in QC. */
  textBlocks?: (ctx: LayoutContext, data: T) => TextBlock[];
  /** Storyboard fields that reference assets ("asset:<id>"). */
  assetRefs?: (data: T) => string[];
  /** Narration cue words this scene animates on (checked against the narration). */
  cues?: (data: T) => string[];
}
