// ============================================================
// BIKE JOCKEY — App Logic
// Spotify PKCE OAuth + TDF Stage Playlist Generator
// ============================================================

'use strict';

// ---- Config ----
const CLIENT_ID = 'fafb4d31398b4d0b82e32572bbd7444a';
const REDIRECT_URIS = [
  'http://localhost:3000/callback',
  'https://simoncharmms.github.io/bike-jockey/callback'
];
const SCOPES = [
  'user-library-read',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing'
].join(' ');

const CACHE_KEY_TRACKS = 'bj_saved_tracks';
const CACHE_KEY_DEVICES = 'bj_devices';
const CACHE_KEY_FEATURES = 'bj_audio_features';
const CACHE_KEY_FEATURES_VERSION = 'bj_features_version';
const FEATURES_CACHE_VERSION = '4';
const CACHE_KEY_TOKEN = 'bj_access_token';
const CACHE_KEY_EXPIRY = 'bj_token_expiry';
const CACHE_KEY_USER = 'bj_user_profile';

// ---- State ----
const state = {
  accessToken: null,
  userProfile: null,
  savedTracks: [], // { id, name, artist, album, albumArt, uri }
  audioFeatures: {}, // { track_id: { tempo, energy, valence, danceability, loudness } }
  stages: TDF_STAGES,
  activeStage: null,
  activeSegmentIndex: 0,
  generatedPlaylists: {}, // { stageId: [...segments] }
  spotifyConnected: false,
  playbackState: null,
  availableDevices: [],
  activeDeviceId: null,
  playbackPolling: null,
  isBikeJockeyPlayback: false
};

// ---- Utils ----
function getRedirectUri() {
  const url = window.location.href;
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return REDIRECT_URIS[0];
  }
  return REDIRECT_URIS[1];
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

async function generateCodeChallenge(verifier) {
  const enc = new TextEncoder();
  const data = enc.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function showLoading(text = 'Loading…') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

// ---- Zone calculations ----
function bpmToZone(bpm) {
  if (bpm < 100) return 1;
  if (bpm < 130) return 2;
  if (bpm < 155) return 3;
  if (bpm < 170) return 4;
  return 5;
}

function zoneToColor(zone) {
  const colors = {
    1: '#3b82f6', // recovery blue
    2: '#22c55e', // endurance green
    3: '#eab308', // tempo yellow
    4: '#f97316', // threshold orange
    5: '#ef4444'  // VO2max red
  };
  return colors[zone] || '#9090b0';
}

function zoneLabel(zone) {
  const labels = { 1: 'Recovery', 2: 'Endurance', 3: 'Tempo', 4: 'Threshold', 5: 'VO2max' };
  return labels[zone] || 'Unknown';
}

function hrZone(zone) {
  const zones = { 1: '50-60%', 2: '60-70%', 3: '70-80%', 4: '80-90%', 5: '90-100%' };
  return zones[zone] || '-';
}

function powerZone(zone) {
  const zones = { 1: '<55% FTP', 2: '55-75% FTP', 3: '75-90% FTP', 4: '90-105% FTP', 5: '>105% FTP' };
  return zones[zone] || '-';
}

function rpeForZone(zone) {
  const rpe = { 1: [1, 3], 2: [3, 5], 3: [5, 6], 4: [7, 8], 5: [9, 10] };
  const r = rpe[zone] || [5, 6];
  return Math.floor((r[0] + r[1]) / 2);
}

function intensityDescriptor(zone, gradient) {
  if (zone === 1) return gradient > 2 ? 'Easy seated spin' : 'Active recovery';
  if (zone === 2) return gradient > 5 ? 'Seated climb' : 'Endurance tempo';
  if (zone === 3) return gradient > 6 ? 'Hard seated climb' : 'Threshold tempo';
  if (zone === 4) return gradient > 8 ? 'Standing climb' : 'Threshold effort';
  if (zone === 5) return gradient > 10 ? 'Max standing sprint' : 'VO2max push';
  return 'Steady effort';
}

// ---- Gradient & BPM mapping ----
function gradientToBpmTarget(gradient) {
  if (gradient > 10) return 72;     // brutal climb
  if (gradient > 8)  return 88;     // steep climb
  if (gradient > 6)  return 100;    // hard climb
  if (gradient > 3)  return 118;    // moderate climb
  if (gradient > 0)  return 138;    // rolling
  if (gradient > -3) return 150;    // flat/slight descent
  if (gradient > -8) return 165;    // descent
  return 178;                        // fast descent / sprint
}

function getProfileGradient(profile, km) {
  // Find the gradient at a given km point
  for (let i = 1; i < profile.length; i++) {
    if (profile[i][0] >= km) {
      const dx = profile[i][0] - profile[i-1][0];
      const dy = profile[i][1] - profile[i-1][1];
      if (dx === 0) return 0;
      return (dy / dx) * 100 / 100; // as decimal → multiply by 100 for %
    }
  }
  return 0;
}

// ---- Segment generation ----
function generateSegments(stage, tracks, audioFeatures, globalUsedIds = []) {
  const numSegments = stage.type === 'tt' || stage.type === 'mountain_tt' ? 6 : 12;
  const totalTime = (stage.distance / stage.avgSpeed) * 60; // minutes
  const segmentDuration = totalTime / numSegments;

  const segments = [];

  for (let i = 0; i < numSegments; i++) {
    const progress = i / numSegments;
    const km = stage.distance * progress;
    const kmEnd = stage.distance * ((i + 1) / numSegments);
    const kmMid = (km + kmEnd) / 2;

    // Find elevation at midpoint
    const elev = interpolateElevation(stage.profile, kmMid);
    const elevNext = interpolateElevation(stage.profile, Math.min(kmEnd, stage.distance));
    const elevPrev = interpolateElevation(stage.profile, km);

    // Calculate average gradient over segment
    const segDist = kmEnd - km;
    const elevChange = elevNext - elevPrev;
    const gradientPct = segDist > 0 ? (elevChange / (segDist * 10)) : 0; // in %

    const targetBpm = gradientToBpmTarget(gradientPct);
    const zone = bpmToZone(targetBpm);

    // Pick best matching track (exclude global already-used IDs + within-playlist)
    const withinPlaylistUsed = segments.map(s => s.trackId).filter(Boolean);
    const allUsed = [...new Set([...globalUsedIds, ...withinPlaylistUsed])];
    const track = findBestTrack(targetBpm, tracks, audioFeatures, allUsed);

    const rpe = rpeForZone(zone);
    const descriptor = intensityDescriptor(zone, Math.abs(gradientPct));

    segments.push({
      index: i,
      km: Math.round(km * 10) / 10,
      kmEnd: Math.round(kmEnd * 10) / 10,
      elevation: Math.round(elev),
      gradientPct: Math.round(gradientPct * 10) / 10,
      targetBpm,
      zone,
      duration: segmentDuration * 60, // in seconds
      trackId: track ? track.id : null,
      trackName: track ? track.name : 'No match found',
      trackArtist: track ? track.artist : '—',
      trackAlbumArt: track ? track.albumArt : null,
      trackUri: track ? track.uri : null,
      actualBpm: track && audioFeatures[track.id] ? Math.round(audioFeatures[track.id].tempo) : targetBpm,
      energy: track && audioFeatures[track.id] ? audioFeatures[track.id].energy : 0.5,
      rpe,
      descriptor,
      hrZone: hrZone(zone),
      powerZone: powerZone(zone)
    });
  }

  return applyPlaylistRules(segments, stage.id, tracks, audioFeatures, globalUsedIds);
}

// ---- Playlist Rules Engine ----
function isInstrumental(feat) {
  if (!feat) return false;
  const speech = feat.speechiness ?? 0.5;    // unknown → assume vocal
  const instness = feat.instrumentalness ?? 0;
  const acoustic = feat.acousticness ?? 0;
  const energy = feat.energy ?? 0.5;
  const dance = feat.danceability ?? 0.5;
  const loud = feat.loudness ?? -5;
  // Hard disqualifier: significant speech/vocals
  if (speech > 0.15) return false;
  // Hard disqualifier: high-energy dance track
  if (dance > 0.7 && energy > 0.6) return false;
  // Primary: Spotify instrumentalness
  if (instness >= 0.5) return true;
  // Secondary: acoustic + calm
  if (acoustic >= 0.6 && energy < 0.5) return true;
  // Tertiary: very quiet and low danceability
  return energy < 0.3 && dance < 0.35 && loud < -10;
}

// Look for an instrumental version of a specific song by name.
// Matches tracks whose name contains both "instrumental" and the target song title (case-insensitive).
// Falls back to null if nothing found — caller chains to findInstrumentalTrack().
function findInstrumentalCoverOf(targetTrackName, tracks, audioFeatures, excludeIds) {
  if (!targetTrackName) return null;
  const needle = targetTrackName.toLowerCase();
  const candidates = tracks.filter(t => {
    if (excludeIds.includes(t.id)) return false;
    const name = t.name.toLowerCase();
    return name.includes('instrumental') && name.includes(needle);
  });
  if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];

  // Broader fallback: artist name contains "instrumental" or "string quartet" or "cover"
  // and the track name contains the target — catches VSQ-style covers
  const broadCandidates = tracks.filter(t => {
    if (excludeIds.includes(t.id)) return false;
    const name = t.name.toLowerCase();
    const artist = t.artist.toLowerCase();
    const nameMatch = name.includes(needle);
    const instrumentalArtist = artist.includes('instrumental') ||
      artist.includes('string quartet') ||
      artist.includes('vitamin string') ||
      artist.includes('cover');
    return nameMatch && instrumentalArtist;
  });
  if (broadCandidates.length > 0) return broadCandidates[Math.floor(Math.random() * broadCandidates.length)];

  return null;
}

