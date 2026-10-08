# Checkpoint Geo & History: channel setup

Everything to set up the YouTube channel once, plus the default video settings. Brand images are in this folder (`channel/`); regenerate them any time with `npm run brand`.

---

## 1. Identity

| Field | Value |
|---|---|
| Channel name | **Checkpoint Geo & History** |
| Handle | **@chechpointgeo** as given. ⚠️ Check the spelling: did you mean **@checkpointgeo**? A handle is hard to change later and viewers type it from memory. If `@checkpointgeo` is taken, alternatives are `@checkpointgeohistory` and `@checkpoint.geo`. |
| Profile picture | `channel/logo.png` (800×800, YouTube crops it to a circle; checked at 98 px) |
| Banner | `channel/banner.png` (2560×1440; title kept inside YouTube's 1546×423 safe area, check `previews/banner-safe-areas.png`) |
| Tagline (banner) | Maps · Borders · The stories behind them |

### Brand kit (keep thumbnails and videos consistent)
| Role | Colour |
|---|---|
| Navy (background) | `#0F1E2E` |
| Sea | `#16324B` |
| Cream (text, land) | `#F3EEE4` / `#E9E2D0` |
| Gold (accent, pin) | `#E8B04A` |
| Display font | Bebas Neue (titles, thumbnails) |
| Body font | Inter (labels, subtitles) |

---

## 2. Before you upload anything
1. **Verify the channel** (phone number): YouTube Studio → Settings → Channel → Feature eligibility → *Intermediate features*. Without it you **cannot upload custom thumbnails** or videos over 15 minutes.
2. **Epidemic Sound:** add the channel in your Epidemic account (Settings → Connected channels / whitelist) **before** the first upload, or the music may get Content ID claims.
3. **Monetisation stays off** for now: the current narration voice (Edge) is for non-commercial use only. Re-voice before joining the Partner Programme.

---

## 3. Channel settings (YouTube Studio → Customisation / Settings)

### Customisation → Profile
- **Name:** Checkpoint Geo & History
- **Handle:** see above
- **Description** (paste, under 1,000 characters):

> Maps, borders, and the history that drew them.
>
> Checkpoint explains the places the world quietly depends on: straits and canals, frontiers and enclaves, empires and the lines they left behind. Every video is built from real maps, and every number is sourced in the description.
>
> New explainers regularly. Subscribe and check in at the next checkpoint.

- **Links:** add later (website, X/Instagram) if you have them.
- **Contact email:** use a dedicated business address (not your personal one).

### Customisation → Branding
- Picture: `logo.png` · Banner: `banner.png`
- **Video watermark:** optional, skip for now.

### Customisation → Layout
- **Channel trailer** (for non-subscribers): the Strait of Malacca video until a dedicated trailer exists.
- **Featured video** (for returning subscribers): latest upload.
- **Sections:** Videos · Shorts · Playlists. Plan these playlists: *Chokepoints*, *Borders & Enclaves*, *History on the Map*.

### Settings → Channel → Basic info
- Country of residence: your country
- **Keywords:** geography, maps, history, geopolitics, borders, chokepoints, straits, explainer, documentary, world history

### Settings → Channel → Advanced settings
- **Audience:** "No, set this channel as not made for kids"
- Ads/monetisation: n/a until the voice is commercially licensed

### Settings → Community
- Comments: "Hold potentially inappropriate comments for review"
- Blocked words: add later as needed

---

## 4. Upload defaults (Settings → Upload defaults)
These pre-fill every upload, so each video only needs its own title, description top and chapters.

| Setting | Default |
|---|---|
| Visibility | Private (publish manually after the final check) |
| Category | **Education** |
| Video language | English |
| Title/caption language | English |
| Licence | Standard YouTube Licence |
| Comments | On, hold potentially inappropriate |
| Show how many viewers like this video | On |
| Automatic chapters | Off (we write our own) |
| Featured places / concepts | Off |
| Tags | geography, maps, history, geopolitics, explainer |

**Description template** (Upload defaults → Description):
```
[One or two sentences about this video]

Chapters
0:00 ...

Sources
- ...

Credits
Music and sound effects: Epidemic Sound.
Maps: Natural Earth (public domain). Satellite imagery: NASA Blue Marble (public domain).

Checkpoint Geo & History: maps, borders and the stories behind them.
#geography #history #maps
```

---

## 5. Every video: upload checklist
Each project's `output/` folder has `youtube-upload.md` with the specific title, description, tags and chapters.

1. Upload the final MP4 from `projects/<id>/output/`. Keep it **Private** while processing.
2. **Title:** from `youtube-upload.md` (under about 70 characters, no clickbait the video can't back up).
3. **Thumbnail:** `output/<id>-thumb-*.jpg` (1280×720, under 2 MB). Use **Test & compare** with up to 3 options.
4. **Description:** paste from `youtube-upload.md` (chapters must start at 0:00, at least 3, each at least 10 s).
5. **Audience:** Not made for kids.
6. **Altered or synthetic content:** YouTube asks this on every upload. The narration is a synthetic voice; read YouTube's current guidance on that screen. I'm not certain whether a generic text-to-speech narrator needs the label.
7. **Subtitles:** Subtitles → English → Upload file → *With timing* → `output/<id>.srt`.
8. **End screen:** the last 12 s of every video is a clean globe; add *Subscribe* + *Best for viewer* video there.
9. **Cards:** optional, link related videos at the moment they're mentioned.
10. **Checks:** wait for "Checks complete: no issues" (copyright). If a music claim appears, confirm the channel is whitelisted in Epidemic and dispute with your Epidemic licence.
11. Publish (or schedule). Consistent days and times help: pick one and stick to it.

---

## 6. After publishing
- Pin a comment with a question to start discussion (e.g. "Which chokepoint should we cover next?").
- Add the video to its playlist.
- In 48 hours, check **Analytics → Reach** (impressions click-through rate) and **Engagement** (audience retention). Note where viewers drop off and share that with me for the next script.
