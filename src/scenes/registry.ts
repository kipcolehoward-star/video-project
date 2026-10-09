import {AtlasScene} from './AtlasScene';
import {ComparisonScene} from './ComparisonScene';
import {DiagramScene} from './DiagramScene';
import {GridScene} from './GridScene';
import {JourneyScene} from './JourneyScene';
import {ListScene} from './ListScene';
import {MapScene} from './MapScene';
import {PhotoScene} from './PhotoScene';
import {StepsScene} from './StepsScene';
import type {SceneDefinition} from './types';
import {SplitScene} from './SplitScene';
import {StatisticScene} from './StatisticScene';
import {TitleScene} from './TitleScene';

/**
 * Storyboard `type` -> scene implementation. Add new scenes here
 * (TimelineScene, MapScene, QuoteScene, ...) — nothing else needs to change.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCENES: Record<string, SceneDefinition<any>> = {
  title: TitleScene,
  split: SplitScene,
  statistic: StatisticScene,
  steps: StepsScene,
  comparison: ComparisonScene,
  diagram: DiagramScene,
  map: MapScene,
  photo: PhotoScene,
  list: ListScene,
  grid: GridScene,
  atlas: AtlasScene,
  journey: JourneyScene,
};
