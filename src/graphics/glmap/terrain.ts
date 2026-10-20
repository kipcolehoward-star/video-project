/**
 * Elevation tiles for the glmap `terrain` option (relief shading, height tints,
 * sea depth).
 *
 * Source: Terrain Tiles on AWS Open Data (Mapzen/Tilezen "terrarium" PNGs,
 * height in metres = R * 256 + G + B / 256 - 32768), built from SRTM and
 * GMTED2010 on land and ETOPO1 at sea. 256 px tiles; MapLibre asks for tile
 * zoom ≈ map zoom + 1, so zooms 5–8 cover map zooms up to about 7.5 and are
 * overzoomed beyond that.
 */
import {planTiles} from './tiles';

export const TERRAIN_ZOOMS = [5, 6, 7, 8] as const;
export const TERRAIN_MAX_ZOOM = 8;

type Key = {lon: number; lat: number; zoom: number; pitch?: number};

/** Elevation tiles for the camera keys in a W×H frame; `extra` = how far drift can push the zoom past a key. */
export const terrainPlan = (camera: Key[], W: number, H: number, extra: number) => planTiles(camera, W, H, extra, TERRAIN_ZOOMS[0], TERRAIN_MAX_ZOOM);
