/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — CLIENT APPLICATION ENGINE (CONSOLIDATED & REFINED)
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── Global State ─────────────────────────────────────────────────────────── */
let all = [];
let sort = 'subscribers_raw';
let chSort = 'subscribers_raw';
let yvfMetric = 'subscribers_raw';
let lastRefreshedTs = Date.now();

// Compare Tray State (localStorage)
let compareSet = [];
try {
  compareSet = JSON.parse(localStorage.getItem('yt_compare_set') || '[]');
  if (!Array.isArray(compareSet)) compareSet = [];
} catch {
  compareSet = [];
}

// Muted channels in Velocity chart (localStorage)
let mutedVelocity = new Set();
try {
  const mv = JSON.parse(localStorage.getItem('yt_muted_velocity') || '[]');
  mutedVelocity = new Set(mv);
} catch {
  mutedVelocity = new Set();
}

// Single Source of Truth Enrichment Cache
const _enrichCache = {};
const ENRICH_TTL = 30 * 60 * 1000; // 30 minutes

// Deep Dive Route State
let ddChannelId = null;
let ddActiveTab = 'overview';
let ddFullVideos = null;
let ddSnapshots = null;
let ddVidFilter = 'longform';
let ddVidPreset = 'recent';
let ddVidPage = 0;
let ddVidList = [];

// Latest Drops Race Window State
const raceState = {
  range: +(localStorage.getItem('race.range') || 30),
  sort:  localStorage.getItem('race.sort') || 'vel',
  open:  new Set(),
  slim:  +(localStorage.getItem('race.slim') || 0)
};

// Topic Intelligence State
const _topicCache = { topics: new Map(), perChannel: new Map(), ts: 0 };
const TOPIC_ALIAS = {};
let topicRadarRange = localStorage.getItem('topic.range') || '90d';
let raceTopicFilter = null;  // string or null — cross-wire from radar

// Load aliases from localStorage
try {
  Object.assign(TOPIC_ALIAS, JSON.parse(localStorage.getItem('yt_topic_aliases') || '{}'));
} catch {}

/* ── 01. Color & Hue System ───────────────────────────────────────────────── */
function hash(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

const hueOf = id => Math.abs(hash(id)) % 360;
const colorOf = ch => ch.is_primary ? 'var(--me)' : `hsl(${hueOf(ch.id)} 75% 62%)`;

/* ── 02. Formatting & String Helpers ──────────────────────────────────────── */
function fmtN(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  n = parseFloat(n);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

function fmtDelta(v, suffix = '%') {
  if (v === null || v === undefined || isNaN(v) || Math.abs(v) < 0.05) {
    return '<span class="delta-flat">— steady</span>';
  }
  v = parseFloat(v);
  if (v > 0) return `<span class="delta-up">▲ +${v.toFixed(1)}${suffix}</span>`;
  return `<span class="delta-down">▼ ${v.toFixed(1)}${suffix}</span>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function proxyImg(url) {
  if (!url) return '';
  if (url.includes('ggpht.com') || url.includes('ytimg.com') || url.includes('googleusercontent.com')) {
    return '/api/img-proxy?url=' + encodeURIComponent(url);
  }
  return url;
}

function isYouTubeShort(v) {
  if (!v) return false;
  if (v.url && v.url.includes('/shorts/')) return true;
  let dur = 0;
  if (typeof v.duration_secs === 'number') dur = v.duration_secs;
  else if (v.duration && typeof v.duration === 'string') {
    const p = v.duration.split(':').map(n => parseInt(n, 10));
    if (p.length === 3) dur = p[0] * 3600 + p[1] * 60 + p[2];
    else if (p.length === 2) dur = p[0] * 60 + p[1];
    else dur = parseInt(v.duration, 10) || 0;
  }
  if (dur > 0 && dur <= 62) return true;
  const title = (v.title || '').toLowerCase();
  return title.includes('#shorts') || title.includes('#short');
}

function calcEngagementRate(likeCount, commentCount, viewCount) {
  const vc = parseInt(viewCount || 0);
  if (!vc || vc === 0) return null;
  const rate = ((parseInt(likeCount || 0) + parseInt(commentCount || 0)) / vc) * 100;
  return parseFloat(rate.toFixed(1));
}

function viewsPerDay(viewCount, publishedAt) {
  if (!viewCount || !publishedAt) return 0;
  const days = Math.max(1, Math.floor((Date.now() - new Date(publishedAt).getTime()) / (864e5)));
  return Math.round(parseInt(viewCount) / days);
}

function ago(dateStr) {
  if (!dateStr) return 'just now';
  const time = typeof dateStr === 'number' ? dateStr : new Date(dateStr).getTime();
  if (isNaN(time)) return 'just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function toast(msg, t = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show ' + t;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = '', 3000);
}

function showErr(id, msg) {
  const e = document.getElementById(id);
  if (e) { e.textContent = '⚠ ' + msg; e.style.display = 'block'; }
}

function hideErr(id) {
  const e = document.getElementById(id);
  if (e) e.style.display = 'none';
}

/* ── 03. AnimKit Helpers ──────────────────────────────────────────────────── */
function countUp(el, to, fmt = fmtN, dur = 600) {
  if (!el) return;
  if (to === null || to === undefined || isNaN(to)) {
    el.textContent = fmt(to);
    return;
  }
  const target = parseFloat(to);
  const t0 = performance.now();
  const step = t => {
    const p = Math.min(1, (t - t0) / dur);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * ease);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = fmt(target);
  };
  requestAnimationFrame(step);
}

function flip(list, mutate) {
  if (!list || !list.children.length) {
    mutate();
    return;
  }
  const items = [...list.children];
  const pos = new Map(items.map(e => [e, e.getBoundingClientRect().top]));
  mutate();
  [...list.children].forEach(e => {
    const f = pos.get(e);
    if (f == null) return;
    const d = f - e.getBoundingClientRect().top;
    if (!d) return;
    e.style.transition = 'none';
    e.style.transform = `translateY(${d}px)`;
    requestAnimationFrame(() => {
      e.style.transition = 'transform 0.35s var(--e-out)';
      e.style.transform = '';
    });
  });
}

const tip = document.createElement('div');
tip.className = 'tip';
document.body.append(tip);

function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.classList.add('on');
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

function hideTip() {
  tip.classList.remove('on');
}

function fit(box, draw) {
  if (!box) return;
  const ro = new ResizeObserver(() => {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (w > 0 && h > 0) draw(w, h);
  });
  ro.observe(box);
}

function sparkSVG(v, w = 90, h = 22, c = 'var(--acc)') {
  if (!v || v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const pts = v.map((x, i) => [
    (i / (v.length - 1)) * w,
    h - 2 - ((x - mn) / r) * (h - 6)
  ]);
  const polyline = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `M${pts[0][0]},${h} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ` L${pts[pts.length - 1][0]},${h} Z`;
  const gradId = 'spGrad_' + Math.abs(hash(polyline));

  return `
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="spark">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradId})"/>
      <polyline points="${polyline}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function setupScrollReveal() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  document.querySelectorAll('.rev:not(.in)').forEach(el => observer.observe(el));
}

setInterval(() => {
  const tickerEl = document.getElementById('lastUpdatedAgo');
  if (tickerEl) tickerEl.textContent = ago(lastRefreshedTs);
}, 30000);

/* ── 04. Navigation ───────────────────────────────────────────────────────── */
function sp(p) {
  closeDeepDive();
  document.querySelectorAll('.page').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('on'));
  const pageEl = document.getElementById('page-' + p);
  const linkEl = document.getElementById('nav-' + p);
  if (pageEl) pageEl.classList.add('on');
  if (linkEl) linkEl.classList.add('on');

  if (p === 'dash') renderDash();
  if (p === 'channels') renderChannels();
  if (p === 'search') {
    setTimeout(() => document.getElementById('srInput')?.focus(), 50);
  }
}

/* ── 05. Compare Tray Engine ──────────────────────────────────────────────── */
function renderCompareTray() {
  const chipsEl = document.getElementById('compareTrayChips');
  const popoverList = document.getElementById('comparePopoverList');
  const compareNowWrap = document.getElementById('compareNowWrap');
  if (!chipsEl) return;

  const me = all.find(c => c.is_primary);
  const primaryId = me ? me.id : (all[0]?.id || null);

  const currentSet = new Set(compareSet);
  if (primaryId) currentSet.add(primaryId);

  const displayChannels = all.filter(c => currentSet.has(c.id)).slice(0, 5);

  chipsEl.innerHTML = displayChannels.map(ch => {
    const isMe = ch.is_primary;
    const col = colorOf(ch);
    return `
      <div class="compare-chip ${isMe ? 'chip-me' : ''}" onclick="toggleCompare('${esc(ch.id)}')">
        <span class="dot" style="background:${col}"></span>
        <span>${esc(ch.name.length > 8 ? ch.name.slice(0, 8) + '…' : ch.name)}</span>
        ${!isMe ? '<span class="rm">✕</span>' : ''}
      </div>`;
  }).join('');

  if (popoverList) {
    popoverList.innerHTML = all.map(ch => {
      const checked = currentSet.has(ch.id) ? 'checked' : '';
      const isMe = ch.is_primary;
      return `
        <label class="compare-popover-item">
          <input type="checkbox" ${checked} ${isMe ? 'disabled' : ''} onchange="toggleCompare('${esc(ch.id)}')">
          <span style="color:${colorOf(ch)}">●</span>
          <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ch.name)} ${isMe ? '(You)' : ''}</span>
        </label>`;
    }).join('');
  }

  if (compareNowWrap) {
    compareNowWrap.style.display = displayChannels.length >= 2 ? 'block' : 'none';
  }
}

function filterComparePopover(q) {
  const term = q.toLowerCase();
  document.querySelectorAll('.compare-popover-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(term) ? 'flex' : 'none';
  });
}

function toggleCompare(channelId) {
  const me = all.find(c => c.is_primary);
  if (me && channelId === me.id) return;

  const idx = compareSet.indexOf(channelId);
  if (idx >= 0) {
    compareSet.splice(idx, 1);
  } else {
    if (compareSet.length >= 4) {
      toast('Max 4 rival channels in compare set', 'e');
      return;
    }
    compareSet.push(channelId);
  }
  localStorage.setItem('yt_compare_set', JSON.stringify(compareSet));
  renderCompareTray();

  if (document.getElementById('page-dash')?.classList.contains('on')) {
    const tbody = document.getElementById('lbTableBody');
    const primary = all.find(c => c.is_primary) || all[0];
    if (tbody) tbody.innerHTML = renderLeaderboardRows(primary, all);
  }

  if (ddChannelId && ddActiveTab === 'compare') {
    renderDDCompare(all.find(c => c.id === ddChannelId));
  }
}

function toggleComparePopover(event) {
  if (event) event.stopPropagation();
  const p = document.getElementById('comparePopover');
  if (p) p.classList.toggle('open');
}

function openCompareSet() {
  const p = document.getElementById('comparePopover');
  if (p) p.classList.remove('open');
  const me = all.find(c => c.is_primary) || all[0];
  if (me) openDeepDive(me.id, 'compare');
}

/* ── 06. Command Palette & Shortcuts Modal ────────────────────────────────── */
let cmdIndex = 0;

function openCommandPalette() {
  const ovrl = document.getElementById('cmdOvrl');
  const pal = document.getElementById('cmdPal');
  const inp = document.getElementById('cmdInp');
  if (ovrl) ovrl.classList.add('open');
  if (pal) pal.classList.add('open');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
  renderCommandPalette('');
}

function closeCommandPalette() {
  document.getElementById('cmdOvrl')?.classList.remove('open');
  document.getElementById('cmdPal')?.classList.remove('open');
}

function renderCommandPalette(query) {
  const listEl = document.getElementById('cmdList');
  if (!listEl) return;
  const q = query.toLowerCase().trim();

  const channels = all.filter(c => c.name.toLowerCase().includes(q) || (c.handle || '').toLowerCase().includes(q));
  const actions = [
    { title: 'Go to Dashboard', icon: 'dashboard', action: () => sp('dash') },
    { title: 'Go to My Channels', icon: 'subscriptions', action: () => sp('channels') },
    { title: 'Search YouTube Channels', icon: 'search', action: () => sp('search') },
    { title: 'Export Channels as CSV', icon: 'download', action: () => exportCSV() },
    { title: 'Refresh All Data', icon: 'refresh', action: () => refreshAll() },
    { title: 'Keyboard Shortcuts Cheat Sheet', icon: 'help', action: () => openShortcutsModal() },
  ].filter(a => a.title.toLowerCase().includes(q));

  cmdIndex = 0;
  let html = '';

  if (channels.length) {
    html += '<div class="cmd-group-label">Channels</div>';
    channels.slice(0, 5).forEach((ch, i) => {
      html += `
        <div class="cmd-item ${i === 0 ? 'selected' : ''}" data-type="channel" data-id="${esc(ch.id)}">
          <span style="color:${colorOf(ch)}">●</span>
          <span style="flex:1">${esc(ch.name)}</span>
          <span style="font-family:var(--f-mono);font-size:11px;color:var(--t3)">${esc(ch.subscribers)}</span>
        </div>`;
    });
  }

  if (actions.length) {
    html += '<div class="cmd-group-label">Actions</div>';
    actions.forEach((a, i) => {
      const isSelected = !channels.length && i === 0;
      html += `
        <div class="cmd-item ${isSelected ? 'selected' : ''}" data-type="action" data-index="${i}">
          <span class="msi" style="font-size:16px">${a.icon}</span>
          <span style="flex:1">${esc(a.title)}</span>
        </div>`;
    });
  }

  if (!channels.length && !actions.length) {
    html = '<div style="color:var(--t3);padding:24px;text-align:center">No matching channels or commands.</div>';
  }

  listEl.innerHTML = html;

  listEl.querySelectorAll('.cmd-item').forEach(item => {
    item.addEventListener('click', () => executeCmdItem(item, actions));
  });
}

function executeCmdItem(item, actions) {
  closeCommandPalette();
  const type = item.dataset.type;
  if (type === 'channel') {
    openDeepDive(item.dataset.id);
  } else if (type === 'action') {
    const idx = parseInt(item.dataset.index);
    if (actions[idx]) actions[idx].action();
  }
}

document.getElementById('cmdInp')?.addEventListener('input', e => {
  renderCommandPalette(e.target.value);
});

document.getElementById('cmdInp')?.addEventListener('keydown', e => {
  const listEl = document.getElementById('cmdList');
  const items = listEl ? [...listEl.querySelectorAll('.cmd-item')] : [];
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdIndex = (cmdIndex + 1) % items.length;
    items.forEach((it, i) => it.classList.toggle('selected', i === cmdIndex));
    items[cmdIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdIndex = (cmdIndex - 1 + items.length) % items.length;
    items.forEach((it, i) => it.classList.toggle('selected', i === cmdIndex));
    items[cmdIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (items[cmdIndex]) items[cmdIndex].click();
  }
});

function openShortcutsModal() {
  document.getElementById('scOvrl')?.classList.add('open');
  document.getElementById('scModal')?.classList.add('open');
}

function closeShortcutsModal() {
  document.getElementById('scOvrl')?.classList.remove('open');
  document.getElementById('scModal')?.classList.remove('open');
}

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
    } catch {}
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
    try { localStorage.setItem('yt_enrich_' + channelId, JSON.stringify(data)); } catch {}
    // Rebuild topic intelligence from freshly cached videos
    setTimeout(() => { buildTopicCache(); renderTopicRadar(); }, 0);
    resolve(data);
  } catch {
    resolve(null);
  } finally {
    _enrichActiveWorkers--;
    processEnrichQueue();
  }
}

/* ── 08. Insights Generator ───────────────────────────────────────────────── */
function genInsights(me, allChannels) {
  if (!me || allChannels.length < 2) {
    return [{ tone: 'info', text: 'Add more competitor channels to generate comparative insights.' }];
  }

  const insights = [];
  const total = allChannels.length;

  const sortedSubs = [...allChannels].sort((a, b) => (b.subscribers_raw || 0) - (a.subscribers_raw || 0));
  const subRank = sortedSubs.findIndex(c => c.id === me.id) + 1;
  insights.push({
    tone: subRank <= 2 ? 'up' : 'info',
    text: `You rank <strong>#${subRank}/${total}</strong> in subscribers with <strong>${esc(me.subscribers)}</strong>.`
  });

  if (subRank > 1) {
    const chAbove = sortedSubs[subRank - 2];
    const gap = (chAbove.subscribers_raw || 0) - (me.subscribers_raw || 0);
    insights.push({
      tone: 'info',
      text: `<strong>${fmtN(gap)}</strong> subs needed to overtake <strong>${esc(chAbove.name)}</strong> (#${subRank - 1}).`
    });
  }

  const sortedAvg = [...allChannels].sort((a, b) => (b.avg_views_raw || 0) - (a.avg_views_raw || 0));
  const avgRank = sortedAvg.findIndex(c => c.id === me.id) + 1;
  if (avgRank < subRank) {
    insights.push({
      tone: 'up',
      text: `High view efficiency: you rank <strong>#${avgRank}/${total}</strong> in Avg Views per Video (<strong>${esc(me.avg_views)}</strong>).`
    });
  }

  const myEnrich = _enrichCache[me.id];
  if (myEnrich && myEnrich.engagement > 0) {
    insights.push({
      tone: myEnrich.engagement >= 4 ? 'up' : 'info',
      text: `Active engagement rate is <strong>${myEnrich.engagement}%</strong> across recent long-form uploads.`
    });
  }

  return insights.slice(0, 4);
}

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
        try { localStorage.removeItem('yt_enrich_' + ch.id); } catch {}
      } catch {}
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
async function renderDash() {
  const el = document.getElementById('dashMain');
  if (!el) return;

  await fetchAll();
  const primary = all.find(c => c.is_primary) || all[0];

  if (!primary) {
    el.innerHTML = `
      <div class="empty card rev in">
        <div class="empty-ico"><span class="msi" style="font-size:24px">subscriptions</span></div>
        <h3 style="font-family:var(--f-disp);font-size:18px;color:var(--t1)">No Channels Tracked</h3>
        <p style="max-width:360px">Add your channel to view real-time performance and competitor comparisons.</p>
        <button class="btn btn-acc" onclick="sp('channels')">+ Add Your Channel</button>
      </div>`;
    return;
  }

  const primaryEnrich = await enrich(primary.id) || {};
  const sp30Vals = primaryEnrich.sp30 && primaryEnrich.sp30.length ? primaryEnrich.sp30 : [10, 14, 12, 18, 22, 20, 26];
  const engRate = primaryEnrich.engagement ?? 0;
  const engGaugePct = Math.min(100, Math.round((engRate / 10) * 100));

  const subRaw = primary.subscribers_raw || 0;
  const stones = [1e3, 5e3, 10e3, 25e3, 50e3, 100e3, 250e3, 500e3, 1e6, 2e6, 5e6, 10e6, 50e6, 100e6];
  const ms = stones.find(s => s > subRaw);
  const msPct = ms ? Math.min(99, Math.round((subRaw / ms) * 100)) : 100;
  const circum = 2 * Math.PI * 10;
  const msDash = ms ? (msPct / 100 * circum) : circum;

  // 1. My Channel Strip
  const stripHtml = `
    <div class="my-channel-strip rev in" onclick="openDeepDive('${esc(primary.id)}')">
      <div class="mcs-identity">
        ${primary.logo_url
          ? `<img class="mcs-logo" src="${esc(proxyImg(primary.logo_url))}" alt="">`
          : `<div class="mcs-logo-fb">${(primary.name || '?')[0].toUpperCase()}</div>`}
        <div class="mcs-info">
          <div class="mcs-name">${esc(primary.name)} <span class="badge bdg-gd">⭐ Mine</span></div>
          <div class="mcs-meta">
            ${primary.handle ? `<span>${esc(primary.handle)}</span>` : ''}
            ${primary.country ? `<span>• ${esc(primary.country)}</span>` : ''}
            <span>• Since ${primary.created || '—'}</span>
          </div>
        </div>
      </div>

      <div class="mcs-tiles">
        <div class="tile">
          <span class="lbl">Subscribers</span>
          <span class="val gold count-val" data-val="${primary.subscribers_raw || 0}">${esc(primary.subscribers)}</span>
          <span class="foot">${sparkSVG(sp30Vals, 80, 18, 'var(--me)')}</span>
        </div>
        <div class="tile">
          <span class="lbl">Next Milestone</span>
          <span class="val gold count-val" data-val="${ms || subRaw}">${ms ? fmtN(ms) : 'Max'}</span>
          <span class="foot" style="gap:6px">
            <svg class="milestone-ring" viewBox="0 0 24 24" style="width:20px;height:20px">
              <circle cx="12" cy="12" r="10" fill="none" stroke="var(--bg-3)" stroke-width="2.5"/>
              <circle cx="12" cy="12" r="10" fill="none" stroke="var(--me)" stroke-width="2.5"
                stroke-dasharray="${circum.toFixed(1)}"
                stroke-dashoffset="${(circum - msDash).toFixed(1)}"
                stroke-linecap="round"/>
            </svg>
            <span style="font-size:10.5px;color:var(--me);font-family:var(--f-mono)">${msPct}%</span>
          </span>
        </div>
        <div class="tile">
          <span class="lbl">Total Views</span>
          <span class="val count-val" data-val="${primary.total_views_raw || 0}">${esc(primary.total_views)}</span>
          <span class="foot">${fmtDelta(primaryEnrich.momDelta || 0)}</span>
        </div>
        <div class="tile">
          <span class="lbl">Avg Views</span>
          <span class="val green count-val" data-val="${primary.avg_views_raw || 0}">${esc(primary.avg_views)}</span>
          <span class="foot"><span style="font-size:10px;color:var(--t3)">per video</span></span>
        </div>
        <div class="tile">
          <span class="lbl">Engagement</span>
          <span class="val cyan">${engRate}%</span>
          <span class="foot" style="flex-direction:column;align-items:flex-start">
            <div class="gauge-bar"><div class="gauge-fill" style="width:${engGaugePct}%"></div></div>
          </span>
        </div>
      </div>

      <div class="mcs-action">
        <span>Deep Dive</span>
        <span class="msi" style="font-size:15px">arrow_forward</span>
      </div>
    </div>`;

  // 2. You vs Field Panel
  const insights = genInsights(primary, all);
  const sortedSubs = [...all].sort((a, b) => (b.subscribers_raw || 0) - (a.subscribers_raw || 0));
  const medSubs = sortedSubs[Math.floor(all.length / 2)]?.subscribers || '—';
  const sortedAvg = [...all].sort((a, b) => (b.avg_views_raw || 0) - (a.avg_views_raw || 0));
  const medAvg = sortedAvg[Math.floor(all.length / 2)]?.avg_views || '—';

  const yvfHtml = `
    <div class="you-vs-field rev in" style="--i:1">
      <div class="yvf-hdr">
        <div class="yvf-title">
          <span class="ic-tile cyan"><span class="msi" style="font-size:15px">compare_arrows</span></span>
          You vs Field
        </div>
        <div class="yvf-chips">
          <button class="chip chip-btn ${yvfMetric === 'subscribers_raw' ? 'on' : ''}" onclick="setYvfMetric('subscribers_raw')">Subscribers</button>
          <button class="chip chip-btn ${yvfMetric === 'avg_views_raw' ? 'on' : ''}" onclick="setYvfMetric('avg_views_raw')">Avg Views</button>
          <button class="chip chip-btn ${yvfMetric === 'total_views_raw' ? 'on' : ''}" onclick="setYvfMetric('total_views_raw')">Total Views</button>
        </div>
      </div>

      <div class="yvf-grid">
        <!-- Sub-panel 1: Rank Ladder -->
        <div class="rank-ladder-card">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);letter-spacing:.06em">Rank Ladder</div>
          <div class="ladder-list" id="ladderList">
            ${renderLadderRows(primary, all, yvfMetric)}
          </div>
        </div>

        <!-- Sub-panel 2: Grouped Bars SVG -->
        <div class="yvf-chart-card">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);letter-spacing:.06em;margin-bottom:6px">
            Field Comparison (${yvfMetric === 'subscribers_raw' ? 'Subscribers' : yvfMetric === 'avg_views_raw' ? 'Avg Views' : 'Total Views'})
          </div>
          <div class="chart-box" id="yvfChartWrap"></div>
        </div>

        <!-- Sub-panel 3: Auto-Insights -->
        <div class="insights-card">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);letter-spacing:.06em">Automated Insights</div>
          <ul class="insights-list">
            ${insights.map(item => `
              <li class="insight-item ${item.tone}">
                <span class="msi">${item.tone === 'up' ? 'trending_up' : item.tone === 'down' ? 'trending_down' : 'insights'}</span>
                <span>${item.text}</span>
              </li>`).join('')}
          </ul>
          <div class="insights-footer-chips">
            <span class="badge bdg-dim">Med. Subs: ${medSubs}</span>
            <span class="badge bdg-dim">Med. Avg: ${medAvg}</span>
          </div>
        </div>
      </div>
    </div>`;

  // 3. Full-Width Leaderboard Table
  const lbHtml = `
    <div class="lb-wrap rev in" style="--i:2">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="sect-lbl" style="margin:0">
          <span class="msi">leaderboard</span> Full Leaderboard (${all.length} channels)
        </div>
        <span style="font-size:11.5px;color:var(--t3)">Click any header to sort</span>
      </div>
      <div style="overflow-x:auto">
        <table class="lb-table">
          <colgroup>
            <col style="width:36px">
            <col style="width:23%">
            <col style="width:23%">
            <col style="width:13%">
            <col style="width:13%">
            <col style="width:9%">
            <col style="width:11%">
            <col style="width:75px">
            <col style="width:68px">
          </colgroup>
          <thead>
            <tr>
              <th style="text-align:center">#</th>
              <th>Channel</th>
              <th onclick="setLeaderboardSort('subscribers_raw')">Subscribers ▾</th>
              <th onclick="setLeaderboardSort('avg_views_raw')">Avg Views ▾</th>
              <th onclick="setLeaderboardSort('total_views_raw')">Total Views ▾</th>
              <th onclick="setLeaderboardSort('total_videos_raw')">Videos ▾</th>
              <th>Last Upload</th>
              <th onclick="setLeaderboardSort('threat_score')" style="text-align:center" title="Topic Overlap Threat vs Your Channel">Threat ▾</th>
              <th style="text-align:center">Compare</th>
            </tr>
          </thead>
          <tbody id="lbTableBody">
            ${renderLeaderboardRows(primary, all)}
          </tbody>
        </table>
      </div>
    </div>`;

  // 4. Latest Drops Race Window (replaces Face-off)
  const raceHtml = `<div id="dashRaceWindow" class="rev in" style="--i:3"></div>`;

  // 4b. Topic Radar (under Drops)
  const radarHtml = `<div id="dashTopicRadar" class="rev in" style="--i:4"></div>`;

  // 5. Velocity Card (now full-width, separate from face-off)
  const velHtml = `
    <div class="vel-card rev in" style="margin-top:var(--s5);--i:5">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="sect-lbl" style="margin:0">
          <span class="msi">bar_chart</span> 6-Month Upload Velocity
        </div>
        <div class="vel-legend-chips" id="velLegendChips"></div>
      </div>
      <div class="chart-box" id="dashVelocity"></div>
    </div>`;

  // 6. Recent Uploads Rail
  const recentHtml = `
    <div class="card rev in" style="margin-top:var(--s5);--i:5">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div class="sect-lbl" style="margin:0">
          <span class="msi">play_circle</span> Your Recent Uploads
        </div>
        <div style="display:flex;gap:4px">
          <button class="icon-btn" onclick="scrollRecentRail(-230)"><span class="msi">chevron_left</span></button>
          <button class="icon-btn" onclick="scrollRecentRail(230)"><span class="msi">chevron_right</span></button>
        </div>
      </div>
      <div class="recent-rail-wrap">
        <div class="recent-uploads-scroll" id="dashRecentUploads">
          <div style="display:flex;align-items:center;gap:8px;color:var(--t3);padding:20px 0">
            <div class="spin"></div> Loading recent uploads…
          </div>
        </div>
      </div>
    </div>`;

  el.innerHTML = stripHtml + yvfHtml + raceHtml + radarHtml + lbHtml + velHtml + recentHtml;

  document.querySelectorAll('.count-val').forEach(valEl => {
    countUp(valEl, valEl.dataset.val);
  });

  const chartBox = document.getElementById('yvfChartWrap');
  if (chartBox) {
    fit(chartBox, (w, h) => drawYvfBarsSvg(chartBox, primary, all, yvfMetric, w, h));
  }

  renderRaceWindow();
  renderTopicRadar();
  loadVelocityWithFit(all);
  loadDashboardRecentUploads(primary.id);
  setupScrollReveal();
}

