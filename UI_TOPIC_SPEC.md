# YT Tracker — Phase 7 Spec: Topic Intelligence + Self-Tracking Layer

> **Agent instruction:** *"Phases 1–3 structure & motion stay intact. This spec adds (a) a client-side topic engine, (b) a Topic Radar dashboard card, (c) a Deep Dive Topics tab, (d) self-tracking surfaces (My Pulse, milestone ring, video health chips, daily digest), and (e) topic-aware alerts. Vanilla JS/CSS only. All data from `all[]`, `_enrichCache`, and `_topicCache`. Implement in order T1 → T5. QA at end. Zero new YouTube quota unless user explicitly hits Deep Scan."*

---

## 0. Architecture Overview

```
_topicCache = {
  topics: Map<string, TopicStat>,  // global across all channels
  perChannel: Map<chId, Map<string, TopicStat>>,
  aliases: Map<string, string>,    // "auto cad" → "autocad"
  ts: number                       // last build timestamp
}

TopicStat = {
  topic: string,
  n: number,                 // total video count on topic (all channels)
  avgViews: number,
  avgEng: number | null,
  lastUsed: number,          // ms timestamp
  recentAvg: number,         // avg views in range window
  oldAvg: number,            // avg views before window
  hotScore: number,          // recentAvg × log2(n+1)
  momentum: number,          // recentAvg / oldAvg (null if < 2 videos per period)
  channels: string[],        // channel IDs that used this topic
  leadChannel: string | null // chId with highest avg views on this topic
}
```

One global rebuild when any `enrich()` resolves. 7-day localStorage persistence under key `yt_topic_cache`. Alias map persisted separately under `yt_topic_aliases`.

---

## T1 — Topic Engine

### 1.1 Tokenizer + Bigrams

```js
/* ── Topic Engine ─────────────────────────────────────────────────────────── */
const TOPIC_STOP = new Set(
  "how,what,why,does,do,works,work,the,a,an,to,of,in,on,for,with,and,or," +
  "using,use,used,that,this,you,your,my,we,it,is,are,was,were,be,been," +
  "full,complete,explained,explaining,exploring,beginner,tutorial,guide," +
  "vs,versus,part,ep,episode,series,video,watch,new,best,top,first,last," +
  "make,made,making,build,built,building,get,got,just,even,can,could,would," +
  "should,will,from,but,not,no,yes,all,more,most,less,one,two,three,four," +
  "five,six,seven,eight,nine,ten,i,me,he,she,they,them,us,our,his,her,its"
  .split(",")
);

const TOPIC_ALIAS = {};  // loaded from localStorage below

function topicTokens(title) {
  if (!title) return [];
  const words = title.toLowerCase()
    .replace(/[^\p{L}\p{N}\s+#]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !TOPIC_STOP.has(w))
    .map(w => TOPIC_ALIAS[w] || w);  // apply aliases

  // Build unigrams + adjacent bigrams
  const tokens = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(words[i] + " " + words[i + 1]);
  }
  return tokens;
}

function topicFreqMap(videos) {
  // Return Map<token, frequency> across all video titles
  const freq = new Map();
  videos.forEach(v => {
    const toks = topicTokens(v.title || "");
    // dedupe per video so one video only counts once per token
    new Set(toks).forEach(t => freq.set(t, (freq.get(t) || 0) + 1));
  });
  return freq;
}
```

**Bigram pruning:** only keep bigrams with frequency ≥ 3 across ALL channel videos combined — avoids one-off phrases becoming topics.

### 1.2 `topicStats()` — Core Build Function

