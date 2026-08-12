/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — API & DATA COMMUNICATIONS ENGINE
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── 07. Enrichment Pipeline with LocalStorage Cache ──────────────────────── */
const _enrichQueue = [];
let _enrichActiveWorkers = 0;
const MAX_ENRICH_CONCURRENCY = 2;

async function enrich(channelId, forceRefresh = false) {
  const ch = all.find(c => c.id === channelId);
  if (!ch) return null;

  const now = Date.now();
  const storageKey = 'yt_enrich_' + channelId;

  if (!forceRefresh && _enrichCache[channelId] && (now - _enrichCache[channelId].ts) < ENRICH_TTL) {
    return _enrichCache[channelId];
  }

  if (!forceRefresh) {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (stored && (now - stored.ts) < ENRICH_TTL) {
        _enrichCache[channelId] = stored;
        return stored;
      }
    } catch { }
  }

  return new Promise(resolve => {
    _enrichQueue.push({ channelId, resolve });
    processEnrichQueue();
  });
}

async function processEnrichQueue() {
  if (_enrichActiveWorkers >= MAX_ENRICH_CONCURRENCY || !_enrichQueue.length) return;
  _enrichActiveWorkers++;

  const { channelId, resolve } = _enrichQueue.shift();
  const ch = all.find(c => c.id === channelId);

  try {
    const r = await fetch(`/api/channels/${channelId}/videos?max=20`);
    const vids = await r.json();
    if (!Array.isArray(vids)) {
      resolve(null);
      return;
    }

    const now = Date.now();
    const longForm = vids.filter(v => !isYouTubeShort(v));
    const sorted = [...longForm].sort((a, b) => new Date(b.published_at || b.date) - new Date(a.published_at || a.date));

    const sample = sorted.slice(0, 5);
    const engValues = sample.map(v => calcEngagementRate(v.like_count, v.comment_count, v.view_count ?? v.views_raw)).filter(r => r !== null);
    const avgEng = engValues.length ? parseFloat((engValues.reduce((a, b) => a + b, 0) / engValues.length).toFixed(1)) : 0;

    const sp30 = sorted.slice(0, 10).map(v => v.view_count ?? v.views_raw ?? 0).reverse();
    const latestV = sorted[0];
    const latestVpd = latestV ? viewsPerDay(latestV.view_count ?? latestV.views_raw, latestV.published_at || latestV.date) : 0;

    const subCount = ch.subscriber_count ?? ch.subscribers_raw ?? 0;
    const totViews = ch.total_views_raw ?? 0;
    const audiencePct = totViews > 0 ? parseFloat(((subCount / totViews) * 100).toFixed(1)) : 0;

    let streak = 0, lastW = -1;
    for (const v of sorted) {
      const pubTime = new Date(v.published_at || v.date).getTime();
      if (isNaN(pubTime)) continue;
      const wa = Math.floor((now - pubTime) / (7 * 864e5));
      if (streak === 0 && wa <= 1) { streak = 1; lastW = wa; }
      else if (streak > 0 && wa === lastW + 1) { streak++; lastW = wa; }
      else if (streak > 0) break;
    }

    const data = {
      ts: now,
      vids,
      longForm,
      engagement: avgEng,
      sp30,
      latestVpd,
      audiencePct,
      streak,
      latestVideo: latestV || null,
    };

    _enrichCache[channelId] = data;
    try { localStorage.setItem('yt_enrich_' + channelId, JSON.stringify(data)); } catch { }
    // Rebuild topic intelligence from freshly cached videos
    setTimeout(() => {
      buildTopicCache();
      renderTopicRadar();
      syncPipelineWithPublishedVideos();
    }, 0);
    resolve(data);
  } catch {
    resolve(null);
  } finally {
    _enrichActiveWorkers--;
    processEnrichQueue();
  }
}

/* ── 08. Insights Generator ───────────────────────────────────────────────── */

/* ── 09. API Data Fetching ────────────────────────────────────────────────── */
async function fetchAll() {
  try {
    const r = await fetch('/api/channels');
    all = await r.json();
    lastRefreshedTs = Date.now();
    const b = document.getElementById('sbBadge');
    if (b) b.textContent = all.length || '';
    renderCompareTray();
    return all;
  } catch {
    return [];
  }
}