function setYvfMetric(metric) {
  yvfMetric = metric;
  const primary = all.find(c => c.is_primary) || all[0];
  const ladderEl = document.getElementById('ladderList');
  const chartBox = document.getElementById('yvfChartWrap');

  if (ladderEl) {
    flip(ladderEl, () => {
      ladderEl.innerHTML = renderLadderRows(primary, all, yvfMetric);
    });
  }
  if (chartBox) {
    drawYvfBarsSvg(chartBox, primary, all, yvfMetric, chartBox.clientWidth, chartBox.clientHeight);
  }

  document.querySelectorAll('.yvf-chips .chip-btn').forEach(btn => {
    btn.classList.toggle('on', btn.textContent.toLowerCase().includes(metric === 'subscribers_raw' ? 'sub' : metric === 'avg_views_raw' ? 'avg' : 'tot'));
  });
}

function renderLadderRows(primary, allChannels, metricKey) {
  const sorted = [...allChannels].sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0));
  const maxVal = Math.max(...sorted.map(c => c[metricKey] || 0), 1);

  return sorted.slice(0, 6).map((ch, i) => {
    const isMe = ch.id === primary.id;
    const col = colorOf(ch);
    const pct = Math.max(4, Math.round(((ch[metricKey] || 0) / maxVal) * 100));
    return `
      <div class="ladder-row ${isMe ? 'me' : ''}" onclick="openDeepDive('${esc(ch.id)}')">
        <div class="ladder-row-bar" style="width:${pct}%;background:${col}"></div>
        <div style="display:flex;align-items:center;gap:6px;position:relative;z-index:1;min-width:0">
          <span style="font-family:var(--f-mono);font-size:10px;color:var(--t3)">#${i + 1}</span>
          <span style="width:7px;height:7px;border-radius:50%;background:${col};flex-shrink:0"></span>
          <span class="ladder-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ch.name)} ${isMe ? '◀ YOU' : ''}</span>
        </div>
        <span class="ladder-val" style="position:relative;z-index:1">${fmtN(ch[metricKey] || 0)}</span>
      </div>`;
  }).join('');
}

function drawYvfBarsSvg(box, primary, allChannels, metricKey, width, height) {
  const sorted = [...allChannels].sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0));
  const top3 = sorted.filter(c => c.id !== primary.id).slice(0, 3);
  const compareSetBars = [primary, ...top3];

  const maxVal = Math.max(...compareSetBars.map(c => c[metricKey] || 0), 1);
  const medVal = sorted[Math.floor(sorted.length / 2)]?.[metricKey] || 0;

  const W = Math.max(width || 400, 280);
  const H = Math.max(height || 200, 160);
  const padB = 36, padT = 20, plotH = H - padB - padT;

  const nBars = compareSetBars.length;
  const barW = Math.min(42, Math.max(24, Math.floor((W - 80) / nBars) - 20));
  const gap = Math.floor((W - 50 - nBars * barW) / (nBars + 1));

  const medY = H - padB - Math.round((medVal / maxVal) * plotH);

  let gridlines = '';
  [0, Math.round(maxVal / 2), maxVal].forEach(t => {
    const y = H - padB - Math.round((t / maxVal) * plotH);
    gridlines += `
      <line x1="36" y1="${y}" x2="${W - 16}" y2="${y}" stroke="var(--line-1)" stroke-width="1" stroke-dasharray="3 3"/>
      <text x="32" y="${y + 3}" text-anchor="end" fill="var(--t3)" font-size="8.5" font-family="JetBrains Mono">${fmtN(t)}</text>`;
  });

  const barsSvg = compareSetBars.map((ch, i) => {
    const val = ch[metricKey] || 0;
    const h = Math.max(6, Math.round((val / maxVal) * plotH));
    const x = 40 + gap + i * (barW + gap);
    const y = H - padB - h;
    const isMe = ch.id === primary.id;
    const col = colorOf(ch);
    const gradId = 'yvfBarGrad_' + Math.abs(hash(ch.id));

    return `
      <g class="bars" data-tip="<strong>${esc(ch.name)}</strong>: ${fmtN(val)}">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${col}" stop-opacity="${isMe ? '1' : '0.85'}"/>
            <stop offset="100%" stop-color="${col}" stop-opacity="0.35"/>
          </linearGradient>
        </defs>
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="url(#${gradId})"
              style="cursor:pointer;filter:${isMe ? 'drop-shadow(0 0 6px rgba(245,197,66,0.3))' : 'none'}"/>
        <text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-size="9.5" font-weight="700" font-family="JetBrains Mono" fill="${col}">
          ${fmtN(val)}
        </text>
        <text x="${x + barW / 2}" y="${H - 14}" text-anchor="middle" font-size="10" fill="var(--t2)" font-family="DM Sans">
          ${esc(ch.name.length > 8 ? ch.name.slice(0, 8) + '…' : ch.name)}
        </text>
      </g>`;
  }).join('');

  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="overflow:visible">
      ${gridlines}
      <line x1="36" y1="${medY}" x2="${W - 16}" y2="${medY}" stroke="var(--acc)" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.6"/>
      <text x="${W - 18}" y="${medY - 4}" text-anchor="end" fill="var(--acc)" font-size="8.5" font-family="DM Sans" opacity="0.8">median: ${fmtN(medVal)}</text>
      ${barsSvg}
    </svg>`;

  box.querySelectorAll('.bars').forEach(g => {
    g.addEventListener('mouseenter', e => {
      const rect = e.target.getBoundingClientRect();
      showTip(g.dataset.tip, rect.left + rect.width / 2, rect.top);
    });
    g.addEventListener('mouseleave', hideTip);
  });
}

function setLeaderboardSort(field) {
  sort = field;
  const tbody = document.getElementById('lbTableBody');
  const primary = all.find(c => c.is_primary) || all[0];
  if (tbody) {
    flip(tbody, () => {
      tbody.innerHTML = renderLeaderboardRows(primary, all);
    });
  }
}

function renderLeaderboardRows(primary, allChannels) {
  // Precompute threat scores for all channels
  const withThreat = allChannels.map(ch => {
    const threat = calcThreatScore(ch.id, primary?.id);
    return { ...ch, _threatScore: threat.score, _sharedTopics: threat.sharedTopics };
  });

  const sorted = [...withThreat].sort((a, b) => {
    if (sort === 'threat_score') return (b._threatScore || 0) - (a._threatScore || 0);
    return (b[sort] || 0) - (a[sort] || 0);
  });
  const maxVal = Math.max(...sorted.map(c => sort === 'threat_score' ? (c._threatScore || 0) : (c[sort] || 0)), 1);

  return sorted.map((ch, i) => {
    const isMe = ch.id === primary?.id;
    const curVal = sort === 'threat_score' ? (ch._threatScore || 0) : (ch[sort] || 0);
    const pct = Math.max(4, Math.round((curVal / maxVal) * 100));
    const col = colorOf(ch);
    const inCompare = compareSet.includes(ch.id) || isMe;
    const threatScore = ch._threatScore || 0;
    const threatColor = threatScore >= 50 ? 'var(--down)' : threatScore >= 25 ? 'var(--warn)' : 'var(--t3)';

    return `
      <tr class="lb-row ${isMe ? 'me' : ''}" onclick="openDeepDive('${esc(ch.id)}', 'overview')">
        <td style="font-family:var(--f-mono);font-size:11px;color:var(--t3);text-align:center">#${i + 1}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            ${ch.logo_url
              ? `<img src="${esc(proxyImg(ch.logo_url))}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid ${col};flex-shrink:0" alt="">`
              : `<div style="width:26px;height:26px;border-radius:50%;background:var(--bg-3);border:1px solid ${col};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${(ch.name || '?')[0]}</div>`}
            <div style="min-width:0">
              <div style="font-weight:600;color:${isMe ? 'var(--me)' : 'var(--t1)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ch.name)} ${isMe ? '⭐' : ''}</div>
              <div style="font-size:10.5px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ch.handle || '')}</div>
            </div>
          </div>
        </td>
        <td class="lb-bar-cell">
          <div style="font-family:var(--f-mono);font-weight:700;color:var(--t1)">${esc(ch.subscribers)}</div>
          <div class="lb-bar-bg">
            <div class="lb-bar-fill" style="width:${pct}%;background:${col}"></div>
          </div>
        </td>
        <td style="font-family:var(--f-mono);color:var(--up);font-weight:700">${esc(ch.avg_views)}</td>
        <td style="font-family:var(--f-mono);color:var(--t2)">${esc(ch.total_views)}</td>
        <td style="font-family:var(--f-mono);color:var(--t3)">${esc(ch.total_videos)}</td>
        <td style="font-size:11px;color:var(--t3)">${ch.video?.date || '—'}</td>
        <td style="text-align:center;padding:6px 4px" onclick="event.stopPropagation()">
          ${isMe
            ? `<span class="badge bdg-gd">YOU</span>`
            : `<span class="badge" style="background:${threatScore>=50?'rgba(255,107,107,0.12)':threatScore>=25?'rgba(245,197,66,0.12)':'var(--bg-3)'};color:${threatColor}" title="Shared topics: ${(ch._sharedTopics||[]).join(', ') || 'none'}">⚔️ ${threatScore}%</span>`}
        </td>
        <td style="text-align:center;overflow:visible;text-overflow:clip;padding:6px 0" onclick="event.stopPropagation()">
          <button class="icon-btn ${inCompare ? 'active' : ''}" style="display:inline-flex;margin:0 auto" onclick="toggleCompare('${esc(ch.id)}')" title="Toggle compare tray">
            <span class="msi" style="font-size:14px">${inCompare ? 'check' : 'add'}</span>
          </button>
        </td>
      </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════════════════
   LATEST DROPS RACE WINDOW
   ══════════════════════════════════════════════════════════════════════════════ */

function raceVelOf(v) {
  const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
  const pub = v.published_at || v.date;
  if (!pub) return 0;
  const days = Math.max(1, (Date.now() - new Date(pub).getTime()) / 864e5);
  return vc / days;
}

function raceEngOf(v) {
  const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
  if (!vc) return null;
  const lc = parseInt(v.like_count || v.likes || 0);
  const cc = parseInt(v.comment_count || v.comments || 0);
  if (!lc && !cc) return null;
  return parseFloat(((lc + cc) / vc * 100).toFixed(1));
}

