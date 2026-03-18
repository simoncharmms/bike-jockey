# \greekdevs Brief — Bike Jockey Fixes (2026-03-18)

## Context
Single-page web app: `index.html` + `app.js` + `styles.css`.
Generates spinning class playlists from TDF stage profiles + Spotify library.
No build step. Pure vanilla JS + Chart.js. Deployed to GitHub Pages.

## Issues to Fix

---

### Issue 1 — Global Duplicate Song Prevention Across All 10 Playlists

**Current behaviour:**
`findBestTrack()` avoids reuse only within a single playlist (passes `usedIds` from the current `segments` array). `applyPlaylistRules()` also only deduplicates within one playlist. Nothing prevents the same track appearing in Stage 2 and Stage 7.

**Required behaviour:**
Across all 10 generated playlists, ZERO duplicate tracks — including:
- Regular segments
- Break songs (instrumental)
- Die Ärzte second-to-last slot
- Opener / closer instrumentals

**Approach:**
- `state.generatedPlaylists` already holds all generated playlists keyed by stageId.
- Before generating a new stage's playlist, collect all `trackId`s already used across ALL entries in `state.generatedPlaylists`. Pass this as the global exclusion list into both `generateSegments()` and `applyPlaylistRules()`.
- Signature change: `generateSegments(stage, tracks, audioFeatures, globalUsedIds = [])` and `applyPlaylistRules(segments, stageId, tracks, audioFeatures, globalUsedIds = [])`.
- In `findBestTrack`, rename `usedIds` param to make it clear it's the union of within-playlist AND global used.
- In `findInstrumentalTrack`, same: merge within-playlist and global exclusions.
- If the library is too small to satisfy uniqueness across all 10 playlists, allow reuse (graceful fallback, not crash), but prioritise fresh tracks first.

**Also:**
- The Die Ärzte slot currently just calls `findDieAerzteTrack(tracks)` which always returns the SAME track. If multiple Die Ärzte tracks exist in the library, rotate through them. If only one exists, allow its reuse in that slot (it's a special slot) but track it in the global used set to prevent it appearing elsewhere.

---

### Issue 2 — Instrumental Classification Rework

**Current behaviour:**
```js
function isInstrumental(feat) {
  return feat && feat.energy < 0.4 && feat.danceability < 0.5;
}
```
This is too permissive and misclassifies vocal pop songs as "instrumental".

**Required behaviour:**
Spotify's audio features include an `instrumentalness` field (0.0–1.0). Values > 0.5 indicate likely instrumental; values > 0.8 are very confident.

Changes needed:
1. In `fetchAudioFeatures()`, add `instrumentalness` to the stored feature object alongside tempo/energy/valence/danceability/loudness.
2. Rewrite `isInstrumental(feat)`:
   ```js
   function isInstrumental(feat) {
     if (!feat) return false;
     // Primary: Spotify's own instrumentalness score
     if (feat.instrumentalness >= 0.5) return true;
     // Fallback heuristic for tracks missing the field (shouldn't happen, but defensive)
     return feat.energy < 0.35 && feat.danceability < 0.4 && feat.loudness < -10;
   }
   ```
3. The fallback in `findInstrumentalTrack` (sorted by lowest energy) should ALSO require `instrumentalness >= 0.5` if available, and only fall back to energy-sort if zero tracks pass that threshold.

**Note on caching:** The cached feature objects in localStorage will be missing `instrumentalness`. Add a cache invalidation mechanism: store a cache version key `bj_features_version = "2"` and on load, if version mismatches, clear features cache and re-fetch. Do NOT clear track cache.

---

### Issue 3 — UI Layout: Sticky Elevation Profile + Current Segment

**Current behaviour:**
The stage view scrolls as a normal page. Elevation profile and current segment scroll away when the user scrolls down to see the playlist.

**Required behaviour:**
When in the stage view:
- Elevation profile (`#elevation-chart` container) and current segment (`#now-playing` with its title) must remain **sticky at the top** of the main content column as the user scrolls through the playlist.
- The playlist list (`#segments-list`) scrolls independently below them.
- The sidebar stays as-is (already fixed on desktop).

**Also — Elevation Profile: Highlight Active Segment**
- The elevation chart should show a vertical marker or highlighted band indicating the position of the currently active segment.
- When `selectSegment(index)` is called, update the chart to reflect the new active position.
- Implementation: add a Chart.js annotation OR manually draw a vertical line on the canvas using Chart.js `afterDraw` plugin. The position corresponds to the segment's `km` midpoint mapped to the x-axis of the elevation profile.
- Use a vertical line in the accent colour (`#ff6b2b`) with a small label showing the segment number.

**CSS approach for sticky layout:**
- `.stage-view-body` is a flex/grid container. The `.stage-main-content` column should become a flex column with a sticky header section (elevation + now-playing) and a scrollable playlist section.
- Something like:
  ```css
  .stage-main-content {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 64px - 60px); /* viewport minus app-header minus stage-view-header */
    overflow: hidden;
  }
  .stage-sticky-top {
    flex-shrink: 0;
  }
  .stage-scrollable {
    flex: 1;
    overflow-y: auto;
  }
  ```
- Wrap the elevation chart + now-playing sections in a `<div class="stage-sticky-top">` in `index.html`.
- Wrap the playlist section in `<div class="stage-scrollable">`.

---

## File Map
- `/Users/homer-service/.openclaw/workspace/bike-jockey/app.js` — all JS logic
- `/Users/homer-service/.openclaw/workspace/bike-jockey/index.html` — markup
- `/Users/homer-service/.openclaw/workspace/bike-jockey/styles.css` — styles
- `/Users/homer-service/.openclaw/workspace/bike-jockey/data/stages.js` — TDF stage data (read-only for this task)

## Constraints
- No build tooling. Pure vanilla JS, ES6+. Must work in modern Chrome/Safari.
- No new external dependencies. Chart.js already loaded from CDN.
- Chart.js annotation plugin is NOT loaded — implement the elevation marker via the built-in `afterDraw` plugin pattern on the chart instance, not via a plugin import.
- Do not break Spotify PKCE auth flow, playback API, or PDF export.
- Maintain existing dark theme and visual style.
- All changes must be self-contained in the three files above.

## Deliverables
Each agent delivers a concrete diff/patch or complete replacement of the relevant sections.
Achilles owns: app.js changes (Issues 1, 2, 3-chart-marker)
Achilles also owns: index.html structural changes (Issue 3-sticky)
Achilles also owns: styles.css changes (Issue 3-sticky)
Odysseus: test cases / edge case analysis for Issues 1 & 2 (small library, zero instrumentals, all 10 stages generated, Die Ärzte dedup)
Agamemnon: code review pass on Achilles' output — BLOCK/WARN/NIT
Hector: verify git remote is SSH, commit message, push