```js
const _topicCache = { topics: new Map(), perChannel: new Map(), ts: 0 };
const TOPIC_CACHE_TTL = 10 * 60 * 1000; // 10 minutes in-memory; 7d in localStorage

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

  // Global freq — first pass to identify valid bigrams (freq ≥ 3)
  const globalFreq = topicFreqMap(allVids);
  const validBigrams = new Set(
    [...globalFreq.entries()]
      .filter(([t, n]) => t.includes(" ") && n >= 3)
      .map(([t]) => t)
  );

  // Re-tokenize keeping only valid bigrams + all unigrams with freq ≥ 2
  function cleanTokens(title) {
    const raw = topicTokens(title);
    return raw.filter(t => {
      if (t.includes(" ")) return validBigrams.has(t);
      return (globalFreq.get(t) || 0) >= 2;
    });
  }

  // Build per-topic stats (global)
  const topicMap = new Map();
  const cutRecent = now - 90 * 864e5;   // 90-day window for recentAvg
  const cutOld    = now - 365 * 864e5;  // 1-year for oldAvg baseline

  allVids.forEach(v => {
    const toks = cleanTokens(v.title || "");
    const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
    const eng = calcEngagementRate(v.like_count, v.comment_count, vc);
    const pub = new Date(v.published_at || v.date || 0).getTime();

    toks.forEach(t => {
      if (!topicMap.has(t)) {
        topicMap.set(t, {
          topic: t, n: 0, totalViews: 0, totalEng: 0, engCount: 0,
          lastUsed: 0, recentViews: [], oldViews: [], channels: new Set()
        });
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

  // Compute derived stats
  const finalTopics = new Map();
  for (const [t, s] of topicMap) {
    if (s.n < 2) continue; // noise filter
    const avgViews = s.n > 0 ? Math.round(s.totalViews / s.n) : 0;
    const avgEng = s.engCount > 0 ? parseFloat((s.totalEng / s.engCount).toFixed(1)) : null;
    const recentAvg = s.recentViews.length > 0
      ? s.recentViews.reduce((a, b) => a + b, 0) / s.recentViews.length : 0;
    const oldAvg = s.oldViews.length > 0
      ? s.oldViews.reduce((a, b) => a + b, 0) / s.oldViews.length : 0;
    const hotScore = Math.round(recentAvg * Math.log2(s.n + 1));
    const momentum = (recentAvg > 0 && oldAvg > 0 && s.recentViews.length >= 2 && s.oldViews.length >= 2)
      ? parseFloat((recentAvg / oldAvg).toFixed(2)) : null;

    // Leading channel: highest avg views on this topic
    let leadChannel = null, leadMax = 0;
    s.channels.forEach(chId => {
      const chVids = (perChVids[chId] || []).filter(v => cleanTokens(v.title || "").includes(t));
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
      const toks = cleanTokens(v.title || "");
      const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
      const eng = calcEngagementRate(v.like_count, v.comment_count, vc);
      const pub = new Date(v.published_at || v.date || 0).getTime();
      toks.forEach(t => {
        if (!finalTopics.has(t)) return; // only keep globally-valid topics
        if (!chMap.has(t)) chMap.set(t, { n: 0, totalViews: 0, totalEng: 0, engCount: 0, lastUsed: 0 });
        const s = chMap.get(t);
        s.n++;
        s.totalViews += vc;
        if (eng !== null) { s.totalEng += eng; s.engCount++; }
        if (pub > s.lastUsed) s.lastUsed = pub;
      });
    });
    // Derive
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

  // Persist to localStorage (7-day TTL)
  try {
    const serializable = {
      ts: now,
      topics: [...finalTopics.entries()],
      perChannel: [...perChannel.entries()].map(([id, m]) => [id, [...m.entries()]])
    };
    localStorage.setItem("yt_topic_cache", JSON.stringify(serializable));
  } catch {}
}

function loadTopicCacheFromStorage() {
  try {
    const raw = JSON.parse(localStorage.getItem("yt_topic_cache") || "null");
    if (!raw || Date.now() - raw.ts > 7 * 864e5 * 1000) return false;
    _topicCache.topics = new Map(raw.topics);
    _topicCache.perChannel = new Map(raw.perChannel.map(([id, entries]) => [id, new Map(entries)]));
    _topicCache.ts = raw.ts;
    return true;
  } catch { return false; }
}

function loadTopicAliases() {
  try {
    const raw = JSON.parse(localStorage.getItem("yt_topic_aliases") || "{}");
    Object.assign(TOPIC_ALIAS, raw);
  } catch {}
}

function saveTopicAlias(from, to) {
  TOPIC_ALIAS[from] = to;
  try { localStorage.setItem("yt_topic_aliases", JSON.stringify(TOPIC_ALIAS)); } catch {}
  buildTopicCache();
}
```

### 1.3 Gap + Moat Detection

```js
function computeTopicGaps(primaryId) {
  if (!primaryId || !_topicCache.topics.size) return { gaps: [], moats: [] };

  const myTopics = _topicCache.perChannel.get(primaryId) || new Map();
  const fieldTopics = _topicCache.topics;
  const allAvgViews = [...fieldTopics.values()].map(t => t.avgViews).sort((a, b) => a - b);
  const medianFieldAvg = allAvgViews[Math.floor(allAvgViews.length / 2)] || 0;

  const gaps = [], moats = [];

  for (const [t, stat] of fieldTopics) {
    const myStat = myTopics.get(t);
    const myN = myStat?.n || 0;
    const fieldAvg = stat.avgViews;

    // GAP: field avg above median & I have 0 videos
    if (myN === 0 && fieldAvg >= medianFieldAvg && stat.n >= 3) {
      gaps.push({ topic: t, fieldAvg, fieldN: stat.n, hotScore: stat.hotScore, momentum: stat.momentum });
    }

    // MOAT: I am the lead channel on this topic AND rivals have ≤1 video each
    if (myStat && myStat.n >= 2 && stat.leadChannel === primaryId) {
      const rivalCount = stat.channels.filter(id => id !== primaryId)
        .map(id => _topicCache.perChannel.get(id)?.get(t)?.n || 0)
        .filter(n => n > 0).length;
      if (rivalCount <= 1) {
        moats.push({ topic: t, myN: myStat.n, myAvg: myStat.avgViews, rivalCount });
      }
    }
  }

  // Sort by hotScore desc / myAvg desc
  gaps.sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));
  moats.sort((a, b) => b.myAvg - a.myAvg);

  return { gaps: gaps.slice(0, 5), moats: moats.slice(0, 3) };
}
```

### 1.4 Deep Scan (explicit, labeled cost)

```js
async function topicDeepScan(chId) {
  // Shows cost warning, fetches /api/channels/{id}/videos?max=200
  // Stores under "yt_deepscan_{id}" with 7-day TTL
  // Rebuilds topic cache after
  const DEEP_KEY = "yt_deepscan_" + chId;
  try {
    const cached = JSON.parse(localStorage.getItem(DEEP_KEY) || "null");
    if (cached && Date.now() - cached.ts < 7 * 864e5 * 1000) {
      _enrichCache[chId] = { ..._enrichCache[chId], vids: cached.vids, deepScanned: true };
      buildTopicCache();
      return;
    }
  } catch {}

  toast("Deep scanning… (~4 API units)", "");
  const r = await fetch(`/api/channels/${chId}/videos?max=200`);
  const vids = await r.json();
  if (!Array.isArray(vids)) { toast("Deep scan failed", "e"); return; }
  try { localStorage.setItem(DEEP_KEY, JSON.stringify({ ts: Date.now(), vids })); } catch {}
  _enrichCache[chId] = { ..._enrichCache[chId], vids, deepScanned: true };
  buildTopicCache();
  toast("Deep scan complete!", "s");
}
```

---

## T2 — Dashboard: Topic Radar Card

### 2.1 HTML structure

**Placement:** Dashboard, full-width, directly under the Drops window (`--i:4` stagger).

