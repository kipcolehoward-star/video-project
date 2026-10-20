/**
 * Node side of the glmap `terrain` option: which elevation tiles a project
 * needs, where the downloaded copies live, and the credit line they require.
 * The tile rule itself is shared with the scene (src/graphics/glmap/terrain.ts).
 */
import path from 'node:path';
import {terrainFor, type GlMapData} from '../../src/scenes/GlMapScene';
import {ROOT, resolveProjectFormat, type LoadedProject} from './project';

export const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
export const TERRAIN_DIR = path.join(ROOT, 'data', 'geo', 'terrain');

export const TERRAIN_CREDIT =
  'Elevation and sea depth: Terrain Tiles (Mapzen/Tilezen, AWS Open Data, https://registry.opendata.aws/terrain-tiles). ' +
  'SRTM and GMTED2010 data courtesy of the U.S. Geological Survey; ETOPO1 courtesy of NOAA National Centers for Environmental Information.';

const scenesWithTerrain = (p: LoadedProject) => p.storyboard.scenes.filter((s) => s.type === 'glmap' && (s.data as unknown as GlMapData).terrain);

export const usesTerrain = (p: LoadedProject) => scenesWithTerrain(p).length > 0;

/** Unique tiles for every glmap scene with terrain, sized for the project's own format. */
export function terrainTilesFor(p: LoadedProject) {
  const {width, height} = resolveProjectFormat(p.config);
  const seen = new Map<string, {z: number; x: number; y: number}>();
  for (const s of scenesWithTerrain(p)) {
    for (const t of terrainFor(s.data as unknown as GlMapData, width, height, s.duration, p.config.style).tiles) seen.set(`${t.z}/${t.x}/${t.y}`, t);
  }
  return [...seen.values()];
}
