# Map data sources

All layers: Natural Earth (https://www.naturalearthdata.com), public domain, 1:10m.
Built by `npm run geo:setup` with mapshaper (simplified for video). Worldview: Natural Earth default (de facto).
countries-10m.json: world-atlas (ISC) packaging of Natural Earth.

raster/bluemarble-5400.jpg: NASA Blue Marble Next Generation, topography + bathymetry, December 2004, 5400x2700
raster/bluemarble-3600.jpg: the same image downscaled to 3600x1800 (Lanczos) with FFmpeg, 2026-10-08; this is the copy rendered (10 px/degree matches the sharpest zoom the globe shows before cross-fading to vectors, at 55% less memory per render tab).
(NASA Earth Observatory, Reto Stöckli; image record 73909). NASA imagery is generally not copyrighted;
courtesy credit: "Blue Marble imagery: NASA Earth Observatory".
admin1.json also holds England, Scotland, Wales and Northern Ireland (type_en "Country of the UK"), dissolved from the UK subdivisions by Natural Earth geonunit (2026-10-26).