function raceData() {
  const now = Date.now();
  const cut = now - raceState.range * 864e5;
  return all.map(ch => {
    const cached = _enrichCache[ch.id];
    const rawVids = cached?.vids || [];
    const vids = rawVids
      .filter(v => {
        const pub = v.published_at || v.date;
        if (!pub || +new Date(pub) < cut) return false;
        if (raceTopicFilter) {
          const toks = topicTokens(v.title || '');
          return toks.includes(raceTopicFilter);
        }
        return true;
      })
      .map(v => ({
        ...v,
        _vel: raceVelOf(v),
        _eng: raceEngOf(v),
        _pub: new Date(v.published_at || v.date).getTime()
      }))
      .sort((a, b) => b._pub - a._pub);
    return { ch, vids, hasCache: !!cached };
  });
}

const raceSorters = {
  vel:    (a, b) => (b.vids[0]?._vel || 0) - (a.vids[0]?._vel || 0),
  views:  (a, b) => (parseInt(b.vids[0]?.view_count ?? b.vids[0]?.views_raw ?? 0)) - (parseInt(a.vids[0]?.view_count ?? a.vids[0]?.views_raw ?? 0)),
  newest: (a, b) => (b.vids[0]?._pub || 0) - (a.vids[0]?._pub || 0)
};

function renderRaceWindow() {
  const el = document.getElementById('dashRaceWindow');
  if (!el) return;

  const rows = raceData();
  // Enrich channels missing cache
  rows.forEach(r => { if (!r.hasCache) enrich(r.ch.id).then(() => renderRaceWindow()); });

  const ranked = rows.filter(r => r.vids[0]).sort(raceSorters[raceState.sort] || raceSorters.vel);
  const muted  = rows.filter(r => !r.vids[0]);
  const bestViews = ranked.length ? Math.max(...ranked.map(r => parseInt(r.vids[0].view_count ?? r.vids[0].views_raw ?? 0))) : 1;

  // Caption
  let caption = ranked.length
    ? `⚡ fastest right now: <strong>${esc(ranked[0].ch.name)}</strong> · ${fmtN(Math.round(ranked[0].vids[0]._vel))}/day${raceTopicFilter ? ` <span style="color:var(--acc)">· filtered: "${esc(raceTopicFilter)}"</span>` : ''}`
    : (raceTopicFilter ? `No channels published on "${esc(raceTopicFilter)}" in ${raceState.range}d window` : 'Waiting for enrichment data…');

  // Medal emojis
  const medals = ['🥇', '🥈', '🥉'];

  const rankedRowsHtml = ranked.map((r, i) => {
    const ch = r.ch;
    const v  = r.vids[0];
    const col = colorOf(ch);
    const vc  = parseInt(v.view_count ?? v.views_raw ?? 0);
    const vel = Math.round(v._vel);
    const eng = v._eng;
    const pct = bestViews > 0 ? Math.max(4, Math.round(vc / bestViews * 100)) : 4;
    const pub  = v.published_at || v.date;
    const ageMs = Date.now() - new Date(pub).getTime();
    const isNew = ageMs < 48 * 3600000;
    const isMe  = ch.is_primary;
    const isOpen = raceState.open.has(ch.id);
    const medal = i < 3 ? medals[i] : `<span style="font-size:11px">#${i+1}</span>`;

    // Avatar
    const avatarHtml = ch.logo_url
      ? `<img class="rrow-avatar" src="${esc(proxyImg(ch.logo_url))}" style="border:1.5px solid ${col}" alt="">`
      : `<div class="rrow-avatar-fb" style="border:1.5px solid ${col};color:${col}">${(ch.name||'?')[0]}</div>`;

    // Thumb
    const thumbHtml = v.thumb
      ? `<img class="rrow-thumb" src="${esc(v.thumb)}" alt="">`
      : `<div class="rrow-thumb-fb"><span class="msi" style="color:var(--t3);font-size:18px">play_circle</span></div>`;

    // Expanded inset: vids #2-#5
    const insetVids = r.vids.slice(1, 5);
    const insetHtml = insetVids.length ? insetVids.map((iv, ii) => {
      const ivc = parseInt(iv.view_count ?? iv.views_raw ?? 0);
      const ivel = Math.round(iv._vel);
      return `
        <div class="race-inset-row vrow" style="--i:${ii}">
          <span style="font-family:var(--f-mono);font-size:10px;color:var(--t3)">#${ii+2}</span>
          <img class="race-inset-thumb" src="${esc(iv.thumb||'')}" alt="">
          <span class="race-inset-title" title="${esc(iv.title)}">${esc(iv.title)}</span>
          <span class="race-inset-stat">${fmtN(ivc)} 👁</span>
          <span class="race-inset-stat" style="color:var(--acc)">${fmtN(ivel)}/d ⚡</span>
        </div>`;
    }).join('') + `
      <div class="race-inset-footer">
        <button class="btn btn-gh btn-sm" onclick="event.stopPropagation();openDeepDive('${esc(ch.id)}','videos')">Full catalog →</button>
      </div>` : `<div style="font-size:11px;color:var(--t3);padding:8px 0">No other drops in ${raceState.range}d window.</div>`;

    return `
      <div class="rrow ${isMe?'me':''} ${isOpen?'open':''}" id="rrow-${esc(ch.id)}"
           onclick="raceToggleRow('${esc(ch.id)}')">
        <div class="rrow-rank">${medal}</div>
        <div class="rrow-ch">
          ${avatarHtml}
          <div class="rrow-ch-info">
            <div class="rrow-ch-name" onclick="event.stopPropagation();openDeepDive('${esc(ch.id)}','overview')">
              ${esc(ch.name)}
              ${isMe ? '<span class="you-chip">YOU</span>' : ''}
              ${isNew ? '<span class="new-dot">NEW</span>' : ''}
            </div>
            <div class="rrow-ch-ago">${ago(pub)}</div>
          </div>
        </div>
        <div class="rrow-vid">
          <div class="rrow-thumb-wrap">
            ${thumbHtml}
          </div>
          <div class="rrow-vid-title" title="${esc(v.title)}">${esc(v.title)}</div>
        </div>
        <div class="rrow-views">${fmtN(vc)}<br><span style="font-size:9.5px;color:var(--t3);font-family:var(--f-ui);font-weight:400">views</span></div>
        <div class="rrow-vel">${fmtN(vel)}<span style="font-size:9.5px;font-weight:400">/day</span> ⚡</div>
        <div class="rrow-eng">${eng !== null ? eng+'%' : '<span style="color:var(--t3)">—</span>'}</div>
        <div class="race-vs-wrap">
          <span class="race-vs-label">${Math.round(pct)}% of best</span>
          <div class="race-vs-track"><div class="race-vs-fill" style="width:${pct}%;background:${col}"></div></div>
        </div>
        <div class="rrow-chev"><span class="msi" style="font-size:18px">expand_more</span></div>
      </div>
      <div class="fold ${isOpen?'open':''}" id="rfold-${esc(ch.id)}">
        <div class="fold-inner">
          <div class="race-inset">${insetHtml}</div>
        </div>
      </div>`;
  }).join('');

  const mutedHtml = muted.map(r => {
    const col = colorOf(r.ch);
    const lastDate = r.ch.video?.date || '—';
    return `
      <div class="race-muted-row">
        <span class="race-muted-dot" style="background:${col}"></span>
        <span>${esc(r.ch.name)}</span>
        <span style="font-size:10.5px">— no drops in ${raceState.range}d window · last: ${lastDate}</span>
      </div>`;
  }).join('');

  const isSlim = raceState.slim === 1;
  const filterBadgeHtml = raceTopicFilter
    ? `<span class="badge bdg-pr" style="margin-left:8px;cursor:pointer" onclick="filterRaceByTopic(null)" title="Click to clear topic filter">
        topic: ${esc(raceTopicFilter)} ✕
       </span>`
    : '';

  el.innerHTML = `
    <div class="race-window">
      <div class="race-win-bar ${isSlim?'slim-mode':''}">
        <div class="race-pulse-dot"></div>
        <div class="race-title">LATEST DROPS${filterBadgeHtml} <span>· newest uploads head-to-head</span></div>
        <div class="race-controls">
          <div class="race-seg" data-tip="Time window">
            ${[7,30,90].map(d => `<button class="race-seg-btn ${raceState.range===d?'on':''}" onclick="setRaceRange(${d})">${d}d</button>`).join('')}
          </div>
          <div class="race-seg" data-tip="Sort by">
            <button class="race-seg-btn ${raceState.sort==='vel'?'on':''}" onclick="setRaceSort('vel')">⚡ Velocity</button>
            <button class="race-seg-btn ${raceState.sort==='views'?'on':''}" onclick="setRaceSort('views')">👁 Views</button>
            <button class="race-seg-btn ${raceState.sort==='newest'?'on':''}" onclick="setRaceSort('newest')">🕒 Newest</button>
          </div>
          <button class="icon-btn" onclick="raceExpandAll()" title="Expand / collapse all rows"><span class="msi" style="font-size:16px">unfold_more</span></button>
          <button class="icon-btn" onclick="raceToggleSlim()" title="Collapse window to caption bar"><span class="msi" style="font-size:16px">${isSlim?'expand_more':'remove'}</span></button>
        </div>
      </div>
      <div class="race-caption"><span>${caption}</span></div>
      ${isSlim ? '' : `<div class="race-body" id="raceBody">${rankedRowsHtml}${mutedHtml}</div>`}
    </div>`;
}

function setRaceRange(days) {
  raceState.range = days;
  localStorage.setItem('race.range', days);
  renderRaceWindow();
}

function setRaceSort(s) {
  raceState.sort = s;
  localStorage.setItem('race.sort', s);
  const body = document.getElementById('raceBody');
  if (body) flip(body, () => renderRaceWindow());
  else renderRaceWindow();
}

function raceToggleRow(id) {
  if (raceState.open.has(id)) {
    raceState.open.delete(id);
  } else {
    raceState.open.add(id);
  }
  const rowEl  = document.getElementById('rrow-' + id);
  const foldEl = document.getElementById('rfold-' + id);
  if (rowEl)  rowEl.classList.toggle('open', raceState.open.has(id));
  if (foldEl) foldEl.classList.toggle('open', raceState.open.has(id));
}

function raceExpandAll() {
  const rows = raceData().filter(r => r.vids[0]);
  const allOpen = rows.every(r => raceState.open.has(r.ch.id));
  if (allOpen) {
    raceState.open.clear();
  } else {
    rows.forEach(r => raceState.open.add(r.ch.id));
  }
  renderRaceWindow();
}

function raceToggleSlim() {
  raceState.slim = raceState.slim ? 0 : 1;
  localStorage.setItem('race.slim', raceState.slim);
  renderRaceWindow();
}

/* ══════════════════════════════════════════════════════════════════════════════
   T1: TOPIC INTELLIGENCE ENGINE
   ══════════════════════════════════════════════════════════════════════════════ */

const TOPIC_STOP = new Set(
  ('how,what,why,does,do,works,work,the,a,an,to,of,in,on,for,with,and,or,' +
   'using,use,used,that,this,you,your,my,we,it,is,are,was,were,be,been,' +
   'full,complete,explained,explaining,exploring,beginner,tutorial,guide,' +
   'vs,versus,part,ep,episode,series,video,watch,new,best,top,first,last,' +
   'make,made,making,build,built,building,get,got,just,even,can,could,would,' +
   'should,will,from,but,not,no,yes,all,more,most,less,one,two,three,four,' +
   'five,six,seven,eight,nine,ten,i,me,he,she,they,them,us,our,his,her,its,' +
   'inside,here,now,then,when,which,who,every,where,about,into,over,after,' +
   'before,much,many,some,other,back,also,only,very,well,still,down,up,out').split(',')
);

function topicTokens(title) {
  if (!title) return [];
  const words = title.toLowerCase()
    .replace(/[^\p{L}\p{N}\s+#]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !TOPIC_STOP.has(w))
    .map(w => TOPIC_ALIAS[w] || w);
  const tokens = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(words[i] + ' ' + words[i + 1]);
  }
  return tokens;
}

function topicFreqMap(videos) {
  const freq = new Map();
  videos.forEach(v => {
    const toks = topicTokens(v.title || '');
    new Set(toks).forEach(t => freq.set(t, (freq.get(t) || 0) + 1));
  });
  return freq;
}

function buildTopicCache() {
  const now = Date.now();

  // Gather all enriched videos
  const allVids = [];
  const perChVids = {};
  all.forEach(ch => {
    const en = _enrichCache[ch.id];
    if (!en || !en.vids) return;
    perChVids[ch.id] = en.vids;
    en.vids.forEach(v => allVids.push({ ...v, _chId: ch.id }));
  });

  if (!allVids.length) return;

  // Global freq pass
  const globalFreq = topicFreqMap(allVids);
  const validBigrams = new Set(
    [...globalFreq.entries()]
      .filter(([t, n]) => t.includes(' ') && n >= 3)
      .map(([t]) => t)
  );

  function cleanTokens(title) {
    const raw = topicTokens(title);
    return raw.filter(t => {
      if (t.includes(' ')) return validBigrams.has(t);
      return (globalFreq.get(t) || 0) >= 2;
    });
  }

  const topicMap = new Map();
  const cutRecent = now - 90 * 864e5;
  const cutOld    = now - 365 * 864e5;

  allVids.forEach(v => {
    const toks = cleanTokens(v.title || '');
    const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
    const eng = calcEngagementRate(v.like_count, v.comment_count, vc);
    const pub = new Date(v.published_at || v.date || 0).getTime();

    toks.forEach(t => {
      if (!topicMap.has(t)) {
        topicMap.set(t, { topic: t, n: 0, totalViews: 0, totalEng: 0, engCount: 0,
          lastUsed: 0, recentViews: [], oldViews: [], channels: new Set() });
      }
      const s = topicMap.get(t);
      s.n++;
      s.totalViews += vc;
      if (eng !== null) { s.totalEng += eng; s.engCount++; }
      if (pub > s.lastUsed) s.lastUsed = pub;
      s.channels.add(v._chId);
      if (pub >= cutRecent) s.recentViews.push(vc);
      else if (pub >= cutOld) s.oldViews.push(vc);
    });
  });

  const finalTopics = new Map();
  for (const [t, s] of topicMap) {
    if (s.n < 2) continue;
    const avgViews  = s.n > 0 ? Math.round(s.totalViews / s.n) : 0;
    const avgEng    = s.engCount > 0 ? parseFloat((s.totalEng / s.engCount).toFixed(1)) : null;
    const recentAvg = s.recentViews.length > 0 ? s.recentViews.reduce((a, b) => a + b, 0) / s.recentViews.length : 0;
    const oldAvg    = s.oldViews.length > 0    ? s.oldViews.reduce((a, b) => a + b, 0) / s.oldViews.length : 0;
    const hotScore  = Math.round(recentAvg * Math.log2(s.n + 1));
    const momentum  = (recentAvg > 0 && oldAvg > 0 && s.recentViews.length >= 2 && s.oldViews.length >= 2)
      ? parseFloat((recentAvg / oldAvg).toFixed(2)) : null;

    // Leading channel
    let leadChannel = null, leadMax = 0;
    s.channels.forEach(chId => {
      const chVids = (perChVids[chId] || []).filter(v => cleanTokens(v.title || '').includes(t));
      if (!chVids.length) return;
      const chAvg = chVids.reduce((a, v) => a + parseInt(v.view_count ?? v.views_raw ?? 0), 0) / chVids.length;
      if (chAvg > leadMax) { leadMax = chAvg; leadChannel = chId; }
    });

    finalTopics.set(t, {
      topic: t, n: s.n, avgViews, avgEng, lastUsed: s.lastUsed,
      recentAvg: Math.round(recentAvg), oldAvg: Math.round(oldAvg),
      hotScore, momentum, channels: [...s.channels], leadChannel
    });
  }

  // Per-channel topic stats
  const perChannel = new Map();
  all.forEach(ch => {
    const chVids = perChVids[ch.id] || [];
    if (!chVids.length) return;
    const chMap = new Map();
    chVids.forEach(v => {
      const toks = cleanTokens(v.title || '');
      const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
      const eng = calcEngagementRate(v.like_count, v.comment_count, vc);
      const pub = new Date(v.published_at || v.date || 0).getTime();
      toks.forEach(t => {
        if (!finalTopics.has(t)) return;
        if (!chMap.has(t)) chMap.set(t, { n: 0, totalViews: 0, totalEng: 0, engCount: 0, lastUsed: 0 });
        const s = chMap.get(t);
        s.n++; s.totalViews += vc;
        if (eng !== null) { s.totalEng += eng; s.engCount++; }
        if (pub > s.lastUsed) s.lastUsed = pub;
      });
    });
    const chTopics = new Map();
    for (const [t, s] of chMap) {
      chTopics.set(t, {
        topic: t, n: s.n,
        avgViews: s.n ? Math.round(s.totalViews / s.n) : 0,
        avgEng: s.engCount ? parseFloat((s.totalEng / s.engCount).toFixed(1)) : null,
        lastUsed: s.lastUsed
      });
    }
    perChannel.set(ch.id, chTopics);
  });

  _topicCache.topics = finalTopics;
  _topicCache.perChannel = perChannel;
  _topicCache.ts = now;

  try {
    const serializable = {
      ts: now,
      topics: [...finalTopics.entries()],
      perChannel: [...perChannel.entries()].map(([id, m]) => [id, [...m.entries()]])
    };
    localStorage.setItem('yt_topic_cache', JSON.stringify(serializable));
  } catch {}
}

function loadTopicCacheFromStorage() {
  try {
    const raw = JSON.parse(localStorage.getItem('yt_topic_cache') || 'null');
    if (!raw || Date.now() - raw.ts > 7 * 864e5 * 1000) return false;
    _topicCache.topics = new Map(raw.topics);
    _topicCache.perChannel = new Map(raw.perChannel.map(([id, entries]) => [id, new Map(entries)]));
    _topicCache.ts = raw.ts;
    return true;
  } catch { return false; }
}

function saveTopicAlias(from, to) {
  TOPIC_ALIAS[from] = to;
  try { localStorage.setItem('yt_topic_aliases', JSON.stringify(TOPIC_ALIAS)); } catch {}
  buildTopicCache();
  renderTopicRadar();
}

function computeTopicGaps(primaryId) {
  if (!primaryId || !_topicCache.topics.size) return { gaps: [], moats: [] };

  const myTopics   = _topicCache.perChannel.get(primaryId) || new Map();
  const fieldTopics = _topicCache.topics;
  const allAvgViews = [...fieldTopics.values()].map(t => t.avgViews).sort((a, b) => a - b);
  const medianFieldAvg = allAvgViews[Math.floor(allAvgViews.length / 2)] || 0;

  const gaps = [], moats = [];
  for (const [t, stat] of fieldTopics) {
    const myStat = myTopics.get(t);
    const myN    = myStat?.n || 0;
    if (myN === 0 && stat.avgViews >= medianFieldAvg && stat.n >= 3) {
      gaps.push({ topic: t, fieldAvg: stat.avgViews, fieldN: stat.n, hotScore: stat.hotScore, momentum: stat.momentum });
    }
    if (myStat && myStat.n >= 2 && stat.leadChannel === primaryId) {
      const rivalCount = stat.channels.filter(id => id !== primaryId)
        .map(id => _topicCache.perChannel.get(id)?.get(t)?.n || 0)
        .filter(n => n > 0).length;
      if (rivalCount <= 1) {
        moats.push({ topic: t, myN: myStat.n, myAvg: myStat.avgViews, rivalCount });
      }
    }
  }
  gaps.sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));
  moats.sort((a, b) => b.myAvg - a.myAvg);
  return { gaps: gaps.slice(0, 5), moats: moats.slice(0, 3) };
}

