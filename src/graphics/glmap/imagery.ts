/**
 * Satellite imagery for the glmap `imagery` option.
 *
 * Source: EOxCloudless (Sentinel-2 cloudless) **2016** by EOX IT Services,
 * layer s2cloudless_3857, 256 px JPEG tiles in Web Mercator. Only the 2016
 * layer is CC BY 4.0; the 2018–2025 layers are non-commercial (checked
 * 2026-10-20 at https://cloudless.eox.at/license-non-commercial).
 */
import {planTiles} from './tiles';

export const IMAGERY_URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';
export const IMAGERY_CREDIT = 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)';
export const IMAGERY_LICENCE = 'CC BY 4.0';
/** Sentinel-2's 10 m pixels are reached around tile zoom 14; nothing in a Short needs more than this. */
export const IMAGERY_MAX_ZOOM = 12;

type Key = {lon: number; lat: number; zoom: number; pitch?: number};

/** Imagery tiles for the camera keys in a W×H frame; `extra` = how far drift can push the zoom past a key. */
export const imageryPlan = (camera: Key[], W: number, H: number, extra: number) =>
  planTiles(camera, W, H, extra, Math.max(0, Math.floor(Math.min(...camera.map((k) => k.zoom))) - 1), IMAGERY_MAX_ZOOM);
