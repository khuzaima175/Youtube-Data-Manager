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

function getChannelMedianBaseline(chId) {
  if (_channelBaselinesCache && _channelBaselinesCache[chId]) {
    return _channelBaselinesCache[chId];
  }
  const en = _enrichCache[chId];
  const longForm = en?.longForm || [];
  if (longForm.length >= 3) {
    const sorted = longForm.map(v => parseInt(v.view_count ?? v.views_raw ?? 0)).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] || 1;
  }
  const ch = all.find(c => c.id === chId);
  return ch?.avg_views_raw || 1;
}

function buildTopicCache(force = false) {
  const now = Date.now();
  if (!force && _topicCache.ts && (now - _topicCache.ts) < 5 * 60 * 1000 && _topicCache.topics && _topicCache.topics.size > 0) {
    return;
  }

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
  const minBigramCount = allVids.length > 25 ? 3 : 2;
  const validBigrams = new Set(
    [...globalFreq.entries()]
      .filter(([t, n]) => t.includes(' ') && n >= minBigramCount)
      .map(([t]) => t)
  );

  const minUnigramFreq = allVids.length > 30 ? 2 : 1;
  function cleanTokens(title) {
    const raw = topicTokens(title);
    return raw.filter(t => {
      if (t.includes(' ')) return validBigrams.has(t);
      return (globalFreq.get(t) || 0) >= minUnigramFreq;
    });
  }

  // Precompute channel baselines for RPI calculation
  const baselines = {};
  all.forEach(ch => {
    baselines[ch.id] = getChannelMedianBaseline(ch.id);
  });

  const topicMap = new Map();
  const cut14d = now - 14 * 864e5;
  const cutRecent = now - 90 * 864e5;
  const cutOld = now - 365 * 864e5;

  allVids.forEach(v => {
    const toks = cleanTokens(v.title || '');
    const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
    const eng = calcEngagementRate(v.like_count, v.comment_count, vc);
    const pub = new Date(v.published_at || v.date || 0).getTime();
    const chBase = Math.max(baselines[v._chId] || 1, 1);
    const rpi = vc / chBase;

    // Velocity-Weighted RPI (VRPI) & Outlier Math
    const ageDays = Math.max(0.04, (now - pub) / 864e5);
    const velocityDaily = vc / ageDays; // current views / day
    const baseVelocityDaily = Math.max(1, chBase / 30); // expected daily baseline
    const rawVrpi = velocityDaily / baseVelocityDaily;
    // Publication age decay: full weight for first 7d, smooth decay after
    const ageDecay = ageDays <= 7 ? 1.0 : 1.0 / Math.sqrt(1 + (ageDays - 7) / 21);
    const vrpi = rawVrpi * ageDecay;
    const isBreakout = (ageDays <= 14) && (rawVrpi >= 2.5);

    // Attach computed metrics to video object
    v._ageDays = ageDays;
    v._velocityDaily = Math.round(velocityDaily);
    v._vrpi = parseFloat(vrpi.toFixed(2));
    v._rawVrpi = parseFloat(rawVrpi.toFixed(2));
    v._isBreakout = isBreakout;

    toks.forEach(t => {
      if (!topicMap.has(t)) {
        topicMap.set(t, {
          topic: t, n: 0, totalViews: 0, totalEng: 0, engCount: 0,
          totalRpi: 0, totalVrpi: 0, breakoutCount: 0, supply14d: 0,
          lastUsed: 0, recentViews: [], oldViews: [], channels: new Set()
        });
      }
      const s = topicMap.get(t);
      s.n++;
      s.totalViews += vc;
      s.totalRpi += rpi;
      s.totalVrpi += vrpi;
      if (isBreakout) s.breakoutCount++;
      if (pub >= cut14d) s.supply14d++;
      if (eng !== null) { s.totalEng += eng; s.engCount++; }
      if (pub > s.lastUsed) s.lastUsed = pub;
      s.channels.add(v._chId);
      if (pub >= cutRecent) s.recentViews.push(vc);
      else if (pub >= cutOld) s.oldViews.push(vc);
    });
  });

  const finalTopics = new Map();
  const minOccurrences = allVids.length > 25 ? 2 : 1;
  for (const [t, s] of topicMap) {
    if (s.n < minOccurrences) continue;
    const avgViews = s.n > 0 ? Math.round(s.totalViews / s.n) : 0;
    const avgEng = s.engCount > 0 ? parseFloat((s.totalEng / s.engCount).toFixed(1)) : null;
    const recentAvg = s.recentViews.length > 0 ? s.recentViews.reduce((a, b) => a + b, 0) / s.recentViews.length : 0;
    const oldAvg = s.oldViews.length > 0 ? s.oldViews.reduce((a, b) => a + b, 0) / s.oldViews.length : 0;
    
    // Empirical Bayes Shrinkage for RPI (P1)
    const rawRpi = s.n > 0 ? s.totalRpi / s.n : 1.0;
    const rawVrpi = s.n > 0 ? s.totalVrpi / s.n : 1.0;
    const w = s.n / (s.n + 5); // Weight formula w = n / (n + 5)
    const shrunkenRpi = parseFloat((w * rawRpi + (1 - w) * 1.0).toFixed(2));
    const shrunkenVrpi = parseFloat((w * rawVrpi + (1 - w) * 1.0).toFixed(2));
    const confidenceTag = s.n >= 8 ? `High (n=${s.n})` : s.n >= 4 ? `Moderate (n=${s.n})` : `Shrunken (n=${s.n})`;
    
    // Supply / Demand Saturation Matrix Metrics (P2)
    const supply14d = s.supply14d;
    const blueOceanScore = parseFloat((shrunkenRpi / (1 + supply14d)).toFixed(2));
    
    // 2x2 Quadrant Assignment
    // High Demand: shrunkenRpi >= 1.25 | High Supply: supply14d >= 2
    let quadrant = 'emerging';
    if (shrunkenRpi >= 1.25 && supply14d < 2) {
      quadrant = 'blue_ocean'; // 🌊 High Demand, Low Supply
    } else if (shrunkenRpi >= 1.25 && supply14d >= 2) {
      quadrant = 'red_ocean'; // 🔥 High Demand, High Supply
    } else if (shrunkenRpi < 1.25 && supply14d >= 2) {
      quadrant = 'saturated'; // ⚠️ Low Demand, High Supply
    } else {
      quadrant = 'emerging'; // 🌱 Low Demand, Low Supply
    }

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
      rawRpi: parseFloat(rawRpi.toFixed(2)),
      shrunkenRpi,
      rawVrpi: parseFloat(rawVrpi.toFixed(2)),
      shrunkenVrpi,
      breakoutCount: s.breakoutCount,
      isBreakoutTopic: s.breakoutCount > 0,
      confidenceTag,
      supply14d,
      blueOceanScore,
      quadrant,
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
    if (myN === 0 && (stat.shrunkenRpi >= 1.1 || stat.avgViews >= medianFieldAvg) && stat.n >= 2) {
      gaps.push({
        topic: t,
        fieldAvg: stat.avgViews,
        fieldN: stat.n,
        shrunkenRpi: stat.shrunkenRpi,
        blueOceanScore: stat.blueOceanScore,
        hotScore: stat.hotScore,
        momentum: stat.momentum
      });
    }
    if (myStat && myStat.n >= 2 && stat.leadChannel === primaryId) {
      const rivalCount = stat.channels.filter(id => id !== primaryId)
        .map(id => _topicCache.perChannel.get(id)?.get(t)?.n || 0)
        .filter(n => n > 0).length;
      if (rivalCount <= 1) {
        moats.push({
          topic: t,
          myN: myStat.n,
          myAvg: myStat.avgViews,
          shrunkenRpi: stat.shrunkenRpi,
          rivalCount
        });
      }
    }
  }
  gaps.sort((a, b) => (b.shrunkenRpi || 0) - (a.shrunkenRpi || 0));
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
    // Non-blocking sync 200 videos to Supabase videos table (P0)
    syncVideosToSupabase(chId, vids).catch(e => console.warn('Supabase deep scan sync warning:', e));
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

function setTopicRadarView(v) {
  topicRadarView = v;
  localStorage.setItem('topic.view', v);
  renderTopicRadar();
}

function openAiTitleSynthesizer(topic = '', title = '') {
  _aiSynthState.topic = topic || '';
  _aiSynthState.title = title || '';
  _aiSynthState.open = true;
  if (typeof renderAiSynthesizerModal === 'function') {
    renderAiSynthesizerModal();
  }
}

function openTitleLabWithTopic(topic) {
  if (!topic) return;
  titleLabDraft = `The Ultimate Guide to ${capWords(topic)}`;
  if (typeof sp === 'function') sp('studio');
  setTimeout(() => {
    if (typeof setStudioSubTab === 'function') setStudioSubTab('lab');
    const input = document.getElementById('titleLabInput');
    if (input) {
      input.value = titleLabDraft;
      if (typeof onTitleLabInput === 'function') onTitleLabInput(titleLabDraft);
      input.focus();
    }
  }, 100);
}

let radarSearchQuery = '';
let radarFilterQuadrant = 'all';
let radarDisplayLimit = 15;

async function renderTopicRadarPage() {
  const el = document.getElementById('radarMain');
  if (!el) return;

  await fetchAll();
  const primary = all.find(c => c.is_primary) || all[0];

  // Enrich all channels in background if needed
  all.forEach(c => {
    if (!_enrichCache[c.id]) {
      enrich(c.id).catch(() => {});
    }
  });

  buildTopicCache();

  if (!_topicCache.topics.size) {
    el.innerHTML = `
      <div class="empty card rev in" style="padding:48px 24px;text-align:center;max-width:540px;margin:40px auto">
        <div class="spin" style="width:32px;height:32px;margin:0 auto 16px;border-color:var(--accent) transparent transparent transparent"></div>
        <h3 style="font-size:16px;font-weight:600;color:var(--text-1);margin-bottom:8px">Analyzing Topic Intelligence</h3>
        <p style="color:var(--text-3);font-size:13px;line-height:1.5">Extracting semantic tokens, view velocity, and field coverage across active channels…</p>
      </div>`;
    setTimeout(() => {
      buildTopicCache(true);
      if (_topicCache.topics.size) renderTopicRadarPage();
    }, 2000);
    return;
  }

  const gapsData = computeTopicGaps(primary?.id);
  const gaps = gapsData.gaps || [];

  // Top Ranked Opportunities (8 max)
  const allTopicsList = [..._topicCache.topics.values()];
  const topOpportunities = [...allTopicsList]
    .filter(t => t.n >= 2 && (t.quadrant === 'blue_ocean' || t.quadrant === 'red_ocean' || t.shrunkenRpi >= 1.2))
    .sort((a, b) => (b.blueOceanScore || 0) - (a.blueOceanScore || 0) || (b.avgViews || 0) - (a.avgViews || 0))
    .slice(0, 8);

  // 1. Top Opportunities Section
  const topOppHtml = `
    <div style="margin-bottom:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:16px;font-weight:600;color:var(--text-1);display:flex;align-items:center;gap:8px" data-tip="topic_opportunities">
            <i data-lucide="sparkles" style="width:16px;height:16px;color:var(--accent)"></i>
            <span>Top High-Leverage Opportunities</span>
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px">Prioritized topics with high viewer demand and untapped niche angles</div>
        </div>
        <button class="btn btn-gh btn-sm" onclick="buildTopicCache(true);renderTopicRadarPage();" data-tip="reindex_topics">
          <i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Re-index Topics
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px">
        ${topOpportunities.map((t, i) => {
          const myUploads = _topicCache.perChannel.get(primary?.id)?.get(t.topic)?.n || 0;
          const isUntapped = myUploads === 0;
          const rpiMultiplier = (t.shrunkenRpi || 1.2).toFixed(1);
          
          let statusBadge = '';
          let rationale = '';
          if (isUntapped && t.quadrant === 'blue_ocean') {
            statusBadge = '<span class="badge" style="background:rgba(61,220,151,0.12);color:var(--pos);border:1px solid rgba(61,220,151,0.3);font-size:10px;font-weight:600;padding:2px 8px">💎 Untapped Blue Ocean</span>';
            rationale = `Competitors average <strong style="color:var(--text-1)">${fmtN(t.avgViews)} views</strong> (${rpiMultiplier}× normal) with only ${t.supply14d || 0} recent drops and <strong style="color:var(--accent)">0 videos by you</strong>. High breakout probability.`;
          } else if (t.quadrant === 'red_ocean' || t.quadrant === 'blue_ocean') {
            statusBadge = '<span class="badge" style="background:rgba(102,114,245,0.12);color:var(--accent);border:1px solid rgba(102,114,245,0.3);font-size:10px;font-weight:600;padding:2px 8px">🔥 High Demand Pillar</span>';
            rationale = `Strong niche staple averaging <strong style="color:var(--text-1)">${fmtN(t.avgViews)} views</strong> across ${t.n} competitor uploads. Steady viewer search volume.`;
          } else {
            statusBadge = '<span class="badge" style="background:rgba(255,171,0,0.12);color:var(--warn);border:1px solid rgba(255,171,0,0.3);font-size:10px;font-weight:600;padding:2px 8px">🌱 Emerging Trend</span>';
            rationale = `Rising momentum with low competitor saturation. Publish early to capture first-mover search rankings.`;
          }

          return `
            <div class="card reveal" style="--i: ${i % 6};padding:18px;display:flex;flex-direction:column;justify-content:space-between;gap:14px;background:var(--surface-1);border:1px solid var(--border)">
              <div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px">
                  <div style="font-size:15px;font-weight:600;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(t.topic)}" data-tip="topic_keyword">
                    #${i + 1} ${capWords(t.topic)}
                  </div>
                  ${statusBadge}
                </div>

                <!-- Plain English Rationale -->
                <div style="font-size:12.5px;color:var(--text-2);line-height:1.5;margin-bottom:12px">
                  ${rationale}
                </div>

                <!-- Metric Row -->
                <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:12px;font-size:11.5px">
                  <div>
                    <div style="color:var(--text-3);font-size:10.5px">Avg Views</div>
                    <div class="num" style="font-weight:600;color:var(--text-1)">${fmtN(t.avgViews)}</div>
                  </div>
                  <div>
                    <div style="color:var(--text-3);font-size:10.5px">Competitors</div>
                    <div style="font-weight:600;color:var(--text-1)">${t.n} channels</div>
                  </div>
                  <div>
                    <div style="color:var(--text-3);font-size:10.5px">Your Videos</div>
                    <div style="font-weight:600;color:${myUploads > 0 ? 'var(--text-1)' : 'var(--accent)'}">${myUploads > 0 ? myUploads : '0 (Gap)'}</div>
                  </div>
                </div>
              </div>

              <!-- Action Bar -->
              <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid var(--border);gap:8px;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:4px">
                  ${t.channels.slice(0, 3).map(chId => {
                    const ch = all.find(c => c.id === chId);
                    if (!ch) return '';
                    return ch.logo_url
                      ? `<img src="${esc(proxyImg(ch.logo_url))}" title="${esc(ch.name)}" style="width:20px;height:20px;border-radius:50%;object-fit:cover">`
                      : `<div title="${esc(ch.name)}" style="width:20px;height:20px;border-radius:50%;background:var(--surface-3);font-size:9px;font-weight:600;display:flex;align-items:center;justify-content:center">${(ch.name || '?')[0]}</div>`;
                  }).join('')}
                  ${t.channels.length > 3 ? `<span style="font-size:10.5px;color:var(--text-3)">+${t.channels.length - 3}</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <button class="btn btn-gh btn-sm" style="padding:4px 8px;font-size:11px" onclick="openAiTitleSynthesizer('${esc(t.topic)}')" title="Generate 6 packaging angles" data-tip="ai_synthesizer">
                    <i data-lucide="sparkles" style="width:12px;height:12px"></i> Ideas
                  </button>
                  <button class="btn btn-acc btn-sm" style="padding:4px 10px;font-size:11px" onclick="openTitleLabWithTopic('${esc(t.topic)}')">
                    <i data-lucide="flask-conical" style="width:12px;height:12px"></i> Plan in Studio
                  </button>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  // 2. Filtered Topic Catalog Exploration Table
  let filteredCatalog = [...allTopicsList];
  if (radarSearchQuery) {
    filteredCatalog = filteredCatalog.filter(t => t.topic.toLowerCase().includes(radarSearchQuery.toLowerCase()));
  }
  if (radarFilterQuadrant !== 'all') {
    filteredCatalog = filteredCatalog.filter(t => t.quadrant === radarFilterQuadrant);
  }

  filteredCatalog.sort((a, b) => (b.avgViews || 0) - (a.avgViews || 0));
  const displayedTopics = filteredCatalog.slice(0, radarDisplayLimit);
  const hasMore = filteredCatalog.length > radarDisplayLimit;

  const catalogHtml = `
    <div class="card reveal" style="--i: 4;padding:0;overflow:hidden">
      <!-- Table Filter Toolbar -->
      <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div class="bench-search-box" style="flex:1;max-width:300px;position:relative">
          <i data-lucide="search" style="width:14px;height:14px;color:var(--text-3);position:absolute;left:10px;top:50%;transform:translateY(-50%)"></i>
          <input type="text" style="width:100%;padding:6px 10px 6px 32px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);color:var(--text-1);font-size:12px;outline:none" placeholder="Search ${allTopicsList.length} niche topics…" value="${esc(radarSearchQuery)}" oninput="filterRadarTopics(this.value)">
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <button class="btn btn-gh btn-sm ${radarFilterQuadrant === 'all' ? 'active' : ''}" onclick="setRadarQuadrantFilter('all')" data-tip="quad_all">All (${allTopicsList.length})</button>
          <button class="btn btn-gh btn-sm ${radarFilterQuadrant === 'blue_ocean' ? 'active' : ''}" onclick="setRadarQuadrantFilter('blue_ocean')" data-tip="quad_untapped">Untapped</button>
          <button class="btn btn-gh btn-sm ${radarFilterQuadrant === 'red_ocean' ? 'active' : ''}" onclick="setRadarQuadrantFilter('red_ocean')" data-tip="quad_high_demand">High Demand</button>
          <button class="btn btn-gh btn-sm ${radarFilterQuadrant === 'emerging' ? 'active' : ''}" onclick="setRadarQuadrantFilter('emerging')" data-tip="quad_emerging">Emerging</button>
        </div>
      </div>

      <!-- Data Table -->
      <table class="data-table">
        <thead>
          <tr>
            <th style="min-width:180px" data-tip="topic_keyword">Topic</th>
            <th class="num" style="min-width:110px" data-tip="topic_avg_views">Avg Views ▾</th>
            <th style="text-align:center;min-width:110px" data-tip="niche_frequency">Niche Frequency</th>
            <th style="text-align:center;min-width:110px" data-tip="topic_coverage">Your Coverage</th>
            <th style="text-align:center;min-width:110px" data-tip="untapped_status">Status</th>
            <th style="text-align:center;width:120px"></th>
          </tr>
        </thead>
        <tbody>
          ${displayedTopics.map(t => {
            const myUploads = _topicCache.perChannel.get(primary?.id)?.get(t.topic)?.n || 0;
            return `
              <tr>
                <td>
                  <strong style="color:var(--text-1);font-weight:500" data-tip="topic_keyword">${capWords(t.topic)}</strong>
                </td>
                <td class="num" style="font-weight:500;color:var(--text-1)" data-tip="topic_avg_views">
                  ${fmtN(t.avgViews)}
                </td>
                <td style="text-align:center;color:var(--text-2)" data-tip="niche_frequency">
                  ${t.n} drops
                </td>
                <td style="text-align:center;color:${myUploads > 0 ? 'var(--text-2)' : 'var(--accent)'}" data-tip="topic_coverage">
                  ${myUploads > 0 ? `${myUploads} videos` : '0 (Untapped)'}
                </td>
                <td style="text-align:center" data-tip="untapped_status">
                  <span style="font-size:11px;color:${t.quadrant === 'blue_ocean' ? 'var(--pos)' : t.quadrant === 'red_ocean' ? 'var(--accent)' : 'var(--text-3)'}">
                    ${t.quadrant === 'blue_ocean' ? 'Opportunity' : t.quadrant === 'red_ocean' ? 'High Demand' : 'Emerging'}
                  </span>
                </td>
                <td style="text-align:center">
                  <div style="display:inline-flex;align-items:center;gap:6px">
                    <button class="btn btn-gh btn-sm" style="padding:3px 8px;font-size:11px" onclick="openTitleLabWithTopic('${esc(t.topic)}')">
                      <i data-lucide="flask-conical" style="width:12px;height:12px"></i> Studio
                    </button>
                    <button class="icon-btn" style="width:26px;height:26px" onclick="openAiTitleSynthesizer('${esc(t.topic)}')" title="Generate Titles" data-tip="ai_synthesizer">
                      <i data-lucide="sparkles" style="width:12px;height:12px"></i>
                    </button>
                  </div>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>

      ${hasMore ? `
        <div style="padding:14px;text-align:center;border-top:1px solid var(--border)">
          <button class="btn btn-gh btn-sm" onclick="radarDisplayLimit += 20; renderTopicRadarPage()">
            Load More Topics (${filteredCatalog.length - radarDisplayLimit} remaining)
          </button>
        </div>` : ''}
    </div>`;

  el.innerHTML = topOppHtml + catalogHtml;
  if (window.lucide) window.lucide.createIcons();

  if (window.Reveal && typeof window.Reveal.init === 'function') {
    window.Reveal.init();
  }
}

function filterRadarTopics(query) {
  radarSearchQuery = query || '';
  radarDisplayLimit = 15;
  renderTopicRadarPage();
}

function setRadarQuadrantFilter(q) {
  radarFilterQuadrant = q;
  radarDisplayLimit = 15;
  renderTopicRadarPage();
}

function renderTopicRadar() {
  const el = document.getElementById('dashTopicRadar');
  if (!el) return;

  // Auto-build topic cache if videos exist in cache
  let totalCachedVids = 0;
  all.forEach(c => { totalCachedVids += (_enrichCache[c.id]?.vids?.length || 0); });
  if (totalCachedVids > 0 && !_topicCache.topics.size) {
    buildTopicCache();
  }

  if (!_topicCache.topics.size) {
    el.innerHTML = `
      <div class="topic-radar-card">
        <div class="topic-radar-hdr">
          <div class="topic-radar-title">
            <span class="msi" style="color:var(--down);font-size:16px">whatshot</span>
            <span>TOPIC RADAR</span> <span style="font-size:11px;color:var(--t3);font-weight:400">· what's hot across your field</span>
          </div>
          <div class="race-seg" style="opacity:0.6">
            <div class="skel" style="width:110px;height:24px;border-radius:var(--r-full)"></div>
          </div>
        </div>
        <div class="topic-radar-body" style="min-height:220px">
          <!-- Hot Column Shimmer -->
          <div class="topic-hot-col" style="gap:10px">
            <div class="topic-section-label">HOT NOW (RPI)</div>
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
            <div style="display:flex;align-items:center;gap:8px;margin-top:auto;font-size:11px;color:var(--t3)">
              <div class="spin" style="width:12px;height:12px"></div>
              <span>Building topic intelligence index & RPI baselines…</span>
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

  // Sorted by Shrunken RPI (Empirical Bayes)
  const sortedTopics = [..._topicCache.topics.values()]
    .filter(t => t.n >= 1 && (rangeMs === Infinity || t.lastUsed >= cutTs))
    .sort((a, b) => (b.shrunkenRpi || 0) - (a.shrunkenRpi || 0) || (b.hotScore || 0) - (a.hotScore || 0));

  const hotTopics = sortedTopics.slice(0, 10);
  const matrixTopics = hotTopics.slice(0, 8);
  const { gaps, moats } = computeTopicGaps(primaryId);

  // Active topic filter chip in topic radar
  const filterChipHtml = raceTopicFilter
    ? `<span class="badge bdg-pr" style="margin-left:8px;cursor:pointer;display:inline-flex;align-items:center;gap:4px" onclick="event.stopPropagation();filterRaceByTopic(null)" title="Click to clear topic filter">
        filter: ${esc(raceTopicFilter)} ✕
       </span>` : '';

  // View Selector Pills & Range
  const controlsHtml = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div class="race-seg">
        <button class="race-seg-btn ${topicRadarView === 'rpi' ? 'on' : ''}" onclick="setTopicRadarView('rpi')" title="View topics ranked by Empirical Bayes Shrunken RPI">
          🔥 RPI View
        </button>
        <button class="race-seg-btn ${topicRadarView === 'matrix' ? 'on' : ''}" onclick="setTopicRadarView('matrix')" title="View 2×2 Supply / Demand Saturation Grid">
          🗺️ Saturation Matrix
        </button>
      </div>
      <div class="race-seg">
        ${['90d', '6m', 'all'].map(r => `
          <button class="race-seg-btn ${topicRadarRange === r ? 'on' : ''}"
            onclick="setTopicRadarRange('${r}')">${r}</button>`).join('')}
      </div>
    </div>`;

  let mainBodyHtml = '';

  if (topicRadarView === 'rpi') {
    // ── RPI VIEW ────────────────────────────────────────────────────────────
    const hotListHtml = hotTopics.length ? hotTopics.map((t, i) => {
      const leadCh = all.find(c => c.id === t.leadChannel);
      const leadCol = leadCh ? colorOf(leadCh) : 'var(--t3)';
      const isFiltered = raceTopicFilter === t.topic;
      const mom = t.momentum;
      const momHtml = mom !== null
        ? `<span style="color:${mom >= 1.2 ? 'var(--up)' : mom <= 0.8 ? 'var(--down)' : 'var(--t3)'};">${mom >= 1 ? '▲' : '▼'}${mom.toFixed(1)}×</span>`
        : `<span style="color:var(--t3)">•</span>`;
      
      const rpiClass = t.shrunkenRpi >= 1.5 ? 'bdg-gr' : t.shrunkenRpi >= 1.1 ? 'bdg-pr' : 'bdg-dim';
      const supplyText = t.supply14d > 0 ? `📦 ${t.supply14d} in 14d` : '📦 0 in 14d';

      return `
        <div class="topic-hot-row ${isFiltered ? 'filtered' : ''}" onclick="filterRaceByTopic('${esc(t.topic)}')" title="Click to filter race window by '${esc(t.topic)}'">
          <span class="topic-rank-chip">${i + 1}</span>
          <div class="topic-hot-body">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="topic-hot-name">${esc(t.topic)}</span>
              <span class="badge ${rpiClass}" style="font-size:9.5px;padding:1px 6px" title="Empirical Bayes Shrunken RPI (${t.confidenceTag})">
                ⚡ ${t.shrunkenRpi.toFixed(2)}× RPI
              </span>
            </div>
            <div class="topic-hot-meta">
              <span style="color:var(--t3)">${t.n} vids</span>
              <span class="chip" style="font-size:9px;padding:1px 5px;background:var(--bg-3)">${supplyText}</span>
              ${leadCh ? ` · <span style="color:${leadCol}">●</span> ${esc(leadCh.name)}` : ''}
            </div>
          </div>
          <div class="topic-hot-stats">
            <div style="display:flex;align-items:center;gap:4px">
              <button class="icon-btn" style="width:24px;height:24px" onclick="event.stopPropagation();openAiTitleSynthesizer('${esc(t.topic)}')" title="Generate AI Titles for this topic">
                <span class="msi" style="font-size:13px;color:var(--acc)">auto_awesome</span>
              </button>
              <button class="icon-btn" style="width:24px;height:24px" onclick="event.stopPropagation();openTitleLabWithTopic('${esc(t.topic)}')" title="Open in Title Lab">
                <span class="msi" style="font-size:13px">science</span>
              </button>
            </div>
            <div style="text-align:right">
              <span class="topic-score" style="font-size:11px">🔥${fmtN(t.hotScore)}</span>
              <span style="font-size:10px;margin-left:4px">${momHtml}</span>
            </div>
          </div>
        </div>`;
    }).join('') : `<div style="color:var(--t3);font-size:11.5px;padding:12px 0">No topics in this range yet.</div>`;

    // Gap + moat chips
    const gapChips = gaps.slice(0, 3).map(g => `
      <div class="topic-gap-chip" onclick="openAiTitleSynthesizer('${esc(g.topic)}')" title="Field avg: ${fmtN(g.fieldAvg)} · ${g.shrunkenRpi}x RPI · Click to Synthesize">
        <span class="msi" style="font-size:13px;color:var(--acc)">search_off</span>
        <span>${esc(g.topic)}</span>
        <span class="topic-gap-stat">⚡ ${g.shrunkenRpi}× RPI · you: 0</span>
      </div>`).join('');

    const moatChips = moats.slice(0, 2).map(m => `
      <div class="topic-moat-chip" onclick="filterRaceByTopic('${esc(m.topic)}')" title="You lead on this topic (${m.myN} vids, ${m.rivalCount} rival)">
        <span class="msi" style="font-size:13px;color:var(--me)">shield</span>
        <span>${esc(m.topic)}</span>
        <span class="topic-moat-stat">YOU #1 🛡</span>
      </div>`).join('');

    // Heat matrix columns
    const matrixChannels = [...all]
      .sort((a, b) => (b.subscribers_raw || 0) - (a.subscribers_raw || 0))
      .slice(0, 8);

    function hexToRgba(color, alpha) {
      if (!color) return `rgba(56, 189, 248, ${alpha})`;
      if (color.startsWith('hsl(')) {
        return color.replace('hsl(', 'hsla(').replace(')', `,${alpha})`);
      }
      if (color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
      }
      if (color.startsWith('#')) {
        let c = color.substring(1);
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        if (c.length === 6) {
          const num = parseInt(c, 16);
          const r = (num >> 16) & 255;
          const g = (num >> 8) & 255;
          const b = num & 255;
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      }
      return color;
    }

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
        const intensity = Math.min(1, chStat.avgViews / globalMaxAvg);
        const isMe = ch.is_primary;
        const rgbBase = isMe ? '245, 158, 11' : '56, 189, 248';
        const opacity = (0.08 + intensity * 0.40).toFixed(2);
        const bgStyle = `rgba(${rgbBase}, ${opacity})`;
        const borderStyle = `rgba(${rgbBase}, ${(0.15 + intensity * 0.30).toFixed(2)})`;
        return `<td class="matrix-cell ${isMe ? 'matrix-me-cell' : ''}"
          style="background:${bgStyle}; border-color:${borderStyle};"
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

    mainBodyHtml = `
      <div class="topic-radar-body">
        <div class="topic-hot-col">
          <div class="topic-section-label">TOP TOPICS BY RELATIVE PERFORMANCE (RPI)</div>
          <div class="topic-hot-list">${hotListHtml}</div>
          ${(gapChips || moatChips) ? `
          <div class="topic-section-label" style="margin-top:12px">STRATEGIC POSITION</div>
          <div class="topic-chips-row">${gapChips}${moatChips}</div>` : ''}
        </div>
        <div class="topic-matrix-col">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
            <div class="topic-section-label" style="margin-bottom:0">HEAT MATRIX · WHO OWNS WHAT TOPIC</div>
            <span class="topic-matrix-scroll-hint">← Swipe channels →</span>
          </div>
          <div class="topic-matrix-scroll-container">
            <table class="topic-matrix">
              <thead>${matrixHeaderHtml}</thead>
              <tbody>${matrixRowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  } else {
    // ── 2×2 SATURATION MATRIX VIEW ──────────────────────────────────────────
    const blueOceanTopics = sortedTopics.filter(t => t.quadrant === 'blue_ocean');
    const redOceanTopics = sortedTopics.filter(t => t.quadrant === 'red_ocean');
    const emergingTopics = sortedTopics.filter(t => t.quadrant === 'emerging');
    const saturatedTopics = sortedTopics.filter(t => t.quadrant === 'saturated');

    function renderQuadrantList(list, isBlue = false) {
      if (!list.length) return `<div style="font-size:11px;color:var(--t3);padding:10px 0">No topics in this category.</div>`;
      return list.slice(0, 6).map(t => `
        <div class="sat-topic-item ${isBlue ? 'sat-item-blue' : ''}" onclick="filterRaceByTopic('${esc(t.topic)}')" title="Click to filter drops">
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:12px;font-weight:600;color:var(--t1)">${esc(t.topic)}</span>
              ${isBlue ? '<span class="badge bdg-gr" style="font-size:9px">Top Pick</span>' : ''}
            </div>
            <div style="font-size:10.5px;color:var(--t3);display:flex;gap:6px;margin-top:2px">
              <span>${t.shrunkenRpi.toFixed(2)}× RPI</span>
              <span>•</span>
              <span>${t.supply14d} drops/14d</span>
              <span>•</span>
              <span>Score: ${t.blueOceanScore}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            <button class="icon-btn" style="width:24px;height:24px" onclick="event.stopPropagation();openAiTitleSynthesizer('${esc(t.topic)}')" title="Generate Title Ideas">
              <span class="msi" style="font-size:13px;color:var(--acc)">lightbulb</span>
            </button>
            <button class="icon-btn" style="width:24px;height:24px" onclick="event.stopPropagation();openTitleLabWithTopic('${esc(t.topic)}')" title="Test in Title Lab">
              <span class="msi" style="font-size:13px">science</span>
            </button>
          </div>
        </div>`).join('');
    }

    mainBodyHtml = `
      <div class="sat-matrix-container">
        <!-- Matrix Legend Subtitle -->
        <div style="font-size:11.5px;color:var(--t3);margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span>Supply vs Demand Matrix: 90-day audience demand multiplier (RPI) vs. 14-day competitor release saturation.</span>
          <span class="badge bdg-dim" style="font-size:10px">Opportunity Score = RPI / (1 + Supply₁₄d)</span>
        </div>

        <!-- 2x2 Grid -->
        <div class="sat-2x2-grid">
          <!-- Q1: High Opportunity (Top Left) -->
          <div class="sat-quadrant sat-q-blue">
            <div class="sat-q-hdr">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="msi" style="color:var(--up);font-size:16px">trending_up</span>
                <span class="sat-q-title" style="color:var(--up)">High Opportunity</span>
              </div>
              <span class="badge bdg-gr" style="font-size:9.5px">High Demand · Low Supply</span>
            </div>
            <div class="sat-q-sub">Surging audience demand with low recent competitor upload volume. Strong opportunity.</div>
            <div class="sat-q-list">${renderQuadrantList(blueOceanTopics, true)}</div>
          </div>

          <!-- Q2: High Competition (Top Right) -->
          <div class="sat-quadrant sat-q-red">
            <div class="sat-q-hdr">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="msi" style="color:var(--warn);font-size:16px">local_fire_department</span>
                <span class="sat-q-title" style="color:var(--warn)">High Competition</span>
              </div>
              <span class="badge bdg-gd" style="font-size:9.5px">High Demand · High Supply</span>
            </div>
            <div class="sat-q-sub">High viewer interest but saturated with competitor releases. Requires standout packaging.</div>
            <div class="sat-q-list">${renderQuadrantList(redOceanTopics)}</div>
          </div>

          <!-- Q3: Emerging / Niche (Bottom Left) -->
          <div class="sat-quadrant sat-q-emerging">
            <div class="sat-q-hdr">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="msi" style="color:var(--acc);font-size:16px">insights</span>
                <span class="sat-q-title" style="color:var(--acc)">Emerging Trends</span>
              </div>
              <span class="badge bdg-pr" style="font-size:9.5px">Low Demand · Low Supply</span>
            </div>
            <div class="sat-q-sub">Early-stage topics with growing potential. Ideal for building early topic authority.</div>
            <div class="sat-q-list">${renderQuadrantList(emergingTopics)}</div>
          </div>

          <!-- Q4: Saturated (Bottom Right) -->
          <div class="sat-quadrant sat-q-saturated">
            <div class="sat-q-hdr">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="msi" style="color:var(--down);font-size:16px">pause_circle</span>
                <span class="sat-q-title" style="color:var(--down)">Low Traction</span>
              </div>
              <span class="badge bdg-rd" style="font-size:9.5px">Low Demand · High Supply</span>
            </div>
            <div class="sat-q-sub">Overcrowded niche with below-average viewer response. Consider alternative angles.</div>
            <div class="sat-q-list">${renderQuadrantList(saturatedTopics)}</div>
          </div>
        </div>
      </div>`;
  }

  el.innerHTML = `
    <div class="topic-radar-card">
      <div class="topic-radar-hdr">
        <div class="topic-radar-title">
          <span class="msi" style="color:var(--down)">whatshot</span>
          <span>TOPIC RADAR</span>${filterChipHtml}
          <span class="topic-radar-sub">· what's hot across your field</span>
        </div>
        ${controlsHtml}
      </div>
      ${mainBodyHtml}
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
  popover.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 290)) + window.scrollX + 'px';
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