```html
<!-- In dashMain, after raceHtml, before lbHtml -->
<div id="dashTopicRadar" class="rev in" style="--i:4"></div>
```

```
┌ TOPIC RADAR header: [🔥] TOPIC RADAR · what's hot across your field ── [90d|6m|All] ┐
├ LEFT 4col: HOT LIST ────────────────────┐ ┌ RIGHT 8col: HEAT MATRIX ───────────────┤
│ rank chip + topic + 🔥score + arrow     │ │ rows = top 8 topics (sorted by hotScore)│
│ n vids · led by (●channel hue)         │ │ cols = all channels (avatar/dot + name) │
│                                         │ │ cell = avg views tinted in ch hue      │
│ ── GAP CHIPS ──────────────────────────│ │ dashed = 0 videos on that topic        │
│ [EUV: 0 vids · field avg 2.1M ↗]      │ │ click cell → mini popover              │
│ [MOAT: sheet-metal YOU #1 🛡]          │ └────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 `renderTopicRadar()` — Full Implementation

```js
let topicRadarRange = localStorage.getItem("topic.range") || "90d";

function renderTopicRadar() {
  const el = document.getElementById("dashTopicRadar");
  if (!el) return;

  if (!_topicCache.topics.size) {
    el.innerHTML = `
      <div class="topic-radar-card">
        <div class="topic-radar-hdr">
          <div class="topic-radar-title">
            <span class="msi">local_fire_department</span> TOPIC RADAR
            <span>· what's hot across your field</span>
          </div>
        </div>
        <div style="padding:20px;color:var(--t3);font-size:12px;text-align:center">
          <div class="spin" style="display:inline-block;margin-right:8px"></div>
          Building topic index from cached videos…
        </div>
      </div>`;
    return;
  }

  const primary = all.find(c => c.is_primary) || all[0];
  const primaryId = primary?.id;

  // Apply range filter
  const rangeMs = topicRadarRange === "6m" ? 180 * 864e5
                : topicRadarRange === "all" ? Infinity
                : 90 * 864e5;
  const cutTs = Date.now() - rangeMs;

  // Sort topics by hotScore (top 12 for hot list, top 8 for matrix)
  const sortedTopics = [..._topicCache.topics.values()]
    .filter(t => t.n >= 2 && (rangeMs === Infinity || t.lastUsed >= cutTs))
    .sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));

  const hotTopics = sortedTopics.slice(0, 8);
  const matrixTopics = hotTopics.slice(0, 8);

  // Gap + moat detection
  const { gaps, moats } = computeTopicGaps(primaryId);

  // ── HOT LIST HTML ──
  const hotListHtml = hotTopics.map((t, i) => {
    const leadCh = all.find(c => c.id === t.leadChannel);
    const leadCol = leadCh ? colorOf(leadCh) : "var(--t3)";
    const momentumHtml = t.momentum !== null
      ? `<span style="color:${t.momentum >= 1.2 ? 'var(--up)' : t.momentum <= 0.8 ? 'var(--down)' : 'var(--t3)'}">${t.momentum >= 1 ? "▲" : "▼"}${t.momentum.toFixed(1)}×</span>`
      : `<span style="color:var(--t3)">•</span>`;

    return `
      <div class="topic-hot-row" onclick="filterRaceByTopic('${esc(t.topic)}')">
        <span class="topic-rank-chip">${i + 1}</span>
        <div class="topic-hot-body">
          <div class="topic-hot-name">${esc(t.topic)}</div>
          <div class="topic-hot-meta">
            <span style="color:var(--t3)">${t.n} vids</span>
            ${leadCh ? `<span>· led by <span style="color:${leadCol}">●</span> ${esc(leadCh.name)}</span>` : ""}
          </div>
        </div>
        <div class="topic-hot-stats">
          <span class="topic-score">🔥${fmtN(t.hotScore)}</span>
          ${momentumHtml}
        </div>
      </div>`;
  }).join("");

  // ── GAP + MOAT CHIPS ──
  const gapChips = gaps.slice(0, 3).map(g => `
    <div class="topic-gap-chip" title="Field avg: ${fmtN(g.fieldAvg)} · ${g.fieldN} videos across field">
      <span class="msi" style="font-size:13px;color:var(--acc)">search_off</span>
      <span>${esc(g.topic)}</span>
      <span class="topic-gap-stat">${fmtN(g.fieldAvg)} avg · you: 0</span>
    </div>`).join("");

  const moatChips = moats.slice(0, 2).map(m => `
    <div class="topic-moat-chip" title="You rank #1 on this topic with ${m.myN} videos">
      <span class="msi" style="font-size:13px;color:var(--me)">shield</span>
      <span>${esc(m.topic)}</span>
      <span class="topic-moat-stat">YOU #1 🛡</span>
    </div>`).join("");

  // ── HEAT MATRIX ──
  // Columns = channels (up to 8, sorted by subscriber count)
  const matrixChannels = [...all].sort((a, b) => (b.subscribers_raw || 0) - (a.subscribers_raw || 0)).slice(0, 8);

  const matrixHeaderHtml = `
    <tr>
      <th class="matrix-topic-col">Topic</th>
      ${matrixChannels.map(ch => {
        const col = colorOf(ch);
        const isMe = ch.is_primary;
        return `<th class="matrix-ch-col ${isMe ? "matrix-me-col" : ""}">
          <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
            ${ch.logo_url
              ? `<img src="${esc(proxyImg(ch.logo_url))}" style="width:22px;height:22px;border-radius:50%;border:1.5px solid ${col}">`
              : `<div style="width:22px;height:22px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700">${(ch.name||"?")[0]}</div>`}
            <span style="font-size:9px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52px">${esc(ch.name.length > 6 ? ch.name.slice(0,6)+"…" : ch.name)}</span>
          </div>
        </th>`;
      }).join("")}
    </tr>`;

  // Global max for opacity scaling
  const globalMaxAvg = Math.max(...matrixTopics.map(t => t.avgViews), 1);

  const matrixRowsHtml = matrixTopics.map(t => {
    const cells = matrixChannels.map(ch => {
      const chStat = _topicCache.perChannel.get(ch.id)?.get(t.topic);
      if (!chStat || !chStat.n) {
        return `<td class="matrix-cell empty" onclick="showTopicCellPopover(event,'${esc(ch.id)}','${esc(t.topic)}')" title="${esc(ch.name)} · no videos on ${esc(t.topic)}">
          <span class="matrix-empty-dash">—</span>
        </td>`;
      }
      const col = colorOf(ch);
      const opacity = 0.12 + (chStat.avgViews / globalMaxAvg) * 0.75;
      const isMe = ch.is_primary;
      return `<td class="matrix-cell ${isMe ? "matrix-me-cell" : ""}"
        style="background:${col.replace(")", `,${opacity.toFixed(2)})`).replace("hsl","hsla")}"
        onclick="showTopicCellPopover(event,'${esc(ch.id)}','${esc(t.topic)}')"
        title="${esc(ch.name)} · ${chStat.n} vids · avg ${fmtN(chStat.avgViews)}">
        <span class="matrix-cell-val">${fmtN(chStat.avgViews)}</span>
        <span class="matrix-cell-n">${chStat.n}v</span>
      </td>`;
    }).join("");

    return `<tr>
      <td class="matrix-topic-label" onclick="filterRaceByTopic('${esc(t.topic)}')">${esc(t.topic)}</td>
      ${cells}
    </tr>`;
  }).join("");

  el.innerHTML = `
    <div class="topic-radar-card">
      <div class="topic-radar-hdr">
        <div class="topic-radar-title">
          <span class="msi" style="color:var(--down)">local_fire_department</span>
          TOPIC RADAR
          <span>· what's hot across your field</span>
        </div>
        <div class="race-seg">
          ${["90d","6m","all"].map(r => `
            <button class="race-seg-btn ${topicRadarRange === r ? "on" : ""}"
              onclick="setTopicRadarRange('${r}')">${r}</button>`).join("")}
        </div>
      </div>

      <div class="topic-radar-body">
        <!-- LEFT: Hot list + gap chips -->
        <div class="topic-hot-col">
          <div class="topic-section-label">HOT NOW</div>
          <div class="topic-hot-list">${hotListHtml}</div>

          ${(gapChips || moatChips) ? `
          <div class="topic-section-label" style="margin-top:12px">YOUR POSITION</div>
          <div class="topic-chips-row">${gapChips}${moatChips}</div>` : ""}
        </div>

        <!-- RIGHT: Heat matrix -->
        <div class="topic-matrix-col">
          <div class="topic-section-label">HEAT MATRIX · who owns what</div>
          <div style="overflow-x:auto">
            <table class="topic-matrix">
              <thead>${matrixHeaderHtml}</thead>
              <tbody>${matrixRowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Topic cell popover (hidden by default) -->
    <div class="topic-cell-popover" id="topicCellPopover">
      <div class="topic-cell-popover-hdr" id="topicCellPopoverHdr"></div>
      <div class="topic-cell-popover-list" id="topicCellPopoverList"></div>
    </div>`;
}