function findInstrumentalTrack(tracks, audioFeatures, excludeIds) {
  if (!tracks || tracks.length === 0) return null;

  const feat = t => audioFeatures[t.id] || {};
  const energy = t => feat(t).energy ?? 0.5;
  const speech = t => feat(t).speechiness ?? 0.5;
  const instness = t => feat(t).instrumentalness ?? 0;
  const acoustic = t => feat(t).acousticness ?? 0;
  const fresh = t => !excludeIds.includes(t.id);

  const rand = arr => arr[Math.floor(Math.random() * arr.length)];
  const randHalf = arr => {
    const sorted = [...arr].sort((a, b) => energy(a) - energy(b));
    return rand(sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2))));
  };

  // Tier 1: true instrumental, not used
  const t1 = tracks.filter(t => fresh(t) && isInstrumental(feat(t)));
  if (t1.length > 0) return rand(t1);

  // Tier 2: true instrumental, reuse allowed — always better than a vocal track
  const t2 = tracks.filter(t => isInstrumental(feat(t)));
  if (t2.length > 0) return rand(t2);

  // Tier 3: name/artist signals instrumental (VSQ, covers, etc.), not used
  const t3 = tracks.filter(t => fresh(t) && (
    t.name.toLowerCase().includes('instrumental') ||
    t.artist.toLowerCase().includes('instrumental') ||
    t.artist.toLowerCase().includes('string quartet') ||
    t.artist.toLowerCase().includes('vitamin string') ||
    t.artist.toLowerCase().includes('cover')
  ));
  if (t3.length > 0) return rand(t3);

  // Tier 4: low speechiness + low energy, not used
  const t4 = tracks.filter(t => fresh(t) && speech(t) <= 0.15 && energy(t) < 0.5);
  if (t4.length > 0) return randHalf(t4);

  // Tier 5: low speechiness + low energy, reuse allowed
  const t5 = tracks.filter(t => speech(t) <= 0.15 && energy(t) < 0.5);
  if (t5.length > 0) return randHalf(t5);

  // Tier 6: just low speechiness, not used
  const t6 = tracks.filter(t => fresh(t) && speech(t) <= 0.2);
  if (t6.length > 0) return rand(t6);

  // Tier 7: just low speechiness, reuse allowed
  const t7 = tracks.filter(t => speech(t) <= 0.2);
  if (t7.length > 0) return rand(t7);

  // Nuclear fallback
  const t8 = tracks.filter(t => fresh(t));
  if (t8.length > 0) return rand(t8);
  console.warn('[BJ] findInstrumentalTrack: nuclear last resort — returning any track');
  return rand(tracks);
}

function makeInstrumentalSegment(track, audioFeatures, durationSec, descriptor) {
  const feat = track ? audioFeatures[track.id] : null;
  return {
    index: 0,
    km: 0, kmEnd: 0, elevation: 0, gradientPct: 0,
    targetBpm: feat ? Math.round(feat.tempo) : 70,
    zone: 1,
    duration: durationSec,
    trackId: track ? track.id : null,
    trackName: track ? track.name : '[ No instrumental found — add one to your library ]',
    trackArtist: track ? track.artist : '—',
    trackAlbumArt: track ? track.albumArt : null,
    trackUri: track ? track.uri : null,
    actualBpm: feat ? Math.round(feat.tempo) : 70,
    energy: feat ? feat.energy : 0.2,
    rpe: 2,
    descriptor: descriptor || '💤 Recovery Break',
    hrZone: hrZone(1),
    powerZone: powerZone(1),
    isBreak: true
  };
}

function findDieAerzteTrack(tracks, excludeIds = []) {
  const all = tracks.filter(t => {
    const a = t.artist.toLowerCase();
    return a.includes('die ärzte') || a.includes('die aerzte') || a.includes('ärzte');
  });
  if (all.length === 0) return null;
  // Prefer one not already used globally; fall back to any Die Ärzte track if all used
  const fresh = all.filter(t => !excludeIds.includes(t.id));
  return fresh.length > 0 ? fresh[Math.floor(Math.random() * fresh.length)] : all[Math.floor(Math.random() * all.length)];
}

