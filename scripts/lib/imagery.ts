/**
 * Node side of the glmap `imagery` option: which satellite tiles a project
 * needs, where the downloaded copies live, and the credit line they require.
 * The tile plan itself is shared with the scene (src/graphics/glmap/imagery.ts).
 */
import path from 'node:path';
import {IMAGERY_CREDIT, IMAGERY_LICENCE} from '../../src/graphics/glmap/imagery';
import {imageryFor, type GlMapData} from '../../src/scenes/GlMapScene';
import {ROOT, resolveProjectFormat, type LoadedProject} from './project';

export const IMAGERY_DIR = path.join(ROOT, 'data', 'geo', 'imagery', 's2cloudless-2016');
export const IMAGERY_CREDIT_LINE = `Satellite imagery: ${IMAGERY_CREDIT}, licensed ${IMAGERY_LICENCE} (https://creativecommons.org/licenses/by/4.0/).`;

const scenesWithImagery = (p: LoadedProject) => p.storyboard.scenes.filter((s) => s.type === 'glmap' && (s.data as unknown as GlMapData).imagery);

export const usesImagery = (p: LoadedProject) => scenesWithImagery(p).length > 0;

/** Local path of a downloaded tile. */
export const imageryTile = (t: {z: number; x: number; y: number}) => path.join(IMAGERY_DIR, `${t.z}`, `${t.x}`, `${t.y}.jpg`);

/** Unique tiles for every glmap scene with imagery, sized for the project's own format. */
export function imageryTilesFor(p: LoadedProject) {
  const {width, height} = resolveProjectFormat(p.config);
  const seen = new Map<string, {z: number; x: number; y: number}>();
  for (const s of scenesWithImagery(p)) {
    for (const t of imageryFor(s.data as unknown as GlMapData, width, height, s.duration, p.config.style).tiles) seen.set(`${t.z}/${t.x}/${t.y}`, t);
  }
  return [...seen.values()];
}