function setTopicRadarRange(r) {
  topicRadarRange = r;
  localStorage.setItem("topic.range", r);
  renderTopicRadar();
}

function showTopicCellPopover(event, chId, topic) {
  event.stopPropagation();
  const popover = document.getElementById("topicCellPopover");
  if (!popover) return;

  const ch = all.find(c => c.id === chId);
  const chStat = _topicCache.perChannel.get(chId)?.get(topic);
  const en = _enrichCache[chId];
  const vids = (en?.vids || []).filter(v => topicTokens(v.title || "").includes(topic));

  document.getElementById("topicCellPopoverHdr").innerHTML =
    `<strong>${esc(topic)}</strong> · ${esc(ch?.name || chId)}`;

  if (!vids.length) {
    document.getElementById("topicCellPopoverList").innerHTML =
      `<div style="color:var(--t3);font-size:11px;padding:8px 0">No videos on this topic.</div>`;
  } else {
    document.getElementById("topicCellPopoverList").innerHTML =
      vids.slice(0, 4).map(v => {
        const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
        return `<a class="topic-cell-vid-row" href="${esc(v.url)}" target="_blank" rel="noopener">
          <img src="${esc(v.thumb||"")}" style="width:52px;height:30px;object-fit:cover;border-radius:3px">
          <div style="min-width:0">
            <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.title)}</div>
            <div style="font-size:10px;color:var(--t3)">${fmtN(vc)} views · ${ago(v.published_at||v.date)}</div>
          </div>
        </a>`;
      }).join("");
  }

  // Position popover near click
  const rect = event.target.closest("td")?.getBoundingClientRect() || { left: event.clientX, bottom: event.clientY };
  popover.style.left = Math.min(rect.left, window.innerWidth - 280) + "px";
  popover.style.top = (rect.bottom + window.scrollY + 6) + "px";
  popover.classList.add("open");
}

// Close popover on outside click
document.addEventListener("click", e => {
  const p = document.getElementById("topicCellPopover");
  if (p && !p.contains(e.target)) p.classList.remove("open");
});
```

### 2.3 Race Window Topic Filter Cross-wire

```js
// State
let raceTopicFilter = null;  // string or null