function applyPlaylistRules(segments, stageId, tracks, audioFeatures, globalUsedIds = []) {
  if (!segments || segments.length === 0) return segments;

  // Start with global exclusions + within-playlist tracks
  const usedIds = [...new Set([...globalUsedIds, ...segments.map(s => s.trackId).filter(Boolean)])];
  const avgDuration = segments.reduce((sum, s) => sum + s.duration, 0) / segments.length;

  // --- Rule 1: Instrumental opener & closer ---
  // Prefer an instrumental cover of the first / last real segment's song
  const firstRealTrackName = segments[0]?.trackName;
  const lastRealTrackName = segments[segments.length - 1]?.trackName;

  const openerTrack = findInstrumentalCoverOf(firstRealTrackName, tracks, audioFeatures, usedIds)
    || findInstrumentalTrack(tracks, audioFeatures, usedIds);
  if (openerTrack) usedIds.push(openerTrack.id);

  const closerTrack = findInstrumentalCoverOf(lastRealTrackName, tracks, audioFeatures, usedIds)
    || findInstrumentalTrack(tracks, audioFeatures, usedIds);
  if (closerTrack) usedIds.push(closerTrack.id);

  const opener = makeInstrumentalSegment(openerTrack, audioFeatures, avgDuration, '🎸 Warm-Up (Instrumental)');
  const closer = makeInstrumentalSegment(closerTrack, audioFeatures, avgDuration, '🎸 Cool-Down (Instrumental)');

  // --- Rule 2: Insert breaks ---
  let breakCount;
  if (stageId <= 3) breakCount = 3;
  else if (stageId <= 6) breakCount = 2;
  else breakCount = 1;

  // Find zone-change points (where zone increases by ≥1 vs previous)
  const zoneChangeIndices = [];
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].zone - segments[i - 1].zone >= 1) {
      zoneChangeIndices.push(i);
    }
  }

  // Decide break insertion positions
  let breakPositions = [];
  if (zoneChangeIndices.length >= breakCount) {
    // Pick the top zone-change points, spread out
    const step = Math.max(1, Math.floor(zoneChangeIndices.length / breakCount));
    for (let i = 0; i < breakCount; i++) {
      const idx = Math.min(i * step, zoneChangeIndices.length - 1);
      breakPositions.push(zoneChangeIndices[idx]);
    }
  } else {
    // Not enough zone-change points — distribute evenly
    breakPositions = zoneChangeIndices.slice(0, breakCount);
    const remaining = breakCount - breakPositions.length;
    if (remaining > 0) {
      const step = Math.floor(segments.length / (remaining + 1));
      for (let i = 1; i <= remaining; i++) {
        const pos = i * step;
        if (!breakPositions.includes(pos) && pos < segments.length) {
          breakPositions.push(pos);
        }
      }
    }
  }
  breakPositions.sort((a, b) => a - b);
  // Deduplicate
  breakPositions = [...new Set(breakPositions)];

  // Build the middle section with breaks inserted
  const middle = [];
  let breakIdx = 0;
  for (let i = 0; i < segments.length; i++) {
    if (breakIdx < breakPositions.length && i === breakPositions[breakIdx]) {
      // Preferred: instrumental cover of the song that follows this break
      const nextSegTrackName = segments[i]?.trackName;
      let breakTrack = findInstrumentalCoverOf(nextSegTrackName, tracks, audioFeatures, usedIds)
        || findInstrumentalTrack(tracks, audioFeatures, usedIds);
      if (breakTrack) usedIds.push(breakTrack.id);
      const desc = breakTrack && breakTrack.name.toLowerCase().includes('instrumental')
        ? `💤 Recovery Break (Instrumental Cover)`
        : '💤 Recovery Break';
      middle.push(makeInstrumentalSegment(breakTrack, audioFeatures, avgDuration * 0.6, desc));
      breakIdx++;
    }
    middle.push(segments[i]);
  }

  // --- Rule 3: Second-to-last = Die Ärzte ---
  const aerzteTrack = findDieAerzteTrack(tracks, usedIds);
  if (aerzteTrack) usedIds.push(aerzteTrack.id);
  let aerzteSeg;
  if (aerzteTrack) {
    const feat = audioFeatures[aerzteTrack.id];
    aerzteSeg = {
      index: 0,
      km: 0, kmEnd: 0, elevation: 0, gradientPct: 0,
      targetBpm: feat ? Math.round(feat.tempo) : 130,
      zone: feat ? bpmToZone(feat.tempo) : 3,
      duration: avgDuration,
      trackId: aerzteTrack.id,
      trackName: aerzteTrack.name,
      trackArtist: aerzteTrack.artist,
      trackAlbumArt: aerzteTrack.albumArt,
      trackUri: aerzteTrack.uri,
      actualBpm: feat ? Math.round(feat.tempo) : 130,
      energy: feat ? feat.energy : 0.7,
      rpe: 6,
      descriptor: '🤘 Die Ärzte Finale',
      hrZone: hrZone(feat ? bpmToZone(feat.tempo) : 3),
      powerZone: powerZone(feat ? bpmToZone(feat.tempo) : 3),
      isDieAerzte: true
    };
  } else {
    aerzteSeg = {
      index: 0,
      km: 0, kmEnd: 0, elevation: 0, gradientPct: 0,
      targetBpm: 130, zone: 3, duration: avgDuration,
      trackId: 'die_aerzte_placeholder',
      trackName: 'SFT (Schrei nach Liebe)',
      trackArtist: 'Die Ärzte',
      trackAlbumArt: null,
      trackUri: null,
      actualBpm: 130,
      energy: 0.7, rpe: 6,
      descriptor: '⚠️ Add \'Die Ärzte\' to your Spotify library!',
      hrZone: hrZone(3), powerZone: powerZone(3),
      isPlaceholder: true,
      isDieAerzte: true
    };
  }

  // --- Assemble final order ---
  // [opener, ...middle_with_breaks, die_aerzte, closer]
  const final = [opener, ...middle, aerzteSeg, closer];

  // Re-index and assign km positions to injected segments (breaks, opener, closer)
  // so the elevation chart marker shows a meaningful position instead of always km=0
  final.forEach((seg, i) => {
    seg.index = i;
    if (seg.km === 0 && seg.kmEnd === 0) {
      // Find the nearest real segment (non-injected) to borrow its km position
      const nearestReal = final.slice(i).find(s => s.km > 0 || s.kmEnd > 0)
        || final.slice(0, i).reverse().find(s => s.km > 0 || s.kmEnd > 0);
      if (nearestReal) {
        seg.km = nearestReal.km;
        seg.kmEnd = nearestReal.kmEnd;
      }
    }
  });

  return final;
}

function interpolateElevation(profile, km) {
  if (km <= profile[0][0]) return profile[0][1];
  if (km >= profile[profile.length - 1][0]) return profile[profile.length - 1][1];

  for (let i = 1; i < profile.length; i++) {
    if (profile[i][0] >= km) {
      const t = (km - profile[i-1][0]) / (profile[i][0] - profile[i-1][0]);
      return profile[i-1][1] + t * (profile[i][1] - profile[i-1][1]);
    }
  }
  return profile[profile.length - 1][1];
}

function findBestTrack(targetBpm, tracks, audioFeatures, usedIds) {
  if (!tracks || tracks.length === 0) return null;

  const tracksWithFeatures = tracks.filter(t => audioFeatures[t.id]);
  if (tracksWithFeatures.length === 0) return tracks[Math.floor(Math.random() * tracks.length)];

  // Fresh pool: not globally used across any playlist
  const freshPool = tracksWithFeatures.filter(t => !usedIds.includes(t.id));
  // Fallback: allow reuse, but still prefer non-speechy tracks over rap/spoken word
  const fallbackPool = tracksWithFeatures.filter(t =>
    (audioFeatures[t.id].speechiness || 0) <= 0.33
  );
  const pool = freshPool.length > 0 ? freshPool
    : fallbackPool.length > 0 ? fallbackPool
    : tracksWithFeatures;

  // Score each track: BPM proximity (also check half/double time)
  const scored = pool.map(t => {
    const feat = audioFeatures[t.id];
    const bpm = feat.tempo;
    const bpmDiffs = [
      Math.abs(bpm - targetBpm),
      Math.abs(bpm * 2 - targetBpm),
      Math.abs(bpm / 2 - targetBpm)
    ];
    const minDiff = Math.min(...bpmDiffs);
    return { track: t, score: minDiff };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0].track;
}

// ---- Spotify Auth (PKCE) ----
async function initiateSpotifyLogin() {
  const verifier = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);
  const state = generateRandomString(16);

  sessionStorage.setItem('pkce_verifier', verifier);
  sessionStorage.setItem('oauth_state', state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const stateParam = params.get('state');
  const error = params.get('error');

  if (error) {
    toast('Spotify login failed: ' + error, 'error');
    history.replaceState({}, '', window.location.pathname);
    return false;
  }

  if (!code) return false;

  const savedState = sessionStorage.getItem('oauth_state');
  if (stateParam !== savedState) {
    toast('State mismatch — possible CSRF attack', 'error');
    return false;
  }

  const verifier = sessionStorage.getItem('pkce_verifier');
  if (!verifier) {
    toast('Code verifier missing', 'error');
    return false;
  }

  // Exchange code for token
  try {
    showLoading('Connecting to Spotify…');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: getRedirectUri(),
        client_id: CLIENT_ID,
        code_verifier: verifier
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error_description || 'Token exchange failed');
    }

    const data = await response.json();
    const expiry = Date.now() + data.expires_in * 1000;

    localStorage.setItem(CACHE_KEY_TOKEN, data.access_token);
    localStorage.setItem(CACHE_KEY_EXPIRY, expiry);
    if (data.refresh_token) {
      localStorage.setItem('bj_refresh_token', data.refresh_token);
    }

    state.accessToken = data.access_token;

    sessionStorage.removeItem('pkce_verifier');
    sessionStorage.removeItem('oauth_state');

    // Clean URL
    history.replaceState({}, '', window.location.pathname);
    return true;
  } catch (err) {
    console.error('Token exchange error:', err);
    toast('Failed to connect Spotify: ' + err.message, 'error');
    hideLoading();
    return false;
  }
}

