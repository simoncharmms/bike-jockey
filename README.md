# 🚴 Bike Jockey — TDF 2025 Spinning Playlists

Turn **Tour de France 2025** stage profiles into perfectly-paced spinning playlists powered by your Spotify library.

![Bike Jockey](https://img.shields.io/badge/Bike%20Jockey-TDF%202025-ff6b2b?style=for-the-badge)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-f7df1e?style=for-the-badge&logo=javascript)
![GitHub Pages](https://img.shields.io/badge/GitHub-Pages%20Ready-0969da?style=for-the-badge&logo=github)

---

## What It Does

Bike Jockey maps the elevation profiles of 10 iconic TDF 2025 stages to BPM curves, then matches songs from your Spotify library to each segment. The result: a workout playlist that feels like you're actually racing the Tour.

**Steep climb → low BPM (seated climb)**  
**Flat/rolling → medium-high BPM (endurance tempo)**  
**Descent → high BPM (sprint/recovery spin)**

---

## Features

- 🏔️ **10 TDF 2025 stages** — from the Bastille Day Puy de Sancy thriller to the Champs-Élysées finale
- 🎵 **Spotify integration** — fetches up to 200 saved tracks with full audio feature analysis
- 📊 **Interactive elevation charts** — visualize stage profiles with segment overlays
- 💓 **Zone mapping** — HR zones, power zones (FTP %), RPE, and intensity descriptors per segment
- 🏆 **Workout metrics** — estimated duration, calorie burn, avg BPM, intensity distribution
- 📋 **One-click Spotify export** — push generated playlists directly to your Spotify account
- 🎭 **Demo mode** — try it without Spotify using a built-in 30-track library
- 📱 **Mobile-friendly** — works on phone for class use

---

## Playlist Rules

Every generated session follows these rules:

| Rule | Description |
|------|-------------|
| 🎸 First & last song | Always instrumental (low energy + low danceability) |
| 💤 Breaks | Sessions 1–3: 3 breaks · Sessions 4–6: 4 breaks · Sessions 7–10: 1 break. Each break is an instrumental track placed before an intensity increase. |
| 🤘 Second-to-last song | Always from **Die Ärzte** (or a placeholder if not in your library) |

---

## Stages Included

| # | Stage | Type | Distance | Elev. |
|---|-------|------|----------|-------|
| 1 | Grand Départ — Lille Loop | Sprint | 184.9km | 1,065m |
| 5 | Caen Time Trial | TT | 33km | 191m |
| 10 | Bastille Day — Puy de Sancy | Mountain | 165.3km | 4,307m |
| 12 | Pyrenees — Hautacam | Mountain | 180.6km | 3,794m |
| 13 | Mountain TT — Peyragudes | Mountain TT | 10.9km | 645m |
| 14 | Pyrenees Epic — Luchon-Superbagnères | Mountain | 182.6km | 5,020m |
| 16 | Mont Ventoux | Mountain | 171.5km | 2,929m |
| 18 | **Queen Stage** — Col de la Loze | Mountain 👑 | 171.5km | 5,642m |
| 19 | Alpine Rollercoaster — La Plagne | Mountain | 129.9km | 3,431m |
| 21 | Champs-Élysées — Paris | Sprint 🏆 | 132.3km | 1,129m |

---

## Setup & Deployment

### Running Locally

You'll need a simple HTTP server (browsers block CORS for `file://`):

**Option A — Python:**
```bash
cd bike-jockey
python3 -m http.server 3000
# Open http://localhost:3000
```

**Option B — Node.js (npx):**
```bash
cd bike-jockey
npx serve -p 3000
# Open http://localhost:3000
```

**Option C — VS Code Live Server:**  
Install the Live Server extension, then "Open with Live Server."

### Spotify Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Find or create the app with Client ID: `fafb4d31398b4d0b82e32572bbd7444a`
3. Add these Redirect URIs in the app settings:
   - `http://localhost:3000/callback` (for local dev)
   - `https://simoncharmms.github.io/bike-jockey/callback` (for GitHub Pages)
4. Save the settings

### Deploy to GitHub Pages

```bash
# From the repo root
git add bike-jockey/
git commit -m "🚴 Add Bike Jockey app"
git push

# Then enable GitHub Pages in repo Settings → Pages → Source: main branch
```

The app will be live at: `https://simoncharmms.github.io/bike-jockey/`

---

## How the Playlist Logic Works

1. **Stage segmentation:** Each stage is divided into 12 segments (6 for TTs) based on estimated race time
2. **Gradient calculation:** Average gradient per segment is computed from the elevation profile
3. **BPM target mapping:**
   - `>10%` grade → ~72 BPM (brutal climb — seated grind)
   - `8–10%` → ~88 BPM (steep — standing effort)
   - `6–8%` → ~100 BPM (hard climb)
   - `3–6%` → ~118 BPM (moderate — threshold)
   - `0–3%` → ~138 BPM (rolling — endurance)
   - Slight descent → ~150 BPM (flat power)
   - Descent → ~165 BPM (recovery spin)
   - Fast descent → ~178 BPM (high cadence)
4. **Song matching:** For each segment, the best-matching track is selected by BPM proximity (also checks half/double tempo). Recently-used tracks are penalized to maximize variety.
5. **Zone assignment:** BPM maps to training zones (Z1–Z5) for HR%, FTP power, RPE, and instructor cues

---

## Tech Stack

- **Vanilla HTML/CSS/JS** — zero build step, zero dependencies except Chart.js
- **Chart.js 4.4** (from CDN) — elevation and donut charts
- **Spotify Web API** — PKCE OAuth flow (no client secret exposed)
- **localStorage** — caches tracks and audio features so you only fetch once

---

## Privacy

- No server. Everything runs in your browser.
- Track data and audio features are cached in `localStorage` only.
- The app requests: `user-library-read`, `playlist-modify-private`, `playlist-modify-public`, `user-read-private`.
- No data is ever sent anywhere except the Spotify API.

---

## File Structure

```
bike-jockey/
├── index.html        # Single-page app shell
├── app.js            # All app logic (auth, API, playlist gen, charts)
├── styles.css        # Dark theme, cycling-inspired
├── data/
│   └── stages.js     # TDF 2025 stage data with elevation profiles
├── README.md
└── .gitignore
```

---

## Credits

Stage data sourced from Alpecin Cycling, Bicycling.com, ProCyclingStats, and official Tour de France 2025 publications. Elevation profiles are approximate and intended for spinning class use.

*Built for Simon — the data-driven cyclist 🚴*