async function topicDeepScan(chId) {
  const DEEP_KEY = 'yt_deepscan_' + chId;
  try {
    const cached = JSON.parse(localStorage.getItem(DEEP_KEY) || 'null');
    if (cached && Date.now() - cached.ts < 7 * 864e5 * 1000) {
      _enrichCache[chId] = { ..._enrichCache[chId], vids: cached.vids, deepScanned: true };
      buildTopicCache();
      toast('Using cached deep scan (7-day)', 's');
      return;
    }
  } catch {}
  // Disable button during fetch
  const btn = document.querySelector(`[onclick*="topicDeepScan('${chId}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
  toast('Deep scanning… (~4 API units)', '');
  try {
    const r = await fetch(`/api/channels/${chId}/videos?max=200`);
    const vids = await r.json();
    if (!Array.isArray(vids)) throw new Error('bad response');
    try { localStorage.setItem(DEEP_KEY, JSON.stringify({ ts: Date.now(), vids })); } catch {}
    _enrichCache[chId] = { ..._enrichCache[chId], vids, deepScanned: true };
    buildTopicCache();
    toast('Deep scan complete!', 's');
    if (ddChannelId === chId) renderDDTopics(all.find(c => c.id === chId));
    renderTopicRadar();
  } catch {
    toast('Deep scan failed', 'e');
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Deep Scan'; }
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   T2: TOPIC RADAR CARD (Dashboard)
   ══════════════════════════════════════════════════════════════════════════════ */

function filterRaceByTopic(topic) {
  raceTopicFilter = raceTopicFilter === topic ? null : topic;
  renderRaceWindow();
  document.querySelector('.race-window')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setTopicRadarRange(r) {
  topicRadarRange = r;
  localStorage.setItem('topic.range', r);
  renderTopicRadar();
}

function renderTopicRadar() {
  const el = document.getElementById('dashTopicRadar');
  if (!el) return;

  if (!_topicCache.topics.size) {
    el.innerHTML = `
      <div class="topic-radar-card">
        <div class="topic-radar-hdr">
          <div class="topic-radar-title">
            <span class="msi" style="color:var(--down)">local_fire_department</span>
            TOPIC RADAR <span>· what's hot across your field</span>
          </div>
        </div>
        <div style="padding:24px;color:var(--t3);font-size:12px;text-align:center;display:flex;align-items:center;justify-content:center;gap:10px;min-height:80px">
          <div class="spin"></div>
          Building topic index from cached videos… Enrich a few channels to begin.
        </div>
      </div>`;
    return;
  }

  const primary = all.find(c => c.is_primary) || all[0];
  const primaryId = primary?.id;

  const rangeMs = topicRadarRange === '6m' ? 180 * 864e5 : topicRadarRange === 'all' ? Infinity : 90 * 864e5;
  const cutTs = isFinite(rangeMs) ? Date.now() - rangeMs : 0;

  const sortedTopics = [..._topicCache.topics.values()]
    .filter(t => t.n >= 2 && (rangeMs === Infinity || t.lastUsed >= cutTs))
    .sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));

  const hotTopics    = sortedTopics.slice(0, 10);
  const matrixTopics = hotTopics.slice(0, 8);
  const { gaps, moats } = computeTopicGaps(primaryId);

  // Active topic filter chip in race window
  const filterChipHtml = raceTopicFilter
    ? `<span class="badge bdg-pr" style="margin-left:8px;cursor:pointer" onclick="filterRaceByTopic(null)">
        filter: ${esc(raceTopicFilter)} ×
       </span>` : '';

  // Hot list
  const hotListHtml = hotTopics.length ? hotTopics.map((t, i) => {
    const leadCh  = all.find(c => c.id === t.leadChannel);
    const leadCol = leadCh ? colorOf(leadCh) : 'var(--t3)';
    const isFiltered = raceTopicFilter === t.topic;
    const mom = t.momentum;
    const momHtml = mom !== null
      ? `<span style="color:${mom >= 1.2 ? 'var(--up)' : mom <= 0.8 ? 'var(--down)' : 'var(--t3)'};">${mom >= 1 ? '▲' : '▼'}${mom.toFixed(1)}×</span>`
      : `<span style="color:var(--t3)">•</span>`;
    return `
      <div class="topic-hot-row ${isFiltered ? 'filtered' : ''}" onclick="filterRaceByTopic('${esc(t.topic)}')" title="Click to filter race window">
        <span class="topic-rank-chip">${i + 1}</span>
        <div class="topic-hot-body">
          <div class="topic-hot-name">${esc(t.topic)}</div>
          <div class="topic-hot-meta">
            <span style="color:var(--t3)">${t.n} vid${t.n !== 1 ? 's' : ''}</span>
            ${leadCh ? ` · <span style="color:${leadCol}">●</span> ${esc(leadCh.name)}` : ''}
          </div>
        </div>
        <div class="topic-hot-stats">
          <span class="topic-score">🔥${fmtN(t.hotScore)}</span>
          ${momHtml}
        </div>
      </div>`;
  }).join('') : `<div style="color:var(--t3);font-size:11.5px;padding:12px 0">No topics in this range yet.</div>`;

  // Gap + moat chips
  const gapChips = gaps.slice(0, 3).map(g => `
    <div class="topic-gap-chip" title="Field avg: ${fmtN(g.fieldAvg)} · ${g.fieldN} videos">
      <span class="msi" style="font-size:13px;color:var(--acc)">search_off</span>
      <span>${esc(g.topic)}</span>
      <span class="topic-gap-stat">${fmtN(g.fieldAvg)} avg · you: 0</span>
    </div>`).join('');

  const moatChips = moats.slice(0, 2).map(m => `
    <div class="topic-moat-chip" title="You lead on this topic (${m.myN} vids, ${m.rivalCount} rival)">
      <span class="msi" style="font-size:13px;color:var(--me)">shield</span>
      <span>${esc(m.topic)}</span>
      <span class="topic-moat-stat">YOU #1 🛡</span>
    </div>`).join('');

  // Heat matrix
  const matrixChannels = [...all]
    .sort((a, b) => (b.subscribers_raw || 0) - (a.subscribers_raw || 0))
    .slice(0, 8);

  const matrixHeaderHtml = `<tr>
    <th class="matrix-topic-col">Topic</th>
    ${matrixChannels.map(ch => {
      const col = colorOf(ch);
      const isMe = ch.is_primary;
      return `<th class="matrix-ch-col ${isMe ? 'matrix-me-col' : ''}">
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          ${ch.logo_url
            ? `<img src="${esc(proxyImg(ch.logo_url))}" style="width:22px;height:22px;border-radius:50%;border:1.5px solid ${col};object-fit:cover">`
            : `<div style="width:22px;height:22px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">${(ch.name||'?')[0]}</div>`}
          <span style="font-size:9px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52px">${esc(ch.name.length > 7 ? ch.name.slice(0, 7) + '…' : ch.name)}</span>
        </div>
      </th>`;
    }).join('')}
  </tr>`;

  const globalMaxAvg = Math.max(...matrixTopics.map(t => t.avgViews), 1);
  const matrixRowsHtml = matrixTopics.map(t => {
    const cells = matrixChannels.map(ch => {
      const chStat = _topicCache.perChannel.get(ch.id)?.get(t.topic);
      if (!chStat || !chStat.n) {
        return `<td class="matrix-cell empty" onclick="showTopicCellPopover(event,'${esc(ch.id)}','${esc(t.topic)}')"
          title="${esc(ch.name)} · 0 videos on '${esc(t.topic)}'">
          <span class="matrix-empty-dash">—</span>
        </td>`;
      }
      const col = colorOf(ch);
      // Parse hsl to build hsla
      const opacity = 0.12 + (chStat.avgViews / globalMaxAvg) * 0.78;
      const bgStyle = col.startsWith('hsl(')
        ? col.replace('hsl(', 'hsla(').replace(')', `,${opacity.toFixed(2)})`)
        : col;
      return `<td class="matrix-cell ${ch.is_primary ? 'matrix-me-cell' : ''}"
        style="background:${bgStyle}"
        onclick="showTopicCellPopover(event,'${esc(ch.id)}','${esc(t.topic)}')"
        title="${esc(ch.name)} · ${chStat.n} vid${chStat.n !== 1 ? 's' : ''} · avg ${fmtN(chStat.avgViews)}">
        <span class="matrix-cell-val">${fmtN(chStat.avgViews)}</span>
        <span class="matrix-cell-n">${chStat.n}v</span>
      </td>`;
    }).join('');
    return `<tr>
      <td class="matrix-topic-label" onclick="filterRaceByTopic('${esc(t.topic)}')" title="Filter race window by this topic">${esc(t.topic)}</td>
      ${cells}
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="topic-radar-card">
      <div class="topic-radar-hdr">
        <div class="topic-radar-title">
          <span class="msi" style="color:var(--down)">local_fire_department</span>
          TOPIC RADAR${filterChipHtml}
          <span>· what's hot across your field</span>
        </div>
        <div class="race-seg">
          ${['90d','6m','all'].map(r => `
            <button class="race-seg-btn ${topicRadarRange === r ? 'on' : ''}"
              onclick="setTopicRadarRange('${r}')">${r}</button>`).join('')}
        </div>
      </div>

      <div class="topic-radar-body">
        <div class="topic-hot-col">
          <div class="topic-section-label">HOT NOW</div>
          <div class="topic-hot-list">${hotListHtml}</div>
          ${(gapChips || moatChips) ? `
          <div class="topic-section-label" style="margin-top:12px">YOUR POSITION</div>
          <div class="topic-chips-row">${gapChips}${moatChips}</div>` : ''}
        </div>
        <div class="topic-matrix-col">
          <div class="topic-section-label">HEAT MATRIX · who owns what topic</div>
          <div style="overflow-x:auto">
            <table class="topic-matrix">
              <thead>${matrixHeaderHtml}</thead>
              <tbody>${matrixRowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    <div class="topic-cell-popover" id="topicCellPopover">
      <div class="topic-cell-popover-hdr" id="topicCellPopoverHdr"></div>
      <div class="topic-cell-popover-list" id="topicCellPopoverList"></div>
    </div>`;
}

function showTopicCellPopover(event, chId, topic) {
  event.stopPropagation();
  const popover = document.getElementById('topicCellPopover');
  if (!popover) return;

  const ch   = all.find(c => c.id === chId);
  const en   = _enrichCache[chId];
  const vids = (en?.vids || []).filter(v => {
    const toks = topicTokens(v.title || '');
    return toks.includes(topic) || toks.some(t => t === topic);
  });

  document.getElementById('topicCellPopoverHdr').innerHTML =
    `<strong style="color:var(--t1)">${esc(topic)}</strong> <span style="color:var(--t3)">· ${esc(ch?.name || chId)}</span>`;

  document.getElementById('topicCellPopoverList').innerHTML = !vids.length
    ? `<div style="color:var(--t3);font-size:11px;padding:8px 0">No videos on this topic cached yet.</div>`
    : vids.slice(0, 4).map(v => {
        const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
        return `<a class="topic-cell-vid-row" href="${esc(v.url)}" target="_blank" rel="noopener">
          <img src="${esc(v.thumb||'')}" style="width:52px;height:30px;object-fit:cover;border-radius:3px;background:var(--bg-1)" onerror="this.style.opacity='.3'">
          <div style="min-width:0">
            <div style="font-size:11px;font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.title)}</div>
            <div style="font-size:10px;color:var(--t3)">${fmtN(vc)} views · ${ago(v.published_at||v.date)}</div>
          </div>
        </a>`;
      }).join('');

  const rect = event.currentTarget?.getBoundingClientRect() || { left: event.clientX, bottom: event.clientY };
  popover.style.left = Math.min(rect.left, window.innerWidth - 290) + window.scrollX + 'px';
  popover.style.top  = (rect.bottom + window.scrollY + 6) + 'px';
  popover.classList.add('open');
}

// Close cell popover on outside click
document.addEventListener('click', e => {
  const p = document.getElementById('topicCellPopover');
  if (p && p.classList.contains('open') && !p.contains(e.target)) {
    p.classList.remove('open');
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   T3: DEEP DIVE — TOPICS TAB (5th tab)
   ══════════════════════════════════════════════════════════════════════════════ */

function renderDDTopics(ch) {
  const panel = document.getElementById('ddPanel-topics');
  if (!panel || !ch) return;

  if (!_topicCache.topics.size) {
    buildTopicCache();
  }

  const primaryId    = (all.find(c => c.is_primary) || all[0])?.id;
  const myTopics     = _topicCache.perChannel.get(ch.id) || new Map();
  const globalTopics = _topicCache.topics;
  const col          = colorOf(ch);
  const isMe         = ch.is_primary;
  const isDeepScanned = !!_enrichCache[ch.id]?.deepScanned;

  const chTopicsSorted = [...myTopics.values()]
    .filter(t => t.n >= 1)
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 12);

  const maxChAvg = chTopicsSorted.length ? chTopicsSorted[0].avgViews : 1;

  // Rising topic: positive momentum in global index
  const risingEntry = [...myTopics.values()]
    .filter(t => (globalTopics.get(t.topic)?.momentum || 0) > 1.2)
    .sort((a, b) => (globalTopics.get(b.topic)?.momentum || 0) - (globalTopics.get(a.topic)?.momentum || 0))[0];

  // My stats for vs overlay
  const myChTopics = primaryId !== ch.id ? (_topicCache.perChannel.get(primaryId) || new Map()) : new Map();

  const rowsHtml = chTopicsSorted.map((t, i) => {
    const globalT = globalTopics.get(t.topic);
    const pct     = maxChAvg > 0 ? Math.max(4, Math.round(t.avgViews / maxChAvg * 100)) : 4;
    const myStat  = myChTopics.get(t.topic);
    const myPct   = myStat && maxChAvg > 0 ? Math.max(2, Math.round(myStat.avgViews / maxChAvg * 100)) : 0;
    const mom     = globalT?.momentum ?? null;
    const momHtml = mom !== null
      ? `<span style="color:${mom >= 1.2 ? 'var(--up)' : mom <= 0.8 ? 'var(--down)' : 'var(--t3)'};font-family:var(--f-mono);font-size:11px">${mom >= 1 ? '▲' : '▼'}${mom.toFixed(1)}×</span>`
      : `<span style="color:var(--t3)">•</span>`;

    return `
      <div class="dd-topic-row">
        <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--t3);width:18px;flex-shrink:0">#${i + 1}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:700;color:var(--t1)">${esc(t.topic)}</span>
            ${momHtml}
            ${globalT?.hotScore ? `<span class="badge bdg-dim">🔥${fmtN(globalT.hotScore)}</span>` : ''}
            ${t.avgEng !== null ? `<span class="badge bdg-dim">${t.avgEng}% eng</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
            <div style="flex:1;max-width:200px;height:6px;background:var(--bg-1);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${col};border-radius:3px;transition:width .6s var(--e-out)"></div>
            </div>
            <span style="font-family:var(--f-mono);font-size:11.5px;font-weight:700;color:var(--t1)">${fmtN(t.avgViews)}</span>
            <span style="font-size:10.5px;color:var(--t3)">${t.n} vid${t.n !== 1 ? 's' : ''} · ${ago(t.lastUsed)}</span>
          </div>
          ${(!isMe && myStat) ? `
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;max-width:200px;height:4px;background:var(--bg-1);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${myPct}%;background:var(--me);border-radius:3px;transition:width .6s var(--e-out)"></div>
            </div>
            <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--me)">${fmtN(myStat.avgViews)}</span>
            <span style="font-size:9.5px;color:var(--t3)">you · ${myStat.n}v</span>
          </div>` : ''}
          ${(!isMe && !myStat) ? `
          <div style="font-size:10px;color:var(--down);margin-top:2px">← you: 0 videos on this topic</div>` : ''}
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:18px">

      ${risingEntry ? `
      <div class="card" style="border-left:3px solid var(--up);flex-direction:row;align-items:center;gap:14px;padding:14px 16px">
        <span class="msi" style="color:var(--up);font-size:28px;flex-shrink:0">trending_up</span>
        <div>
          <div style="font-size:10.5px;font-weight:700;color:var(--up);text-transform:uppercase;letter-spacing:.06em">Rising Topic</div>
          <div style="font-size:15px;font-weight:700;color:var(--t1);margin:2px 0">${esc(risingEntry.topic)}</div>
          <div style="font-size:11.5px;color:var(--t2)">${fmtN(risingEntry.avgViews)} avg · ${risingEntry.n} videos · momentum ${(globalTopics.get(risingEntry.topic)?.momentum ?? 0).toFixed(1)}×</div>
        </div>
      </div>` : ''}

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="sect-lbl" style="margin:0">
            <span class="msi">local_fire_department</span> Top Topics
          </div>
          ${!isMe ? `<span style="font-size:11px;color:var(--t3)">
            <span style="color:${col}">●</span> ${esc(ch.name)} &nbsp;
            <span style="color:var(--me)">●</span> You (overlay)
          </span>` : ''}
        </div>
        ${chTopicsSorted.length
          ? `<div style="display:flex;flex-direction:column">${rowsHtml}</div>`
          : `<div style="color:var(--t3);text-align:center;padding:24px;font-size:12px">No topics detected yet.<br>Try Deep Scan for richer history.</div>`}
      </div>

      <div class="card" style="flex-direction:row;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--t2)">Deep Scan (200 videos)</div>
          <div style="font-size:11px;color:var(--t3)">Richer topic history · ≈4 API units · cached 7 days</div>
        </div>
        <button class="btn ${isDeepScanned ? 'btn-gh' : 'btn-acc'} btn-sm"
          onclick="topicDeepScan('${esc(ch.id)}')"
          ${isDeepScanned ? 'disabled' : ''}>
          ${isDeepScanned ? '✓ Already scanned' : '⚡ Deep Scan'}
        </button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   T4: MY PULSE POPOVER
   ══════════════════════════════════════════════════════════════════════════════ */

function toggleMyPulse() {
  const pop = document.getElementById('myPulsePopover');
  if (!pop) return;
  if (pop.classList.contains('open')) { pop.classList.remove('open'); return; }
  renderMyPulse();
  pop.classList.add('open');
}

async function renderMyPulse() {
  const pop = document.getElementById('myPulsePopover');
  if (!pop) return;

  const me = all.find(c => c.is_primary) || all[0];
  if (!me) {
    pop.innerHTML = `<div style="padding:16px;color:var(--t3);font-size:12px">No primary channel set.<br>Click "Set Mine" on any channel.</div>`;
    return;
  }

  pop.innerHTML = `<div style="padding:16px;display:flex;align-items:center;gap:8px;color:var(--t3)"><div class="spin"></div> Loading…</div>`;

  const en = await enrich(me.id) || {};
  const allVids = en.vids || [];
  const longForm = allVids.filter(v => !isYouTubeShort(v));

  // 7-day spark from recent vids (use sp30 if available)
  const sparkData = en.sp30?.slice(-7) || longForm.slice(0, 7).map(v => parseInt(v.view_count ?? v.views_raw ?? 0)).reverse();

  // Cadence / overdue detection
  let cadenceMsg = '', cadenceWarn = false;
  if (longForm.length >= 2) {
    const pub0 = new Date(longForm[0].published_at || longForm[0].date || 0).getTime();
    const daysSince = Math.floor((Date.now() - pub0) / 864e5);
    const intervals = [];
    for (let i = 0; i < Math.min(longForm.length - 1, 5); i++) {
      const a = new Date(longForm[i].published_at   || longForm[i].date || 0).getTime();
      const b = new Date(longForm[i+1].published_at || longForm[i+1].date || 0).getTime();
      if (a && b) intervals.push(Math.abs(a - b) / 864e5);
    }
    if (intervals.length) {
      const median = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
      cadenceWarn = daysSince > median * 1.5;
      cadenceMsg = `${daysSince}d since upload · median ${Math.round(median)}d${cadenceWarn ? ' → ⚠ overdue' : ' → on track'}`;
    }
  }

  // Velocity vs avg
  let velMsg = '';
  if (longForm.length >= 2) {
    const latest = longForm[0];
    const latestVc = parseInt(latest.view_count ?? latest.views_raw ?? 0);
    const latestPub = new Date(latest.published_at || latest.date || 0).getTime();
    const latestDays = Math.max(1, (Date.now() - latestPub) / 864e5);
    const latestVpd = latestVc / latestDays;
    const prevVpds = longForm.slice(1, 6).map(v => {
      const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
      const pub = new Date(v.published_at || v.date || 0).getTime();
      const days = Math.max(1, (Date.now() - pub) / 864e5);
      return vc / days;
    });
    const avgVpd = prevVpds.reduce((a, b) => a + b, 0) / Math.max(1, prevVpds.length);
    const ratio = avgVpd > 0 ? latestVpd / avgVpd : 1;
    const arrow = ratio >= 1.3 ? '▲' : ratio <= 0.7 ? '▼' : '~';
    const arrowColor = ratio >= 1.3 ? 'var(--up)' : ratio <= 0.7 ? 'var(--down)' : 'var(--t3)';
    velMsg = `Latest: <span style="font-family:var(--f-mono);color:var(--acc)">${fmtN(Math.round(latestVpd))}/day</span> <span style="color:${arrowColor}">${arrow}${ratio.toFixed(1)}×</span> your avg`;
  }

  // Next milestone ring
  const subRaw = me.subscribers_raw || 0;
  const stones = [1e3,5e3,10e3,25e3,50e3,100e3,250e3,500e3,1e6,2e6,5e6,10e6,50e6,100e6];
  const ms = stones.find(s => s > subRaw);
  const msPct = ms ? Math.min(99, (subRaw / ms) * 100) : 100;
  const circum = 2 * Math.PI * 10; // r=10 → ~62.8
  const dash = msPct / 100 * circum;
  const msRingSvg = ms ? `
    <svg class="milestone-ring" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--bg-3)" stroke-width="2.5"/>
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--me)" stroke-width="2.5"
        stroke-dasharray="${circum.toFixed(1)}"
        stroke-dashoffset="${(circum - dash).toFixed(1)}"
        stroke-linecap="round" transform="rotate(-90 12 12)"/>
    </svg>` : '';

  pop.innerHTML = `
    <div class="my-pulse-hdr">
      ${me.logo_url ? `<img src="${esc(proxyImg(me.logo_url))}" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--me);object-fit:cover">` : ''}
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--t1)">${esc(me.name)}</div>
        <div style="font-size:10.5px;color:var(--t3)">${esc(me.subscribers)} subs · ${me.total_videos} videos</div>
      </div>
    </div>
    <div class="my-pulse-body">
      ${sparkData.length ? `
      <div class="my-pulse-row">
        <span style="color:var(--t3);font-size:11px">7-day spark</span>
        ${sparkSVG(sparkData, 90, 20, 'var(--me)')}
      </div>` : ''}

      ${ms ? `
      <div class="my-pulse-row">
        <span style="color:var(--t3);font-size:11px">Next: ${fmtN(ms)}</span>
        <div style="display:flex;align-items:center;gap:6px">
          ${msRingSvg}
          <span style="font-family:var(--f-mono);font-size:11px;color:var(--me)">${msPct.toFixed(0)}%</span>
        </div>
      </div>` : ''}

      ${cadenceMsg ? `
      <div class="my-pulse-row ${cadenceWarn ? 'warn' : ''}">
        <span class="msi" style="font-size:14px;color:${cadenceWarn ? 'var(--warn)' : 'var(--t3)'}">schedule</span>
        <span style="font-size:11px;flex:1">${cadenceMsg}</span>
      </div>` : ''}

      ${velMsg ? `
      <div class="my-pulse-row">
        <span class="msi" style="font-size:14px;color:var(--t3)">bolt</span>
        <span style="font-size:11px;flex:1">${velMsg}</span>
      </div>` : ''}

      <div class="my-pulse-row" style="font-family:var(--f-mono);font-size:12.5px;color:var(--me);font-weight:700">
        ${esc(me.subscribers)} subscribers
      </div>
    </div>
    <div class="my-pulse-footer">
      <button class="btn btn-gh btn-sm" onclick="toggleMyPulse();sp('dash')">Dashboard →</button>
      <button class="btn btn-gh btn-sm" onclick="refreshOne('${esc(me.id)}').then(()=>renderMyPulse())">Refresh ↺</button>
    </div>`;
}

// Close pulse popover on outside click
document.addEventListener('click', e => {
  const pop = document.getElementById('myPulsePopover');
  const btn = document.getElementById('myPulseBtn');
  if (pop && pop.classList.contains('open') && !pop.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
    pop.classList.remove('open');
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   T5: TOPIC-AWARE ALERTS
   ══════════════════════════════════════════════════════════════════════════════ */

const _alertDedup = new Set();
try {
  const saved = JSON.parse(localStorage.getItem('yt_alert_dedup') || '[]');
  saved.forEach(k => _alertDedup.add(k));
} catch {}

function topicAlerts_check(ch, newVids) {
  if (!ch || !newVids || !newVids.length) return;
  const primary = all.find(c => c.is_primary);
  if (!primary || !_topicCache.topics.size) return;

  const { moats, gaps } = computeTopicGaps(primary.id);
  const moatTopics = new Set(moats.map(m => m.topic));
  const gapTopics  = new Set(gaps.map(g => g.topic));
  const todayKey   = new Date().toISOString().slice(0, 10);

  newVids.forEach(v => {
    const toks = new Set(topicTokens(v.title || ''));

    moatTopics.forEach(t => {
      if (!toks.has(t) || ch.id === primary.id) return;
      const dk = `threat:${t}:${ch.id}:${todayKey}`;
      if (_alertDedup.has(dk)) return;
      _alertDedup.add(dk);
      pushTopicAlert({ type: 'threat', icon: 'warning', color: 'var(--down)',
        title: `${esc(ch.name)} published on your moat: ${t}`,
        body: v.title, url: v.url });
    });

    toks.forEach(t => {
      const stat = _topicCache.topics.get(t);
      if (!stat || (stat.momentum || 0) < 2 || ch.id === primary.id) return;
      const dk = `opp:${t}:${todayKey}`;
      if (_alertDedup.has(dk)) return;
      _alertDedup.add(dk);
      pushTopicAlert({ type: 'opportunity', icon: 'trending_up', color: 'var(--up)',
        title: `Hot topic spiking: ${t} (${(stat.momentum || 0).toFixed(1)}×)`,
        body: `${esc(ch.name)} → ${v.title}`, url: v.url });
    });

    gapTopics.forEach(t => {
      if (!toks.has(t) || ch.id === primary.id) return;
      const dk = `gap:${t}:${ch.id}:${todayKey}`;
      if (_alertDedup.has(dk)) return;
      _alertDedup.add(dk);
      pushTopicAlert({ type: 'gap', icon: 'search_off', color: 'var(--warn)',
        title: `Rival covered your gap: ${t}`,
        body: `${esc(ch.name)} → ${v.title}`, url: v.url });
    });
  });

  // Persist dedup set (keep only today's)
  try { localStorage.setItem('yt_alert_dedup', JSON.stringify([..._alertDedup])); } catch {}
}

function pushTopicAlert({ type, icon, color, title, body, url }) {
  // Toast notification
  toast(`${title}`, type === 'threat' ? 'e' : type === 'opportunity' ? 's' : '');
}

/* ══════════════════════════════════════════════════════════════════════════════
   PHASE 8: COMPETITIVE INTELLIGENCE ENGINE (⚔️ COMPETE)
   ══════════════════════════════════════════════════════════════════════════════ */

// C1: Closest-Threat Jaccard Topic Overlap Score
function calcThreatScore(chId, primaryId) {
  if (!primaryId || chId === primaryId || !_topicCache.topics.size) {
    return { score: 0, sharedTopics: [] };
  }
  const myTopics = _topicCache.perChannel.get(primaryId);
  const rivalTopics = _topicCache.perChannel.get(chId);
  if (!myTopics || !rivalTopics || !myTopics.size || !rivalTopics.size) {
    return { score: 0, sharedTopics: [] };
  }

  const myTop = new Set([...myTopics.values()].sort((a, b) => b.n - a.n).slice(0, 20).map(t => t.topic));
  const rivalTop = new Set([...rivalTopics.values()].sort((a, b) => b.n - a.n).slice(0, 20).map(t => t.topic));

  const shared = [];
  myTop.forEach(t => {
    if (rivalTop.has(t)) shared.push(t);
  });

  const union = new Set([...myTop, ...rivalTop]).size;
  const score = union > 0 ? Math.round((shared.length / union) * 100) : 0;
  return { score, sharedTopics: shared };
}

// C2: Copycat Detector (token overlap >= 60%)
function detectCopycatsForVideo(v, myTopVids) {
  if (!myTopVids || !myTopVids.length) return null;
  const vToks = new Set(topicTokens(v.title || ''));
  if (vToks.size < 2) return null;

  for (const myV of myTopVids) {
    const myToks = new Set(topicTokens(myV.title || ''));
    if (myToks.size < 2) continue;

    let matchCount = 0;
    vToks.forEach(t => { if (myToks.has(t)) matchCount++; });
    const minSize = Math.min(vToks.size, myToks.size);
    const overlap = minSize > 0 ? (matchCount / minSize) : 0;

    const pubV = new Date(v.published_at || v.date || 0).getTime();
    const pubMy = new Date(myV.published_at || myV.date || 0).getTime();

    if (overlap >= 0.60 && pubV >= pubMy - 864e5) {
      return {
        myTitle: myV.title,
        overlapPct: Math.round(overlap * 100),
        myViews: parseInt(myV.view_count ?? myV.views_raw ?? 0)
      };
    }
  }
  return null;
}

// C3: Collision Insight Detector (Traffic Shadow)
function detectCollisionForVideo(myVid, allChannels, primaryId) {
  const pub = new Date(myVid.published_at || myVid.date || 0).getTime();
  if (!pub) return null;

  const myToks = new Set(topicTokens(myVid.title || ''));
  const myCh = allChannels.find(c => c.id === primaryId) || allChannels[0];
  const mySubs = myCh?.subscribers_raw || 0;

  for (const ch of allChannels) {
    if (ch.id === primaryId) continue;
    const rivalSubs = ch.subscribers_raw || 0;
    if (rivalSubs < mySubs * 1.8) continue;

    const en = _enrichCache[ch.id];
    if (!en || !en.vids) continue;

    for (const rv of en.vids) {
      const rPub = new Date(rv.published_at || rv.date || 0).getTime();
      const diffHours = Math.abs(pub - rPub) / 3600000;

      if (diffHours <= 24) {
        const rToks = new Set(topicTokens(rv.title || ''));
        let sharedTopic = null;
        for (const t of myToks) {
          if (rToks.has(t)) { sharedTopic = t; break; }
        }
        if (sharedTopic) {
          return {
            rivalCh: ch.name,
            rivalVidTitle: rv.title,
            hoursDiff: Math.round(diffHours),
            sharedTopic,
            isEarlier: rPub <= pub
          };
        }
      }
    }
  }
  return null;
}

// C4: Evergreen vs. Hype Fingerprint
function calcEvergreenFingerprint(vids) {
  if (!vids || !vids.length) return { ratio: 50, label: 'Balanced', type: 'balanced', icon: 'balance' };
  const sortedByViews = [...vids].sort((a, b) => (parseInt(b.view_count ?? b.views_raw ?? 0)) - (parseInt(a.view_count ?? a.views_raw ?? 0)));
  const top10 = sortedByViews.slice(0, 10);
  if (!top10.length) return { ratio: 50, label: 'Balanced', type: 'balanced', icon: 'balance' };

  const now = Date.now();
  const ONE_YEAR = 365 * 864e5;
  const oldies = top10.filter(v => {
    const pub = new Date(v.published_at || v.date || 0).getTime();
    return pub > 0 && (now - pub) >= ONE_YEAR;
  });

  const ratio = Math.round((oldies.length / top10.length) * 100);
  if (ratio >= 60) {
    return { ratio, label: `Evergreen (${ratio}%)`, type: 'evergreen', icon: 'park' };
  } else if (ratio <= 25) {
    return { ratio: 100 - ratio, label: `Hype-Driven (${100 - ratio}%)`, type: 'hype', icon: 'bolt' };
  }
  return { ratio, label: `Balanced (${ratio}%)`, type: 'balanced', icon: 'balance' };
}

// C5: Series Detector
function detectSeries(vids) {
  if (!vids || vids.length < 3) return [];
  const seriesMap = new Map();
  const seriesRegex = /\b(part|ep|episode|#|vol|volume|chapter)\s*(\d+)\b/i;

  const totalV = vids.reduce((s, v) => s + (parseInt(v.view_count ?? v.views_raw ?? 0) || 0), 0);
  const chAvg = totalV / vids.length;

  vids.forEach(v => {
    const title = v.title || '';
    const m = title.match(seriesRegex);
    let seriesName = null;
    let epNum = 0;

    if (m) {
      epNum = parseInt(m[2]) || 1;
      seriesName = title.slice(0, m.index).replace(/[-:–|]$/, '').trim();
    } else {
      const parts = title.split(/[-:|–]/);
      if (parts.length >= 2 && parts[0].trim().length >= 4) {
        seriesName = parts[0].trim();
      }
    }

    if (seriesName && seriesName.length >= 3) {
      if (!seriesMap.has(seriesName)) {
        seriesMap.set(seriesName, { name: seriesName, vids: [] });
      }
      seriesMap.get(seriesName).vids.push({ ...v, _ep: epNum });
    }
  });

  const detected = [];
  for (const [name, entry] of seriesMap) {
    if (entry.vids.length >= 2) {
      const sVids = entry.vids;
      const sTotal = sVids.reduce((s, v) => s + (parseInt(v.view_count ?? v.views_raw ?? 0) || 0), 0);
      const sAvg = Math.round(sTotal / sVids.length);
      const ratio = chAvg > 0 ? (sAvg / chAvg) : 1;
      const status = ratio >= 1.25 ? 'double_down' : ratio <= 0.7 ? 'diminishing' : 'neutral';
      detected.push({
        name,
        count: sVids.length,
        avgViews: sAvg,
        ratio: parseFloat(ratio.toFixed(2)),
        status,
        latestVid: sVids.sort((a, b) => new Date(b.published_at || b.date) - new Date(a.published_at || a.date))[0]
      });
    }
  }

  return detected.sort((a, b) => b.avgViews - a.avgViews).slice(0, 6);
}

function scrollRecentRail(offset) {

  const rail = document.getElementById('dashRecentUploads');
  if (rail) rail.scrollBy({ left: offset, behavior: 'smooth' });
}

async function loadDashboardRecentUploads(primaryId) {
  const el = document.getElementById('dashRecentUploads');
  if (!el) return;
  try {
    const r = await fetch(`/api/channels/${primaryId}/videos?max=10`);
    const vids = await r.json();
    if (!vids || !vids.length) {
      el.innerHTML = '<div style="color:var(--t3);font-size:12px;padding:12px 0">No uploads found.</div>';
      return;
    }

    // Benchmark vs 30-vid average
    const en = _enrichCache[primaryId] || {};
    const sp30 = en.sp30 || [];
    const avgViews = sp30.length
      ? sp30.reduce((a, b) => a + b, 0) / sp30.length
      : (vids.reduce((a, v) => a + (parseInt(v.view_count ?? v.views_raw ?? 0) || 0), 0) / Math.max(1, vids.length));

    el.innerHTML = vids.map(v => {
      const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
      const ratio = avgViews > 0 ? (vc / avgViews) : 1;
      let healthChip = '';
      if (ratio >= 1.3) {
        healthChip = `<span class="ru-health-chip up" title="Overperformer (▲${ratio.toFixed(1)}× your avg) → make Part 2">▲${ratio.toFixed(1)}×</span>`;
      } else if (ratio <= 0.7) {
        // Check for collision with larger rival
        const collision = detectCollisionForVideo(v, all, primaryId);
        if (collision) {
          healthChip = `<span class="ru-health-chip down" style="background:rgba(239,68,68,0.2);color:#ef4444" title="Collision: ${esc(collision.rivalCh)} dropped on '${esc(collision.sharedTopic)}' ${collision.hoursDiff}h ${collision.isEarlier ? 'earlier' : 'later'}">⚡ Collision</span>`;
        } else {
          healthChip = `<span class="ru-health-chip down" title="Underperformer (▼${ratio.toFixed(1)}× your avg) → test new thumbnail">▼${ratio.toFixed(1)}×</span>`;
        }
      }

      return `
        <a class="ru-item" href="${esc(v.url)}" target="_blank" rel="noopener">
          <img class="ru-thumb" src="${esc(v.thumb || '')}" alt="">
          <div class="ru-body">
            <div class="ru-title" title="${esc(v.title)}">${esc(v.title)}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
              <span style="font-family:var(--f-mono);font-size:11px;font-weight:700;color:var(--acc)">${esc(v.views)}</span>
              ${healthChip}
            </div>
            <div style="font-size:10px;color:var(--t3);margin-top:2px">${ago(v.published_at || v.date)}</div>
          </div>
        </a>`;
    }).join('');
  } catch {
    el.innerHTML = '<div style="color:var(--t3);font-size:12px;padding:12px 0">Could not load uploads.</div>';
  }
}

function loadVelocityWithFit(channels) {
  const box = document.getElementById('dashVelocity');
  const legendChipsEl = document.getElementById('velLegendChips');
  if (!box || !channels.length) return;

  if (legendChipsEl) {
    legendChipsEl.innerHTML = channels.map(ch => {
      const isMuted = mutedVelocity.has(ch.id);
      return `
        <div class="vel-legend-chip ${isMuted ? 'muted' : ''}" onclick="toggleMuteVelocity('${esc(ch.id)}')">
          <span style="width:6px;height:6px;border-radius:2px;background:${colorOf(ch)}"></span>
          <span>${esc(ch.name.length > 8 ? ch.name.slice(0, 8) + '…' : ch.name)}</span>
        </div>`;
    }).join('');
  }

  fit(box, (w, h) => drawVelocitySvg(box, channels, w, h));
}

function toggleMuteVelocity(channelId) {
  if (mutedVelocity.has(channelId)) {
    mutedVelocity.delete(channelId);
  } else {
    mutedVelocity.add(channelId);
  }
  localStorage.setItem('yt_muted_velocity', JSON.stringify([...mutedVelocity]));
  loadVelocityWithFit(all);
}

async function drawVelocitySvg(box, channels, width, height) {
  try {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short' }) + " '" + String(d.getFullYear()).slice(2),
      });
    }

    const activeChannels = channels.filter(c => !mutedVelocity.has(c.id));
    if (!activeChannels.length) {
      box.innerHTML = '<div style="color:var(--t3);font-size:12px;padding:40px 0;text-align:center">All channels are muted. Click legend chips to unmute.</div>';
      return;
    }

    const videoLists = await Promise.all(
      activeChannels.map(async ch => {
        const cached = _enrichCache[ch.id];
        if (cached && cached.vids && cached.vids.length > 0) return cached.vids;
        try {
          const r = await fetch(`/api/channels/${ch.id}/videos?max=50`);
          const vids = await r.json();
          if (Array.isArray(vids)) {
            _enrichCache[ch.id] = { ts: Date.now(), vids };
            return vids;
          }
        } catch {}
        return [];
      })
    );

    const data = activeChannels.map((ch, i) => ({
      ch,
      color: colorOf(ch),
      counts: months.map(m =>
        (videoLists[i] || []).filter(v => (v.published_at || v.date || '').startsWith(m.key)).length
      ),
    }));

    const maxC = Math.max(...data.flatMap(d => d.counts), 1);
    const W = Math.max(width || 400, 280);
    const H = Math.max(height || 180, 140);
    const padB = 26, padT = 16, pH = H - padB - padT;

    const nCh = activeChannels.length;
    const bW = Math.min(16, Math.max(5, Math.floor((W - 60) / (months.length * nCh)) - 2));
    const bGap = 2, gGap = 14;
    const gW = nCh * (bW + bGap) + gGap;

    let bars = '';
    [0, Math.round(maxC / 2), maxC].forEach(t => {
      const y = H - padB - Math.round((t / maxC) * pH);
      bars += `<line x1="28" y1="${y}" x2="${W - 10}" y2="${y}" stroke="var(--line-1)" stroke-width="1" stroke-dasharray="3 3"/>
               <text x="24" y="${y + 3}" text-anchor="end" fill="var(--t3)" font-size="8" font-family="JetBrains Mono">${t}</text>`;
    });

    months.forEach((m, mi) => {
      const gx = 32 + mi * gW;
      data.forEach((d, ci) => {
        const c = d.counts[mi];
        if (c === 0) return;
        const h = Math.max(4, Math.round((c / maxC) * pH));
        const x = gx + ci * (bW + bGap), y = H - padB - h;
        bars += `<rect class="bars" x="${x}" y="${y}" width="${bW}" height="${h}" rx="2" fill="${d.color}" opacity="0.9"
                       data-tip="<strong>${esc(d.ch.name)}</strong> · ${m.label}: ${c} videos" style="cursor:pointer"/>`;
      });
      bars += `<text x="${gx + nCh * (bW + bGap) / 2}" y="${H - 6}" text-anchor="middle" font-size="8.5" fill="var(--t3)" font-family="DM Sans">${m.label}</text>`;
    });

    box.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;overflow:visible">
        ${bars}
      </svg>`;

    box.querySelectorAll('.bars').forEach(rect => {
      rect.addEventListener('mouseenter', e => {
        const r = e.target.getBoundingClientRect();
        showTip(rect.dataset.tip, r.left + r.width / 2, r.top);
      });
      rect.addEventListener('mouseleave', hideTip);
    });
  } catch {
    box.innerHTML = '<div style="color:var(--t3);font-size:12px">Could not load chart.</div>';
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGE 2: MY CHANNELS
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderChannels() {
  const el = document.getElementById('chTbl');
  const cnt = document.getElementById('chCntLbl');
  const summaryStrip = document.getElementById('channelsSummaryStrip');
  if (!el) return;

  await fetchAll();
  if (cnt) cnt.textContent = all.length || '0';

  if (!all.length) {
    if (summaryStrip) summaryStrip.innerHTML = '';
    el.innerHTML = `
      <div class="empty card rev in">
        <div class="empty-ico"><span class="msi" style="font-size:24px">subscriptions</span></div>
        <h3 style="font-family:var(--f-disp);font-size:18px;color:var(--t1)">No Channels Tracked</h3>
        <p style="max-width:360px">Add channels to start tracking performance metrics and comparisons.</p>
        <button class="btn btn-acc" onclick="toggleAdd()">+ Add Channel</button>
      </div>`;
    return;
  }

  if (summaryStrip) {
    const totSubs = all.reduce((s, c) => s + (c.subscribers_raw || 0), 0);
    const totViews = all.reduce((s, c) => s + (c.total_views_raw || 0), 0);
    const primary = all.find(c => c.is_primary);
    const myShare = (primary && totSubs > 0) ? (((primary.subscribers_raw || 0) / totSubs) * 100).toFixed(1) + '%' : '—';

    summaryStrip.innerHTML = `
      <div class="tile"><span class="lbl">Tracked</span><span class="val cyan count-val" data-val="${all.length}">${all.length}</span></div>
      <div class="tile"><span class="lbl">Combined Subs</span><span class="val gold count-val" data-val="${totSubs}">${fmtN(totSubs)}</span></div>
      <div class="tile"><span class="lbl">Combined Views</span><span class="val count-val" data-val="${totViews}">${fmtN(totViews)}</span></div>
      <div class="tile"><span class="lbl">Your Share</span><span class="val green">${myShare}</span></div>`;
  }

  const primary = all.find(c => c.is_primary);
  const rivals = all.filter(c => !c.is_primary).sort((a, b) => (b[chSort] || 0) - (a[chSort] || 0));
  const sortedAll = primary ? [primary, ...rivals] : rivals;

  el.innerHTML = `
    <div class="ch-list-dense" id="chListContainer">
      ${sortedAll.map(ch => renderDenseChannelRow(ch)).join('')}
    </div>
    <div class="ghost-add-card" onclick="toggleAdd()">
      <span class="msi">add</span> + Track another channel
    </div>`;

  summaryStrip?.querySelectorAll('.count-val').forEach(v => countUp(v, v.dataset.val));

  sortedAll.forEach(async ch => {
    const en = await enrich(ch.id);
    const spEl = document.getElementById(`row-spark-${ch.id}`);
    const engEl = document.getElementById(`row-eng-${ch.id}`);
    if (spEl) {
      if (en && en.sp30 && en.sp30.length) {
        spEl.innerHTML = sparkSVG(en.sp30, 80, 18, colorOf(ch));
      } else {
        spEl.innerHTML = '<span style="color:var(--t3)">—</span>';
      }
    }
    if (engEl) {
      if (en && en.engagement > 0) {
        engEl.textContent = `${en.engagement}%`;
        engEl.style.color = en.engagement >= 4 ? 'var(--up)' : en.engagement >= 2 ? 'var(--warn)' : 'var(--t2)';
      } else {
        engEl.textContent = '—';
        engEl.style.color = 'var(--t3)';
      }
    }
  });
}

function renderDenseChannelRow(ch) {
  const isMine = ch.is_primary;
  const col = colorOf(ch);
  const inCompare = compareSet.includes(ch.id) || isMine;

  return `
    <div class="ch-row ${isMine ? 'me' : ''}" onclick="openDeepDive('${esc(ch.id)}')">
      <!-- 1. Avatar -->
      <div>
        ${ch.logo_url
          ? `<img class="ch-row-av" src="${esc(proxyImg(ch.logo_url))}" style="border:2px solid ${col}" alt="">`
          : `<div class="ch-row-av" style="background:var(--bg-3);border:2px solid ${col};display:flex;align-items:center;justify-content:center;font-weight:700">${(ch.name || '?')[0]}</div>`}
      </div>

      <!-- 2. Identity -->
      <div class="ch-row-ident">
        <div class="ch-row-name">
          ${esc(ch.name)}
          ${isMine ? '<span class="badge bdg-gd">⭐ Mine</span>' : ''}
        </div>
        <div class="ch-row-sub">
          <span>${esc(ch.handle || '')}</span>
          ${ch.country ? `<span>• ${esc(ch.country)}</span>` : ''}
        </div>
      </div>

      <!-- 3. Sparkline (30-day views) -->
      <div id="row-spark-${esc(ch.id)}" style="display:flex;align-items:center;justify-content:center">
        <div class="skel" style="width:75px;height:16px"></div>
      </div>

      <!-- 4. Subscribers -->
      <div>
        <div style="font-family:var(--f-mono);font-weight:700;color:var(--t1)">${esc(ch.subscribers)}</div>
        <div style="font-size:10px;color:var(--t3)">subscribers</div>
      </div>

      <!-- 5. Avg Views -->
      <div>
        <div style="font-family:var(--f-mono);font-weight:700;color:var(--up)">${esc(ch.avg_views)}</div>
        <div style="font-size:10px;color:var(--t3)">avg views</div>
      </div>

      <!-- 6. Engagement -->
      <div>
        <div style="font-family:var(--f-mono);font-weight:700;color:var(--t3)" id="row-eng-${esc(ch.id)}">—</div>
        <div style="font-size:10px;color:var(--t3)">engagement</div>
      </div>

      <!-- 7. Last Upload -->
      <div>
        <div style="font-size:11px;color:var(--t2)">${ch.video?.date || '—'}</div>
        <div style="font-size:10px;color:var(--t3)">last upload</div>
      </div>

      <!-- 8. Actions -->
      <div class="ch-row-acts" onclick="event.stopPropagation()">
        ${!isMine ? `<button class="icon-btn" title="Set as My Channel" onclick="setPrimary('${esc(ch.id)}')"><span class="msi" style="font-size:14px">star</span></button>` : ''}
        <button class="icon-btn ${inCompare ? 'active' : ''}" title="Toggle compare" onclick="toggleCompare('${esc(ch.id)}')"><span class="msi" style="font-size:14px">compare_arrows</span></button>
        <button class="icon-btn" title="Refresh" onclick="refreshOne('${esc(ch.id)}')"><span class="msi" style="font-size:14px">refresh</span></button>
        <button class="icon-btn" title="Delete" style="color:var(--down)" onclick="deleteChannel('${esc(ch.id)}')"><span class="msi" style="font-size:14px">delete</span></button>
      </div>
    </div>`;
}

function setChSort(field) {
  chSort = field;
  const container = document.getElementById('chListContainer');
  const primary = all.find(c => c.is_primary);
  const rivals = all.filter(c => !c.is_primary).sort((a, b) => (b[chSort] || 0) - (a[chSort] || 0));
  const sortedAll = primary ? [primary, ...rivals] : rivals;

  if (container) {
    flip(container, () => {
      container.innerHTML = sortedAll.map(ch => renderDenseChannelRow(ch)).join('');
    });
  }
}

function toggleAdd() {
  const p = document.getElementById('addPanel');
  if (!p) return;
  const isHidden = p.style.display === 'none';
  p.style.display = isHidden ? 'block' : 'none';
  const btn = document.getElementById('addTgl');
  if (btn) btn.innerHTML = isHidden ? '<span class="msi">close</span> Cancel' : '<span class="msi">add</span> Add Channel';
  if (isHidden) setTimeout(() => document.getElementById('addInput')?.focus(), 50);
}

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
    try { localStorage.removeItem('yt_enrich_' + id); } catch {}
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
    try { localStorage.removeItem('yt_enrich_' + id); } catch {}
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

async function doSearchAutocomplete(q) {
  try {
    const r = await fetch('/api/channels/search-suggest?q=' + encodeURIComponent(q));
    if (!r.ok) { closeSearchSuggestions(); return; }
    const items = await r.json();
    showSearchSuggestions(items);
  } catch {
    closeSearchSuggestions();
  }
}

function showSearchSuggestions(items) {
  const dd = document.getElementById('srDropdown');
  if (!dd) return;
  if (!items || !items.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = items.map(ch => `
    <div class="sug-row" onclick="selectSearchSuggestion('${esc(ch.id)}')">
      <img src="${esc(proxyImg(ch.logo_url))}" style="width:28px;height:28px;border-radius:50%;object-fit:cover" alt="">
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:600;color:var(--t1)">${esc(ch.name)}</div>
        <div style="font-size:11px;color:var(--t3)">${esc(ch.handle || '')} • ${esc(ch.subscribers)} subs</div>
      </div>
      <span class="badge bdg-pr">Select</span>
    </div>`).join('');
  dd.style.display = 'block';
}

function closeSearchSuggestions() {
  const dd = document.getElementById('srDropdown');
  if (dd) dd.style.display = 'none';
}

async function selectSearchSuggestion(channelId) {
  closeSearchSuggestions();
  const resEl = document.getElementById('srRes');
  const skelEl = document.getElementById('srSkel');
  if (resEl) resEl.style.display = 'none';
  if (skelEl) skelEl.style.display = 'block';

  try {
    const r = await fetch('/api/channel-by-id/' + encodeURIComponent(channelId));
    const d = await r.json();
    if (!r.ok) { showErr('srErr', d.error || 'Channel not found'); return; }
    renderSearchResult(d);
  } catch {
    showErr('srErr', 'Network error.');
  } finally {
    if (skelEl) skelEl.style.display = 'none';
  }
}

async function doSearch() {
  const q = document.getElementById('srInput')?.value.trim();
  if (!q) { showErr('srErr', 'Please enter a search query.'); return; }
  hideErr('srErr');
  closeSearchSuggestions();

  const resEl = document.getElementById('srRes');
  const skelEl = document.getElementById('srSkel');
  if (resEl) resEl.style.display = 'none';
  if (skelEl) skelEl.style.display = 'block';

  try {
    const r = await fetch('/api/channel?q=' + encodeURIComponent(q));
    const d = await r.json();
    if (!r.ok) { showErr('srErr', d.error || 'Channel not found'); return; }
    renderSearchResult(d);
  } catch {
    showErr('srErr', 'Network error.');
  } finally {
    if (skelEl) skelEl.style.display = 'none';
  }
}

function renderSearchResult(d) {
  const resEl = document.getElementById('srRes');
  if (!resEl) return;
  const inList = all.some(c => c.id === d.id);
  const vid = d.video || {};

  resEl.innerHTML = `
    <div class="card rev in" style="padding:22px;gap:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:14px">
          <img src="${esc(proxyImg(d.logo_url))}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--acc)" alt="">
          <div>
            <div style="font-family:var(--f-disp);font-size:17px;font-weight:700;color:var(--t1)">${esc(d.name)}</div>
            <div style="font-size:11.5px;color:var(--t3)">${esc(d.handle || '')} • Joined ${d.created || '—'}</div>
          </div>
        </div>
        <button class="btn ${inList ? 'btn-gh' : 'btn-acc'}" onclick="toggleTrackSearchResult('${esc(d.id)}')">
          <span class="msi">${inList ? 'check' : 'add'}</span>
          ${inList ? 'Tracking' : 'Track Channel'}
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        <div class="tile"><span class="lbl">Subscribers</span><span class="val gold">${esc(d.subscribers)}</span></div>
        <div class="tile"><span class="lbl">Total Views</span><span class="val">${esc(d.total_views)}</span></div>
        <div class="tile"><span class="lbl">Videos</span><span class="val cyan">${esc(d.total_videos)}</span></div>
        <div class="tile"><span class="lbl">Avg Views</span><span class="val green">${esc(d.avg_views)}</span></div>
      </div>

      ${vid.title ? `
        <div style="background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);padding:10px 12px;display:flex;gap:12px;align-items:center">
          <img src="${esc(vid.thumb)}" style="width:84px;height:48px;border-radius:4px;object-fit:cover" alt="">
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;font-weight:700;color:var(--acc);text-transform:uppercase">Latest Upload</div>
            <div style="font-size:12.5px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(vid.title)}</div>
            <div style="font-size:10.5px;color:var(--t3)">${esc(vid.views)} views • ${vid.date || ''}</div>
          </div>
        </div>` : ''}
    </div>`;

  resEl.style.display = 'block';
}

async function toggleTrackSearchResult(channelId) {
  const inList = all.some(c => c.id === channelId);
  if (inList) {
    await deleteChannel(channelId);
  } else {
    try {
      const r = await fetch('/api/channels/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId })
      });
      if (r.ok) {
        toast('Channel added!', 's');
        await fetchAll();
      }
    } catch {
      toast('Failed to add', 'e');
    }
  }
  doSearch();
}

/* Autocomplete for inline Add Panel on My Channels */
let _addDebounce = null;
document.getElementById('addInput')?.addEventListener('keyup', e => {
  if (['Enter', 'Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const q = e.target.value.trim();
  clearTimeout(_addDebounce);
  if (q.length < 2) { closeAddSuggestions(); return; }
  _addDebounce = setTimeout(() => doAddAutocomplete(q), 350);
});

async function doAddAutocomplete(q) {
  try {
    const r = await fetch('/api/channels/search-suggest?q=' + encodeURIComponent(q));
    if (!r.ok) { closeAddSuggestions(); return; }
    const items = await r.json();
    const dd = document.getElementById('addDropdown');
    if (!dd) return;
    if (!items.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = items.map(ch => `
      <div class="sug-row" onclick="selectAddSuggestion('${esc(ch.id)}')">
        <img src="${esc(proxyImg(ch.logo_url))}" style="width:26px;height:26px;border-radius:50%;object-fit:cover" alt="">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--t1)">${esc(ch.name)}</div>
          <div style="font-size:10px;color:var(--t3)">${esc(ch.handle || '')} • ${esc(ch.subscribers)} subs</div>
        </div>
        <span class="badge bdg-pr">+ Add</span>
      </div>`).join('');
    dd.style.display = 'block';
  } catch {
    closeAddSuggestions();
  }
}

function closeAddSuggestions() {
  const dd = document.getElementById('addDropdown');
  if (dd) dd.style.display = 'none';
}

async function selectAddSuggestion(channelId) {
  closeAddSuggestions();
  const inp = document.getElementById('addInput');
  if (inp) inp.value = channelId;
  addCh();
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGE 4: DEEP DIVE FULL-VIEWPORT OVERLAY ROUTE (#page-channel)
   ══════════════════════════════════════════════════════════════════════════════ */
async function openDeepDive(channelId, tab = null) {
  const ch = all.find(c => c.id === channelId);
  if (!ch) return;

  // Restore last tab per channel if no explicit tab given
  const persistedTab = localStorage.getItem('dd_tab_' + channelId) || 'overview';
  const resolvedTab = tab || persistedTab;

  ddChannelId = channelId;
  ddActiveTab = resolvedTab;
  ddFullVideos = null;
  ddSnapshots = null;
  ddVidPage = 0;
  ddVidList = [];

  const logoWrap = document.getElementById('ddLogoWrap');
  const nameEl = document.getElementById('ddName');
  const metaEl = document.getElementById('ddMeta');
  const actsEl = document.getElementById('ddActions');
  const col = colorOf(ch);

  if (logoWrap) {
    logoWrap.innerHTML = ch.logo_url
      ? `<img class="dd-avatar" src="${esc(proxyImg(ch.logo_url))}" style="border-color:${col}" alt="">`
      : `<div class="dd-avatar" style="background:var(--bg-3);border-color:${col};display:flex;align-items:center;justify-content:center;font-weight:700">${(ch.name || '?')[0]}</div>`;
  }
  if (nameEl) nameEl.textContent = ch.name || '';
  if (metaEl) metaEl.textContent = `${ch.handle || ''} • ${ch.subscribers} subscribers • ${ch.total_videos} videos`;

  const inCompare = compareSet.includes(ch.id) || ch.is_primary;
  if (actsEl) {
    actsEl.innerHTML = `
      ${!ch.is_primary ? `<button class="btn btn-gh btn-sm" onclick="setPrimary('${esc(ch.id)}')"><span class="msi" style="font-size:14px">star</span> Set Mine</button>` : ''}
      <button class="btn ${inCompare ? 'btn-acc' : 'btn-gh'} btn-sm" onclick="toggleCompare('${esc(ch.id)}')">
        <span class="msi" style="font-size:14px">${inCompare ? 'check' : 'compare_arrows'}</span> ${inCompare ? 'In Compare' : '+ Compare'}
      </button>
      <button class="icon-btn" onclick="refreshOne('${esc(ch.id)}')"><span class="msi" style="font-size:15px">refresh</span></button>
      <button class="icon-btn" onclick="closeDeepDive()"><span class="msi" style="font-size:16px">close</span></button>`;
  }

  const ddEl = document.getElementById('page-channel');
  if (ddEl) {
    ddEl.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  switchDDTab(tab);
}

function closeDeepDive() {
  const ddEl = document.getElementById('page-channel');
  if (ddEl) {
    ddEl.classList.remove('open');
    document.body.style.overflow = '';
  }
  ddChannelId = null;
}

function switchDDTab(tab) {
  ddActiveTab = tab;
  // Persist last tab per channel
  if (ddChannelId) localStorage.setItem('dd_tab_' + ddChannelId, tab);

  document.querySelectorAll('#ddTabsWrap .tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.dd-panel').forEach(p => p.classList.remove('on'));

  const tabBtn = document.getElementById('ddTab-' + tab);
  const panelEl = document.getElementById('ddPanel-' + tab);
  if (tabBtn) tabBtn.classList.add('on');
  if (panelEl) panelEl.classList.add('on');

  const ch = all.find(c => c.id === ddChannelId);
  if (!ch) return;

  if (tab === 'overview') renderDDOverview(ch);
  if (tab === 'videos')   renderDDVideos(ch);
  if (tab === 'growth')   renderDDGrowth(ch);
  if (tab === 'compare')  renderDDCompare(ch);
  if (tab === 'topics')   renderDDTopics(ch);
}

/* ── Deep Dive Tab 1: Overview (Bento Rebuild) ─────────────────────────────── */
async function renderDDOverview(ch) {
  const panel = document.getElementById('ddPanel-overview');
  if (!panel) return;

  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;color:var(--t3);padding:40px 0">
      <div class="spin"></div> Loading overview…
    </div>`;

  const en = await enrich(ch.id) || {};
  const vids = en.vids || [];
  const allVids = [...(en.longForm || vids)];
  const top5 = [...allVids].sort((a, b) => (b.view_count ?? b.views_raw ?? 0) - (a.view_count ?? a.views_raw ?? 0)).slice(0, 5);
  const maxTopViews = top5.length ? Math.max(...top5.map(v => parseInt(v.view_count ?? v.views_raw ?? 0))) : 1;

  // Fixed audience ratio (was showing 0% due to falsy check on computed value)
  const subCount = ch.subscriber_count ?? ch.subscribers_raw ?? 0;
  const totalVws = ch.total_views_raw ?? 0;
  const audienceRatio = totalVws > 0 ? ((subCount / totalVws) * 100).toFixed(1) : null;

  // Engagement gauge
  const engRate = en.engagement ?? 0;
  const engGaugePct = Math.min(100, Math.round((engRate / 10) * 100));

  // Cadence: uploads per month from vids
  let cadenceStr = '—';
  if (allVids.length >= 2) {
    const oldest = Math.min(...allVids.map(v => new Date(v.published_at || v.date || 0).getTime()).filter(t => t > 0));
    const mos = Math.max(1, (Date.now() - oldest) / (30 * 864e5));
    cadenceStr = (allVids.length / mos).toFixed(1) + '/mo';
  }

  // Pulse chart: uploads by week (last 13 weeks)
  const pulseSvg = buildPulseChart(allVids, colorOf(ch));

  // This month stats
  const nowDate = new Date();
  const mKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth()+1).padStart(2,'0')}`;
  const thisMonthVids = allVids.filter(v => (v.published_at||v.date||'').startsWith(mKey));
  const thisMonthViews = thisMonthVids.reduce((s, v) => s + parseInt(v.view_count ?? v.views_raw ?? 0), 0);
  const bestThisMonth = thisMonthVids.sort((a,b) => (b.view_count??b.views_raw??0)-(a.view_count??a.views_raw??0))[0];

  const col = colorOf(ch);

  panel.innerHTML = `
    <div class="dd-overview-bento rev in">
      <!-- LEFT column -->
      <div class="dd-overview-left">
        <!-- KPI strip -->
        <div class="dd-kpi-strip">
          <div class="tile">
            <span class="lbl">Subscribers</span>
            <span class="val gold count-val" data-val="${ch.subscribers_raw || 0}">${esc(ch.subscribers)}</span>
            <span class="foot">${sparkSVG(en.sp30, 75, 18, 'var(--me)')}</span>
          </div>
          <div class="tile">
            <span class="lbl">Total Views</span>
            <span class="val count-val" data-val="${ch.total_views_raw || 0}">${esc(ch.total_views)}</span>
            <span class="foot">${fmtDelta(en.momDelta || 0)}</span>
          </div>
          <div class="tile">
            <span class="lbl">Avg Views</span>
            <span class="val green count-val" data-val="${ch.avg_views_raw || 0}">${esc(ch.avg_views)}</span>
            <span class="foot"><span style="font-size:10px;color:var(--t3)">per video</span></span>
          </div>
          <div class="tile">
            <span class="lbl">Subs ÷ Views</span>
            <span class="val cyan">${audienceRatio !== null ? audienceRatio + '%' : '—'}</span>
            <span class="foot"><span style="font-size:10px;color:var(--t3)">audience ratio</span></span>
          </div>
        </div>

        <!-- Pulse card -->
        <div class="dd-pulse-card">
          <div class="sect-lbl" style="margin:0">
            <span class="msi">show_chart</span> 90-Day Upload Pulse
          </div>
          ${pulseSvg}
          <div class="dd-this-month-row">
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--t3);letter-spacing:.06em">This Month</span>
            <span class="badge bdg-pr">${thisMonthVids.length} uploads</span>
            ${thisMonthViews > 0 ? `<span class="badge bdg-dim">${fmtN(thisMonthViews)} views</span>` : ''}
            ${bestThisMonth ? `<span style="font-size:11px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1" title="${esc(bestThisMonth.title)}">Best: ${esc(bestThisMonth.title)}</span>` : '<span style="font-size:11px;color:var(--t3)">No uploads yet this month</span>'}
          </div>
        </div>

        <!-- Top Videos -->
        <div class="card">
          <div class="sect-lbl" style="margin:0 0 10px 0">
            <span class="msi">star</span> Top Performing Videos
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${top5.map((v, i) => {
              const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
              const eng = calcEngagementRate(v.like_count, v.comment_count, v.view_count ?? v.views_raw);
              const pct = maxTopViews > 0 ? Math.max(4, Math.round(vc / maxTopViews * 100)) : 4;
              return `
              <a href="${esc(v.url)}" target="_blank" rel="noopener" class="dd-top-vid-row">
                <span style="font-family:var(--f-mono);font-size:10.5px;font-weight:700;color:var(--t3)">#${i+1}</span>
                <img src="${esc(v.thumb || '')}" style="width:72px;height:40px;border-radius:4px;object-fit:cover" alt="">
                <div style="min-width:0">
                  <div class="dd-top-vid-title">${esc(v.title)}</div>
                  <div class="dd-top-vid-meta">${ago(v.published_at || v.date)}</div>
                </div>
                <div class="dd-vrow-views-wrap">
                  <div class="dd-top-vid-views">${fmtN(vc)}</div>
                  <div class="dd-vrow-vsbar-track"><div class="dd-vrow-vsbar-fill" style="width:${pct}%;background:${col}"></div></div>
                </div>
                ${eng !== null ? `<span class="badge ${eng >= 4 ? 'bdg-gr' : 'bdg-dim'}">${eng}%</span>` : '<span></span>'}
              </a>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- RIGHT column -->
      <div class="dd-overview-right">
        <!-- About card -->
        <div class="card" style="gap:12px">
          <div class="sect-lbl" style="margin:0">
            <span class="msi">info</span> About Channel
          </div>
          <p style="font-size:12px;color:var(--t2);line-height:1.6;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden">
            ${esc(ch.description || 'No description available for this channel.')}
          </p>
          <div style="display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px solid var(--line-1);font-size:11.5px">
            <div style="display:flex;justify-content:space-between"><span style="color:var(--t3)">Country</span><span>${esc(ch.country || 'Global')}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--t3)">Joined</span><span>${ch.created || '—'}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--t3)">Channel ID</span><span class="mono" style="font-size:10.5px">${esc(ch.id)}</span></div>
          </div>
          <a href="https://www.youtube.com/${esc(ch.handle || 'channel/' + ch.id)}" target="_blank" rel="noopener" class="btn btn-gh btn-sm" style="width:100%;margin-top:4px">
            Open on YouTube ↗
          </a>
        </div>

        <!-- Health card (fills void under About) -->
        <div class="dd-health-card">
          <div class="sect-lbl" style="margin:0">
            <span class="msi">monitor_heart</span> Channel Health
          </div>

          <div class="dd-health-row">
            <span class="dd-health-label"><span class="msi" style="font-size:15px">favorite</span> Engagement Rate</span>
            <span class="dd-health-val" style="color:${engRate >= 4 ? 'var(--up)' : engRate >= 2 ? 'var(--warn)' : 'var(--t2)'}">${engRate > 0 ? engRate + '%' : '—'}</span>
          </div>
          ${engRate > 0 ? `
          <div class="gauge-bar" style="margin:-4px 0 4px"><div class="gauge-fill" style="width:${engGaugePct}%;background:linear-gradient(90deg,${col},var(--up))"></div></div>
          ` : ''}

          <div class="dd-health-row">
            <span class="dd-health-label"><span class="msi" style="font-size:15px">upload</span> Cadence</span>
            <span class="dd-health-val">${cadenceStr}</span>
          </div>

          <div class="dd-health-row">
            <span class="dd-health-label"><span class="msi" style="font-size:15px">local_fire_department</span> Upload Streak</span>
            <span class="dd-health-val" style="color:${(en.streak||0) >= 3 ? 'var(--up)' : 'var(--t1)'}">
              ${(en.streak || 0) > 0 ? en.streak + ' week' + ((en.streak||0) !== 1 ? 's' : '') : '—'}
            </span>
          </div>

          <div class="dd-health-row">
            <span class="dd-health-label"><span class="msi" style="font-size:15px">groups</span> Audience Ratio</span>
            <span class="dd-health-val">${audienceRatio !== null ? audienceRatio + '%' : '—'}</span>
          </div>
          <div style="font-size:10px;color:var(--t3);margin-top:-8px">subs ÷ total views</div>

          <div class="dd-health-row" style="margin-top:4px">
            <span class="dd-health-label"><span class="msi" style="font-size:15px">video_library</span> Total Videos</span>
            <span class="dd-health-val">${esc(ch.total_videos || '—')}</span>
          </div>

          <!-- Phase 8 Competitive Traits -->
          ${(() => {
            const primaryId = (all.find(c => c.is_primary) || all[0])?.id;
            const threat = calcThreatScore(ch.id, primaryId);
            const eg = calcEvergreenFingerprint(allVids);
            return `
            <div style="padding-top:10px;margin-top:8px;border-top:1px solid var(--line-1);display:flex;flex-direction:column;gap:8px">
              <div class="dd-health-row">
                <span class="dd-health-label"><span class="msi" style="font-size:15px">${eg.icon}</span> Catalog Strategy</span>
                <span class="badge ${eg.type === 'evergreen' ? 'bdg-gr' : eg.type === 'hype' ? 'bdg-rd' : 'bdg-dim'}">${eg.label}</span>
              </div>
              ${ch.id !== primaryId ? `
              <div class="dd-health-row">
                <span class="dd-health-label"><span class="msi" style="font-size:15px">swords</span> Threat Overlap</span>
                <span class="badge ${threat.score >= 50 ? 'bdg-rd' : threat.score >= 25 ? 'bdg-gd' : 'bdg-dim'}">⚔️ ${threat.score}% affinity</span>
              </div>` : ''}
            </div>`;
          })()}
        </div>
      </div>
    </div>`;

  panel.querySelectorAll('.count-val').forEach(v => countUp(v, v.dataset.val));
}

function buildPulseChart(vids, col) {
  if (!vids || !vids.length) {
    return '<div style="padding:20px;text-align:center;color:var(--t3);font-size:12px">No video data to chart.</div>';
  }

  // Group by week (last 13 weeks = ~91 days)
  const now = Date.now();
  const weeks = 13;
  const weekMs = 7 * 864e5;
  const buckets = Array.from({length: weeks}, (_, i) => ({
    label: '',
    count: 0,
    startMs: now - (weeks - i) * weekMs
  }));

  vids.forEach(v => {
    const pub = new Date(v.published_at || v.date || 0).getTime();
    if (!pub) return;
    const idx = buckets.findIndex((b, i) => pub >= b.startMs && (i === weeks-1 || pub < buckets[i+1].startMs));
    if (idx >= 0) buckets[idx].count++;
  });

  const maxC = Math.max(...buckets.map(b => b.count), 1);
  const W = 600, H = 80, padL = 10, padR = 10, padT = 8, padB = 4;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const bW = Math.floor(plotW / weeks) - 3;

  const gradId = 'pulseGrad_' + Math.abs(hash(col));

  let bars = '';
  buckets.forEach((b, i) => {
    const h = b.count > 0 ? Math.max(6, Math.round((b.count / maxC) * plotH)) : 2;
    const x = padL + i * (plotW / weeks);
    const y = padT + plotH - h;
    const opacity = b.count > 0 ? 0.7 + (b.count / maxC) * 0.3 : 0.15;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bW}" height="${h}" rx="2" fill="${col}" opacity="${opacity.toFixed(2)}"
      data-tip="${b.count} upload${b.count !== 1 ? 's' : ''} (week ${i+1})" style="cursor:pointer"/>`;
  });

  const svgHtml = `
    <div style="width:100%;overflow:hidden;border-radius:var(--r-s);background:var(--bg-3);padding:6px">
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;overflow:visible">
        ${bars}
        <text x="${padL}" y="${H}" font-size="8" fill="var(--t3)" font-family="DM Sans">13 weeks ago</text>
        <text x="${W - padR}" y="${H}" text-anchor="end" font-size="8" fill="var(--t3)" font-family="DM Sans">now</text>
      </svg>
    </div>`;

  return svgHtml;
}

/* ── Deep Dive Tab 2: Videos (Rebuilt) ────────────────────────────────────── */
async function renderDDVideos(ch) {
  const panel = document.getElementById('ddPanel-videos');
  if (!panel) return;

  // Restore persisted filter/sort
  ddVidFilter = localStorage.getItem('dd_vid_filter_' + ch.id) || 'longform';
  ddVidPreset = localStorage.getItem('dd_vid_sort_' + ch.id) || 'recent';
  ddVidPage = 0;

  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;color:var(--t3);padding:40px 0">
      <div class="spin"></div> Loading video catalog…
    </div>`;

  if (!ddFullVideos) {
    try {
      const r = await fetch(`/api/channels/${ch.id}/videos/full`);
      ddFullVideos = await r.json();
    } catch {
      ddFullVideos = [];
    }
  }

  const allVids = ddFullVideos || [];
  const longForm = allVids.filter(v => !isYouTubeShort(v));
  const shorts   = allVids.filter(v => isYouTubeShort(v));
  const totalViews = allVids.reduce((s, v) => s + parseInt(v.view_count ?? v.views_raw ?? 0), 0);
  const avgViews = allVids.length ? Math.round(totalViews / allVids.length) : 0;
  const bestViews = allVids.length ? Math.max(...allVids.map(v => parseInt(v.view_count ?? v.views_raw ?? 0))) : 0;
  const col = colorOf(ch);

  const detectedSeries = detectSeries(allVids);
  const seriesStripHtml = detectedSeries.length ? `
    <div class="dd-series-strip" style="margin-bottom:14px;padding:12px 16px;background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-m)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t2);display:flex;align-items:center;gap:6px">
          <span class="msi" style="font-size:16px;color:var(--acc)">auto_stories</span> Series Detector
        </div>
        <span style="font-size:10.5px;color:var(--t3)">${detectedSeries.length} active franchise${detectedSeries.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:8px">
        ${detectedSeries.map(s => `
          <div class="dd-series-card" style="background:var(--bg-2);border:1px solid var(--line-1);border-radius:var(--r-s);padding:8px 10px">
            <div style="font-size:12px;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
              <span style="font-size:10.5px;color:var(--t3)">${s.count} episodes</span>
              <span class="badge ${s.status === 'double_down' ? 'bdg-gr' : s.status === 'diminishing' ? 'bdg-rd' : 'bdg-dim'}" style="font-size:9.5px">
                ${s.status === 'double_down' ? '▲ Double Down' : s.status === 'diminishing' ? '▼ Fading' : '• Steady'} (${s.ratio}×)
              </span>
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  panel.innerHTML = `
    <div class="card rev in">
      <div class="dd-vid-filter-bar">
        <div class="dd-vid-filter-top">
          <div class="vid-seg" id="ddVidFormatSeg">
            <button class="vid-seg-btn ${ddVidFilter==='all'?'on':''}"     onclick="setDDVidFilter('all','${esc(ch.id)}')"     title="All videos">All ${allVids.length}</button>
            <button class="vid-seg-btn ${ddVidFilter==='longform'?'on':''}" onclick="setDDVidFilter('longform','${esc(ch.id)}')" title="Long-form only">Long-form ${longForm.length}</button>
            <button class="vid-seg-btn ${ddVidFilter==='shorts'?'on':''}"   onclick="setDDVidFilter('shorts','${esc(ch.id)}')"   title="Shorts only">Shorts ${shorts.length}</button>
          </div>
          <div class="vid-seg" id="ddVidSortSeg">
            <button class="vid-seg-btn ${ddVidPreset==='recent'?'on':''}" onclick="setDDVidSort('recent','${esc(ch.id)}')" title="Newest first">🕒 Newest</button>
            <button class="vid-seg-btn ${ddVidPreset==='views'?'on':''}"  onclick="setDDVidSort('views','${esc(ch.id)}')"  title="Most viewed">👁 Most Viewed</button>
            <button class="vid-seg-btn ${ddVidPreset==='vel'?'on':''}"    onclick="setDDVidSort('vel','${esc(ch.id)}')"    title="Highest velocity">⚡ Velocity</button>
          </div>
        </div>
        <div class="dd-vid-ctx-chips">
          <span class="badge bdg-dim">Σ ${fmtN(totalViews)} views</span>
          <span class="badge bdg-dim">avg ${fmtN(avgViews)}</span>
          <span class="badge bdg-dim">best ${fmtN(bestViews)}</span>
        </div>
      </div>

      ${seriesStripHtml}

      <div id="ddVidListContainer" style="display:flex;flex-direction:column;gap:6px">
        ${renderDDVideoRows(allVids, ddVidFilter, ddVidPreset, 0, col, ch.id)}
      </div>
      <div id="ddVidLoadMore"></div>
    </div>`;

  updateDDLoadMore(ch.id, col);
}

function setDDVidFilter(f, chId) {
  ddVidFilter = f;
  ddVidPage = 0;
  localStorage.setItem('dd_vid_filter_' + chId, f);
  document.querySelectorAll('#ddVidFormatSeg .vid-seg-btn').forEach(b => b.classList.toggle('on', b.textContent.startsWith(f === 'all' ? 'All' : f === 'longform' ? 'Long' : 'Shorts')));
  const c = document.getElementById('ddVidListContainer');
  const col = colorOf(all.find(x => x.id === chId) || all[0]);
  if (c) flip(c, () => { c.innerHTML = renderDDVideoRows(ddFullVideos||[], f, ddVidPreset, 0, col, chId); });
  updateDDLoadMore(chId, col);
}

function setDDVidSort(s, chId) {
  ddVidPreset = s;
  ddVidPage = 0;
  localStorage.setItem('dd_vid_sort_' + chId, s);
  document.querySelectorAll('#ddVidSortSeg .vid-seg-btn').forEach(b => b.classList.toggle('on', b.textContent.includes(s === 'recent' ? 'Newest' : s === 'views' ? 'Viewed' : 'Velocity')));
  const c = document.getElementById('ddVidListContainer');
  const col = colorOf(all.find(x => x.id === chId) || all[0]);
  if (c) flip(c, () => { c.innerHTML = renderDDVideoRows(ddFullVideos||[], ddVidFilter, s, 0, col, chId); });
  updateDDLoadMore(chId, col);
}

function getDDVidSorted(vids, formatFilter, sortPreset) {
  let list = formatFilter === 'longform' ? vids.filter(v => !isYouTubeShort(v))
           : formatFilter === 'shorts'   ? vids.filter(v => isYouTubeShort(v))
           : [...vids];
  if (sortPreset === 'views') {
    list.sort((a, b) => (parseInt(b.view_count ?? b.views_raw ?? 0)) - (parseInt(a.view_count ?? a.views_raw ?? 0)));
  } else if (sortPreset === 'vel') {
    list.sort((a, b) => raceVelOf(b) - raceVelOf(a));
  } else {
    list.sort((a, b) => new Date(b.published_at || b.date) - new Date(a.published_at || a.date));
  }
  return list;
}

function renderDDVideoRows(vids, formatFilter, sortPreset, page, col, chId) {
  const list = getDDVidSorted(vids, formatFilter, sortPreset);
  ddVidList = list;
  const maxVc = list.length ? Math.max(...list.map(v => parseInt(v.view_count ?? v.views_raw ?? 0))) : 1;
  const PAGE = 10;
  const slice = list.slice(0, (page + 1) * PAGE);

  if (!slice.length) return '<div style="color:var(--t3);padding:24px;text-align:center">No videos matching filters.</div>';

  const primary = all.find(c => c.is_primary) || all[0];
  const primaryId = primary?.id;
  const isRival = chId && chId !== primaryId;
  const myTopVids = (isRival && _enrichCache[primaryId]?.vids) ? _enrichCache[primaryId].vids.slice(0, 20) : [];

  return slice.map((v, i) => {
    const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
    const vel = Math.round(raceVelOf(v));
    const eng = calcEngagementRate(v.like_count, v.comment_count, vc);
    const isShort = isYouTubeShort(v);
    const pct = maxVc > 0 ? Math.max(4, Math.round(vc / maxVc * 100)) : 4;
    const pub = v.published_at || v.date;
    const ageMs = pub ? Date.now() - new Date(pub).getTime() : Infinity;
    const isNew = ageMs < 48 * 3600000;
    const likeStr = (v.like_count > 0 || v.likes > 0) ? '👍 ' + fmtN(v.like_count || v.likes) : '';
    const dur = v.duration || '';
    const engColor = eng !== null ? (eng >= 4 ? 'var(--up)' : eng >= 2 ? 'var(--warn)' : 'var(--t3)') : 'var(--t3)';

    // Copycat detection on rival videos
    const copycat = isRival ? detectCopycatsForVideo(v, myTopVids) : null;

    return `
      <div class="dd-vrow rev in" style="--i:${i % 10}" onclick="window.open('${esc(v.url)}','_blank')">
        <span class="dd-vrow-rank">#${i + 1}</span>
        <div class="dd-vrow-thumb-wrap">
          <img class="dd-vrow-thumb" src="${esc(v.thumb || '')}" alt="" onerror="this.style.opacity='.3'">
          ${isNew ? '<span class="vid-new-badge">NEW</span>' : ''}
          ${isShort ? '<span class="dur-chip">Short</span>' : (dur ? `<span class="dur-chip">${esc(dur)}</span>` : '')}
        </div>
        <div class="dd-vrow-body">
          <div class="dd-vrow-title">${esc(v.title)}</div>
          <div class="dd-vrow-meta">
            <span title="${esc(pub)}">${ago(pub)}</span>
            ${likeStr ? `<span>${likeStr}</span>` : ''}
            ${copycat ? `<span class="badge bdg-rd" style="font-size:9.5px" title="High token similarity with your video: '${esc(copycat.myTitle)}'">🕵️ ${copycat.overlapPct}% match with yours</span>` : ''}
          </div>
        </div>
        <div class="dd-vrow-views-wrap">
          <div class="dd-vrow-views">${fmtN(vc)} 👁</div>
          <div class="dd-vrow-vsbar-track"><div class="dd-vrow-vsbar-fill" style="width:${pct}%;background:${col}"></div></div>
        </div>
        <div class="dd-vrow-vel">${fmtN(vel)}/day ⚡</div>
        <div class="dd-vrow-eng" style="color:${engColor}">${eng !== null ? eng + '%' : '<span style="color:var(--t3)">—</span>'}</div>
        <a class="dd-vrow-open" href="${esc(v.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Open on YouTube">
          <span class="msi" style="font-size:16px">open_in_new</span>
        </a>
      </div>`;
  }).join('');
}

function updateDDLoadMore(chId, col) {
  const btn = document.getElementById('ddVidLoadMore');
  if (!btn) return;
  const PAGE = 10;
  const total = ddVidList.length;
  const shown = (ddVidPage + 1) * PAGE;
  const remaining = Math.max(0, total - shown);
  if (remaining <= 0) { btn.innerHTML = ''; return; }
  btn.innerHTML = `
    <button class="dd-loadmore-btn" onclick="ddLoadMore('${esc(chId)}','${esc(col)}')"
            title="Load more videos">
      <span class="msi" style="font-size:16px">expand_more</span>
      Show ${Math.min(10, remaining)} more (${remaining} left)
    </button>`;
}

function ddLoadMore(chId, col) {
  ddVidPage++;
  const PAGE = 10;
  const list = ddVidList;
  const slice = list.slice(ddVidPage * PAGE, (ddVidPage + 1) * PAGE);
  const maxVc = list.length ? Math.max(...list.map(v => parseInt(v.view_count ?? v.views_raw ?? 0))) : 1;
  const container = document.getElementById('ddVidListContainer');
  if (!container) return;

  const primary = all.find(c => c.is_primary) || all[0];
  const primaryId = primary?.id;
  const isRival = chId && chId !== primaryId;
  const myTopVids = (isRival && _enrichCache[primaryId]?.vids) ? _enrichCache[primaryId].vids.slice(0, 20) : [];

  const offset = ddVidPage * PAGE;
  const newHtml = slice.map((v, ii) => {
    const i = offset + ii;
    const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
    const vel = Math.round(raceVelOf(v));
    const eng = calcEngagementRate(v.like_count, v.comment_count, vc);
    const isShort = isYouTubeShort(v);
    const pct = maxVc > 0 ? Math.max(4, Math.round(vc / maxVc * 100)) : 4;
    const pub = v.published_at || v.date;
    const ageMs = pub ? Date.now() - new Date(pub).getTime() : Infinity;
    const isNew = ageMs < 48 * 3600000;
    const likeStr = (v.like_count > 0 || v.likes > 0) ? '👍 ' + fmtN(v.like_count || v.likes) : '';
    const dur = v.duration || '';
    const engColor = eng !== null ? (eng >= 4 ? 'var(--up)' : eng >= 2 ? 'var(--warn)' : 'var(--t3)') : 'var(--t3)';

    // Copycat detection on rival videos
    const copycat = isRival ? detectCopycatsForVideo(v, myTopVids) : null;

    return `
      <div class="dd-vrow rev in" style="--i:${ii}" onclick="window.open('${esc(v.url)}','_blank')">
        <span class="dd-vrow-rank">#${i + 1}</span>
        <div class="dd-vrow-thumb-wrap">
          <img class="dd-vrow-thumb" src="${esc(v.thumb || '')}" alt="" onerror="this.style.opacity='.3'">
          ${isNew ? '<span class="vid-new-badge">NEW</span>' : ''}
          ${isShort ? '<span class="dur-chip">Short</span>' : (dur ? `<span class="dur-chip">${esc(dur)}</span>` : '')}
        </div>
        <div class="dd-vrow-body">
          <div class="dd-vrow-title">${esc(v.title)}</div>
          <div class="dd-vrow-meta">
            <span title="${esc(pub)}">${ago(pub)}</span>
            ${likeStr ? `<span>${likeStr}</span>` : ''}
            ${copycat ? `<span class="badge bdg-rd" style="font-size:9.5px" title="High token similarity with your video: '${esc(copycat.myTitle)}'">🕵️ ${copycat.overlapPct}% match with yours</span>` : ''}
          </div>
        </div>
        <div class="dd-vrow-views-wrap">
          <div class="dd-vrow-views">${fmtN(vc)} 👁</div>
          <div class="dd-vrow-vsbar-track"><div class="dd-vrow-vsbar-fill" style="width:${pct}%;background:${col}"></div></div>
        </div>
        <div class="dd-vrow-vel">${fmtN(vel)}/day ⚡</div>
        <div class="dd-vrow-eng" style="color:${engColor}">${eng !== null ? eng + '%' : '<span style="color:var(--t3)">—</span>'}</div>
        <a class="dd-vrow-open" href="${esc(v.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Open on YouTube">
          <span class="msi" style="font-size:16px">open_in_new</span>
        </a>
      </div>`;
  }).join('');

  // Append rows
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = newHtml;
  while (tempDiv.firstChild) container.appendChild(tempDiv.firstChild);

  // Trigger reveal on new rows
  setTimeout(() => {
    container.querySelectorAll('.rev:not(.in)').forEach(el => el.classList.add('in'));
  }, 50);

  updateDDLoadMore(chId, col);
}

/* ── Deep Dive Tab 3: Growth ──────────────────────────────────────────────── */
async function renderDDGrowth(ch) {
  const panel = document.getElementById('ddPanel-growth');
  if (!panel) return;

  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;color:var(--t3);padding:40px 0">
      <div class="spin"></div> Loading growth trends…
    </div>`;

  if (!ddSnapshots) {
    try {
      const r = await fetch(`/api/snapshots/${ch.id}`);
      ddSnapshots = await r.json();
    } catch {
      ddSnapshots = [];
    }
  }

  const snaps = ddSnapshots || [];
  const snapsHtml = snaps.length >= 2
    ? renderSnapshotLineChart(snaps, colorOf(ch))
    : `<div style="padding:24px;text-align:center;color:var(--t3)">
         <div style="font-size:13px;color:var(--t1);margin-bottom:4px">Timeline Building</div>
         Record daily snapshots by refreshing this channel over time to see the growth trajectory.
       </div>`;

  panel.innerHTML = `
    <div class="rev in" style="display:flex;flex-direction:column;gap:18px">
      <div class="card">
        <div class="sect-lbl" style="margin:0 0 10px 0">
          <span class="msi">trending_up</span> Historical Growth Timeline (${snaps.length} snapshots)
        </div>
        ${snapsHtml}
      </div>

      <div class="card">
        <div class="sect-lbl" style="margin:0 0 10px 0">
          <span class="msi">calendar_month</span> Upload Activity Heatmap
        </div>
        ${renderCalendarHeatmap(ddFullVideos || [])}
      </div>
    </div>`;

  panel.querySelectorAll('.snap-dot').forEach(circle => {
    circle.addEventListener('mouseenter', e => {
      const r = e.target.getBoundingClientRect();
      showTip(circle.dataset.tip, r.left + r.width / 2, r.top);
    });
    circle.addEventListener('mouseleave', hideTip);
  });

  panel.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('mouseenter', e => {
      const r = e.target.getBoundingClientRect();
      showTip(cell.dataset.tip, r.left + r.width / 2, r.top);
    });
    cell.addEventListener('mouseleave', hideTip);
  });
}

function renderSnapshotLineChart(snaps, col) {
  const sorted = [...snaps].sort((a, b) => a.date.localeCompare(b.date));
  const maxS = Math.max(...sorted.map(s => s.subscribers || 0), 1);
  const minS = Math.min(...sorted.map(s => s.subscribers || 0), 0);
  const rS = maxS - minS || 1;

  const W = 800, H = 130, pad = 24;
  const pts = sorted.map((s, i) => {
    const x = pad + (i / (sorted.length - 1)) * (W - pad * 2);
    const y = H - pad - ((s.subscribers - minS) / rS) * (H - pad * 2);
    return [x, y, s];
  });

  const polyline = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="130" style="overflow:visible">
      <polyline points="${polyline}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map(([x, y, s]) => `
        <circle class="snap-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${col}" stroke="var(--bg-2)" stroke-width="1.5"
                data-tip="${s.date}: <strong>${fmtN(s.subscribers)}</strong> subs (${fmtN(s.views)} views)" style="cursor:pointer"/>
      `).join('')}
      <text x="${pad}" y="${H - 4}" font-size="9.5" fill="var(--t3)" font-family="JetBrains Mono">${sorted[0].date}</text>
      <text x="${W - pad}" y="${H - 4}" font-size="9.5" text-anchor="end" fill="var(--t3)" font-family="JetBrains Mono">${sorted[sorted.length - 1].date}</text>
    </svg>`;
}

function renderCalendarHeatmap(vids) {
  if (!vids || !vids.length) return '<div style="color:var(--t3);padding:14px 0">No upload history available.</div>';

  const dateMap = {};
  vids.forEach(v => {
    const d = (v.published_at || v.date || '').slice(0, 10);
    if (d) dateMap[d] = (dateMap[d] || 0) + 1;
  });

  const today = new Date();
  const cols = 52, rows = 7, size = 9, gap = 3;
  const W = cols * (size + gap) + 30, H = rows * (size + gap) + 16;

  let cells = '';
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (52 * 7) + 1);

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + c * 7 + r);
      if (d > today) continue;
      const iso = d.toISOString().slice(0, 10);
      const count = dateMap[iso] || 0;
      const x = 16 + c * (size + gap);
      const y = r * (size + gap);
      const fill = count === 0 ? 'var(--bg-3)' : count === 1 ? 'rgba(34, 211, 238, 0.35)' : count === 2 ? 'rgba(34, 211, 238, 0.65)' : 'var(--acc)';
      cells += `<rect class="cal-cell" x="${x}" y="${y}" width="${size}" height="${size}" rx="2" fill="${fill}" data-tip="${iso}: ${count} uploads" style="cursor:pointer"/>`;
    }
  }

  return `
    <div style="overflow-x:auto">
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
        ${cells}
      </svg>
    </div>`;
}

/* ── Deep Dive Tab 4: Compare Matrix ──────────────────────────────────────── */
function renderDDCompare(focusedCh) {
  const panel = document.getElementById('ddPanel-compare');
  if (!panel || !all.length) return;

  const me = all.find(c => c.is_primary) || all[0];
  const sorted = [...all].sort((a, b) => (b.subscribers_raw || 0) - (a.subscribers_raw || 0));

  const metrics = [
    { key: 'subscribers_raw', label: 'Subscribers', fmt: v => fmtN(v) },
    { key: 'total_views_raw', label: 'Total Views', fmt: v => fmtN(v) },
    { key: 'avg_views_raw', label: 'Avg Views/Video', fmt: v => fmtN(v) },
    { key: 'total_videos_raw', label: 'Videos', fmt: v => fmtN(v) },
  ];

  const headCells = sorted.map(ch => {
    const isMe = ch.id === me.id;
    const isFocus = ch.id === focusedCh.id;
    const colClass = isMe ? 'col-me' : isFocus ? 'col-focus' : '';
    return `
      <th class="${colClass}">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          ${ch.logo_url
            ? `<img src="${esc(proxyImg(ch.logo_url))}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid ${colorOf(ch)}" alt="">`
            : `<div style="width:26px;height:26px;border-radius:50%;background:var(--bg-3);display:flex;align-items:center;justify-content:center">${(ch.name || '?')[0]}</div>`}
          <span style="color:${isMe ? 'var(--me)' : isFocus ? 'var(--acc)' : 'var(--t1)'}">${esc(ch.name.length > 10 ? ch.name.slice(0, 10) + '…' : ch.name)}</span>
          ${isMe ? '<span class="badge bdg-gd" style="font-size:8px">YOU</span>' : isFocus ? '<span class="badge bdg-pr" style="font-size:8px">FOCUSED</span>' : ''}
        </div>
      </th>`;
  }).join('');

  const rows = metrics.map(m => {
    const vals = sorted.map(c => c[m.key] || 0);
    const best = Math.max(...vals);
    const cells = sorted.map(ch => {
      const v = ch[m.key] || 0;
      const isBest = v === best && best > 0;
      const isMe = ch.id === me.id;
      const isFocus = ch.id === focusedCh.id;
      const colClass = isMe ? 'col-me' : isFocus ? 'col-focus' : '';
      const rank = vals.filter(x => x > v).length + 1;
      return `
        <td class="${colClass}">
          <div style="font-family:var(--f-mono);font-size:13px;font-weight:700;color:${isBest ? 'var(--up)' : 'var(--t1)'}">
            ${m.fmt(v)}
          </div>
          <span class="rank">#${rank} ${isBest ? '<em class="best">▲ Best</em>' : ''}</span>
        </td>`;
    }).join('');

    return `
      <tr>
        <td>${m.label}</td>
        ${cells}
      </tr>`;
  }).join('');

  panel.innerHTML = `
    <div class="card rev in">
      <div class="sect-lbl" style="margin:0 0 10px 0">
        <span class="msi">table_chart</span> Full Comparison Matrix (${sorted.length} channels)
      </div>

      <div class="cmp-wrap can-r">
        <table class="cmp">
          <thead>
            <tr>
              <th>Metric</th>
              ${headCells}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div style="margin-top:16px;padding:14px;background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-m)">
        <div style="font-size:11.5px;font-weight:700;color:var(--t2);margin-bottom:6px">
          Head-to-Head: <strong style="color:var(--me)">${esc(me.name)}</strong> vs <strong style="color:var(--acc)">${esc(focusedCh.name)}</strong>
        </div>
        <div style="font-size:12.5px;color:var(--t1);line-height:1.5">
          ${focusedCh.id === me.id
            ? `Viewing yourself against the field median. You lead <strong>${sorted.filter(c => (c.subscribers_raw || 0) < (me.subscribers_raw || 0)).length}</strong> competitor channels in total reach.`
            : `<strong>${esc(focusedCh.name)}</strong> currently has <strong>${esc(focusedCh.subscribers)}</strong> subscribers (${(focusedCh.subscribers_raw || 0) > (me.subscribers_raw || 0) ? 'leading you by ' + fmtN((focusedCh.subscribers_raw || 0) - (me.subscribers_raw || 0)) : 'trailing you by ' + fmtN((me.subscribers_raw || 0) - (focusedCh.subscribers_raw || 0))}) with <strong>${esc(focusedCh.avg_views)}</strong> average views per video.`}
        </div>
      </div>
    </div>`;
}

/* ── 10. Global Shortcuts & Init ──────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    sp('search');
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCommandPalette();
    return;
  }

  if (e.key === '?' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    openShortcutsModal();
    return;
  }

  if (e.key === 'Escape') {
    closeDeepDive();
    closeCommandPalette();
    closeShortcutsModal();
    closeSearchSuggestions();
    closeAddSuggestions();
    document.getElementById('comparePopover')?.classList.remove('open');
  }
});

document.addEventListener('click', e => {
  const p = document.getElementById('comparePopover');
  const btn = document.getElementById('compareAddBtn');
  if (p && p.classList.contains('open') && !p.contains(e.target) && e.target !== btn) {
    p.classList.remove('open');
  }
});

(async () => {
  await fetchAll();
  renderDash();
})();