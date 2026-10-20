# Video Production Framework — Claude Code guide

Local, code-driven, **multi-format** video production. Remotion (React/TS)
composes; FFmpeg processes and inspects media; everything runs on this
machine with free/open-source tools. No paid APIs or services unless the user
explicitly approves them.

## Non-negotiables

1. **No format is the default except what project.json says.** Never hard-code
   width, height, aspect ratio or fps anywhere outside `src/config/formats.ts`.
   Scenes get rectangles from the layout engine, never raw coordinates.
2. **Responsive = re-layout, not scaling.** A 9:16 version rearranges
   (row → column, chart direction, anchoring, type scale); it is never a
   stretched or letterboxed 16:9.
3. **Captions come from real timing** (word-level transcription). Never guess.
4. **Never fabricate** facts, asset sources or licenses. Unknown → write
   `"unknown"`; validation will flag it.
5. **Editorial restraint** (documentary style, the default). No gradients-for-decoration, glow, emoji, bouncy or
   random motion, gratuitous transitions or fake UI. Every element must serve
   the narration. Default to cuts; fades only where they mean something.
   Projects with `style: "kinetic"` (Shorts) follow the kinetic rules instead — see "Kinetic style".
6. Inspect before changing; smallest appropriate change; test; report how to preview.

## Machine constraints (inspected 2026-10-06)

- Windows 10, Intel i5-5200U (2 cores / 4 threads), **3.9 GB RAM**, Intel HD 5500 (no CUDA).
- Node 24.12, npm 11.6, FFmpeg 9.0.1 (gyan full build: QSV, loudnorm,
  sidechaincompress, ebur128, blackdetect), Python 3.14, Chrome installed.
- **Close the user's Chrome/other heavy apps before rendering.** With Chrome open (≈2 GB),
  free RAM drops below 500 MB: renders fall from ~7 fps to ~1 fps and Chrome startup
  times out. Check free RAM first (PowerShell Win32_OperatingSystem.FreePhysicalMemory).
- **Long renders are chunked automatically** (`scripts/lib/chunked.ts`): anything over 2 min
  renders in ~60 s parts (exact frame ranges, a fresh browser per part, muted), into
  `<output>.parts/`. Finished parts are recorded in `parts.json`, so **re-running the same
  command resumes** after a crash, a page crash or Claude Code killing a background job under
  memory pressure. A watchdog cancels and retries a part with no progress for 4 min (up to 3 tries).
  Parts are joined with stream copy (no re-encode) and the master `audio/mix.wav` is muxed in;
  the frame count is verified, then QC runs. Flags: `--chunk <s>` (also forces chunking),
  `--no-chunks`, `--keep-parts`. (History: single 6-min renders froze; manual chunking worked.)
- Consequences: render concurrency 2; review edits with `render:preview --scenes …`
  (partial, 50% scale) and only render the full video at the end; an 8-minute
  photo/map-heavy video takes ~50 min at full quality; full 1080p renders run ~1–3 fps. Avoid GPU-only/PyTorch tools.
  Keep media proxies small; don't open many Chrome tabs while rendering.

## Render server (optional, Ubuntu VPS)

A 4 vCPU / 8 GB Ubuntu server (no GPU) can take full renders off this laptop. Scripts in `scripts/server/`:
- `setup-ubuntu.sh`: run once on the server with `sudo bash setup-ubuntu.sh`. Installs FFmpeg, Node 24
  (NodeSource), Chrome Headless Shell libraries, Noto fonts, a 4 GB swap file (swappiness 10), and edge-tts 7.2.8
  in `~/.venvs/video`. Adds a block at the top of `~/.bashrc` that puts the venv first on PATH (scripts call
  `python`) and sets `RENDER_CONCURRENCY=3`, which `RENDER_DEFAULTS` reads. Laptop default: 2.
  `--app` (no sudo) runs only `npm ci` (skipped when the lock is unchanged), `remotion browser ensure`, and checks.
- `push-to-server.ps1 -Server user@ip -Project <id> [-WithEnv] [-DryRun]` (Windows): tars the working tree
  without node_modules, tools, .git, previews, project geo copies or MP4s, then scp's it and runs `setup-ubuntu.sh --app`.
  The repo is private, so the server gets code by upload, not git clone. `.env` is copied only with
  `-WithEnv` (chmod 600). Rendering doesn't need it. Local deletions are not mirrored.
- `pull-from-server.ps1 -Server user@ip -Project <id>`: copies the server's `output/` into `output/from-server/` (never overwrites local renders).
  Measured 2026-10-10: Ep. 01 (1998 frames, 9:16) rendered in 5m53s at 5.9 fps, about 3x the laptop. The server's FFmpeg 8.0.1 gave
  true peak -0.8 dBTP where the laptop's FFmpeg 9 gave -1.0. If a brief requires <= -1 strictly, set `truePeak` to -1.5.
- Render there over SSH: `cd ~/video-project && npm run render -- --project <id>`. Studio:
  `ssh -L 3000:localhost:3000 user@ip`, then `npm run dev` on the server and open localhost:3000 locally.
- Epidemic/image downloads still happen in the Windows session. Push the project after adding assets.
- `transcribe.py` (server only): speech-to-text for checking a finished video or studying a reference video, since Claude
  cannot hear audio. faster-whisper 1.2.1 (MIT) in its own venv `~/.venvs/whisper`, model `turbo` (1.6 GB, cached in
  `~/.cache/huggingface`), CPU int8. Upload audio only (`ffmpeg -i in.mp4 -vn -ac 1 -ar 16000 -c:a libopus -b:a 32k out.opus`,
  about 2.5 MB per 10 min), then `~/.venvs/whisper/bin/python scripts/server/transcribe.py <file> --lang en` writes
  `<file>.transcript.txt` (timestamps + confidence per line) and `.srt`. Measured 2026-10-11: 10m48s of noisy body-camera
  speech in 4m12s including the model download. Limits: no speaker labels, mishears overlapping or shouted speech, and
  cannot judge pronunciation or tone. Captions still use the laptop's whisper.cpp path (`npm run transcribe`).
