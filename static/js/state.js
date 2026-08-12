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
  sort: localStorage.getItem('race.sort') || 'vel',
  open: new Set(),
  slim: +(localStorage.getItem('race.slim') || 0)
};

// Topic Intelligence State
const _topicCache = { topics: new Map(), perChannel: new Map(), ts: 0 };
const TOPIC_ALIAS = {};
let topicRadarRange = localStorage.getItem('topic.range') || '90d';
let raceTopicFilter = null;  // string or null — cross-wire from radar

// Phase 12: Output, Gamification & Sharing State
let _snapshotsCache = null;
let rankMovementMap = {};
let myPulseTab = 'overview';
let reportPeriod = '30d';
let reportScope = 'all';
let _isDeserializingHash = false;

const ACHIEVEMENTS_CATALOG = [
  { id: 'velocity_vanguard', title: 'Velocity Vanguard', icon: '⚡', xp: 100, desc: 'Hit ≥500 views/day on latest longform upload.' },
  { id: 'giant_slayer', title: 'Giant Slayer', icon: '🥊', xp: 150, desc: 'Out-velocity or out-view a rival with 2× your subscribers.' },
  { id: 'upload_machine', title: 'Upload Machine', icon: '🚀', xp: 100, desc: 'Maintain a 3+ week upload streak or ≥4 videos in 30 days.' },
  { id: 'evergreen_master', title: 'Evergreen Master', icon: '🌲', xp: 120, desc: 'Achieve ≥40% Evergreen Fingerprint in your catalog.' },
  { id: 'radar_commander', title: 'Radar Commander', icon: '🛰️', xp: 80, desc: 'Discover ≥5 surge topics with momentum >1.3×.' },
  { id: 'moat_defender', title: 'Moat Defender', icon: '⚔️', xp: 150, desc: 'Establish a Topic Defensive Moat with >60% niche share.' },
  { id: 'collision_dodger', title: 'Collision Dodger', icon: '🛡️', xp: 90, desc: 'Publish clean drops without collision shadow overlap.' },
  { id: 'title_alchemist', title: 'Title Alchemist', icon: '🧪', xp: 75, desc: 'Generate or evaluate ≥10 titles in Title Lab / Studio.' },
  { id: 'pipeline_producer', title: 'Pipeline Producer', icon: '📋', xp: 80, desc: 'Move 3+ cards to Production or Published in Kanban.' },
  { id: 'deep_diver', title: 'Deep Diver', icon: '🧭', xp: 60, desc: 'Inspect 10+ competitor videos across Deep Dive tabs.' },
  { id: 'benchmarker', title: 'Benchmarker', icon: '⚖️', xp: 50, desc: 'Compare 4 competitor channels simultaneously in Compare Set.' },
  { id: 'niche_dominator', title: 'Niche Dominator', icon: '👑', xp: 200, desc: 'Reach Rank #1 in Subscribers or Avg Views on Leaderboard.' }
];

let achievementsState = { unlocked: {}, totalXp: 0, inspectionsCount: 0, titlesTestedCount: 0 };
try {
  const st = localStorage.getItem('yt_achievements');
  if (st) achievementsState = { ...achievementsState, ...JSON.parse(st) };
} catch { }


// Load aliases from localStorage
try {
  Object.assign(TOPIC_ALIAS, JSON.parse(localStorage.getItem('yt_topic_aliases') || '{}'));
} catch { }

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
