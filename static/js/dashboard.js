/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — DASHBOARD COMMAND CENTER ENGINE
   ══════════════════════════════════════════════════════════════════════════════ */

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
    <div id="sec-hero" class="my-channel-strip rev in" onclick="openDeepDive('${esc(primary.id)}')">
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
    <div id="sec-yvf" class="you-vs-field rev in" style="--i:1">
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
    <div id="sec-lb" class="lb-wrap rev in" style="--i:2">
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
  const raceHtml = `<div id="sec-drops" class="rev in" style="--i:3"><div id="dashRaceWindow"></div></div>`;

  // 4b. Topic Radar (under Drops)
  const radarHtml = `<div id="sec-radar" class="rev in" style="--i:4"><div id="dashTopicRadar"></div></div>`;

  // 5. Velocity Card (now full-width, separate from face-off)
  const velHtml = `
    <div id="sec-vel" class="vel-card rev in" style="margin-top:var(--s5);--i:5">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="sect-lbl" style="margin:0">
          <span class="msi">bar_chart</span> 6-Month Upload Velocity
        </div>
        <div class="vel-legend-chips" id="velLegendChips"></div>
      </div>
      <div class="chart-box" id="dashVelocity"></div>
    </div>`;

  // 5b. Timing Intelligence Card (Best-Time Heatmap & Slot Recommender)
  const timingHtml = renderDashTiming();

  // 6. Recent Uploads Rail
  const recentHtml = `
    <div id="sec-recent" class="card rev in" style="margin-top:var(--s5);--i:5">
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

  // 7. Right-Edge Floating Scroll-Spy Rail
  const spyRailHtml = `
    <div class="dash-spy-rail" id="dashSpyRail">
      <div class="dash-spy-item on" data-sec="sec-hero" onclick="scrollToSection('sec-hero')" title="My Channel"><span class="spy-dot"></span><span class="spy-label">Channel</span></div>
      <div class="dash-spy-item" data-sec="sec-yvf" onclick="scrollToSection('sec-yvf')" title="You vs Field"><span class="spy-dot"></span><span class="spy-label">Field</span></div>
      <div class="dash-spy-item" data-sec="sec-drops" onclick="scrollToSection('sec-drops')" title="Latest Drops"><span class="spy-dot"></span><span class="spy-label">Drops</span></div>
      <div class="dash-spy-item" data-sec="sec-radar" onclick="scrollToSection('sec-radar')" title="Topic Radar"><span class="spy-dot"></span><span class="spy-label">Radar</span></div>
      <div class="dash-spy-item" data-sec="sec-lb" onclick="scrollToSection('sec-lb')" title="Leaderboard"><span class="spy-dot"></span><span class="spy-label">Board</span></div>
      <div class="dash-spy-item" data-sec="sec-vel" onclick="scrollToSection('sec-vel')" title="Velocity"><span class="spy-dot"></span><span class="spy-label">Velocity</span></div>
      <div class="dash-spy-item" data-sec="sec-timing" onclick="scrollToSection('sec-timing')" title="Timing Intelligence"><span class="spy-dot"></span><span class="spy-label">Timing</span></div>
      <div class="dash-spy-item" data-sec="sec-recent" onclick="scrollToSection('sec-recent')" title="Recent Uploads"><span class="spy-dot"></span><span class="spy-label">Recent</span></div>
    </div>`;

  el.innerHTML = stripHtml + yvfHtml + raceHtml + radarHtml + lbHtml + velHtml + timingHtml + recentHtml + spyRailHtml;

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
  attachTimingTooltips(el);
  loadDashboardRecentUploads(primary.id);
  setupScrollReveal();
  setupDashScrollSpy();
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
  serializeStateToHash();
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
          <span style="font-family:var(--f-mono);font-size:10px;color:var(--t3);display:flex;align-items:center;gap:3px">#${i + 1} ${renderRankDeltaChip(ch.id)}</span>
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
  serializeStateToHash();
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
        <td style="font-family:var(--f-mono);font-size:11px;color:var(--t3);text-align:center;white-space:nowrap">#${i + 1} ${renderRankDeltaChip(ch.id)}</td>
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
        : `<span class="badge" style="background:${threatScore >= 50 ? 'rgba(255,107,107,0.12)' : threatScore >= 25 ? 'rgba(245,197,66,0.12)' : 'var(--bg-3)'};color:${threatColor}" title="Shared topics: ${(ch._sharedTopics || []).join(', ') || 'none'}">⚔️ ${threatScore}%</span>`}
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
  vel: (a, b) => (b.vids[0]?._vel || 0) - (a.vids[0]?._vel || 0),
  views: (a, b) => (parseInt(b.vids[0]?.view_count ?? b.vids[0]?.views_raw ?? 0)) - (parseInt(a.vids[0]?.view_count ?? a.vids[0]?.views_raw ?? 0)),
  newest: (a, b) => (b.vids[0]?._pub || 0) - (a.vids[0]?._pub || 0)
};

function renderRaceWindow() {
  const el = document.getElementById('dashRaceWindow');
  if (!el) return;

  const rows = raceData();
  // Enrich channels missing cache
  rows.forEach(r => { if (!r.hasCache) enrich(r.ch.id).then(() => renderRaceWindow()); });

  const ranked = rows.filter(r => r.vids[0]).sort(raceSorters[raceState.sort] || raceSorters.vel);
  const muted = rows.filter(r => !r.vids[0]);
  const bestViews = ranked.length ? Math.max(...ranked.map(r => parseInt(r.vids[0].view_count ?? r.vids[0].views_raw ?? 0))) : 1;

  // Caption
  let caption = ranked.length
    ? `⚡ fastest right now: <strong>${esc(ranked[0].ch.name)}</strong> · ${fmtN(Math.round(ranked[0].vids[0]._vel))}/day${raceTopicFilter ? ` <span style="color:var(--acc)">· filtered: "${esc(raceTopicFilter)}"</span>` : ''}`
    : (raceTopicFilter ? `No channels published on "${esc(raceTopicFilter)}" in ${raceState.range}d window` : 'Waiting for enrichment data…');

  // Medal emojis
  const medals = ['🥇', '🥈', '🥉'];

  const rankedRowsHtml = ranked.map((r, i) => {
    const ch = r.ch;
    const v = r.vids[0];
    const col = colorOf(ch);
    const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
    const vel = Math.round(v._vel);
    const eng = v._eng;
    const pct = bestViews > 0 ? Math.max(4, Math.round(vc / bestViews * 100)) : 4;
    const pub = v.published_at || v.date;
    const ageMs = Date.now() - new Date(pub).getTime();
    const isNew = ageMs < 48 * 3600000;
    const isMe = ch.is_primary;
    const isOpen = raceState.open.has(ch.id);
    const medal = i < 3 ? medals[i] : `<span style="font-size:11px">#${i + 1}</span>`;

    // Avatar
    const avatarHtml = ch.logo_url
      ? `<img class="rrow-avatar" src="${esc(proxyImg(ch.logo_url))}" style="border:1.5px solid ${col}" alt="">`
      : `<div class="rrow-avatar-fb" style="border:1.5px solid ${col};color:${col}">${(ch.name || '?')[0]}</div>`;

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
          <span style="font-family:var(--f-mono);font-size:10px;color:var(--t3)">#${ii + 2}</span>
          <img class="race-inset-thumb" src="${esc(iv.thumb || '')}" alt="">
          <span class="race-inset-title" title="${esc(iv.title)}">${esc(iv.title)}</span>
          <span class="race-inset-stat">${fmtN(ivc)} 👁</span>
          <span class="race-inset-stat" style="color:var(--acc)">${fmtN(ivel)}/d ⚡</span>
        </div>`;
    }).join('') + `
      <div class="race-inset-footer">
        <button class="btn btn-gh btn-sm" onclick="event.stopPropagation();openDeepDive('${esc(ch.id)}','videos')">Full catalog →</button>
      </div>` : `<div style="font-size:11px;color:var(--t3);padding:8px 0">No other drops in ${raceState.range}d window.</div>`;

    return `
      <div class="rrow ${isMe ? 'me' : ''} ${isOpen ? 'open' : ''}" id="rrow-${esc(ch.id)}"
           onclick="raceToggleRow('${esc(ch.id)}')">
        <div class="rrow-rank" style="display:flex;flex-direction:column;align-items:center;gap:2px">${medal} ${renderRankDeltaChip(ch.id)}</div>
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
        <div class="rrow-eng">${eng !== null ? eng + '%' : '<span style="color:var(--t3)">—</span>'}</div>
        <div class="race-vs-wrap">
          <span class="race-vs-label">${Math.round(pct)}% of best</span>
          <div class="race-vs-track"><div class="race-vs-fill" style="width:${pct}%;background:${col}"></div></div>
        </div>
        <div class="rrow-chev"><span class="msi" style="font-size:18px">expand_more</span></div>
      </div>
      <div class="fold ${isOpen ? 'open' : ''}" id="rfold-${esc(ch.id)}">
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
    ? `<span class="badge bdg-pr" style="margin-left:8px;cursor:pointer;display:inline-flex;align-items:center;gap:4px" onclick="event.stopPropagation();filterRaceByTopic(null)" title="Click to clear topic filter">
        topic: ${esc(raceTopicFilter)} ✕
       </span>`
    : '';

  el.innerHTML = `
    <div class="race-window">
      <div class="race-win-bar ${isSlim ? 'slim-mode' : ''}">
        <div class="race-pulse-dot"></div>
        <div class="race-title">LATEST DROPS${filterBadgeHtml} <span>· newest uploads head-to-head</span></div>
        <div class="race-controls">
          <div class="race-seg" data-tip="Time window">
            ${[7, 30, 90].map(d => `<button class="race-seg-btn ${raceState.range === d ? 'on' : ''}" onclick="setRaceRange(${d})">${d}d</button>`).join('')}
          </div>
          <div class="race-seg" data-tip="Sort by">
            <button class="race-seg-btn ${raceState.sort === 'vel' ? 'on' : ''}" onclick="setRaceSort('vel')">⚡ Velocity</button>
            <button class="race-seg-btn ${raceState.sort === 'views' ? 'on' : ''}" onclick="setRaceSort('views')">👁 Views</button>
            <button class="race-seg-btn ${raceState.sort === 'newest' ? 'on' : ''}" onclick="setRaceSort('newest')">🕒 Newest</button>
          </div>
          <button class="icon-btn" onclick="raceExpandAll()" title="Expand / collapse all rows"><span class="msi" style="font-size:16px">unfold_more</span></button>
          <button class="icon-btn" onclick="raceToggleSlim()" title="Collapse window to caption bar"><span class="msi" style="font-size:16px">${isSlim ? 'expand_more' : 'remove'}</span></button>
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
  const rowEl = document.getElementById('rrow-' + id);
  const foldEl = document.getElementById('rfold-' + id);
  if (rowEl) rowEl.classList.toggle('open', raceState.open.has(id));
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
        } catch { }
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