function filterRaceByTopic(topic) {
  raceTopicFilter = raceTopicFilter === topic ? null : topic;
  renderRaceWindow();
  // Scroll to race window
  document.querySelector(".race-window")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// In renderRaceWindow(), after computing `ranked`:
// Filter rows by topic if active:
// const filteredRanked = raceTopicFilter
//   ? ranked.filter(r => r.vids.some(v => topicTokens(v.title||"").includes(raceTopicFilter)))
//   : ranked;
// … also show topic filter chip in win-bar when active
```

---

## T3 — Deep Dive: Topics Tab

### 3.1 HTML — Add 5th tab in `index.html`

```html
<button class="tab" id="ddTab-topics" onclick="switchDDTab('topics')">
  <span class="msi">local_fire_department</span> Topics
</button>
```

```html
<div class="dd-panel" id="ddPanel-topics"></div>
```

### 3.2 `renderDDTopics(ch)` — Implementation

```js
async function renderDDTopics(ch) {
  const panel = document.getElementById("ddPanel-topics");
  if (!panel) return;

  if (!_topicCache.topics.size) {
    buildTopicCache();
  }

  const primaryId = (all.find(c => c.is_primary) || all[0])?.id;
  const myTopics = _topicCache.perChannel.get(ch.id) || new Map();
  const globalTopics = _topicCache.topics;
  const col = colorOf(ch);
  const isMe = ch.is_primary;
  const isDeepScanned = !!_enrichCache[ch.id]?.deepScanned;

  // Sort channel topics by avgViews desc
  const chTopicsSorted = [...myTopics.values()]
    .filter(t => t.n >= 1)
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 10);

  const maxChAvg = chTopicsSorted.length ? chTopicsSorted[0].avgViews : 1;

  // Find their rising topic: highest positive momentum
  const risingTopicEntry = [...myTopics.values()]
    .filter(t => globalTopics.get(t.topic)?.momentum > 1.2)
    .sort((a, b) => (globalTopics.get(b.topic)?.momentum || 0) - (globalTopics.get(a.topic)?.momentum || 0))[0];

  // vs You overlay: my stats on same topics (if viewing a rival)
  const myChTopics = primaryId ? (_topicCache.perChannel.get(primaryId) || new Map()) : new Map();

  const topicRowsHtml = chTopicsSorted.map((t, i) => {
    const globalT = globalTopics.get(t.topic);
    const pct = maxChAvg > 0 ? Math.max(4, Math.round(t.avgViews / maxChAvg * 100)) : 4;
    const myStat = myChTopics.get(t.topic);
    const myPct = myStat && maxChAvg > 0 ? Math.max(2, Math.round(myStat.avgViews / maxChAvg * 100)) : 0;
    const momentum = globalT?.momentum;
    const momentumHtml = momentum !== null && momentum !== undefined
      ? `<span style="color:${momentum >= 1.2 ? "var(--up)" : momentum <= 0.8 ? "var(--down)" : "var(--t3)"};font-family:var(--f-mono);font-size:11px">${momentum >= 1 ? "▲" : "▼"}${momentum.toFixed(1)}×</span>`
      : `<span style="color:var(--t3)">•</span>`;

    return `
      <div class="dd-topic-row">
        <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--t3);width:18px">#${i+1}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span style="font-size:13px;font-weight:700;color:var(--t1)">${esc(t.topic)}</span>
            ${momentumHtml}
            ${globalT?.hotScore ? `<span class="badge bdg-dim">🔥${fmtN(globalT.hotScore)}</span>` : ""}
          </div>
          <!-- Their bar -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
            <div style="width:180px;height:6px;background:var(--bg-1);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${col};border-radius:3px;transition:width .6s var(--e-out)"></div>
            </div>
            <span style="font-family:var(--f-mono);font-size:11.5px;font-weight:700">${fmtN(t.avgViews)}</span>
            <span style="font-size:10.5px;color:var(--t3)">${t.n} vid${t.n!==1?"s":""} · ${ago(t.lastUsed)}</span>
            ${t.avgEng !== null ? `<span class="badge bdg-dim">${t.avgEng}% eng</span>` : ""}
          </div>
          ${(!isMe && myStat) ? `
          <!-- My overlay bar -->
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:180px;height:4px;background:var(--bg-1);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${myPct}%;background:var(--me);border-radius:3px;transition:width .6s var(--e-out)"></div>
            </div>
            <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--me)">${fmtN(myStat.avgViews)}</span>
            <span style="font-size:9.5px;color:var(--t3)">you · ${myStat.n}v</span>
          </div>` : ""}
          ${(!isMe && !myStat) ? `
          <div style="font-size:10px;color:var(--down);margin-top:2px">
            ← you: 0 videos on this topic
          </div>` : ""}
        </div>
      </div>`;
  }).join("");

  panel.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:18px;animation:fadeUp .4s var(--e-out)">
      ${risingTopicEntry ? `
      <div class="card" style="border-left:3px solid var(--up);flex-direction:row;align-items:center;gap:12px">
        <span class="msi" style="color:var(--up);font-size:24px">trending_up</span>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--up);text-transform:uppercase;letter-spacing:.06em">Rising Topic</div>
          <div style="font-size:14px;font-weight:700;color:var(--t1)">${esc(risingTopicEntry.topic)}</div>
          <div style="font-size:11.5px;color:var(--t2)">${fmtN(risingTopicEntry.avgViews)} avg · ${risingTopicEntry.n} videos · momentum ${globalTopics.get(risingTopicEntry.topic)?.momentum?.toFixed(1)}×</div>
        </div>
      </div>` : ""}

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="sect-lbl" style="margin:0">
            <span class="msi">local_fire_department</span> Top Topics
          </div>
          ${!isMe ? `<span style="font-size:11px;color:var(--t3)">
            <span style="color:${col}">●</span> ${esc(ch.name)} &nbsp;
            <span style="color:var(--me)">●</span> You (overlay)
          </span>` : ""}
        </div>
        ${chTopicsSorted.length
          ? `<div style="display:flex;flex-direction:column;gap:14px">${topicRowsHtml}</div>`
          : `<div style="color:var(--t3);text-align:center;padding:24px">No topics detected yet — try Deep Scan.</div>`}
      </div>

      <div class="card" style="flex-direction:row;align-items:center;justify-content:space-between;gap:16px">
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--t2)">Deep Scan (200 videos)</div>
          <div style="font-size:11px;color:var(--t3)">Richer topic history · ≈4 API units · cached 7 days</div>
        </div>
        <button class="btn ${isDeepScanned ? "btn-gh" : "btn-acc"} btn-sm" onclick="topicDeepScan('${esc(ch.id)}')">
          ${isDeepScanned ? "✓ Already scanned" : "⚡ Deep Scan"}
        </button>
      </div>
    </div>`;
}
```