- Disk: 643 GB since 2026-10-11 (was 40 GB and filled up; partition grown with `growpart /dev/vda 2` + `resize2fs`).

## Layout of the repo

```
src/
  config/       formats.ts (presets + resolver), safeZones.ts, themes.ts,
                fonts.ts (bundled @fontsource, OFL), project.ts (types + timeline)
  layouts/      engine.ts  — PURE layout functions: format -> named Regions
                ProjectContext.tsx — useLayout/useTheme/useAsset hooks
  components/   Region, Typography, MediaFrame (focal-point crop), LowerThird, SafeZoneGuides
  animations/   motion.ts — small vocabulary: progress, riseIn, fadeOut, pushIn
  scenes/       one file per scene type + registry.ts
  compositions/ Main.tsx — storyboard -> Sequences (cuts / fades)
  Root.tsx      calculateMetadata derives size/fps/duration from props
scripts/        Node CLI (tsx). lib/: project loading, checks, qc, remotion API
templates/project/  scaffold used by `npm run create`
projects/<id>/  one folder per video (this folder is Remotion's public dir at render)
  project.json  format, fps, theme, safe-zone profile, caption style
  brief.md, research.md, script.md, storyboard.json, assets.json, transcript.json
  assets/ audio/ broll/ graphics/ previews/ output/
```

## How data flows

`scripts/lib/project.ts` loads `projects/<id>/*.json`, resolves the format
(**priority: `--format` > `VIDEO_FORMAT` env > project.json**) and builds
`MainProps`. Those props go to Remotion; `Root.calculateMetadata` turns them
into width/height/fps/duration. The same props feed `validate` and `qc`.

## Scenes

A scene module exports a `SceneDefinition`:

- `component` — React; reads regions from the layout engine.
- `regions(ctx, data)` — pure; the exact rects it draws into (with roles
  `text | overlay | media | decor`). QC and `--guides` use this, so it must
  match what the component renders.
- `textBlocks(ctx, data)` — text per region, for overflow estimation.
- `assetRefs(data)` — `asset:<id>` references, for missing-asset checks.

- `cues(data)` — narration cue words the scene animates on; `validate`
  errors if a cue word is not in the scene's narration.

Register in `src/scenes/registry.ts`; reference by `type` in storyboard.json.
Current: `title`, `split`, `statistic` (auto-fits the number, thousands
separators, optional bar/column chart), `steps` (numbered process),
`comparison` (values with count-up, `lead` operator, highlight), `diagram`
(animated diagram in the media slot; library in `src/graphics/diagrams/`:
`trilateration`, `call-routing`, `channel-depth` — strait cross-section, 25 m depth vs 20.5 m Malaccamax draught), `map` (world/usa from public-domain data; shapes
highlight and pins drop on cues; tiny places are pins, not shapes), `photo`
(full-bleed photo, focal-point push-in, lower-left title on a cue), `list`
(display / numbered recap / pairs, fitted to space, optional photo backdrop),
`grid` (reference cards, e.g. country emergency numbers), `glmap` (MapLibre flat map with tilt; see "GL map scene"). `title` also takes
`cue`, `subtitleCue`, `size: "hero"` (one-word punchlines), `background`,
`fadeOut`. `comparison` items take `display` strings ("9/11", "1968", names).
Planned: timeline, quote, photo-montage, broll (video), screen-recording.

**Narration cues:** animations should land on the word that motivates them.
`useCue(scene)(word, fallbackFrame)` returns the frame where the narrator
says `word` (`"second#2"` = second occurrence), from transcript.json; before
voiceover exists it falls back to evenly spaced timing. Steps/comparison
items take `cue`; diagrams take a `cues` map (e.g. `{"ring2": "second"}`).

**Content priority:** in compact frames scenes drop optional copy (split/diagram
`body`, step `text`, comparison `note`) rather than shrinking type. The fit
test is shared with QC so render and validation agree. `itemsLayout` picks
structure by frame shape: row (landscape; square ≤3 items), 2×2 grid
(square, 4 items), column (portrait).

To add layout behaviour, add a pure function to `layouts/engine.ts` that
branches on `ctx.format.orientation` and returns Regions. Keep text regions
inside `ctx.safe`; let media bleed.

## Narration, captions and audio

Storyboard scene fields: `narration` (voiceover text; `*word*` marks keywords
for educational captions; `{shown|spoken}` is a pronunciation override, e.g.
`{999|nine-nine-nine}` — captions show "999", the voice says "nine nine nine";
hyphens, no spaces, in the spoken part), `narrationOffset`, `narrationTail`, and
`sfx: [{asset, at, gainDb}]` (`at` = seconds from scene start).
project.json: `captionStyle` (`auto` = documentary in landscape, kinetic in
portrait/square; or `documentary | kinetic | educational | none`) and `audio`
(`voice`, `speaker`, `lengthScale`, `music` asset id, `musicDb`, `duckDb`,
`targetLufs` default -16, `truePeak` default -1.5).

- **Timeline:** with narration, `duration` is a *minimum*; scenes extend to
  offset + voiceover + tail (`resolveDurations`). Remotion, the mixer, captions
  and QC all use this resolved storyboard.
