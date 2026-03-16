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
  'user-read-private'
].join(' ');

const CACHE_KEY_TRACKS = 'bj_saved_tracks';
const CACHE_KEY_FEATURES = 'bj_audio_features';
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
  spotifyConnected: false
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
function generateSegments(stage, tracks, audioFeatures) {
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

    // Pick best matching track
    const track = findBestTrack(targetBpm, tracks, audioFeatures, segments.map(s => s.trackId));

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

  return segments;
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

  // Try BPM matching first (prefer fresh tracks, allow some reuse)
  const tracksWithFeatures = tracks.filter(t => audioFeatures[t.id]);
  if (tracksWithFeatures.length === 0) return tracks[Math.floor(Math.random() * tracks.length)];

  // Score each track: BPM proximity + avoid recently used
  const scored = tracksWithFeatures.map(t => {
    const feat = audioFeatures[t.id];
    const bpm = feat.tempo;
    // Consider both original tempo and half/double time
    const bpmDiffs = [
      Math.abs(bpm - targetBpm),
      Math.abs(bpm * 2 - targetBpm),
      Math.abs(bpm / 2 - targetBpm)
    ];
    const minDiff = Math.min(...bpmDiffs);
    const penalty = usedIds.slice(-4).includes(t.id) ? 40 : 0;
    return { track: t, score: minDiff + penalty };
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
            loudness: feat.loudness
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

function renderElevationChart(stage, segments) {
  const canvas = document.getElementById('elevation-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (elevationChart) {
    elevationChart.destroy();
    elevationChart = null;
  }

  const labels = stage.profile.map(p => `${p[0]}km`);
  const elevData = stage.profile.map(p => p[1]);

  // Build gradient colors for the fill based on zones
  const minElev = Math.min(...elevData);
  const maxElev = Math.max(...elevData);

  // Calculate segment boundaries for background annotation
  const segmentColors = segments.map(seg => ({
    xStart: seg.km,
    xEnd: seg.kmEnd,
    color: zoneToColor(seg.zone)
  }));

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
    }
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
          <span class="meta-chip chip-duration">⏱ ${formatDuration(seg.duration)}</span>
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
    segments = generateSegments(stage, state.savedTracks, state.audioFeatures);
    state.generatedPlaylists[stageId] = segments;
  }

  // Render chart
  renderElevationChart(stage, segments || []);

  // Render playlist
  renderSegmentsList(segments);

  // Render now playing
  renderNowPlaying(segments?.[0] || null);

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
    ['Till I Collapse', 'Eminem'], ['Not Afraid', 'Eminem']
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
    'Believer': 125, 'Till I Collapse': 171, 'Not Afraid': 170
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
    features[t.id] = {
      tempo: bpm,
      energy: 0.4 + Math.random() * 0.6,
      valence: 0.3 + Math.random() * 0.7,
      danceability: 0.4 + Math.random() * 0.6,
      loudness: -8 + Math.random() * 6
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