---

## T4 — Self-Tracking Surfaces

### 4.1 My Pulse Popover

```js
// Attach to the ⭐ My Channel badge in the topnav (or a new avatar button in nav-right)
// HTML addition in index.html nav-right:
// <button class="icon-btn" id="myPulseBtn" onclick="toggleMyPulse()" title="My Channel Pulse">
//   <span class="msi">person</span>
// </button>
// <div class="my-pulse-popover" id="myPulsePopover"></div>

function toggleMyPulse() {
  const pop = document.getElementById("myPulsePopover");
  if (!pop) return;
  if (pop.classList.contains("open")) { pop.classList.remove("open"); return; }
  renderMyPulse();
  pop.classList.add("open");
}

async function renderMyPulse() {
  const pop = document.getElementById("myPulsePopover");
  if (!pop) return;

  const me = all.find(c => c.is_primary) || all[0];
  if (!me) { pop.innerHTML = `<div style="color:var(--t3);padding:16px">No primary channel set.</div>`; return; }

  const en = await enrich(me.id) || {};
  const vids = en.vids || [];
  const latestVid = en.latestVideo;

  // 7-day views spark from recent vids
  const weekViews = vids.slice(0, 7).map(v => parseInt(v.view_count ?? v.views_raw ?? 0)).reverse();

  // Sub pace (from snapshots if available; else estimate from growth)
  const subRaw = me.subscribers_raw || 0;
  const totalVids = parseInt(me.total_videos || 0);

  // Cadence: days since last upload
  let daysSinceLast = null, cadenceMsg = "";
  if (latestVid) {
    const pub = new Date(latestVid.published_at || latestVid.date || 0).getTime();
    daysSinceLast = Math.floor((Date.now() - pub) / 864e5);
    const longForm = vids.filter(v => !isYouTubeShort(v));
    if (longForm.length >= 2) {
      const intervals = [];
      for (let i = 0; i < Math.min(longForm.length-1, 5); i++) {
        const a = new Date(longForm[i].published_at || longForm[i].date).getTime();
        const b = new Date(longForm[i+1].published_at || longForm[i+1].date).getTime();
        intervals.push(Math.abs(a - b) / 864e5);
      }
      const medianInterval = intervals.sort((a,b)=>a-b)[Math.floor(intervals.length/2)];
      if (daysSinceLast > medianInterval * 1.5) {
        cadenceMsg = `⚠ ${daysSinceLast}d since upload · median ${Math.round(medianInterval)}d → overdue`;
      } else {
        cadenceMsg = `${daysSinceLast}d since last upload · median ${Math.round(medianInterval)}d → on track`;
      }
    }
  }

  // Latest video velocity vs your avg
  let velMsg = "";
  if (latestVid && en.latestVpd && en.sp30?.length) {
    const avgVpd = en.sp30.reduce((a,b) => a+b, 0) / en.sp30.length;
    const ratio = en.latestVpd / Math.max(1, avgVpd);
    velMsg = `Latest: ${fmtN(en.latestVpd)}/day ${ratio >= 1.3 ? "▲" : ratio <= 0.7 ? "▼" : "~"} ${ratio.toFixed(1)}× your avg`;
  }

  pop.innerHTML = `
    <div class="my-pulse-hdr">
      ${me.logo_url ? `<img src="${esc(proxyImg(me.logo_url))}" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--me)">` : ""}
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--t1)">${esc(me.name)}</div>
        <div style="font-size:10.5px;color:var(--t3)">${esc(me.subscribers)} subs · ${me.total_videos} videos</div>
      </div>
    </div>
    <div class="my-pulse-body">
      <div class="my-pulse-row">
        <span style="color:var(--t3);font-size:11px">7-day spark</span>
        ${sparkSVG(weekViews, 90, 20, "var(--me)")}
      </div>
      ${cadenceMsg ? `<div class="my-pulse-row cadence ${daysSinceLast > 14 ? "warn" : ""}">${cadenceMsg}</div>` : ""}
      ${velMsg ? `<div class="my-pulse-row">${velMsg}</div>` : ""}
      <div class="my-pulse-row" style="font-family:var(--f-mono);font-size:12px;color:var(--me)">${esc(me.subscribers)} subscribers</div>
    </div>
    <div class="my-pulse-footer">
      <button class="btn btn-gh btn-sm" onclick="toggleMyPulse();sp('dash')">Dashboard →</button>
      <button class="btn btn-gh btn-sm" onclick="refreshOne('${esc(me.id)}').then(renderMyPulse)">Refresh ↺</button>
    </div>`;
}
```

### 4.2 Milestone Ring in "My Channel Strip"