- **Caption paging** breaks at clause boundaries (carries an unfinished clause
  to the next cue), never splits number phrases ("about three hundred |
  metres"), max 42 chars × 2 lines for documentary / SRT.
- **Caption text comes from the script; timing from whisper.** Alignment
  (`alignScript`) times runs of inexact words together, so "nineteen twenty"
  vs recognised "1920" still gets correct timing.
- Do NOT pass the script to whisper as `--prompt`: in testing it made whisper
  compress or skip speech. Clips are padded with 1 s of silence before
  transcription (whisper squashes timestamps at the end of a file), and
  special tokens like `<|endoftext|>` are filtered out.
- **Caption band:** when captions are on, the layout engine reserves a band at
  the bottom of the platform safe zone and shrinks `ctx.safe` so scenes can
  never collide with captions. Scenes drop optional copy (SplitScene `body`)
  when it no longer fits — content priority, not shrinking text.
- **Ducking** is a deterministic volume envelope from known narration spans
  (ramp down 0.25 s before speech, up 0.6 s after; gaps < 1.2 s stay ducked),
  not a signal-driven compressor. Narration gets only a high-pass and a light
  2.5:1 compressor; final loudness via two-pass `loudnorm`.
- Freshness is hash-based: voiceover (text+voice), transcript (audio),
  mix (timeline+inputs+levels). `validate` errors on anything stale; `render`
  rebuilds a stale mix automatically.

## Music & SFX (Epidemic Sound, user's Pro plan)

Connected via Epidemic's official MCP connector (user scope, key in the Windows
env var `EPIDEMIC_SOUND_API_KEY`, never in files). Tools: `SearchSoundEffects`,
`SearchRecordings` (bpm/mood/genre filters, stems), `DownloadSoundEffect`,
`DownloadRecording` (WAV, FULL or BASS/DRUMS/INSTRUMENTS stems), `EditRecording`
(fit a track to a length), voiceover tools.
Workflow: search → audition `lqmp3Url` previews if needed → `Download*` (WAV) →
`npm run audio:add -- --project <id> --as <assetId> --type sfx|music --url "<signed url>"
--title "<title>" --source "epidemic-sound:<uuid>"` → reference the asset in
storyboard `sfx` or `audio.music`. Signed URLs expire; download immediately.
Licence: covered by the user's subscription for content published while it is
active; the user must whitelist their YouTube channel in Epidemic to avoid
Content ID claims. Do NOT use the developer-portal API free tier (no commercial
licence). Prefer Epidemic over synthesised placeholders for music and SFX.

## Geography toolkit (atlas scene)

Data: `npm run geo:setup` builds Natural Earth 1:10m layers (public domain) into
`data/geo/` (committed): admin1 (states/provinces), rivers, lakes, disputed
(region names in `name`, claimant in `claimant`), countries-10m. Render/stills/dev
copy only what a project uses into `<project>/geo/` (gitignored), plus flag SVGs.
Avoid GADM (non-commercial licence); OSM data needs "© OpenStreetMap contributors".

Atlas options (all timing via cue word or seconds):
- `cameraPath`: eased (default; every leg eases in and out, so the camera stops at each key) | smooth (one continuous
  path through the keys, `smoothPath` in motion.ts: keeps moving through a key when the move carries on in the same
  direction, never overshoots a key, rests only at a turnaround, between two equal keys (a deliberate hold) and at the
  first and last key; longitude takes the shortest way round, so add a middle key for a turn of more than 180°).
  Keys and their times are unchanged. `cameraDrift`: slow push-in during the hold after the last key, zoom change per
  second (0.01 = 1%, limit ±0.05; default 0 = still). With drift the scene ends slightly past its last key, so don't
  use it on a scene the next one continues from. Pilot: `the-strait-of-malacca` s3-geography (2026-10-11).
- `validate` now errors on unknown atlas fields (misspellings were silently ignored) via the optional
  `problems(data)` hook on a SceneDefinition; other scene types have no such check yet.
- `detail`: auto (110m whole-Earth, 50m mid, 10m when any camera zoom ≥ 7) | 50m | 10m
- `layers`: ["rivers","lakes","admin1","disputed"], `layersAt`, `admin1Countries: ["South Africa"]`
- `flagMasks: [{name, iso, at, opacity}]` — flag clipped inside the country, fitted
  to the part on screen (whole flag visible even when zoomed into a big country)
- `flagBadges: [{iso, lon, lat | name, at, label, size}]` — round badge with pop-in.
  Use explicit lon/lat for countries with overseas territories (France's centroid
  is in the Atlantic because of French Guiana).
- `outline`/`labels`/`pulse` names resolve to a country, then a disputed area,
  then a state/province.
- Flags: flag-icons (MIT), ISO 3166-1 alpha-2 lowercase ("ls", "za", "in").
  `validate` errors on unknown codes or missing layers.
- `routes: [{from:[lon,lat], to, via:[[lon,lat]...], at, duration, style: solid|dashed,
  color: gold|white|red, arrow, fromFlag, toFlag, label}]` — great-circle lines that
  draw themselves with an arrowhead. Use `via` waypoints to keep sea lanes at sea
  (e.g. Malacca, Bab-el-Mandeb, Suez, offshore Iberia) and check the still.
- `paleo: {model: 'muller2019'|'merdith2021', ma: [{at, ma}], counter: {y, at, until}, boundaries, boundariesAt}`:
  deep time. Draws the continents as they were `ma` million years ago (keyframes animate the drift,
  linear in time) by rotating today's coastlines with the plate model's own rotations (slerp between
  steps; same method as GPlates, verified 0.000° against the service). Data: `npm run paleo:setup`
  (Müller 2019, 0–250 Ma, 1 Myr) and `-- --model MERDITH2021 --max 1000 --step 10` (Rodinia), saved in
  data/geo/paleo/ (CC BY 4.0, credit Müller et al. 2019 / Merdith et al. 2021 / EarthByte coastlines).
  Labels can ride a plate: `{text, lon, lat, pid}` with today's position (find pids with
  gws.gplates.org/reconstruct/assign_points_plate_ids). `boundaries` draws today's ridges (gold) and
  subduction zones (red). `blank: true` = no land (early molten Earth). Labels support `until`.
  Deep-time maps use today's coastline shapes (as GPlates does); say so in research notes.