function loadStoredToken() {
  const token = localStorage.getItem(CACHE_KEY_TOKEN);
  const expiry = localStorage.getItem(CACHE_KEY_EXPIRY);
  if (token && expiry && Date.now() < parseInt(expiry)) {
    state.accessToken = token;
    return true;
  }
  return false;
}

// ---- Spotify API ----
async function spotifyFetch(endpoint, options = {}) {
  if (!state.accessToken) throw new Error('Not authenticated');
  const url = endpoint.startsWith('http') ? endpoint : `https://api.spotify.com/v1${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${state.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    // Token expired
    localStorage.removeItem(CACHE_KEY_TOKEN);
    localStorage.removeItem(CACHE_KEY_EXPIRY);
    state.accessToken = null;
    toast('Spotify session expired. Please reconnect.', 'error');
    showAuthScreen();
    throw new Error('Token expired');
  }

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return spotifyFetch(endpoint, options);
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(err.error?.message || 'API error');
  }

  // Handle 204 No Content (e.g. /me/player when nothing playing, or PUT responses)
  if (response.status === 204) return null;

  return response.json();
}

async function fetchUserProfile() {
  const cached = localStorage.getItem(CACHE_KEY_USER);
  if (cached) {
    state.userProfile = JSON.parse(cached);
    return state.userProfile;
  }
  const profile = await spotifyFetch('/me');
  localStorage.setItem(CACHE_KEY_USER, JSON.stringify(profile));
  state.userProfile = profile;
  return profile;
}

async function fetchSavedTracks() {
  // Check cache
  const cached = localStorage.getItem(CACHE_KEY_TRACKS);
  if (cached) {
    state.savedTracks = JSON.parse(cached);
    return state.savedTracks;
  }

  showLoading('Loading your saved tracks…');
  const tracks = [];
  let url = '/me/tracks?limit=50';
  let fetched = 0;

  while (url && fetched < 200) {
    const data = await spotifyFetch(url);
    for (const item of data.items) {
      if (item.track) {
        tracks.push({
          id: item.track.id,
          name: item.track.name,
          artist: item.track.artists.map(a => a.name).join(', '),
          album: item.track.album.name,
          albumArt: item.track.album.images?.[1]?.url || item.track.album.images?.[0]?.url || null,
          uri: item.track.uri,
          duration_ms: item.track.duration_ms
        });
        fetched++;
        if (fetched >= 200) break;
      }
    }
    url = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
    if (fetched < 200 && url) {
      showLoading(`Loading your saved tracks… (${fetched} found)`);
    }
  }

  state.savedTracks = tracks;
  localStorage.setItem(CACHE_KEY_TRACKS, JSON.stringify(tracks));
  return tracks;
}

async function fetchAudioFeatures(trackIds) {
  // Cache version check — if stale, clear features cache (but not track cache)
  const cachedVersion = localStorage.getItem(CACHE_KEY_FEATURES_VERSION);
  if (cachedVersion !== FEATURES_CACHE_VERSION) {
    localStorage.removeItem(CACHE_KEY_FEATURES);
    localStorage.setItem(CACHE_KEY_FEATURES_VERSION, FEATURES_CACHE_VERSION);
    // Also clear generated playlists so they're rebuilt with fresh dedup logic
    state.generatedPlaylists = {};
  }

  // Check existing cache
  const cached = localStorage.getItem(CACHE_KEY_FEATURES);
  const existing = cached ? JSON.parse(cached) : {};

  // Find which we still need
  const needed = trackIds.filter(id => !existing[id]);
  if (needed.length === 0) {
    state.audioFeatures = existing;
    return existing;
  }

  showLoading(`Fetching audio analysis for ${needed.length} tracks…`);
  const batches = [];
  for (let i = 0; i < needed.length; i += 100) {
    batches.push(needed.slice(i, i + 100));
  }

  for (let b = 0; b < batches.length; b++) {
    showLoading(`Analyzing tracks… (batch ${b + 1}/${batches.length})`);
    try {
      const data = await spotifyFetch(`/audio-features?ids=${batches[b].join(',')}`);
      for (const feat of (data.audio_features || [])) {
        if (feat) {
          existing[feat.id] = {
            tempo: feat.tempo,
            energy: feat.energy,
            valence: feat.valence,
            danceability: feat.danceability,
            loudness: feat.loudness,
            instrumentalness: feat.instrumentalness,
            speechiness: feat.speechiness,
            acousticness: feat.acousticness
          };
        }
      }
    } catch (err) {
      console.warn('Audio features batch failed:', err);
    }
    // Small delay between batches to avoid rate limiting
    if (b < batches.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  localStorage.setItem(CACHE_KEY_FEATURES, JSON.stringify(existing));
  state.audioFeatures = existing;
  return existing;
}

async function createSpotifyPlaylist(stageName, trackUris) {
  if (!state.userProfile) throw new Error('User profile not loaded');

  const playlist = await spotifyFetch(`/users/${state.userProfile.id}/playlists`, {
    method: 'POST',
    body: JSON.stringify({
      name: `🚴 Bike Jockey — TDF Stage ${stageName}`,
      description: 'Generated by Bike Jockey — TDF stage spinning playlist',
      public: false
    })
  });

  // Add tracks in batches of 100
  for (let i = 0; i < trackUris.length; i += 100) {
    await spotifyFetch(`/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: trackUris.slice(i, i + 100) })
    });
  }

  return playlist;
}

// ---- Elevation Chart ----
let elevationChart = null;
// Active segment km midpoint for the vertical marker
let elevationChartActiveKm = null;
// Profile km max for x-axis mapping
let elevationChartMaxKm = 0;

function updateElevationMarker(kmMid) {
  elevationChartActiveKm = kmMid;
  if (elevationChart) elevationChart.update('none');
}

function renderElevationChart(stage, segments) {
  const canvas = document.getElementById('elevation-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (elevationChart) {
    elevationChart.destroy();
    elevationChart = null;
  }

  elevationChartActiveKm = null;
  elevationChartMaxKm = stage.profile[stage.profile.length - 1][0];

  const labels = stage.profile.map(p => `${p[0]}km`);
  const elevData = stage.profile.map(p => p[1]);

  // afterDraw plugin: vertical segment marker
  const segmentMarkerPlugin = {
    id: 'segmentMarker',
    afterDraw(chart) {
      if (elevationChartActiveKm == null) return;
      const { ctx: c, chartArea, scales } = chart;
      if (!chartArea) return;

      // Map km to pixel x: x-axis is label-based (index), so compute fractional index
      const profileKms = stage.profile.map(p => p[0]);
      const maxKm = profileKms[profileKms.length - 1];
      const minKm = profileKms[0];
      const fraction = (elevationChartActiveKm - minKm) / (maxKm - minKm);
      const xPx = chartArea.left + fraction * (chartArea.right - chartArea.left);

      c.save();
      c.beginPath();
      c.moveTo(xPx, chartArea.top);
      c.lineTo(xPx, chartArea.bottom);
      c.strokeStyle = '#ff6b2b';
      c.lineWidth = 2;
      c.setLineDash([4, 3]);
      c.stroke();
      c.setLineDash([]);

      // Label
      const seg = segments && segments[state.activeSegmentIndex];
      const label = seg ? `S${seg.index + 1}` : '';
      if (label) {
        c.font = '700 11px Inter, sans-serif';
        c.fillStyle = '#ff6b2b';
        c.textAlign = 'center';
        c.fillText(label, xPx, chartArea.top - 4);
      }
      c.restore();
    }
  };

  elevationChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Elevation (m)',
        data: elevData,
        borderColor: '#ff6b2b',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'rgba(255, 107, 43, 0.2)';
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(255, 107, 43, 0.4)');
          gradient.addColorStop(1, 'rgba(255, 107, 43, 0.02)');
          return gradient;
        },
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#ff6b2b',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e1e28',
          borderColor: '#2a2a3a',
          borderWidth: 1,
          titleColor: '#f0f0f8',
          bodyColor: '#9090b0',
          padding: 10,
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => ` ${Math.round(item.parsed.y)}m elevation`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)', drawTicks: false },
          ticks: {
            color: '#5a5a78',
            maxTicksLimit: 10,
            maxRotation: 0,
            font: { size: 11, family: 'Inter' }
          },
          border: { display: false }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)', drawTicks: false },
          ticks: {
            color: '#5a5a78',
            callback: v => `${v}m`,
            font: { size: 11, family: 'Inter' }
          },
          border: { display: false }
        }
      }
    },
    plugins: [segmentMarkerPlugin]
  });
}