```js
// In renderDash(), after computing primaryEnrich:
// Add a 5th tile to mcs-tiles: "Next Milestone"
// Detect nearest milestone (25K, 50K, 100K, 500K, 1M …)

function nextMilestone(n) {
  const stones = [1e3, 5e3, 10e3, 25e3, 50e3, 100e3, 250e3, 500e3, 1e6, 2e6, 5e6, 10e6, 50e6, 100e6];
  return stones.find(s => s > n) || null;
}

// In strip tile HTML:
// const ms = nextMilestone(primary.subscribers_raw || 0);
// const msPct = ms ? Math.min(99, Math.round((primary.subscribers_raw / ms) * 100)) : 100;
// const msDash = ms ? Math.round(msPct / 100 * 63) : 63; // circumference ~63 for r=10
// → SVG ring with stroke-dashoffset animation
```

### 4.3 Video Health Chips on Recent Uploads Rail

```js
// In loadDashboardRecentUploads(), after building ru-item HTML:
// After getting longFormAvgVpd from enrichCache.sp30:
// Each card gets a chip: ratio vs 30-vid avg
// Green ▲2.4× = overperformer → "Make Part 2"
// Red ▼0.4× = underperformer → "New thumb test"
```

### 4.4 Daily Digest (Alerts Bell)

- Hook into the existing Phase-4 alerts system (or add bell icon if not yet present).
- Digest generates once per calendar day, stored in `localStorage('yt_digest_' + todayKey)`.
- Content: yesterday's views Δ (from snapshots), sub pace, cadence status, top competitor drops.

---

## T5 — Topic-Aware Alerts

```js
// During refreshOne() and after buildTopicCache():
function checkTopicAlerts(ch, newVids) {
  if (!ch || !newVids.length) return;
  const primary = all.find(c => c.is_primary);
  if (!primary) return;

  const { moats, gaps } = computeTopicGaps(primary.id);
  const moatTopics = new Set(moats.map(m => m.topic));
  const gapTopics  = new Set(gaps.map(g => g.topic));

  newVids.forEach(v => {
    const toks = new Set(topicTokens(v.title || ""));

    // THREAT: rival published on your moat topic
    if (ch.id !== primary.id) {
      moatTopics.forEach(t => {
        if (toks.has(t)) {
          pushAlert({
            type: "topic-threat",
            icon: "warning",
            color: "var(--down)",
            title: `${ch.name} published on your moat: ${t}`,
            body: v.title,
            url: v.url,
            ts: Date.now()
          });
        }
      });
    }

    // OPPORTUNITY: hot topic momentum just crossed 2×
    toks.forEach(t => {
      const stat = _topicCache.topics.get(t);
      if (stat?.momentum >= 2 && ch.id !== primary.id) {
        pushAlert({
          type: "topic-opportunity",
          icon: "trending_up",
          color: "var(--up)",
          title: `Hot topic spiking: ${t} (${stat.momentum.toFixed(1)}×)`,
          body: `${ch.name} just published → ${v.title}`,
          url: v.url,
          ts: Date.now()
        });
      }
    });

    // GAP ALERT: rival published on a gap topic you haven't covered
    if (ch.id !== primary.id) {
      gapTopics.forEach(t => {
        if (toks.has(t)) {
          pushAlert({
            type: "topic-gap",
            icon: "search_off",
            color: "var(--warn)",
            title: `Rival covered your gap: ${t}`,
            body: `${ch.name} → ${v.title}`,
            url: v.url,
            ts: Date.now()
          });
        }
      });
    }
  });
}
```

---

## CSS Additions (style.css)

