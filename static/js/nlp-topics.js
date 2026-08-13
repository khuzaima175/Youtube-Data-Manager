/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — NLP & TOPIC INTELLIGENCE ENGINE
   ══════════════════════════════════════════════════════════════════════════════ */

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
  const customStops = new Set(userPrefs?.customStopwords || []);
  const words = title.toLowerCase()
    .replace(/[^\p{L}\p{N}\s+#]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !TOPIC_STOP.has(w) && !customStops.has(w))
    .map(w => (userPrefs?.topicAliases && userPrefs.topicAliases[w]) || TOPIC_ALIAS[w] || w);
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
  const cutOld = now - 365 * 864e5;

  allVids.forEach(v => {
    const toks = cleanTokens(v.title || '');
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

  const finalTopics = new Map();
  for (const [t, s] of topicMap) {
    if (s.n < 2) continue;
    const avgViews = s.n > 0 ? Math.round(s.totalViews / s.n) : 0;
    const avgEng = s.engCount > 0 ? parseFloat((s.totalEng / s.engCount).toFixed(1)) : null;
    const recentAvg = s.recentViews.length > 0 ? s.recentViews.reduce((a, b) => a + b, 0) / s.recentViews.length : 0;
    const oldAvg = s.oldViews.length > 0 ? s.oldViews.reduce((a, b) => a + b, 0) / s.oldViews.length : 0;
    const hotScore = Math.round(recentAvg * Math.log2(s.n + 1));
    const momentum = (recentAvg > 0 && oldAvg > 0 && s.recentViews.length >= 2 && s.oldViews.length >= 2)
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
  } catch { }
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
  try { localStorage.setItem('yt_topic_aliases', JSON.stringify(TOPIC_ALIAS)); } catch { }
  buildTopicCache();
  renderTopicRadar();
}

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
  } catch { }
  // Disable button during fetch
  const btn = document.querySelector(`[onclick*="topicDeepScan('${chId}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
  toast('Deep scanning… (~4 API units)', '');
  try {
    const r = await apiFetch(`/api/channels/${chId}/videos?max=200`);
    const vids = await r.json();
    if (!Array.isArray(vids)) throw new Error('bad response');
    try { localStorage.setItem(DEEP_KEY, JSON.stringify({ ts: Date.now(), vids })); } catch { }
    _enrichCache[chId] = { ..._enrichCache[chId], vids, deepScanned: true };
    if (typeof clearTimingCache === 'function') clearTimingCache();
    buildTopicCache();
    toast('Deep scan complete!', 's');
    if (ddChannelId === chId) {
      renderDDTopics(all.find(c => c.id === chId));
      if (ddActiveTab === 'growth') renderDDGrowth(all.find(c => c.id === chId));
    }
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
  renderTopicRadar();
  if (typeof serializeStateToHash === 'function') serializeStateToHash();
  if (raceTopicFilter) {
    document.getElementById('sec-drops')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof toast === 'function') toast(`Filtering Latest Drops by: "${raceTopicFilter}"`, 's');
  } else {
    if (typeof toast === 'function') toast('Cleared topic filter', 's');
  }
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
            <span class="msi" style="color:var(--down);font-size:16px">local_fire_department</span>
            TOPIC RADAR <span>· what's hot across your field</span>
          </div>
          <div class="race-seg" style="opacity:0.6">
            <div class="skel" style="width:110px;height:24px;border-radius:var(--r-full)"></div>
          </div>
        </div>
        <div class="topic-radar-body" style="min-height:220px">
          <!-- Hot Column Shimmer -->
          <div class="topic-hot-col" style="gap:10px">
            <div class="topic-section-label">HOT NOW</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div class="skel" style="height:32px;border-radius:var(--r-s)"></div>
              <div class="skel" style="height:32px;border-radius:var(--r-s)"></div>
              <div class="skel" style="height:32px;border-radius:var(--r-s)"></div>
              <div class="skel" style="height:32px;border-radius:var(--r-s)"></div>
            </div>
          </div>
          <!-- Matrix Column Shimmer -->
          <div class="topic-matrix-col" style="display:flex;flex-direction:column;gap:10px">
            <div class="topic-section-label">HEAT MATRIX · WHO OWNS WHAT TOPIC</div>
            <div style="display:grid;grid-template-columns:100px repeat(4, 1fr);gap:8px">
              <div class="skel" style="height:24px"></div>
              <div class="skel" style="height:24px"></div>
              <div class="skel" style="height:24px"></div>
              <div class="skel" style="height:24px"></div>
              <div class="skel" style="height:24px"></div>
            </div>
            <div style="display:grid;grid-template-columns:100px repeat(4, 1fr);gap:8px">
              <div class="skel" style="height:28px"></div>
              <div class="skel" style="height:28px"></div>
              <div class="skel" style="height:28px"></div>
              <div class="skel" style="height:28px"></div>
              <div class="skel" style="height:28px"></div>
            </div>
            <div style="display:grid;grid-template-columns:100px repeat(4, 1fr);gap:8px">
              <div class="skel" style="height:28px"></div>
              <div class="skel" style="height:28px"></div>
              <div class="skel" style="height:28px"></div>
              <div class="skel" style="height:28px"></div>
              <div class="skel" style="height:28px"></div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:auto;font-size:11px;color:var(--t3)">
              <div class="spin" style="width:12px;height:12px"></div>
              <span>Building topic intelligence index from catalog…</span>
            </div>
          </div>
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

  const hotTopics = sortedTopics.slice(0, 10);
  const matrixTopics = hotTopics.slice(0, 8);
  const { gaps, moats } = computeTopicGaps(primaryId);

  // Active topic filter chip in topic radar
  const filterChipHtml = raceTopicFilter
    ? `<span class="badge bdg-pr" style="margin-left:8px;cursor:pointer;display:inline-flex;align-items:center;gap:4px" onclick="event.stopPropagation();filterRaceByTopic(null)" title="Click to clear topic filter">
        filter: ${esc(raceTopicFilter)} ✕
       </span>` : '';

  // Hot list
  const hotListHtml = hotTopics.length ? hotTopics.map((t, i) => {
    const leadCh = all.find(c => c.id === t.leadChannel);
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
        : `<div style="width:22px;height:22px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">${(ch.name || '?')[0]}</div>`}
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
          <span class="msi" style="color:var(--down);font-size:16px">whatshot</span>
          TOPIC RADAR${filterChipHtml}
          <span>· what's hot across your field</span>
        </div>
        <div class="race-seg">
          ${['90d', '6m', 'all'].map(r => `
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

  const ch = all.find(c => c.id === chId);
  const en = _enrichCache[chId];
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
          <img src="${esc(v.thumb || '')}" style="width:52px;height:30px;object-fit:cover;border-radius:3px;background:var(--bg-1)" onerror="this.style.opacity='.3'">
          <div style="min-width:0">
            <div style="font-size:11px;font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.title)}</div>
            <div style="font-size:10px;color:var(--t3)">${fmtN(vc)} views · ${ago(v.published_at || v.date)}</div>
          </div>
        </a>`;
    }).join('');

  const rect = event.currentTarget?.getBoundingClientRect() || { left: event.clientX, bottom: event.clientY };
  popover.style.left = Math.min(rect.left, window.innerWidth - 290) + window.scrollX + 'px';
  popover.style.top = (rect.bottom + window.scrollY + 6) + 'px';
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
      const a = new Date(longForm[i].published_at || longForm[i].date || 0).getTime();
      const b = new Date(longForm[i + 1].published_at || longForm[i + 1].date || 0).getTime();
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
  const stones = [1e3, 5e3, 10e3, 25e3, 50e3, 100e3, 250e3, 500e3, 1e6, 2e6, 5e6, 10e6, 50e6, 100e6];
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
} catch { }

function topicAlerts_check(ch, newVids) {
  if (!ch || !newVids || !newVids.length) return;
  const primary = all.find(c => c.is_primary);
  if (!primary || !_topicCache.topics.size) return;

  const { moats, gaps } = computeTopicGaps(primary.id);
  const moatTopics = new Set(moats.map(m => m.topic));
  const gapTopics = new Set(gaps.map(g => g.topic));
  const todayKey = new Date().toISOString().slice(0, 10);

  newVids.forEach(v => {
    const toks = new Set(topicTokens(v.title || ''));

    moatTopics.forEach(t => {
      if (!toks.has(t) || ch.id === primary.id) return;
      const dk = `threat:${t}:${ch.id}:${todayKey}`;
      if (_alertDedup.has(dk)) return;
      _alertDedup.add(dk);
      pushTopicAlert({
        type: 'threat', icon: 'warning', color: 'var(--down)',
        title: `${esc(ch.name)} published on your moat: ${t}`,
        body: v.title, url: v.url
      });
    });

    toks.forEach(t => {
      const stat = _topicCache.topics.get(t);
      if (!stat || (stat.momentum || 0) < 2 || ch.id === primary.id) return;
      const dk = `opp:${t}:${todayKey}`;
      if (_alertDedup.has(dk)) return;
      _alertDedup.add(dk);
      pushTopicAlert({
        type: 'opportunity', icon: 'trending_up', color: 'var(--up)',
        title: `Hot topic spiking: ${t} (${(stat.momentum || 0).toFixed(1)}×)`,
        body: `${esc(ch.name)} → ${v.title}`, url: v.url
      });
    });

    gapTopics.forEach(t => {
      if (!toks.has(t) || ch.id === primary.id) return;
      const dk = `gap:${t}:${ch.id}:${todayKey}`;
      if (_alertDedup.has(dk)) return;
      _alertDedup.add(dk);
      pushTopicAlert({
        type: 'gap', icon: 'search_off', color: 'var(--warn)',
        title: `Rival covered your gap: ${t}`,
        body: `${esc(ch.name)} → ${v.title}`, url: v.url
      });
    });
  });

  // Persist dedup set (keep only today's)
  try { localStorage.setItem('yt_alert_dedup', JSON.stringify([..._alertDedup])); } catch { }
}

function pushTopicAlert({ type, icon, color, title, body, url }) {
  // Push to persistent Bell inbox
  pushInboxAlert({
    id: 'alert-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    type: type || 'threat',
    title: title || 'Topic Signal',
    text: body || '',
    url: url || '',
    read: false
  });
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
    const ratio = userPrefs?.collisionRatio || 1.8;
    if (rivalSubs < mySubs * ratio) continue;

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