// ---- Donut Chart ----
let donutChart = null;

function renderDonutChart(segments) {
  const canvas = document.getElementById('donut-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (donutChart) {
    donutChart.destroy();
    donutChart = null;
  }

  // Count time in each zone
  const zoneTimes = [0, 0, 0, 0, 0];
  for (const seg of segments) {
    if (seg.zone >= 1 && seg.zone <= 5) {
      zoneTimes[seg.zone - 1] += seg.duration;
    }
  }

  const total = zoneTimes.reduce((a, b) => a + b, 0);
  const zonePcts = zoneTimes.map(t => total > 0 ? Math.round((t / total) * 100) : 0);

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Z1 Recovery', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO2max'],
      datasets: [{
        data: zonePcts,
        backgroundColor: [
          '#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'
        ],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e1e28',
          borderColor: '#2a2a3a',
          borderWidth: 1,
          titleColor: '#f0f0f8',
          bodyColor: '#9090b0',
          callbacks: {
            label: (item) => ` ${item.label}: ${item.raw}%`
          }
        }
      }
    }
  });

  // Update legend
  const legend = document.getElementById('zone-legend');
  if (legend) {
    const zoneNames = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2max'];
    const zoneColors = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'];
    legend.innerHTML = zoneNames.map((name, i) => `
      <div class="zone-legend-item">
        <div class="zone-dot-sm" style="background:${zoneColors[i]}"></div>
        <span style="color:var(--text-secondary)">Z${i+1} ${name}</span>
        <span class="zone-legend-pct" style="color:${zoneColors[i]}">${zonePcts[i]}%</span>
      </div>
    `).join('');
  }

  return zonePcts;
}

// ---- Mini Profile Chart (for stage cards) ----
function renderMiniProfile(canvasId, profile) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = profile.map(p => p[0]);
  const data = profile.map(p => p[1]);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#ff6b2b',
        borderWidth: 1.5,
        tension: 0.4,
        fill: true,
        backgroundColor: 'rgba(255, 107, 43, 0.15)',
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      animation: false
    }
  });
}

// ---- UI Rendering ----
function renderStageGrid() {
  const grid = document.getElementById('stage-grid');
  if (!grid) return;

  grid.innerHTML = state.stages.map((stage, idx) => `
    <div class="stage-card" data-stage-id="${stage.id}" data-type="${stage.type}" onclick="selectStage(${stage.id})">
      <div class="stage-card-header">
        <span class="stage-number">Stage ${stage.number}</span>
        <span class="stage-type-badge badge-${stage.type}">
          ${stage.typeIcon} ${stage.typeLabel}
        </span>
      </div>
      <div class="stage-mini-profile">
        <canvas id="mini-profile-${stage.id}" width="260" height="40"></canvas>
      </div>
      <div class="stage-card-name">${stage.name}</div>
      <div class="stage-card-route">📍 ${stage.start} → ${stage.finish}</div>
      <div class="stage-card-stats">
        <div class="stat-item">
          <span class="stat-value text-accent">${stage.distance}</span>
          <span class="stat-label">km</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${(stage.elevationGain / 1000).toFixed(1)}k</span>
          <span class="stat-label">elev +m</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${stage.date.split(' ')[1]}</span>
          <span class="stat-label">${stage.date.split(' ')[0]}</span>
        </div>
      </div>
    </div>
  `).join('');

  // Render mini profiles after DOM is updated
  requestAnimationFrame(() => {
    state.stages.forEach(stage => {
      renderMiniProfile(`mini-profile-${stage.id}`, stage.profile);
    });
  });
}