```css
/* ══ TOPIC RADAR CARD ══ */
.topic-radar-card {
  background: var(--bg-2);
  border: 1px solid var(--line-1);
  border-radius: var(--r-l);
  margin-top: var(--s5);
  box-shadow: var(--sh-1);
  overflow: hidden;
}

.topic-radar-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  background: var(--bg-3);
  border-bottom: 1px solid var(--line-1);
  flex-wrap: wrap;
  gap: 10px;
}

.topic-radar-title {
  font-family: var(--f-disp);
  font-size: 14px;
  font-weight: 700;
  color: var(--t1);
  display: flex;
  align-items: center;
  gap: 8px;
}

.topic-radar-title span {
  color: var(--t3);
  font-size: 12px;
  font-weight: 500;
  font-family: var(--f-ui);
}

.topic-radar-body {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 0;
  min-height: 280px;
}

.topic-hot-col {
  padding: 14px 16px;
  border-right: 1px solid var(--line-1);
  display: flex;
  flex-direction: column;
}

.topic-matrix-col {
  padding: 14px 16px;
}

.topic-section-label {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--t3);
  margin-bottom: 8px;
}

/* Hot list rows */
.topic-hot-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.topic-hot-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--r-s);
  cursor: pointer;
  transition: background var(--d-1);
}

.topic-hot-row:hover {
  background: var(--bg-hover);
}

.topic-rank-chip {
  font-family: var(--f-mono);
  font-size: 10px;
  font-weight: 800;
  color: var(--t3);
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.topic-hot-body {
  flex: 1;
  min-width: 0;
}

.topic-hot-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--t1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topic-hot-meta {
  font-size: 10.5px;
  color: var(--t3);
}

.topic-hot-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.topic-score {
  font-family: var(--f-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--down);
}

/* Gap + moat chips */
.topic-chips-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.topic-gap-chip, .topic-moat-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--r-s);
  font-size: 11.5px;
  cursor: default;
}

.topic-gap-chip {
  background: rgba(34, 211, 238, 0.06);
  border: 1px solid rgba(34, 211, 238, 0.2);
}

.topic-moat-chip {
  background: rgba(245, 197, 66, 0.06);
  border: 1px solid rgba(245, 197, 66, 0.2);
}

.topic-gap-stat, .topic-moat-stat {
  margin-left: auto;
  font-family: var(--f-mono);
  font-size: 10.5px;
  color: var(--t3);
}

/* Heat matrix */
.topic-matrix {
  border-collapse: collapse;
  width: 100%;
  font-size: 11px;
}

.topic-matrix th, .topic-matrix td {
  padding: 6px 8px;
  border: 1px solid var(--line-1);
  text-align: center;
  vertical-align: middle;
}

.topic-matrix th {
  background: var(--bg-3);
  font-size: 9.5px;
  color: var(--t3);
  font-weight: 700;
  text-transform: uppercase;
}

.matrix-topic-col, .matrix-topic-label {
  text-align: left !important;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--t1);
  white-space: nowrap;
  cursor: pointer;
  min-width: 100px;
  position: sticky;
  left: 0;
  background: var(--bg-2);
  z-index: 1;
}

.matrix-topic-label:hover { color: var(--acc); }

.matrix-ch-col { min-width: 64px; }

.matrix-cell {
  cursor: pointer;
  position: relative;
  transition: filter var(--d-1);
}

.matrix-cell:hover { filter: brightness(1.3); }

.matrix-cell.empty {
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 4px,
    rgba(148,163,184,.06) 4px,
    rgba(148,163,184,.06) 8px
  );
}

.matrix-empty-dash { color: var(--t4); font-size: 14px; }

.matrix-cell-val {
  display: block;
  font-family: var(--f-mono);
  font-size: 10.5px;
  font-weight: 700;
  color: var(--t1);
}

.matrix-cell-n {
  display: block;
  font-size: 9px;
  color: var(--t3);
}

.matrix-me-col, .matrix-me-cell {
  box-shadow: inset 0 0 0 1.5px rgba(245,197,66,.5);
}

/* Cell popover */
.topic-cell-popover {
  position: absolute;
  width: 260px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-m);
  box-shadow: var(--sh-2);
  z-index: 200;
  padding: 12px;
  display: none;
}

.topic-cell-popover.open {
  display: block;
  animation: pop .18s var(--e-out) forwards;
}

.topic-cell-popover-hdr {
  font-size: 12px;
  font-weight: 700;
  color: var(--t1);
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line-1);
}

.topic-cell-vid-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--line-1);
  text-decoration: none;
  color: var(--t2);
  transition: color var(--d-1);
}

.topic-cell-vid-row:last-child { border-bottom: none; }
.topic-cell-vid-row:hover { color: var(--t1); }

/* ══ TOPICS TAB ══ */
.dd-topic-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line-1);
}

.dd-topic-row:last-child { border-bottom: none; }

/* ══ MY PULSE POPOVER ══ */
.my-pulse-popover {
  position: fixed;
  top: 62px;
  right: 36px;
  width: 280px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-l);
  box-shadow: var(--sh-2);
  z-index: 150;
  display: none;
  overflow: hidden;
}

.my-pulse-popover.open {
  display: block;
  animation: pop .2s var(--e-out) forwards;
}

.my-pulse-hdr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-3);
  border-bottom: 1px solid var(--line-1);
}

.my-pulse-body {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.my-pulse-row {
  font-size: 11.5px;
  color: var(--t2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.my-pulse-row.warn { color: var(--warn); }

.my-pulse-footer {
  display: flex;
  gap: 6px;
  padding: 10px 16px;
  border-top: 1px solid var(--line-1);
  background: var(--bg-1);
}

/* Milestone ring in strip */
.milestone-ring {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.milestone-ring circle {
  transform: rotate(-90deg);
  transform-origin: center;
  transition: stroke-dashoffset .8s var(--e-out);
}

/* Video health chip on ru-item */
.ru-health-chip {
  font-family: var(--f-mono);
  font-size: 9px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
}

.ru-health-chip.up { background: rgba(61,220,151,.15); color: var(--up); }
.ru-health-chip.down { background: rgba(255,107,107,.15); color: var(--down); }

/* Responsive */
@media (max-width: 1080px) {
  .topic-radar-body { grid-template-columns: 1fr; }
  .topic-hot-col { border-right: none; border-bottom: 1px solid var(--line-1); }
}

@media (max-width: 768px) {
  .my-pulse-popover { right: 16px; width: calc(100vw - 32px); }
}
```

---

## Build Order & DoD (T1 → T5)

| Step | Impl target | DoD check |
|---|---|---|
| T1 | `topicTokens()`, `topicFreqMap()`, `buildTopicCache()`, alias map, deep scan | `_topicCache.topics` populated from `_enrichCache`; bigrams ≥ 3 only; topics n<2 excluded; localStorage roundtrip works |
| T2 | `renderTopicRadar()`, hot list, matrix, gap/moat chips, cell popover, range seg | Renders ≤50ms from warm cache; dashed cells for 0-video slots; cell click shows popover with real videos; topic click calls `filterRaceByTopic()` |
| T3 | 5th DD tab, `renderDDTopics()`, rising topic callout, vs-you overlay, deep scan button | Dual bars visible when viewing rival; moat/gap correct; deep scan fetch works without breaking normal cache |
| T4 | My Pulse popover, milestone ring, video health chips | Avatar click shows pulse on every page; ring animates correctly; chips show ▲/▼ vs 30-vid avg |
| T5 | `checkTopicAlerts()` inside `refreshOne()`, `pushAlert()`, bell dedup | 3 alert types fire correctly; no spam (deduped by `topic+chId+day`); reduced-motion OK |

**QA checklist:**
- [ ] Stopwords list editable via alias map UI
- [ ] Topics with n < 2 never appear in any surface
- [ ] Momentum shows `•` when < 2 videos per period
- [ ] Matrix respects `hsl()` vs `var()` color handling
- [ ] Network tab: zero extra quota during T1-T5 unless Deep Scan clicked
- [ ] Reduced-motion: ring/bar transitions suppressed
- [ ] `filterRaceByTopic()` shows active chip in race win-bar + FLIP re-sort
- [ ] Deep Scan button shows cost warning + disables during fetch
- [ ] Cell popover closes on outside click