async function refreshAll() {
  const btn = document.getElementById('refAllBtn');
  if (btn) {
    btn.style.animation = 'rot 0.6s linear infinite';
    btn.disabled = true;
  }
  try {
    await fetchAll();
    if (!all.length) { toast('No channels to refresh', 'e'); return; }
    toast(`Refreshing ${all.length} channels…`);
    for (const ch of all) {
      try {
        await fetch(`/api/channels/${ch.id}/refresh`, { method: 'POST' });
        delete _enrichCache[ch.id];
        try { localStorage.removeItem('yt_enrich_' + ch.id); } catch { }
      } catch { }
    }
    await fetchAll();
    lastRefreshedTs = Date.now();
    const dashActive = document.getElementById('page-dash')?.classList.contains('on');
    const chActive = document.getElementById('page-channels')?.classList.contains('on');
    if (dashActive) renderDash();
    if (chActive) renderChannels();
    toast('All channels refreshed!', 's');
  } catch {
    toast('Refresh failed', 'e');
  } finally {
    if (btn) {
      btn.style.animation = '';
      btn.disabled = false;
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGE 1: DASHBOARD
   ══════════════════════════════════════════════════════════════════════════════ */

async function addCh() {
  closeAddSuggestions();
  const inp = document.getElementById('addInput');
  const q = inp?.value.trim();
  if (!q) { showErr('addErr', 'Please enter a channel name or handle.'); return; }
  hideErr('addErr');

  const btn = document.getElementById('addBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

  try {
    const r = await fetch('/api/channels/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q })
    });
    const res = await r.json();
    if (r.status === 409) { showErr('addErr', 'Already in your list.'); return; }
    if (!r.ok) { showErr('addErr', res.error || 'Could not add channel.'); return; }
    if (inp) inp.value = '';
    toggleAdd();
    await renderChannels();
    toast('Channel added!', 's');
  } catch {
    showErr('addErr', 'Network error.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Add'; }
  }
}

async function setPrimary(id) {
  try {
    const r = await fetch(`/api/channels/${id}/set-primary`, { method: 'POST' });
    if (!r.ok) { toast('Could not set primary', 'e'); return; }
    toast('Primary channel updated!', 's');
    await fetchAll();
    renderChannels();
    renderDash();
  } catch {
    toast('Network error', 'e');
  }
}

async function refreshOne(id) {
  try {
    const r = await fetch(`/api/channels/${id}/refresh`, { method: 'POST' });
    if (!r.ok) { toast('Refresh failed', 'e'); return; }
    const prevVids = _enrichCache[id]?.vids || [];
    delete _enrichCache[id];
    try { localStorage.removeItem('yt_enrich_' + id); } catch { }
    toast('Channel updated!', 's');
    await fetchAll();
    // Check for new videos and fire topic alerts
    const newEn = _enrichCache[id];
    if (newEn?.vids?.length) {
      const prevIds = new Set(prevVids.map(v => v.id || v.video_id));
      const newVids = newEn.vids.filter(v => !prevIds.has(v.id || v.video_id));
      const ch = all.find(c => c.id === id);
      if (newVids.length && ch) topicAlerts_check(ch, newVids);
    }
    renderChannels();
  } catch {
    toast('Refresh failed', 'e');
  }
}

async function deleteChannel(id) {
  try {
    await fetch(`/api/channels/${id}`, { method: 'DELETE' });
    delete _enrichCache[id];
    try { localStorage.removeItem('yt_enrich_' + id); } catch { }
    compareSet = compareSet.filter(x => x !== id);
    localStorage.setItem('yt_compare_set', JSON.stringify(compareSet));
    toast('Channel removed', 'e');
    await fetchAll();
    renderChannels();
    renderDash();
  } catch {
    toast('Failed to remove channel', 'e');
  }
}

function exportCSV() {
  const a = document.createElement('a');
  a.href = '/api/export/csv';
  a.download = 'yt_tracker_channels.csv';
  a.click();
  toast('Exporting CSV…', 's');
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGE 3: SEARCH
   ══════════════════════════════════════════════════════════════════════════════ */
let _srDebounce = null;

document.getElementById('srInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { closeSearchSuggestions(); doSearch(); }
  if (e.key === 'Escape') closeSearchSuggestions();
});

document.getElementById('srInput')?.addEventListener('keyup', e => {
  if (['Enter', 'Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const q = e.target.value.trim();
  clearTimeout(_srDebounce);
  if (q.length < 2) { closeSearchSuggestions(); return; }
  _srDebounce = setTimeout(() => doSearchAutocomplete(q), 380);
});

document.getElementById('srInput')?.addEventListener('blur', () => {
  setTimeout(closeSearchSuggestions, 250);
});

/* ── 1. Snapshot Delta & Rank Movement Engine ─────────────────────────────── */
async function loadAllSnapshots() {
  if (_snapshotsCache) return _snapshotsCache;
  try {
    const r = await fetch('/api/snapshots');
    if (r.ok) {
      _snapshotsCache = await r.json();
      calcRankDeltas();
      return _snapshotsCache;
    }
  } catch { }
  _snapshotsCache = {};
  return _snapshotsCache;
}