function renderSegmentsList(segments) {
  const list = document.getElementById('segments-list');
  if (!list) return;

  if (!segments || segments.length === 0) {
    list.innerHTML = `
      <div class="no-tracks-msg">
        <div class="icon">🎵</div>
        <p>Connect Spotify and load your library to generate a playlist for this stage.</p>
      </div>`;
    return;
  }

  // Pre-compute cumulative start times
  let cumSec = 0;
  const cumTimes = segments.map(seg => {
    const start = cumSec;
    cumSec += seg.duration;
    return start;
  });

  list.innerHTML = segments.map((seg, i) => `
    <div class="segment-item z${seg.zone} ${state.activeSegmentIndex === i ? 'active' : ''}"
         onclick="selectSegment(${i})"
         id="segment-${i}">
      <div class="segment-number">${i + 1}</div>
      <div class="segment-track-info">
        <div class="segment-track-name">${escapeHtml(seg.trackName)}</div>
        <div class="segment-track-artist">${escapeHtml(seg.trackArtist)}</div>
        <div class="segment-meta-row">
          <span class="meta-chip chip-bpm">♩ ${seg.actualBpm} BPM</span>
          <span class="meta-chip chip-duration" title="Song duration">⏱ ${formatDuration(seg.duration)}</span>
          <span class="meta-chip chip-cumtime" title="Cumulative time">🕐 ${formatDuration(cumTimes[i])}</span>
          <span class="meta-chip chip-intensity" style="color:${zoneToColor(seg.zone)}">${escapeHtml(seg.descriptor)}</span>
        </div>
      </div>
      <div class="segment-zone-col">
        <div class="segment-metrics">
          <span class="seg-rpe" style="color:${zoneToColor(seg.zone)}">${seg.rpe}</span>
          <span class="seg-rpe-label">RPE</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderNowPlaying(segment) {
  const container = document.getElementById('now-playing');
  if (!container) return;

  if (!segment || !segment.trackName || segment.trackName === 'No match found') {
    container.innerHTML = `
      <div class="now-playing-bar">
        <div class="track-art">🎵</div>
        <div class="track-info">
          <div class="track-name text-muted">No track selected</div>
          <div class="track-artist">Connect Spotify to get started</div>
        </div>
      </div>`;
    return;
  }

  const zone = segment.zone;
  const zoneColor = zoneToColor(zone);

  container.innerHTML = `
    <div class="now-playing-bar">
      <div class="track-art">
        ${segment.trackAlbumArt
          ? `<img src="${segment.trackAlbumArt}" alt="album art" loading="lazy">`
          : '🎵'}
      </div>
      <div class="track-info">
        <div class="track-name">${escapeHtml(segment.trackName)}</div>
        <div class="track-artist">${escapeHtml(segment.trackArtist)}</div>
        <div class="track-bpm-badge">♩ ${segment.actualBpm} BPM</div>
      </div>
      <div style="flex:1"></div>
      <div class="zone-indicator">
        <div class="zone-dot" style="background:${zoneColor}20; color:${zoneColor}; border: 2px solid ${zoneColor}">
          Z${zone}
        </div>
        <span class="zone-label">${zoneLabel(zone)}</span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
      <div style="background:var(--bg-elevated);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">💓 HR Zone</div>
        <div style="font-size:14px;font-weight:700;color:${zoneColor}">${segment.hrZone}</div>
      </div>
      <div style="background:var(--bg-elevated);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">⚡ Power</div>
        <div style="font-size:13px;font-weight:700;color:${zoneColor}">${segment.powerZone}</div>
      </div>
      <div style="background:var(--bg-elevated);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">📈 Energy</div>
        <div style="font-size:14px;font-weight:700;color:${zoneColor}">${Math.round(segment.energy * 100)}%</div>
      </div>
    </div>
    <div style="margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:8px">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Instructor Cue</div>
      <div style="font-size:15px;font-weight:600;color:${zoneColor}">😤 ${escapeHtml(segment.descriptor)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
        km ${segment.km}–${segment.kmEnd} · ${Math.round(segment.elevation)}m · RPE ${segment.rpe}/10 · ${formatDuration(segment.duration)}
      </div>
    </div>
  `;
}

function renderSidebarMetrics(stage, segments) {
  if (!segments || segments.length === 0) return;

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const avgBpm = Math.round(segments.reduce((sum, s) => sum + s.actualBpm, 0) / segments.length);
  const calories = Math.round(totalDuration / 60 * 8.5); // approx 8.5 cal/min for spinning

  const durationEl = document.getElementById('metric-duration');
  const elevationEl = document.getElementById('metric-elevation');
  const bpmEl = document.getElementById('metric-bpm');
  const caloriesEl = document.getElementById('metric-calories');

  if (durationEl) durationEl.textContent = formatMinutes(totalDuration / 60);
  if (elevationEl) elevationEl.textContent = `+${stage.elevationGain.toLocaleString()}m`;
  if (bpmEl) bpmEl.textContent = avgBpm;
  if (caloriesEl) caloriesEl.textContent = `~${calories} kcal`;

  // Update stage meta
  const dateEl = document.getElementById('view-stage-date');
  const distEl = document.getElementById('view-stage-distance');
  if (dateEl) dateEl.textContent = stage.date;
  if (distEl) distEl.textContent = `${stage.distance}km · ${stage.elevationGain.toLocaleString()}m`;
}

function selectSegment(index) {
  state.activeSegmentIndex = index;
  const segments = state.generatedPlaylists[state.activeStage?.id];
  if (!segments) return;

  // Update active state in list
  document.querySelectorAll('.segment-item').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });

  // Scroll into view
  const el = document.getElementById(`segment-${index}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Update now playing
  renderNowPlaying(segments[index]);

  // Update elevation chart marker — use km midpoint of the segment
  const seg = segments[index];
  if (seg && seg.km != null && seg.kmEnd != null) {
    const kmMid = (seg.km + seg.kmEnd) / 2;
    updateElevationMarker(kmMid);
  }
}

async function selectStage(stageId) {
  const stage = state.stages.find(s => s.id === stageId);
  if (!stage) return;

  state.activeStage = stage;
  state.activeSegmentIndex = 0;

  // Update stage grid selection
  document.querySelectorAll('.stage-card').forEach(card => {
    card.classList.toggle('active', parseInt(card.dataset.stageId) === stageId);
  });

  // Show stage view
  document.getElementById('stage-selector').style.display = 'none';
  const stageView = document.getElementById('stage-view');
  stageView.classList.add('visible');

  // Update header
  const titleEl = document.getElementById('stage-view-title');
  const metaEl = document.getElementById('stage-view-meta');
  if (titleEl) titleEl.textContent = `Stage ${stage.number}: ${stage.name}`;
  if (metaEl) metaEl.textContent = `${stage.start} → ${stage.finish} · ${stage.distance}km`;

  // Generate or load cached playlist
  let segments = state.generatedPlaylists[stageId];
  if (!segments && state.savedTracks.length > 0) {
    // Collect all track IDs already used across every other generated playlist
    const globalUsedIds = Object.values(state.generatedPlaylists)
      .flat()
      .map(s => s.trackId)
      .filter(Boolean);
    segments = generateSegments(stage, state.savedTracks, state.audioFeatures, globalUsedIds);
    state.generatedPlaylists[stageId] = segments;
  }

  // Render chart
  renderElevationChart(stage, segments || []);

  // Render playlist
  renderSegmentsList(segments);

  // Render now playing
  renderNowPlaying(segments?.[0] || null);

  // Initialize elevation marker to first segment
  if (segments && segments[0] && segments[0].km != null) {
    const kmMid = (segments[0].km + segments[0].kmEnd) / 2;
    updateElevationMarker(kmMid);
  }

  // Render sidebar metrics
  if (segments) {
    renderSidebarMetrics(stage, segments);
    renderDonutChart(segments);
  }
}

function goBackToSelector() {
  document.getElementById('stage-view').classList.remove('visible');
  document.getElementById('stage-selector').style.display = '';
}

async function pushPlaylistToSpotify() {
  const stage = state.activeStage;
  const segments = state.generatedPlaylists[stage?.id];
  if (!stage || !segments) return;

  const trackUris = segments
    .filter(s => s.trackUri)
    .map(s => s.trackUri);

  if (trackUris.length === 0) {
    toast('No tracks to push — connect Spotify first', 'error');
    return;
  }

  try {
    showLoading('Creating Spotify playlist…');
    const playlist = await createSpotifyPlaylist(`Stage ${stage.number}`, trackUris);
    hideLoading();
    toast(`Playlist created: "${playlist.name}"`, 'success');
  } catch (err) {
    hideLoading();
    toast('Failed to create playlist: ' + err.message, 'error');
  }
}

// ---- Spotify Playback API ----
async function fetchAvailableDevices() {
  const data = await spotifyFetch('/me/player/devices');
  state.availableDevices = (data.devices || []).map(d => ({
    id: d.id,
    name: d.name,
    type: d.type,
    is_active: d.is_active
  }));
  return state.availableDevices;
}

async function transferPlayback(deviceId) {
  await spotifyFetch('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play: false })
  });
}

async function playPlaylist(trackUris, deviceId) {
  const body = { uris: trackUris };
  const endpoint = deviceId
    ? `/me/player/play?device_id=${deviceId}`
    : '/me/player/play';
  await spotifyFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

async function pausePlayback() {
  await spotifyFetch('/me/player/pause', { method: 'PUT' });
}

async function resumePlayback() {
  await spotifyFetch('/me/player/play', { method: 'PUT' });
}

async function skipToNext() {
  await spotifyFetch('/me/player/next', { method: 'POST' });
}

async function skipToPrevious() {
  await spotifyFetch('/me/player/previous', { method: 'POST' });
}

async function seekToPosition(positionMs) {
  await spotifyFetch(`/me/player/seek?position_ms=${positionMs}`, { method: 'PUT' });
}

async function fetchCurrentPlayback() {
  try {
    const data = await spotifyFetch('/me/player');
    if (!data || !data.item) {
      state.playbackState = null;
      return null;
    }
    state.playbackState = {
      isPlaying: data.is_playing,
      trackId: data.item.id,
      trackName: data.item.name,
      trackArtist: data.item.artists?.map(a => a.name).join(', ') || '—',
      trackAlbumArt: data.item.album?.images?.[1]?.url || data.item.album?.images?.[0]?.url || null,
      progressMs: data.progress_ms || 0,
      durationMs: data.item.duration_ms || 0,
      deviceName: data.device?.name || '—',
      deviceType: data.device?.type || 'Unknown'
    };
    return state.playbackState;
  } catch (err) {
    // 204 No Content or other non-JSON → nothing playing
    state.playbackState = null;
    return null;
  }
}

function startPlaybackPolling() {
  stopPlaybackPolling();
  state.playbackPolling = setInterval(async () => {
    await fetchCurrentPlayback();
    renderPlayerWidget();
    syncActiveSegment();
  }, 2500);
}

function stopPlaybackPolling() {
  if (state.playbackPolling) {
    clearInterval(state.playbackPolling);
    state.playbackPolling = null;
  }
}

function syncActiveSegment() {
  if (!state.isBikeJockeyPlayback || !state.playbackState) return;
  const segments = state.generatedPlaylists[state.activeStage?.id];
  if (!segments) return;
  const currentTrackId = state.playbackState.trackId;
  const idx = segments.findIndex(s => s.trackId === currentTrackId);
  if (idx >= 0 && idx !== state.activeSegmentIndex) {
    selectSegment(idx);
  }
}

// ---- Player Widget ----
function renderPlayerWidget() {
  const bar = document.getElementById('player-bar');
  if (!bar) return;
  const pb = state.playbackState;
  if (!pb) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');

  const nameEl = document.getElementById('player-track-name');
  const artistEl = document.getElementById('player-track-artist');
  const artEl = document.getElementById('player-album-art');
  const btnPP = document.getElementById('btn-play-pause');
  const progressFill = document.getElementById('player-progress-fill');
  const progressTime = document.getElementById('player-progress-time');
  const durationTime = document.getElementById('player-duration-time');
  const deviceEl = document.getElementById('player-device-name');

  if (nameEl) nameEl.textContent = pb.trackName;
  if (artistEl) artistEl.textContent = pb.trackArtist;
  if (artEl) {
    if (pb.trackAlbumArt) {
      artEl.src = pb.trackAlbumArt;
      artEl.style.display = '';
    } else {
      artEl.style.display = 'none';
    }
  }
  if (btnPP) btnPP.textContent = pb.isPlaying ? '⏸' : '▶';
  if (progressFill && pb.durationMs > 0) {
    const pct = Math.min(100, (pb.progressMs / pb.durationMs) * 100);
    progressFill.style.width = pct + '%';
  }
  if (progressTime) progressTime.textContent = formatDuration(pb.progressMs / 1000);
  if (durationTime) durationTime.textContent = formatDuration(pb.durationMs / 1000);
  if (deviceEl) deviceEl.textContent = `${pb.deviceName} (${pb.deviceType})`;
}

function getActivePlaylistUris() {
  const segments = state.generatedPlaylists[state.activeStage?.id] || [];
  return segments.filter(s => s.trackUri && !s.isPlaceholder).map(s => s.trackUri);
}

async function handlePlayStage() {
  const segments = state.generatedPlaylists[state.activeStage?.id];
  if (!segments) { toast('Generate a playlist first', 'error'); return; }
  const uris = getActivePlaylistUris();
  if (uris.length === 0) { toast('No tracks to play — connect Spotify', 'error'); return; }

  try {
    await fetchAvailableDevices();
  } catch (err) {
    toast('Could not fetch devices: ' + err.message, 'error');
    return;
  }
  const devices = state.availableDevices;

  if (devices.length === 0) {
    toast('No active Spotify devices found. Open Spotify on any device first.', 'error');
    return;
  }

  if (devices.length === 1) {
    await playOnDevice(devices[0].id, uris);
  } else {
    renderDevicePicker(devices);
    const picker = document.getElementById('device-picker');
    if (picker) picker.classList.toggle('hidden');
  }
}

async function playOnDevice(deviceId, uris) {
  state.activeDeviceId = deviceId;
  state.isBikeJockeyPlayback = true;
  try {
    await playPlaylist(uris, deviceId);
    startPlaybackPolling();
    toast('▶ Playing on Spotify', 'success');
    const picker = document.getElementById('device-picker');
    if (picker) picker.classList.add('hidden');
  } catch (err) {
    toast('Playback failed: ' + err.message, 'error');
    state.isBikeJockeyPlayback = false;
  }
}

function renderDevicePicker(devices) {
  const list = document.getElementById('device-list');
  if (!list) return;
  list.innerHTML = devices.map(d => {
    const icon = d.type === 'Smartphone' ? '📱' : d.type === 'Computer' ? '💻' : '🔊';
    return `
      <div class="device-item" onclick="playOnDevice('${d.id}', getActivePlaylistUris())">
        <span class="device-icon">${icon}</span>
        <span class="device-name">${escapeHtml(d.name)}</span>
        ${d.is_active ? '<span class="device-active">active</span>' : ''}
      </div>`;
  }).join('');
}

async function togglePlayPause() {
  if (!state.playbackState) return;
  try {
    if (state.playbackState.isPlaying) {
      await pausePlayback();
      state.playbackState.isPlaying = false;
    } else {
      await resumePlayback();
      state.playbackState.isPlaying = true;
    }
    renderPlayerWidget();
  } catch (err) {
    toast('Playback control failed: ' + err.message, 'error');
  }
}

function handleProgressClick(event) {
  if (!state.playbackState) return;
  const bar = event.currentTarget;
  const rect = bar.getBoundingClientRect();
  const pct = (event.clientX - rect.left) / rect.width;
  const posMs = Math.floor(pct * state.playbackState.durationMs);
  seekToPosition(posMs);
}

// ---- PDF Export ----
function exportToPDF() {
  const stage = state.activeStage;
  const segments = state.generatedPlaylists[stage?.id];
  if (!stage || !segments) {
    toast('No playlist generated yet', 'error');
    return;
  }

  const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

  const rows = segments.map((seg, i) => {
    const isBreak = seg.isBreak;
    const isAerzte = seg.isDieAerzte;
    const rowStyle = isBreak ? 'background:#f5f5f5;' : isAerzte ? 'border-left:3px solid #C2185B;' : '';
    const descCol = isBreak ? '💤 Break' : escapeHtml(seg.descriptor);
    return `<tr style="${rowStyle}">
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #ddd">${escapeHtml(seg.trackName)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd">${escapeHtml(seg.trackArtist)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${seg.actualBpm}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">Z${seg.zone}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${formatDuration(seg.duration)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd">${descCol}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${isBreak ? '✓' : ''}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Bike Jockey — Stage ${stage.number}</title>
<style>
  @media print { body { font-size: 11pt; } table { width: 100%; border-collapse: collapse; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #222; max-width: 900px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 20pt; margin-bottom: 4px; }
  .meta { color: #666; font-size: 11pt; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #333; color: #fff; padding: 8px; font-size: 10pt; text-align: left; }
  td { font-size: 10pt; }
  .footer { margin-top: 24px; font-size: 9pt; color: #999; text-align: center; border-top: 1px solid #ddd; padding-top: 12px; }
</style>
</head><body>
<h1>🚴 Bike Jockey — Stage ${stage.number}: ${escapeHtml(stage.name)}</h1>
<div class="meta">${today} · ${escapeHtml(stage.start)} → ${escapeHtml(stage.finish)} · ${stage.distance}km · +${stage.elevationGain.toLocaleString()}m</div>
<table>
  <thead><tr>
    <th>#</th><th>Track</th><th>Artist</th><th>BPM</th><th>Zone</th><th>Duration</th><th>Descriptor</th><th>Break?</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Generated by Bike Jockey · simoncharmms.github.io/bike-jockey</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

  const printWin = window.open('', '_blank');
  printWin.document.write(html);
  printWin.document.close();
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY_TRACKS);
  localStorage.removeItem(CACHE_KEY_FEATURES);
  localStorage.removeItem(CACHE_KEY_USER);
  state.savedTracks = [];
  state.audioFeatures = {};
  state.generatedPlaylists = {};
  toast('Cache cleared. Reload to re-fetch.', 'info');
}

function showAuthScreen() {
  stopPlaybackPolling();
  state.isBikeJockeyPlayback = false;
  document.getElementById('auth-screen').style.display = '';
  document.getElementById('main-app').classList.remove('visible');
}

function showMainApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('main-app').classList.add('visible');
}

function updateSpotifyStatus() {
  const dot = document.getElementById('spotify-dot');
  const label = document.getElementById('spotify-label');
  const btn = document.getElementById('btn-spotify-connect');
  const userLabel = document.getElementById('user-label');

  if (state.accessToken) {
    if (dot) { dot.classList.add('connected'); }
    if (label) label.textContent = 'Spotify Connected';
    if (btn) btn.style.display = 'none';
    if (userLabel && state.userProfile) {
      userLabel.textContent = state.userProfile.display_name || state.userProfile.id;
      userLabel.style.display = '';
    }
  } else {
    if (dot) dot.classList.remove('connected');
    if (label) label.textContent = 'Not Connected';
    if (btn) btn.style.display = '';
    if (userLabel) userLabel.style.display = 'none';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Demo Mode (no Spotify) ----
function generateDemoTracks() {
  const demoNames = [
    ['Power', 'Imagine Dragons'], ['Thunderstruck', 'AC/DC'],
    ['Eye of the Tiger', 'Survivor'], ['Can\'t Stop the Feeling', 'Justin Timberlake'],
    ['Levels', 'Avicii'], ['Stronger', 'Kanye West'],
    ['Jump Around', 'House of Pain'], ['Mr. Brightside', 'The Killers'],
    ['Take Me to Church', 'Hozier'], ['Blinding Lights', 'The Weeknd'],
    ['Lose Yourself', 'Eminem'], ['Freed from Desire', 'Gala'],
    ['Seven Nation Army', 'The White Stripes'], ['Don\'t Stop Me Now', 'Queen'],
    ['Bohemian Rhapsody', 'Queen'], ['We Will Rock You', 'Queen'],
    ['Harder, Better, Faster', 'Daft Punk'], ['One More Time', 'Daft Punk'],
    ['Get Lucky', 'Daft Punk'], ['Around the World', 'Daft Punk'],
    ['Run Boy Run', 'Woodkid'], ['Iron', 'Woodkid'],
    ['Uprising', 'Muse'], ['Knights of Cydonia', 'Muse'],
    ['Supermassive Black Hole', 'Muse'], ['Hysteria', 'Muse'],
    ['Radioactive', 'Imagine Dragons'], ['Believer', 'Imagine Dragons'],
    ['Till I Collapse', 'Eminem'], ['Not Afraid', 'Eminem'],
    ['Willow (Instrumental)', 'Vitamin String Quartet'],
    ['Blinding Lights (Instrumental)', 'Instrumental Covers']
  ];

  const bpmMap = {
    'Power': 114, 'Thunderstruck': 136, 'Eye of the Tiger': 109,
    'Can\'t Stop the Feeling': 113, 'Levels': 126, 'Stronger': 104,
    'Jump Around': 92, 'Mr. Brightside': 148, 'Take Me to Church': 72,
    'Blinding Lights': 171, 'Lose Yourself': 85, 'Freed from Desire': 136,
    'Seven Nation Army': 124, 'Don\'t Stop Me Now': 156, 'Bohemian Rhapsody': 72,
    'We Will Rock You': 82, 'Harder, Better, Faster': 122, 'One More Time': 126,
    'Get Lucky': 116, 'Around the World': 121, 'Run Boy Run': 105,
    'Iron': 68, 'Uprising': 128, 'Knights of Cydonia': 136,
    'Supermassive Black Hole': 130, 'Hysteria': 132, 'Radioactive': 93,
    'Believer': 125, 'Till I Collapse': 171, 'Not Afraid': 170,
    'Willow (Instrumental)': 96, 'Blinding Lights (Instrumental)': 171
  };

  // Per-track acoustic feature overrides for realism
  const featureOverrides = {
    'Thunderstruck':              { speechiness: 0.08, instrumentalness: 0.0,  acousticness: 0.05 },
    'Lose Yourself':              { speechiness: 0.08, instrumentalness: 0.0,  acousticness: 0.05 },
    'Not Afraid':                 { speechiness: 0.08, instrumentalness: 0.0,  acousticness: 0.05 },
    'Till I Collapse':            { speechiness: 0.08, instrumentalness: 0.0,  acousticness: 0.05 },
    'Uprising':                   { speechiness: 0.08, instrumentalness: 0.0,  acousticness: 0.05 },
    'Knights of Cydonia':         { speechiness: 0.08, instrumentalness: 0.0,  acousticness: 0.05 },
    'Hysteria':                   { speechiness: 0.08, instrumentalness: 0.0,  acousticness: 0.05 },
    'Take Me to Church':          { speechiness: 0.04, instrumentalness: 0.01, acousticness: 0.25 },
    'Iron':                       { speechiness: 0.04, instrumentalness: 0.01, acousticness: 0.25 },
    'Bohemian Rhapsody':          { speechiness: 0.04, instrumentalness: 0.01, acousticness: 0.25 },
    'Run Boy Run':                { speechiness: 0.04, instrumentalness: 0.01, acousticness: 0.25 },
    'Willow (Instrumental)':      { speechiness: 0.02, instrumentalness: 0.85, acousticness: 0.6  },
    'Blinding Lights (Instrumental)': { speechiness: 0.02, instrumentalness: 0.85, acousticness: 0.1 }
  };

  const tracks = demoNames.map(([name, artist], i) => ({
    id: `demo_${i}`,
    name,
    artist,
    album: 'Demo Library',
    albumArt: null,
    uri: `spotify:track:demo_${i}`,
    duration_ms: 210000
  }));

  const features = {};
  tracks.forEach(t => {
    const bpm = bpmMap[t.name] || (80 + Math.random() * 100);
    const overrides = featureOverrides[t.name] || {};
    const isInstrumentalTrack = (overrides.instrumentalness || 0) >= 0.5;
    features[t.id] = {
      tempo: bpm,
      energy: isInstrumentalTrack ? 0.3 : (0.4 + Math.random() * 0.6),
      valence: 0.3 + Math.random() * 0.7,
      danceability: 0.4 + Math.random() * 0.6,
      loudness: -8 + Math.random() * 6,
      speechiness: overrides.speechiness ?? 0.06,
      instrumentalness: overrides.instrumentalness ?? 0.0,
      acousticness: overrides.acousticness ?? 0.1
    };
  });

  return { tracks, features };
}

function enableDemoMode() {
  const { tracks, features } = generateDemoTracks();
  state.savedTracks = tracks;
  state.audioFeatures = features;
  toast('Demo mode: using built-in track library 🎵', 'info');
  renderStageGrid();
  showMainApp();
  hideLoading();
}

// ---- App Init ----
async function init() {
  // Check for OAuth callback
  const isCallback = window.location.search.includes('code=');

  if (isCallback) {
    showLoading('Completing Spotify login…');
    const success = await handleCallback();
    if (!success) {
      hideLoading();
      showAuthScreen();
      return;
    }
  }

  // Check stored token
  if (!state.accessToken) {
    loadStoredToken();
  }

  if (state.accessToken) {
    showLoading('Loading your music library…');
    try {
      await fetchUserProfile();
      await fetchSavedTracks();
      const trackIds = state.savedTracks.map(t => t.id);
      await fetchAudioFeatures(trackIds);

      state.spotifyConnected = true;
      showMainApp();
      renderStageGrid();
      updateSpotifyStatus();
      startPlaybackPolling();
      hideLoading();
      toast(`Welcome back! ${state.savedTracks.length} tracks loaded.`, 'success');
    } catch (err) {
      console.error('Init error:', err);
      hideLoading();
      // If token issues, show auth. Otherwise show app in demo mode.
      if (!state.accessToken) {
        showAuthScreen();
      } else {
        enableDemoMode();
      }
    }
  } else {
    hideLoading();
    showAuthScreen();
  }
}

// ---- Event Bindings ----
document.addEventListener('DOMContentLoaded', () => {
  init();

  // Auth screen connect button
  const authBtn = document.getElementById('btn-auth-spotify');
  if (authBtn) authBtn.addEventListener('click', initiateSpotifyLogin);

  // Demo mode button
  const demoBtn = document.getElementById('btn-demo-mode');
  if (demoBtn) demoBtn.addEventListener('click', enableDemoMode);

  // Header connect button
  const headerConnectBtn = document.getElementById('btn-spotify-connect');
  if (headerConnectBtn) headerConnectBtn.addEventListener('click', initiateSpotifyLogin);

  // Back button
  const backBtn = document.getElementById('btn-back');
  if (backBtn) backBtn.addEventListener('click', goBackToSelector);

  // Push playlist
  const pushBtn = document.getElementById('btn-push-playlist');
  if (pushBtn) pushBtn.addEventListener('click', pushPlaylistToSpotify);

  // Clear cache
  const clearBtn = document.getElementById('btn-clear-cache');
  if (clearBtn) clearBtn.addEventListener('click', clearCache);
});