- `portraitZoom`: zoom multiplier applied only in portrait frames (a 9:16 frame keeps the
  landscape framing's width, so maps look far away; 1.5–1.8 fills it). `npm run short` sets 1.6.
- `palette`: atlas (dark/amber) | geo (slate, red #FF3B30 focus, yellow #FFCC00 `alt`,
  grey #8E8E93 disputed) | paper (parchment, dark ink) | dusk (navy sea, lifted grey-green
  land, clear white borders — dramatic beats) | ocean (blue sea, cream land, dark borders,
  white overlay text on dark panels — explainer beats). The user found atlas/geo too dark with
  faint borders (2026-10-07): default to mixing ocean (explainers) + dusk (drama) + paper (history). Defaults from project theme
  (`geo`/`paper` themes exist). `alt: [{name, at}]` = second highlight colour.
- `basemap: "satellite"` — NASA Blue Marble (public domain, data/geo/raster) on the
  globe, cross-fading to the vector map between zoom 1.3 and 3.2. Heaviest effect:
  ~3.5 fps vs ~5 fps without it (3600x1800 texture, unchanged-camera frames reuse the canvas,
  lower resolution while fading). Use for globe-scale hooks/closes, not long scenes. A WebGL
  version was considered (2026-10-08) and judged not worth the risk on this machine.
- project.json `texture`: none | grain | paper — procedural grain overlay (5–12%).
Engine notes: only features in view are drawn (culling); polygons with reversed
winding (would flood the globe) are corrected per part on load (`fixWinding`) —
Natural Earth 10m Maldives and two simplified lakes needed this.
Test project: `projects/demo-geo-toolkit` (6 scenes: provinces/rivers/flags, Kashmir
disputed + masks, capital badges, shipping route, satellite dive, paper palette).
Script input: the user may write cue-sheet scripts (VOICEOVER / VISUAL_TYPE /
MAP_TARGET / OVERLAY / SFX_TRIGGER); convert them to storyboard JSON by hand, mapping
timestamps to narration cue words.

## GL map scene (MapLibre, V1.1, added 2026-10-19)

`type: "glmap"` (src/scenes/GlMapScene.tsx, src/graphics/glmap/): a flat web map drawn on the GPU by MapLibre GL JS
5.24.0 (BSD-3, pinned; no token, no account, no network at render) with a camera that can tilt and rotate. Use it for
regional close-ups (straits, coasts, shipping lanes); atlas stays the globe scene.
- Base map: one GeoJSON source built from Natural Earth 1:10m land (`countries-10m`, copied by geodata.ts), filtered to
  the area the scene shows. Layers: sea, a blurred shallow-water band along coasts, land, coastline. Palettes: `teal`
  (default), `dusk`. Natural Earth 1:10m gets visibly angular above about zoom 7.5.
- `camera: [{at, lon, lat, zoom, pitch, bearing}]`: one continuous path (smoothPath) through the keys; longitude and
  bearing take the shortest way round. `zoom` is MapLibre's (+1 = twice as close; ~6.5 = the whole Strait of Malacca in
  16:9). `pitch` 0–60.
- `routes: [{via, at, duration, color: gold|white|red, style: solid|dashed}]`, `vessels: [{route, count, seconds,
  reverse, offset, at}]` (markers sailing along a route, only on its drawn part), `labels: [{text, lon, lat, kind:
  land|water|place, at, until, toward}]`, `vignette` (0–1, default 0). Routes, vessels and labels are SVG drawn at
  `map.project()` positions, so they use the project fonts (MapLibre's own text would need glyph files).
- `terrain: {relief, tint, depth}` (all optional; relief 0–1, default 0.6; tint/depth default true): real elevation, flat
  shaded (no 3D). Hillshade lit from the north-west, land coloured by height, sea coloured by depth (replaces the drawn
  shallow-water band). Data: Terrain Tiles (AWS Open Data, terrarium PNGs, built from SRTM + GMTED2010 on land and
  ETOPO1 at sea), downloaded once with `npm run terrain:setup -- --project <id> [--dry-run]` into `data/geo/terrain/` (gitignored),
  only the tiles the camera path can need in the project's format (`planTiles`, src/graphics/glmap/tiles.ts; zooms 5–8);
  renders copy those tiles into the project, so rendering stays offline. `validate` errors when tiles are missing; `npm run
  credits` adds the required USGS/NOAA credit line. The depth colours are drawn over the relief at 85% so the coarse
  seabed data's shading (speckle, seams between tile zoom levels in a tilted view) stays hidden; land keeps full relief.
  Coastlines remain Natural Earth; elevation and coastline can disagree by up to about 1 km at the shore.
- Ship markers: hull 1.2×, wake follows the route behind each ship (a straight wake cut across coasts at bends).
  Symbols are far larger than real ships, so in narrow straits keep `offset` small (3 px in glmap-test) and check the
  route and ships against the coastline before rendering.
- `validate` errors on unknown or out-of-range glmap fields (`problems`).
- Rendering: each frame sets the camera with `jumpTo` and is held (delayRender) until MapLibre reports `idle`.
  MapLibre is imported dynamically inside the browser, so Node tools (validate, qc) and other projects never load it.
  WebGL: `bundleProject` switches Chrome's `gl` option on only when the storyboard has a glmap scene (Windows `angle`,
  Linux `swangle` = software, as the server has no GPU; `RENDER_GL` overrides). All other projects render unchanged.
- Mapbox GL JS was rejected: its Product Terms (§1.7, July 2026) forbid map content in internet video without purchased
  video rights, and §1.9 forbids automated queries.
- Test project: `projects/glmap-test` (12 s Strait of Malacca, silent).

## Kinetic style (Shorts, added 2026-10-20)

User decision (2026-10-20): Shorts in this style until they are good, then long-form. The problem it solves, in the
user's words: videos were "static and lifeless", the voice talks while the picture sits still "like describing an
image". project.json `style: "kinetic"`; documentary projects are unaffected.
- **Rules:** a visible event every 1–2 s, each on the narration word that motivates it; nothing frozen > 1.5 s (the
  camera always drifts); entrances spring in with a small overshoot (`src/animations/kinetic.ts`: pop, slam,
  glowPulse, breathe, snap easing), highlights glow; a sound on every animation; no music; Edge voice; 30 fps; 9:16.
  Accuracy rules still apply (facts, licences, readable text in the safe zone, captions from real timings).
- **Checks:** `validate` errors when moments (scene cuts + each scene's `moments` hook, cue words timed from the
  transcript) are more than 2 s apart; `render`/`qc` error on a frozen picture > 1.5 s (`fps=4,freezedetect`).
- **Sounds:** scenes declare the sounds their animations imply (`SceneDefinition.sounds`: kind + cue); the loader adds
  them as ordinary scene sfx through project.json `sfxKit` (`{"pop": "es-pop", "slam": {"asset": "es-impact",
  "gainDb": -6}}`); `validate` errors on a kind missing from the kit. A beat's `sfx: false` silences it.
- **glmap beats** (`data.beats`, each `{on, off?, sfx?}`): `highlight` (country or province by Natural Earth name;
  fill + white outline + glow pulse, drawn by MapLibre so it follows the tilt; parts inside a disputed area, e.g.
  Crimea, are left out; `flag: "ru"` fills it with the country's flag instead, fitted to the part on screen, smaller
  shapes drawn on top; user preference 2026-10-20: countries named in narration show their flag), `pulse` (re-fire an earlier highlight's glow), `label` (text slammed on at lon/lat, `size`
  hero|big|small), `link` (dashed line drawing itself, optional red ✕ with its own click). Colours: red, gold,
  orange, blue, white. Camera keys with `move` (seconds) start on their word (`at`) and ease `snap` (default, whoosh)
  or `glide` (swish). `drift` = push-in in zoom levels per second (default 0.02 in kinetic projects).
- Rings crossing the 180° meridian (Russia, Fiji) are unwrapped before MapLibre gets them; otherwise they draw a band
  across the world.
- **Previews:** approvals are on moving previews, not stills (user: "even if previews are 144p"):
  `npm run render:preview -- --project <id> --scale 0.25` (270×480, about 3 fps for a glmap scene on the laptop).
- **glmap `imagery`** (`true` or a grade `{saturation, contrast, brightness}`, -1..1, defaults 0.2/0.12/0.04): satellite
  picture instead of the drawn sea and land. Source: EOxCloudless **2016** (Sentinel-2 cloudless, EOX layer
  `s2cloudless_3857`), **CC BY 4.0** — only 2016 is; 2018–2025 are CC BY-NC-SA (checked 2026-10-20 on
  cloudless.eox.at/license-non-commercial and in the WMTS layer abstract). `npm run imagery:setup -- --project <id>
  [--dry-run]` downloads only the planned tiles (4 at a time; EOX publishes no bulk rules) into `data/geo/imagery/`
  (gitignored, with SOURCES.md); `validate` errors when tiles are missing; `npm run credits` adds the EOX line.
  EOX's imagery has real water only in a strip along coasts and flat blue beyond it (a visible band), so pair imagery
  with `terrain: {depth: true, tint: false}`: the sea is then drawn from depth data (bright bathymetric blues, opaque,
  stopping at -3 m so land below sea level such as the Vistula delta keeps its imagery). Caspian-type depressions
  deeper than -3 m on land would still turn blue; check such places.
- **Tile plans must be complete.** `planTiles` samples the camera path between keys (8 points per move) and plans
  the finest level where the frame is and all coarser levels over everything a tilted camera sees. A missing tile
  (404) is drawn from its parent in a still, but froze a video render on one frame (delayRender timeout, 2026-10-20).
  The first terrain planner (16:9-only, finest zoom everywhere) asked for 6,198 tiles for one portrait scene; the
  path plan needs ~580 per tile set.
- If a preview MP4 is open in a player, Remotion cannot replace it (EPERM on rename); the finished file is left as
  `<name>.mp4.<id>.remotion-in-progress`. Never close the user's player; rename that file instead.
- **Picture layer** (`src/graphics/kinetic/pictures.tsx`, glmap beats; user rule 2026-10-20: icons drawn in code,
  pictures public domain / openly licensed via `npm run image`, licence checked per item, no AI or paid art):
  `card` (asset on a paper card that swings in; `caption` in the bundled serif, `crop`, `tilt`; sound "paper"),
  `icon` (drawn icon from `ICONS`, e.g. `teutonic-shield`, drops in and lands; sound "thud" at the landing),
  `year` (counts up to `value`, then punches in; sound "tick"), `tint` (`warm` old-map grade that also hides modern
  borders, `cold`, `none`; silent, it rides on a camera move), label `was` (shown from the scene start, flips to
  `text` on its word; sound "flip"). `place` = top | center | bottom of the safe area; `top` is the big one (60%),
  because the map's subject sits at the frame centre. Show pictures one after another in `top` rather than stacking.
- Over imagery the depth-drawn sea fades out between map zoom 7.5 and 9 (the seabed data drew blobs over lagoons
  in a city view); close up, the imagery's own water is real. EOX serves open-sea tiles as tiny PNGs (kept as .jpg).
- `planTiles`' finest level reaches 2.5·sin(pitch) half-frames up a tilted frame: MapLibre asked for zoom 11 tiles
  1.8 half-frames north of the centre at pitch 40, and the missing tile stopped the render (2026-10-20).
- Edge voice: `edge_tts_cli.py` must read stdin as UTF-8. Until 2026-10-20 it used the Windows code page, so
  "Königsberg", "Tomé" and em dashes reached the voice garbled (heard as junk syllables; affected the Malacca
  quote, the 911 video and the Lesotho Short).
- More glmap beats (step 4): `arrow` (thick bowed arrow drawing itself; army moves; whoosh), `stamp` (rubber-stamp word;
  sound "stamp"), `march` (small walking figures from/to; footsteps), `measure` (ruler line + `text` such as "65 km";
  swish). Highlights take `flag: "asset:<id>"` for flags that are not countries today (Soviet flag, PD-RU-exempt, from
  Commons), `flagFit: "stretch"` (keeps a corner emblem in view), `exit: "fall"` + `offSfx` (flag drops away with a
  crack). Any beat `on: 0` is already showing at the scene start (continuity across cuts; silent). Plain colour fills
  stay for things that are not one country (EU/NATO areas use the EU flag on members or a label; NATO's emblem is a
  protected mark, so it is never drawn).
- **Master audio:** every render now muxes `audio/mix.wav` with FFmpeg (`MASTER_AUDIO` in chunked.ts: 4x-oversampled
  limiter at -3 dBFS, AAC 320k), short renders included. AAC overshoots sharp SFX: a -1.4 dBTP mix came out at +0.2
  dBTP, and Remotion's own audio pass at -0.5. Lowering the mix target instead cost a full LU of loudness.
- Pilot: `projects/kaliningrad` (6 scenes, 57.4 s; final rendered on the laptop in 25 min at concurrency 1): hook, Königsberg, 1945, renamed, 1991, today/Suwałki Gap. Render previews with `--concurrency 1` when memory is short.

## Journey scene (globe travel series, e.g. "The World Gave Us This")

`type: "journey"` (src/scenes/JourneyScene.tsx, cards in src/graphics/journey/). A NASA Blue Marble globe
in a starfield (limb shading, atmosphere, speed-scaled motion blur) and a camera that travels between countries:
`camera` keys `{at, lon, lat, zoom, fy, ease: inOut|in|out|linear}` or `{at, fit: true}` (frames `country`
inside the map box for the current format; 10m borders load automatically when zoom ≥ 6). Split a country into
a short "to-X" scene (rotate, `highlightAt` glowing border + locator ring, end key `ease: "in"`) and an "X" scene
(first key = previous end, `fit` with `ease: "out"`, so the dive is one continuous accelerate/decelerate).
- `mapAt`/`mapOutAt`: satellite → dark silhouette map (exact Natural Earth border) and back; `fill.assets`
  are clipped inside the country, cross-fading `every` seconds.
- `cards: [{slot: left|center|right, kind, asset, asset2, label "TEXT · 1886", focus: cue, alt: cue}]`,
  `cardsAt`, `cardsAllAt`, `cardsOutAt` (cards shrink into points of light that sink into the country; QR
  scatters into a constellation). Kinds: image, xray (flash), train (lateral sweep), print (block, then the
  print `asset2` presses down), steam (food), qr (real scannable code via qrcode-generator + phone scan + tick;
  `qrText`), mp3 (waveform squeezes into an MP3 file; generic player + headphones), rain (drawn rain gauge after the Joseon cheugugi; rain falls, water rises from the focus cue; no asset).
- `montage: {items: [{kind: "qr"} | {asset, at}], collapseAt, targets: [[lon,lat]...], qrText}` = hook cuts that
  collapse into points of light landing on the globe; `globeAt` fades the globe in.
- `locators`, `texts` (`style: hero|country|sub`, `accent: [words]` in blue, `textWrap: balance`), `dimAt`,
  `fadeOut`. `At` = cue word | seconds | negative seconds from end | "end" | "start" (already fully in,
  for continuity across a cut).
- Continuity: hard cuts between scenes are invisible when the next scene's first camera key equals the previous
  scene's last key. Card layout is a fan above the caption band (pure `cardRects(ctx)`, also used by QC).
- Theme `orbit` (near-black, accent #4ea8ff) colours kinetic captions to match.
- Render speed: about 2.5 fps at 1080×1920. `npm run stills -- --formats 9:16 --at 1.5,12,30` renders exact seconds.
- Reference project: `projects/the-world-gave-us-this-01`.

## Images (licensed sourcing)

`npm run image -- search "<query>" --project <id> --source nasa|commons|pexels`
writes a numbered thumbnail sheet (`previews/image-search/sheet.png`) — LOOK at
it before choosing. `npm run image -- pick <n> --as <assetId> --focal x,y`
downloads full-res (rejects < 1600 px long side; downscales > 3840), and writes
assets.json with source URL, author, licence, credit line, retrieval date.
- Sources: NASA (no key, generally not copyrighted), Wikimedia Commons (no key;
  only PD / CC0 / CC BY / CC BY-SA accepted; BY-SA flagged — prefer PD/CC0/BY),
  Pexels (`PEXELS_API_KEY`, Pexels License). Stock video (Pexels) is planned.
- **Accuracy rule:** keyword search returns wrong subjects (searching "GPS
  satellite" on NASA returned CubeSats and other spacecraft). Only use an image
  when its source page confirms it depicts what the narration says. Never
  present a different object as the subject.
- Use real images only when a scene genuinely needs one; typography/diagrams
  remain the default.
- `npm run credits` → `output/<id>-credits.txt` with attribution for assets
  actually used in the video (plus voice attribution when required).

## Safe zones

`auto` picks by orientation: landscape → broadcast title-safe; portrait →
`social-vertical` (reserves bottom 20% and right 12% for Shorts/TikTok/Reels
UI); square → `social-square`. Override in project.json `safeZoneProfile`.

## Commands

| Command | What it does |
|---|---|
| `npm run create -- "Topic" [--format 9:16]` | scaffold `projects/<slug>/` |
| `npm run dev -- --project <id> [--format 9:16] [--guides]` | Remotion Studio (`preview` is an alias) |
| `npm run validate -- --project <id>` | storyboard, assets, fonts, layout for 16:9/9:16/1:1 |
| `npm run stills -- --project <id> [--guides] [--formats 9:16] [--at 1.5,12]` | one still per scene per format + side-by-side sheets |
| `npm run render:preview -- --project <id> [--format 9:16] [--scale 0.25]` | 50% scale (or `--scale`), veryfast x264, JPEG 70 → `previews/` (review drafts) |
| `npm run render:preview -- --project <id> --scenes s16,s17` | only those scenes (+ everything between), with their audio — fastest way to check an edit |
| `npm run render -- --project <id> --from s10 --to s14` | partial final-quality render of a scene range (ids or unique prefixes) |
| `npm run render -- --project <id> [--format 9:16] [--guides]` | full render → `output/`, then QC; long videos render in resumable parts automatically (re-run to resume) |
| `npm run render:all-formats -- --project <id>` | 16:9, 9:16, 1:1 from one bundle |
| `npm run qc -- <file.mp4> --project <id> [--format 9:16]` | QC an existing file |
| `npm run clean` | delete previews + caches (never `output/`) |
| `npm run setup:tools` | download whisper.cpp, Piper, voices, model into tools/ |
| `npm run tools:check [-- --voice <name>]` | Piper → whisper.cpp round trip with word timings |
| `npm run voices` | ElevenLabs voices on the account + remaining characters (free call) |
| `npm run voiceover -- --dry-run` | show scenes/characters that would be generated (and billed) |
| `npm run image -- search/pick ...` | licensed image search with thumbnail sheet; pick writes assets.json |
| `npm run credits` | attribution text for the video description |
| `npm run short -- --project <id> --scenes s1a,s1b,s10a [--outro "..."] [--portrait-zoom 1.6] [--force]` | 9:16 Short from chosen long-video scenes → `projects/<id>-short/` (copies only used assets + music, map outro "full video on the channel", −14 LUFS, kinetic captions, Shorts safe zone, map `portraitZoom`). Then `narrate`, `stills --formats 9:16`, `render`. Aim for ≤ 60 s |
| `npm run brand` | channel logo (800×800) + banner (2560×1440) from `src/compositions/Brand.tsx` → `channel/` with 98 px avatar and banner safe-area previews; channel setup guide: `channel/CHANNEL-SETUP.md` |
| `npm run posters -- --project <id> [--only a,b]` | thumbnails / logo / banner from `posters.json` (one atlas-or-any scene per image, any size e.g. 1280x720, 800x800, 2560x1440) → `output/<id>-<name>.png/.jpg`. Thumbnail text: atlas `texts` style `mega`; thick lines: route `width: 2–3` |
| `npm run geo:setup [-- --force]` | build Natural Earth map layers into data/geo/ |
| `npm run paleo:setup [-- --model MERDITH2021 --max 1000 --step 10]` | plate-model coastlines + rotations for deep-time maps (one-off online fetch from gws.gplates.org) |
| `npm run audio:add -- ...` | download a licensed audio file (Epidemic signed URL) into the project + assets.json |
| `npm run typecheck` | tsc |
| `npm run voiceover -- [--scene <id>] [--force]` | Piper → `audio/narration/<scene>.wav` + manifest (unchanged scenes skipped) |
| `npm run transcribe -- [--force]` | whisper.cpp timings aligned to script words → `transcript.json` |
| `npm run captions` | SRT + VTT subtitle files → `output/<id>.srt/.vtt` |
| `npm run audio` | FFmpeg mix → `audio/mix.wav` (ducked music, SFX, two-pass loudnorm) |
| `npm run narrate` | voiceover → transcribe → captions → audio, in order |

## QC coverage

Pre-render (`validate`, also run by `render`): unknown scene types, duplicate
ids, scene timing, missing assets/fonts, unknown source/license, region
outside frame, text/overlay outside safe zone, text–text / text–media /
text–overlay overlaps, estimated text overflow.
Post-render (`qc`): resolution, aspect ratio, square pixels, fps, pixel
format, duration, black segments, audio presence/duration, clipping, loudness.
Narration (`validate`): missing/stale voiceover, overrun, transcript staleness, word count vs script, ordering, recognition rate < 80% (likely mispronunciation), caption pages too short / overlapping / past the end, stale mix, required voice attribution. Post-render adds loudness vs target ±1 LU, true peak, required audio.
Not yet: image-crop quality.

## Local speech toolchain (installed in tools/, gitignored)

Reproduce with `npm run setup:tools`; verify with `npm run tools:check`.
Versions, URLs and licences are recorded in `scripts/lib/tools.ts`.

| Stage | Tool | Notes |
|---|---|---|
| Composition | Remotion 4.0.533 + React 19 + TS | npm |
| Media / encode / mix / QC | FFmpeg 9 (system) | |
| TTS | Piper 1.2.0 standalone (`tools/piper/piper.exe`) | ~1.5–2.5x real time on this CPU |
| Transcription | whisper.cpp b5454 CPU (`tools/whisper/Release/whisper-cli.exe`) + `ggml-base.en` | ~1x real time on short clips (incl. model load); 16 kHz mono WAV input; `-ojf` gives token timings |
| Fonts | @fontsource Inter + Source Serif 4 (OFL) | npm |

**Voice providers** (`project.json` → `audio.provider`):
- `piper` (default) — local, free, robotic-ish. Voices below.
- `edge` — Microsoft Edge online voices via the `edge-tts` Python package
  (`scripts/lib/tts/edge_tts_cli.py`); returns word boundaries for exact
  timing. **Unofficial endpoint, no publishing rights granted → personal /
  non-monetised only.** The same voices (e.g. `en-US-BrianMultilingualNeural`)
  are licensed for commercial use via Azure AI Speech **paid** tier (F0 free
  tier has no commercial rights) — the upgrade path is a provider switch.
  Edge reads "999" as "nine hundred ninety-nine" and "112" as "one hundred
  twelve": use pronunciation overrides.
- `elevenlabs` — paid API, approved by the user 2026-10-06 for realistic VO.
  Needs `ELEVENLABS_API_KEY` in `.env` (gitignored; never print it). Set
  `audio.voice` to a voice_id (`npm run voices` lists them + quota) and
  `audio.model` (`eleven_multilingual_v2` default; `eleven_v4` = ElevenLabs'
  top narration model per their docs, 2026). Each scene is generated with the
  neighbouring narration as `previous_text`/`next_text` for continuous prosody.
  Uses `/with-timestamps`: captions are timed from the engine's character
  alignment (exact); `npm run transcribe -- --verify` cross-checks with whisper.
  **Licence:** free plan = non-commercial + "elevenlabs.io" in the title; paid
  plans include commercial rights. Credits are billed per character: the
  voiceover step skips unchanged scenes, persists after every clip, checks
  remaining quota first, and supports `--dry-run`. Never use `--force` with
  ElevenLabs unless the user wants to pay for regeneration.

Voices (licences checked from each MODEL_CARD):
- `en_US-joe-medium` — CC0. Default.
- `en_US-libritts_r-medium` — CC BY 4.0; **credit required**:
  "Voice: Piper en_US-libritts_r, trained on LibriTTS-R (CC BY 4.0)." Multi-speaker (`--speaker <id>`).
- Do NOT add `lessac` (Blizzard research licence) or `ryan` (CC BY-NC-SA) for monetised work.
  Check MODEL_CARD before adding any voice.

**Caption rule learned in testing:** whisper mis-hears words (e.g. "coasts" →
"coast"). Captions must display the *script* text and use whisper only for
*timing* (align script words to whisper word timestamps).

Avoid on this machine: WhisperX / PyTorch stacks (no CUDA, 4 GB RAM, Python 3.14
wheel gaps). `edge-tts` is installed system-wide but is an **online Microsoft
service**, not local — only use with explicit user approval.

## Roadmap (pipeline stages)

brief → research → script → scene breakdown → storyboard → voiceover (Piper, installed)
→ transcription (whisper.cpp, installed) → asset collection → B-roll mapping → motion
graphics → captions → audio mix (FFmpeg ducking + loudnorm) → composition →
preview → QC → final render. Each stage writes files into `projects/<id>/`.

## Productions

| Project | Format | Length | Status |
|---|---|---|---|
| `example-project` | 16:9 + 9:16 | 24.8 s | format/caption/audio test bed |
| `how-gps-knows-where-you-are` | 16:9 | 88.2 s | first real video, rendered 2026-10-06; no music (none licensed); research.md cites every claim |
| `facts-about-911` | 16:9 | 8:06 | user's script verbatim; Edge voice Brian (non-monetised); 8 licensed photos; synthesised phone ring; captions off (SRT exported) |
| `the-country-inside-south-africa` | 9:16 | 49.9 s | Lesotho Short; Epidemic music + SFX |
| `the-world-gave-us-this-01` | 9:16 | 66.6 s | Ep. 01 of "The World Gave Us This" (China → Germany → Japan), user's locked script; journey scene, 14 licensed images + drawn QR/MP3, Epidemic music ("Riddle" 66.6 s edit) + 12 SFX; Edge voice (non-monetised) |
| `the-world-gave-us-this-02` | 9:16 | 79.2 s | Ep. 02 (Italy → India → South Korea), script drafted by Claude and approved; first video rendered on the render server; drawn rain-gauge card; truePeak -1.5 |
| `the-strait-of-malacca` | 16:9 | 6:00 | first geography long-form, final rendered 2026-10-07; dusk/ocean/paper palettes, satellite hook + close, Epidemic music bed (2 tracks crossfaded) + SFX; captions off (SRT exported); Edge voice (non-monetised) |

## YouTube upload (added 2026-10-20)

**Every finished video ships with an upload sheet (user rule, 2026-10-20):** write `projects/<id>/youtube.json`
(title, description with intro + sources + hashtags, exactly 4 tags, categoryId, privacy, madeForKids), run
`npm run credits` and `npm run captions`, then `npm run upload:md -- --project <id>` → `output/<id>-upload.md` (title,
tags, settings, description with all credits, and the MP4/SRT/VTT to attach). It checks YouTube's limits.

`npm run upload -- --login` (once; browser sign-in, shows the channel), then `npm run upload -- --project <id> [--dry-run]`
uploads the single final MP4 in `output/` with `projects/<id>/youtube.json` (title, description, tags, categoryId,
privacy, madeForKids, publishAt?, thumbnail?), the credits file appended to the description and the SRT as captions;
it records `output/<id>-youtube.json` and refuses a second upload without `--again`. `--file <mp4> --title ...` = bare test.
- The user's own Google Cloud project `checkpoint-uploader` (YouTube Data API v3, Desktop OAuth client): `YOUTUBE_CLIENT_ID`
  and `YOUTUBE_CLIENT_SECRET` in `.env`; the refresh token lives outside the repo in `~/.video-project/youtube-token.json`.
  The consent screen is in Testing (Publish was greyed out), so Google expires the login after ~7 days; the script
  then simply opens the sign-in again.
- **Until the project passes Google's YouTube API audit, YouTube locks API uploads to private, permanently for that
  video:** the creator cannot make it public in Studio and cannot appeal; it has to be uploaded again through the
  YouTube site/app (YouTube help, checked 2026-10-20). So do NOT upload a finished video through this command before
  the audit is approved; until then upload final videos in YouTube Studio (Claude prepares title, description,
  tags, captions). Custom thumbnails need a phone-verified channel.
- **Upload only after the user approves that specific video.** Composio was tried and dropped (2026-10-20): its
  shared Google project ran out of its daily upload allowance (966/day across all its users).
- Test upload 2026-10-20: https://youtu.be/N0RTY00TWFY (private, 8 s hook preview; for the user to delete).

## Backup (git)

Private repo: https://github.com/kipcolehoward-star/video-project (branch `main`).
- Commit + push after meaningful work (a finished video, a framework change).
- Never commit `.env` (gitignored). A pre-commit hook (`scripts/check-secrets.mjs`,
  install with `npm run hooks:install` after a fresh clone) blocks commits containing
  `.env` values, secret-looking env vars (e.g. EPIDEMIC_SOUND_API_KEY) or known key
  formats. Never print a suspected secret when investigating — report the file only.
- Not in git (by design): `node_modules/`, `tools/` (npm install / npm run
  setup:tools), previews, mixes (npm run audio), Epidemic music WAVs
  (re-download by ID from assets.json), and final MP4s — back those up
  separately (e.g. OneDrive). Subtitles and credits files are committed.
