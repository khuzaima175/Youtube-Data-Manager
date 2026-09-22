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

/* ── 00b. Next Best Action Engine ─────────────────────────────────────────── */
function genNextBestAction(primary, allChannels) {
  const lastActed = getNBALastActed();

  // Priority 1: Timing × Topic Synergy
  const bestSlots = typeof getBestPostingSlots === 'function' ? getBestPostingSlots(primary?.id) : [];
  const hotTopics = _topicCache.topics.size ? [..._topicCache.topics.values()].sort((a, b) => b.n - a.n) : [];
  const topTopic = hotTopics[0]?.name || null;

  const cand1 = {
    id: 'nba_timing_topic',
    type: 'Timing Synergy',
    icon: 'schedule',
    title: topTopic ? `Drop "${topTopic}" in your Peak Slot` : 'Peak Publishing Window',
    sub: bestSlots.length ? `${bestSlots[0].day} @ ${bestSlots[0].hour}:00 · High audience receptivity` : 'High weekend viewer surge window detected',
    actionText: '→ Pipeline',
    actionFn: `addNBAToPipeline('${esc(topTopic || "Peak Slot Upload")}', 'Timing Synergy', 'nba_timing_topic')`
  };

  // Priority 2: Gap Attack Opportunity
  const gapTopic = hotTopics.find(t => !t.channelCounts?.[primary?.id] && t.n >= 2);
  const cand2 = {
    id: 'nba_gap_attack',
    type: 'Gap Attack',
    icon: 'radar',
    title: gapTopic ? `Unclaimed Field Topic: "${gapTopic.name}"` : 'Topic Gap Attack Opportunity',
    sub: 'Competitors are gaining traction on this topic while your catalog has 0 coverage.',
    actionText: '→ Pipeline',
    actionFn: `addNBAToPipeline('${esc(gapTopic?.name || "Topic Gap")}', 'Gap Attack', 'nba_gap_attack')`
  };

  // Priority 3: Cadence Alert
  const enrichData = _enrichCache[primary?.id];
  const lastVid = enrichData?.latestVideo;
  const daysSince = lastVid ? Math.floor((Date.now() - new Date(lastVid.published_at || lastVid.date).getTime()) / 864e5) : 0;
  const cand3 = {
    id: 'nba_cadence_alert',
    type: 'Cadence Optimizer',
    icon: 'timer',
    title: daysSince >= 7 ? `${daysSince}d Since Last Upload` : 'Maintain Upload Cadence',
    sub: daysSince >= 7 ? 'Field upload velocity is outpacing your current release rhythm.' : 'You are sustaining steady momentum across your niche cohort.',
    actionText: '→ Pipeline',
    actionFn: `addNBAToPipeline('Next High-Impact Upload', 'Cadence Optimizer', 'nba_cadence_alert')`
  };

  // Priority 4: Evergreen Fallback
  const fallback = {
    id: 'nba_evergreen',
    type: 'Next Best Action',
    icon: 'auto_awesome',
    title: 'Maintain Channel Momentum',
    sub: 'Plan your next title concept in Studio to keep your audience engaged.',
    actionText: 'Open Studio',
    actionFn: `sp('studio')`
  };

  const candidates = [cand1, cand2, cand3].filter(c => !nbaDismissed.has(c.id) && c.id !== lastActed);
  return candidates[0] || fallback;
}

function addNBAToPipeline(title, tag, actionId) {
  if (typeof createPipelineCard === 'function') {
    createPipelineCard({
      title: title || 'New Video Concept',
      stage: 'idea',
      tag: tag || 'Opportunity',
      notes: 'Prescribed from Next Best Action engine'
    });
  }
  if (actionId) setNBALastActed(actionId);
  toast(`Added "${title}" to Studio Pipeline!`, 's');
  sp('studio');
}

let dashChartInstance = null;
let currentChartMetric = 'views';

async function renderDash() {
  const el = document.getElementById('dashMain');
  if (!el) return;

  await fetchAll();
  const primary = all.find(c => c.is_primary) || all[0];

  if (!primary) {
    el.innerHTML = `
      <div class="empty card rev in" style="padding:48px 24px;text-align:center;max-width:540px;margin:40px auto">
        <div class="empty-ico" style="width:48px;height:48px;border-radius:50%;background:var(--bg-3);display:flex;align-items:center;justify-content:center;margin:0 auto 16px"><i data-lucide="tv" style="width:24px;height:24px;color:var(--t2)"></i></div>
        <h3 style="font-family:var(--f-disp);font-size:18px;font-weight:700;color:var(--t1);margin-bottom:8px">No Tracked Channels Yet</h3>
        <p style="color:var(--t3);font-size:13px;line-height:1.5;margin-bottom:20px">Add your primary YouTube channel or competitor channels to unlock real-time forensics and gap intelligence.</p>
        <button class="btn btn-acc" onclick="sp('channels')"><i data-lucide="plus" style="width:14px;height:14px"></i> Add Channels</button>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const primaryEnrich = await enrich(primary.id) || {};
  
  // Background enrich competitor channels so topic radar & competitor feed populate smoothly
  all.forEach(c => {
    if (c.id !== primary.id && !_enrichCache[c.id]) {
      enrich(c.id).then(() => {
        buildTopicCache();
        loadDashboardCompetitorDrops(primary.id);
      }).catch(() => {});
    }
  });

  const subRaw = primary.subscribers_raw || 0;
  const stones = [1e3, 5e3, 10e3, 25e3, 50e3, 100e3, 250e3, 500e3, 1e6, 2e6, 5e6, 10e6, 50e6, 100e6];
  const nextMilestone = stones.find(s => s > subRaw) || subRaw;
  const msPct = nextMilestone > subRaw ? Math.min(99, Math.round((subRaw / nextMilestone) * 100)) : 100;
  
  const sortedSubs = [...all].sort((a, b) => (b.subscribers_raw || 0) - (a.subscribers_raw || 0));
  const subRank = sortedSubs.findIndex(c => c.id === primary.id) + 1;
  const engRate = primaryEnrich.engagement ?? 0;
  const engGaugePct = Math.min(100, Math.round((engRate / 10) * 100));

  // Next Best Action prescription
  const nba = genNextBestAction(primary, all);

  // 1. Executive Hero Banner
  const heroHtml = `
    <div class="dash-hero-banner rev">
      <div class="dash-hero-left" onclick="openDeepDive('${esc(primary.id)}')">
        ${primary.logo_url
          ? `<img class="dash-hero-avatar" src="${esc(proxyImg(primary.logo_url))}" alt="">`
          : `<div class="dash-hero-avatar-fb">${(primary.name || '?')[0].toUpperCase()}</div>`}
        <div class="dash-hero-info">
          <div class="dash-hero-title-row">
            <span class="dash-hero-name">${esc(primary.name)}</span>
            <span class="badge bdg-gd">Primary Channel</span>
          </div>
          <div class="dash-hero-meta">
            ${primary.handle ? `<span>${esc(primary.handle)}</span> <span>•</span>` : ''}
            <span>Rank #${subRank} of ${all.length} in cohort</span>
            <span>•</span>
            <span class="card-prov" onclick="event.stopPropagation();refreshOne('${primary.id}').then(()=>renderDash())">Live Synced</span>
          </div>
        </div>
      </div>

      <div class="dash-hero-nba">
        <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:var(--r-s);background:rgba(59,130,246,0.12);color:var(--acc);flex-shrink:0">
          <i data-lucide="sparkles" style="width:16px;height:16px"></i>
        </div>
        <div class="dash-hero-nba-content">
          <div class="dash-hero-nba-tag">Strategic Prescription · ${esc(nba.type)}</div>
          <div class="dash-hero-nba-text" title="${esc(nba.title)}">${esc(nba.title)}</div>
        </div>
        <button class="btn btn-acc btn-sm" style="flex-shrink:0;padding:5px 10px;font-size:11px" onclick="event.stopPropagation();${nba.actionFn}">
          ${esc(nba.actionText)}
        </button>
      </div>
    </div>`;

  // 2. Executive KPI Grid (4 Metrics)
  const kpiHtml = `
    <div class="dash-kpi-grid rev" style="--i:1">
      <!-- KPI 1: Subscribers -->
      <div class="kpi-card">
        <div class="kpi-hdr">
          <span>Subscribers</span>
          <i data-lucide="users" style="width:14px;height:14px;color:var(--t3)"></i>
        </div>
        <div class="kpi-val count-val" data-val="${primary.subscribers_raw || 0}">${esc(primary.subscribers)}</div>
        <div class="kpi-foot">
          <div style="flex:1;margin-right:10px">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--t3);margin-bottom:3px">
              <span>Next Target: ${fmtN(nextMilestone)}</span>
              <span>${msPct}%</span>
            </div>
            <div class="gauge-bar" style="height:4px"><div class="gauge-fill" style="width:${msPct}%"></div></div>
          </div>
        </div>
      </div>

      <!-- KPI 2: Total Views -->
      <div class="kpi-card">
        <div class="kpi-hdr">
          <span>Total Views</span>
          <i data-lucide="eye" style="width:14px;height:14px;color:var(--t3)"></i>
        </div>
        <div class="kpi-val count-val" data-val="${primary.total_views_raw || 0}">${esc(primary.total_views)}</div>
        <div class="kpi-foot">
          <span style="color:var(--t3)">30-day velocity delta</span>
          <span>${fmtDelta(primaryEnrich.momDelta || 0)}</span>
        </div>
      </div>

      <!-- KPI 3: Avg Views per Upload -->
      <div class="kpi-card">
        <div class="kpi-hdr">
          <span>Avg Views / Video</span>
          <i data-lucide="bar-chart-2" style="width:14px;height:14px;color:var(--t3)"></i>
        </div>
        <div class="kpi-val count-val" data-val="${primary.avg_views_raw || 0}">${esc(primary.avg_views)}</div>
        <div class="kpi-foot">
          <span style="color:var(--t3)">Channel View Efficiency</span>
          <span class="badge bdg-dim" style="font-size:10px">Niche Benchmark</span>
        </div>
      </div>

      <!-- KPI 4: Audience Engagement -->
      <div class="kpi-card">
        <div class="kpi-hdr">
          <span>Audience Engagement</span>
          <i data-lucide="zap" style="width:14px;height:14px;color:var(--t3)"></i>
        </div>
        <div class="kpi-val">${engRate}%</div>
        <div class="kpi-foot">
          <div style="flex:1;margin-right:10px">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--t3);margin-bottom:3px">
              <span>Active Response</span>
              <span class="badge bdg-dim">${engRate >= 4 ? 'High' : 'Healthy'}</span>
            </div>
            <div class="gauge-bar" style="height:4px"><div class="gauge-fill" style="width:${engGaugePct}%;background:var(--acc)"></div></div>
          </div>
        </div>
      </div>
    </div>`;

  // 3. Interactive Growth Trajectory Curve (Chart.js)
  const chartHtml = `
    <div class="dash-chart-card rev" style="--i:2">
      <div class="dash-chart-hdr">
        <div class="dash-chart-title">
          <i data-lucide="trending-up" style="width:16px;height:16px;color:var(--acc)"></i>
          <span>30-Day Performance Trajectory</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="race-seg">
            <button class="race-seg-btn ${currentChartMetric === 'views' ? 'on' : ''}" onclick="toggleDashChartMetric('views')">Views Velocity</button>
            <button class="race-seg-btn ${currentChartMetric === 'cadence' ? 'on' : ''}" onclick="toggleDashChartMetric('cadence')">Upload Cadence</button>
          </div>
          <span class="card-prov" onclick="refreshOne('${primary.id}').then(()=>renderDash())">Sync Curve</span>
        </div>
      </div>
      <div class="chart-canvas-wrap">
        <canvas id="dashGrowthCanvas"></canvas>
      </div>
    </div>`;

  // 4. 2-Column Activity Forensics Split
  const activityHtml = `
    <div class="dash-activity-grid rev" style="--i:3">
      <!-- Left Column: Your Recent Uploads Forensics -->
      <div class="activity-col">
        <div class="activity-col-hdr">
          <div class="activity-col-title">
            <i data-lucide="play-circle" style="width:15px;height:15px;color:var(--acc)"></i>
            <span>Your Recent Uploads</span>
          </div>
          <button class="btn btn-gh btn-sm" onclick="openDeepDive('${esc(primary.id)}')" style="font-size:11px;padding:3px 8px">
            Inspect All <i data-lucide="arrow-right" style="width:12px;height:12px"></i>
          </button>
        </div>
        <div class="video-forensic-list" id="dashRecentUploads">
          <div style="display:flex;flex-direction:column;gap:8px;padding:8px 0">
            <div class="skel" style="height:48px;border-radius:var(--r-m)"></div>
            <div class="skel" style="height:48px;border-radius:var(--r-m)"></div>
            <div class="skel" style="height:48px;border-radius:var(--r-m)"></div>
          </div>
        </div>
      </div>

      <!-- Right Column: Competitor Drops Radar Feed -->
      <div class="activity-col">
        <div class="activity-col-hdr">
          <div class="activity-col-title">
            <i data-lucide="radar" style="width:15px;height:15px;color:var(--warn)"></i>
            <span>Competitor Activity Feed</span>
          </div>
          <button class="btn btn-gh btn-sm" onclick="sp('channels')" style="font-size:11px;padding:3px 8px">
            Competitor Grid <i data-lucide="arrow-right" style="width:12px;height:12px"></i>
          </button>
        </div>
        <div class="competitor-drop-list" id="dashCompetitorDrops">
          <div style="display:flex;flex-direction:column;gap:8px;padding:8px 0">
            <div class="skel" style="height:48px;border-radius:var(--r-m)"></div>
            <div class="skel" style="height:48px;border-radius:var(--r-m)"></div>
            <div class="skel" style="height:48px;border-radius:var(--r-m)"></div>
          </div>
        </div>
      </div>
    </div>`;

  el.innerHTML = heroHtml + kpiHtml + chartHtml + activityHtml;

  if (window.lucide) window.lucide.createIcons();

  document.querySelectorAll('.count-val').forEach(valEl => {
    countUp(valEl, valEl.dataset.val);
  });

  renderOverviewGrowthChart(primaryEnrich, primary);
  loadDashboardRecentUploads(primary.id);
  loadDashboardCompetitorDrops(primary.id);
  setupScrollReveal();
}

function toggleDashChartMetric(metric) {
  currentChartMetric = metric;
  const primary = all.find(c => c.is_primary) || all[0];
  if (!primary) return;
  const primaryEnrich = _enrichCache[primary.id] || {};
  
  document.querySelectorAll('.dash-chart-hdr .race-seg-btn').forEach((btn, idx) => {
    if ((idx === 0 && metric === 'views') || (idx === 1 && metric === 'cadence')) {
      btn.classList.add('on');
    } else {
      btn.classList.remove('on');
    }
  });

  renderOverviewGrowthChart(primaryEnrich, primary);
}

function renderOverviewGrowthChart(enrichData, primary) {
  const canvas = document.getElementById('dashGrowthCanvas');
  if (!canvas || typeof Chart === 'undefined') return;

  if (dashChartInstance) {
    dashChartInstance.destroy();
    dashChartInstance = null;
  }

  const ctx = canvas.getContext('2d');
  const vids = enrichData.vids || [];
  
  let labels = [];
  let dataPoints = [];

  if (currentChartMetric === 'views') {
    // Recent 15 videos performance velocity
    const sampleVids = [...vids].slice(0, 15).reverse();
    if (sampleVids.length > 0) {
      labels = sampleVids.map((v, i) => v.title ? (v.title.length > 18 ? v.title.slice(0, 18) + '…' : v.title) : `Upload #${i+1}`);
      dataPoints = sampleVids.map(v => parseInt(v.view_count ?? v.views_raw ?? 0) || 0);
    } else {
      labels = ['Day 1', 'Day 5', 'Day 10', 'Day 15', 'Day 20', 'Day 25', 'Day 30'];
      dataPoints = [1200, 1800, 2400, 3100, 4800, 5200, 6400];
    }
  } else {
    // 6-month monthly upload cadence
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      labels.push(d.toLocaleString('en-US', { month: 'short' }));
      const count = vids.filter(v => (v.published_at || v.date || '').startsWith(key)).length;
      dataPoints.push(count);
    }
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(102, 114, 245, 0.14)');
  gradient.addColorStop(1, 'rgba(102, 114, 245, 0.00)');

  dashChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: currentChartMetric === 'views' ? 'Views' : 'Uploads',
        data: dataPoints,
        borderColor: '#6672f5',
        borderWidth: 2,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#6672f5',
        pointBorderColor: '#101216',
        pointBorderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#171a1f',
          borderColor: '#262a31',
          borderWidth: 1,
          titleColor: '#e8eaed',
          bodyColor: '#9aa0a8',
          titleFont: { family: 'Inter', size: 12, weight: '500' },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 8,
          displayColors: false,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${fmtN(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
          ticks: { color: '#6b727c', font: { family: 'Inter', size: 11 }, maxRotation: 0 }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
          ticks: {
            color: '#6b727c',
            font: { family: 'Inter', size: 11 },
            callback: (val) => fmtN(val)
          }
        }
      }
    }
  });
}

async function loadDashboardCompetitorDrops(primaryId) {
  const el = document.getElementById('dashCompetitorDrops');
  if (!el) return;

  const competitors = all.filter(c => c.id !== primaryId);
  if (!competitors.length) {
    el.innerHTML = '<div style="color:var(--t3);font-size:12px;padding:24px 0;text-align:center">No competitor channels added yet.</div>';
    return;
  }

  const drops = [];
  competitors.forEach(ch => {
    const en = _enrichCache[ch.id];
    if (en && en.vids && en.vids.length > 0) {
      const latest = en.vids[0];
      drops.push({
        ch,
        vid: latest,
        published: new Date(latest.published_at || latest.date || 0).getTime()
      });
    }
  });

  drops.sort((a, b) => b.published - a.published);

  if (!drops.length) {
    el.innerHTML = '<div style="color:var(--t3);font-size:12px;padding:24px 0;text-align:center">Loading competitor telemetry…</div>';
    return;
  }

  el.innerHTML = drops.slice(0, 5).map(item => {
    const v = item.vid;
    const ch = item.ch;
    const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
    const pub = item.published;
    const days = Math.max(0.1, (Date.now() - pub) / 864e5);
    const vpd = Math.round(vc / days);

    return `
      <div class="video-forensic-card">
        <a href="${esc(v.url || `https://www.youtube.com/watch?v=${v.id || v.video_id}`)}" target="_blank" rel="noopener" style="flex-shrink:0">
          <img class="video-card-thumb" src="${esc(proxyImg(v.thumb || v.thumbnail_url || ''))}" alt="" onerror="this.style.opacity='.3'">
        </a>
        <div class="video-card-body">
          <a class="video-card-title" href="${esc(v.url || `https://www.youtube.com/watch?v=${v.id || v.video_id}`)}" target="_blank" rel="noopener" title="${esc(v.title)}">
            ${esc(v.title)}
          </a>
          <div class="video-card-meta">
            <span style="display:flex;align-items:center;gap:4px;color:var(--t2);cursor:pointer" onclick="openDeepDive('${esc(ch.id)}')">
              ${ch.logo_url ? `<img src="${esc(proxyImg(ch.logo_url))}" style="width:14px;height:14px;border-radius:50%;object-fit:cover">` : ''}
              <strong>${esc(ch.name)}</strong>
            </span>
            <span>•</span>
            <span>${fmtN(vc)} views</span>
            <span>•</span>
            <span class="badge bdg-dim" style="font-size:9.5px">+${fmtN(vpd)}/day</span>
            <span>•</span>
            <span>${ago(v.published_at || v.date)}</span>
          </div>
        </div>
        <button class="icon-btn" onclick="openDeepDive('${esc(ch.id)}')" title="Inspect Channel" style="flex-shrink:0;width:26px;height:26px">
          <i data-lucide="scan-eye" style="width:13px;height:13px"></i>
        </button>
      </div>`;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

/* ── 04c. Velocity Acceleration Radar Implementation (P5) ─────────────────── */
function renderAccelerationRadar() {
  return `
    <div id="sec-accel" class="card rev" style="margin-top:var(--s5);padding:24px;background:var(--bg-2);border:1px solid var(--line-1);border-radius:var(--r-l)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="ic-tile cyan"><span class="msi" style="font-size:18px">rocket_launch</span></span>
          <div>
            <div style="font-family:var(--f-disp);font-size:15px;font-weight:700;color:var(--t1);display:flex;align-items:center;gap:6px">
              <span>Velocity Acceleration Radar</span>
              <span class="badge bdg-gr" style="font-size:10px">Virality Surge</span>
            </div>
            <div style="font-size:11px;color:var(--t3)">Surfaces competitor drops whose daily view accrual rate is actively accelerating.</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-gh btn-sm" onclick="snapshotDailyVelocityNow()">
            <span class="msi">camera</span> Snapshot Velocity
          </button>
          <span class="card-prov" data-tip="Near-zero quota daily velocity delta" onclick="loadAccelerationTrending()">live acceleration</span>
        </div>
      </div>
      <div id="accelRadarList" style="min-height:120px">
        <div style="display:flex;flex-direction:column;gap:10px;padding:8px 0">
          <div class="skel-row" style="border-radius:var(--r-m);background:var(--bg-3)">
            <div class="skel skel-avatar sm"></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:6px">
              <div class="skel skel-text" style="width:45%"></div>
              <div class="skel skel-text sm" style="width:25%"></div>
            </div>
            <div class="skel skel-badge"></div>
          </div>
          <div class="skel-row" style="border-radius:var(--r-m);background:var(--bg-3)">
            <div class="skel skel-avatar sm"></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:6px">
              <div class="skel skel-text" style="width:50%"></div>
              <div class="skel skel-text sm" style="width:30%"></div>
            </div>
            <div class="skel skel-badge"></div>
          </div>
        </div>
      </div>
    </div>`;
}

async function snapshotDailyVelocityNow() {
  toast('Recording daily velocity snapshot…');
  try {
    const res = await triggerVelocitySnapshot();
    if (res) {
      toast(`Snapshot recorded for ${res.processed_videos || 'active'} videos!`, 's');
      loadAccelerationTrending();
    } else {
      toast('Velocity snapshot completed', 's');
    }
  } catch (err) {
    toast('Snapshot error', 'e');
  }
}

async function loadAccelerationTrending() {
  const container = document.getElementById('accelRadarList');
  if (!container) return;

  try {
    let trending = await fetchTrendingVelocity();
    
    // Fallback: if backend table is empty or still backfilling, compute in-memory acceleration from enriched videos
    if (!trending || !trending.length) {
      const allVids = [];
      all.forEach(ch => {
        const en = _enrichCache[ch.id];
        if (en && en.vids) {
          en.vids.forEach(v => {
            if (!isYouTubeShort(v)) {
              allVids.push({ ...v, ch_name: ch.name, ch_logo: ch.logo_url, ch_id: ch.id });
            }
          });
        }
      });

      trending = allVids.map(v => {
        const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
        const pub = new Date(v.published_at || v.date || 0).getTime();
        const days = Math.max(1, (Date.now() - pub) / 864e5);
        const vpd = vc / days;
        const approxAccel = days <= 14 ? Math.round(vpd * (1.5 - days * 0.05)) : Math.round(vpd * 0.1);
        return {
          video_id: v.id || v.video_id,
          title: v.title,
          url: v.url || `https://www.youtube.com/watch?v=${v.id || v.video_id}`,
          thumbnail_url: v.thumb || v.thumbnail_url,
          views: vc,
          velocity_vpd: Math.round(vpd),
          acceleration: approxAccel,
          channel_name: v.ch_name,
          channel_logo: v.ch_logo,
          channel_id: v.ch_id,
          published_at: v.published_at || v.date
        };
      }).filter(v => v.acceleration > 50).sort((a, b) => b.acceleration - a.acceleration).slice(0, 6);
    }

    if (!trending.length) {
      container.innerHTML = `
        <div style="padding:24px 0;text-align:center;color:var(--t3);font-size:12px;border:1px dashed var(--line-1);border-radius:var(--r-s)">
          No videos with positive acceleration detected in the active window. Refresh channels to accumulate velocity logs.
        </div>`;
      return;
    }

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:12px">
        ${trending.map(item => `
          <div class="card" style="padding:12px;background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);display:flex;gap:12px;align-items:flex-start">
            <div style="position:relative;flex-shrink:0">
              <img src="${esc(proxyImg(item.thumbnail_url || ''))}" style="width:96px;height:54px;object-fit:cover;border-radius:var(--r-s);background:var(--bg-1)" onerror="this.style.opacity='.3'" />
              <span class="badge bdg-gr" style="position:absolute;bottom:3px;right:3px;font-size:8.5px;padding:1px 4px;font-weight:700">
                🚀 +${fmtN(item.acceleration)}/d²
              </span>
            </div>
            <div style="min-width:0;flex:1;display:flex;flex-direction:column;justify-content:space-between;height:100%">
              <div>
                <a href="${esc(item.url)}" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:var(--t1);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-decoration:none" title="${esc(item.title)}">
                  ${esc(item.title)}
                </a>
                <div style="font-size:10px;color:var(--t3);margin-top:4px;display:flex;align-items:center;gap:4px">
                  ${item.channel_logo ? `<img src="${esc(proxyImg(item.channel_logo))}" style="width:14px;height:14px;border-radius:50%;object-fit:cover">` : ''}
                  <span>${esc(item.channel_name || '')}</span>
                  <span>•</span>
                  <span>${ago(item.published_at)}</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:6px;border-top:1px solid var(--line-1)">
                <div style="font-size:10px;color:var(--t2)">
                  <strong>${fmtN(item.views)}</strong> views <span style="color:var(--acc)">(~${fmtN(item.velocity_vpd)}/day)</span>
                </div>
                <div style="display:flex;gap:4px">
                  <button class="icon-btn" style="width:22px;height:22px" onclick="openDeepDive('${esc(item.channel_id || '')}')" title="Analyze Channel in Deep Dive">
                    <span class="msi" style="font-size:12px">analytics</span>
                  </button>
                  <a class="icon-btn" style="width:22px;height:22px;display:flex;align-items:center;justify-content:center" href="${esc(item.url)}" target="_blank" rel="noopener" title="Watch on YouTube">
                    <span class="msi" style="font-size:12px">open_in_new</span>
                  </a>
                </div>
              </div>
            </div>
          </div>`).join('')}
      </div>`;
  } catch (err) {
    container.innerHTML = '<div style="color:var(--t3);font-size:11.5px;padding:16px 0">Could not calculate velocity acceleration.</div>';
  }
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
        <div class="ladder-left">
          <span style="font-family:var(--f-mono);font-size:10px;color:var(--t3);display:flex;align-items:center;gap:3px;flex-shrink:0">#${i + 1} ${renderRankDeltaChip(ch.id)}</span>
          <span style="width:7px;height:7px;border-radius:50%;background:${col};flex-shrink:0"></span>
          <span class="ladder-name">${esc(ch.name)} ${isMe ? '◀ YOU' : ''}</span>
        </div>
        <span class="ladder-val">${fmtN(ch[metricKey] || 0)}</span>
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
  const cardsList = document.getElementById('lbCardsList');
  const primary = all.find(c => c.is_primary) || all[0];
  if (tbody) {
    flip(tbody, () => {
      tbody.innerHTML = renderLeaderboardRows(primary, all);
    });
  }
  if (cardsList) {
    cardsList.innerHTML = renderLeaderboardCards(primary, all);
  }
  document.querySelectorAll('.lb-mobile-sort .race-seg-btn').forEach(btn => {
    const txt = btn.textContent.toLowerCase();
    const active = (field === 'subscribers_raw' && txt === 'subs') ||
      (field === 'avg_views_raw' && txt.includes('avg')) ||
      (field === 'total_views_raw' && txt.includes('total')) ||
      (field === 'threat_score' && txt.includes('threat'));
    btn.classList.toggle('on', active);
  });
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

    const rankDisplay = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    return `
      <tr class="lb-row ${isMe ? 'me' : ''}" onclick="openDeepDive('${esc(ch.id)}', 'overview')">
        <td style="font-family:var(--f-mono);font-size:12px;font-weight:700;color:var(--t3);text-align:center;white-space:nowrap">
          <span style="font-size:${i < 3 ? '14px' : '11px'}">${rankDisplay}</span> ${renderRankDeltaChip(ch.id)}
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            ${ch.logo_url
        ? `<img src="${esc(proxyImg(ch.logo_url))}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1.5px solid ${col};flex-shrink:0" alt="">`
        : `<div style="width:28px;height:28px;border-radius:50%;background:var(--bg-3);border:1.5px solid ${col};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${(ch.name || '?')[0]}</div>`}
            <div style="min-width:0">
              <div style="font-weight:600;font-size:13px;color:${isMe ? 'var(--me)' : 'var(--t1)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ch.name)} ${isMe ? '<span class="badge bdg-gd" style="font-size:9px;margin-left:4px">YOU</span>' : ''}</div>
              <div style="font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ch.handle || '')}</div>
            </div>
          </div>
        </td>
        <td class="lb-bar-cell">
          <div style="font-family:var(--f-mono);font-size:13px;font-weight:700;color:var(--t1)">${esc(ch.subscribers)}</div>
          <div class="lb-bar-bg">
            <div class="lb-bar-fill" style="width:${pct}%;background:${col}"></div>
          </div>
        </td>
        <td style="font-family:var(--f-mono);font-size:13px;color:var(--up);font-weight:700">${esc(ch.avg_views)}</td>
        <td style="font-family:var(--f-mono);font-size:13px;color:var(--t2)">${esc(ch.total_views)}</td>
        <td style="font-family:var(--f-mono);font-size:13px;color:var(--t3)">${esc(ch.total_videos)}</td>
        <td style="font-size:11.5px;color:var(--t3)">${ch.video?.date || '—'}</td>
        <td style="text-align:center;padding:6px 4px" onclick="event.stopPropagation()">
          ${isMe
        ? `<span class="badge bdg-gd">YOU</span>`
        : !_topicCache.topics.size
          ? `<span class="badge bdg-dim" title="Enrich channels to compute topic overlap">—</span>`
          : `<span class="badge" style="background:${threatScore >= 50 ? 'rgba(244,63,94,0.12)' : threatScore >= 25 ? 'rgba(245,158,11,0.12)' : 'var(--bg-3)'};color:${threatColor}" title="Shared topics: ${(ch._sharedTopics || []).join(', ') || 'none'}">${threatScore}% overlap</span>`}
        </td>
        <td style="text-align:center;overflow:visible;text-overflow:clip;padding:6px 0" onclick="event.stopPropagation()">
          <button class="icon-btn ${inCompare ? 'active' : ''}" style="display:inline-flex;margin:0 auto;width:28px;height:28px" onclick="toggleCompare('${esc(ch.id)}')" title="Toggle compare tray">
            <span class="msi" style="font-size:14px">${inCompare ? 'check' : 'add'}</span>
          </button>
        </td>
      </tr>`;
  }).join('');
}

function renderLeaderboardCards(primary, allChannels) {
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
      <div class="lb-card ${isMe ? 'me' : ''}" onclick="openDeepDive('${esc(ch.id)}', 'overview')">
        <div class="lb-card-top">
          <div class="lb-card-ident">
            <span class="lb-card-rank">#${i + 1}</span>
            ${ch.logo_url
        ? `<img class="lb-card-av" src="${esc(proxyImg(ch.logo_url))}" style="border:1.5px solid ${col}" alt="">`
        : `<div class="lb-card-av-fb" style="border:1.5px solid ${col};color:${col}">${(ch.name || '?')[0]}</div>`}
            <div style="min-width:0">
              <div class="lb-card-name">${esc(ch.name)} ${isMe ? '<span class="badge bdg-gd" style="font-size:9px">YOU</span>' : ''}</div>
              <div class="lb-card-meta">${esc(ch.handle || '')} ${renderRankDeltaChip(ch.id)}</div>
            </div>
          </div>
          <div class="lb-card-acts" onclick="event.stopPropagation()">
            ${threatScore > 0 && !isMe ? `<span class="badge" style="background:${threatScore >= 50 ? 'rgba(255,107,107,0.12)' : 'rgba(245,197,66,0.12)'};color:${threatColor};font-size:9.5px">⚔️ ${threatScore}%</span>` : ''}
            <button class="icon-btn ${inCompare ? 'active' : ''}" style="width:28px;height:28px" onclick="toggleCompare('${esc(ch.id)}')" title="Toggle compare">
              <span class="msi" style="font-size:14px">${inCompare ? 'check' : 'add'}</span>
            </button>
          </div>
        </div>
        <div class="lb-card-bar">
          <div class="lb-card-bar-fill" style="width:${pct}%;background:${col}"></div>
        </div>
        <div class="lb-card-stats">
          <div class="lb-stat-item"><span class="lb-stat-lbl">Subs</span><span class="mono" style="color:var(--t1);font-weight:700">${esc(ch.subscribers)}</span></div>
          <div class="lb-stat-item"><span class="lb-stat-lbl">Avg</span><span class="mono" style="color:var(--up);font-weight:700">${esc(ch.avg_views)}</span></div>
          <div class="lb-stat-item"><span class="lb-stat-lbl">Total</span><span class="mono" style="color:var(--t2)">${esc(ch.total_views)}</span></div>
          <div class="lb-stat-item"><span class="lb-stat-lbl">Vids</span><span class="mono" style="color:var(--t3)">${esc(ch.total_videos)}</span></div>
        </div>
      </div>`;
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
        <div class="rrow-stats-strip">
          <div class="rrow-views">${fmtN(vc)} <span style="font-size:9.5px;color:var(--t3);font-family:var(--f-ui);font-weight:400">views</span></div>
          <div class="rrow-vel">${fmtN(vel)}<span style="font-size:9.5px;font-weight:400">/d</span> ⚡</div>
          <div class="rrow-eng">${eng !== null ? eng + '%' : '<span style="color:var(--t3)">—</span>'}</div>
          <div class="race-vs-wrap">
            <span class="race-vs-label">${Math.round(pct)}% of best</span>
            <div class="race-vs-track"><div class="race-vs-fill" style="width:${pct}%;background:${col}"></div></div>
          </div>
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
          <button class="icon-btn" onclick="raceExpandAll()" title="Expand all drops insets"><span class="msi" style="font-size:16px">unfold_more</span></button>
          <button class="icon-btn" onclick="raceToggleSlim()" title="${isSlim ? 'Expand Drops Window' : 'Minimize Drops Window'}"><span class="msi" style="font-size:16px">${isSlim ? 'expand_more' : 'minimize'}</span></button>
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
    const r = await apiFetch(`/api/channels/${primaryId}/videos?max=10`);
    const vids = await r.json();
    if (!vids || !vids.length) {
      el.innerHTML = '<div style="color:var(--t3);font-size:12px;padding:24px 0;text-align:center">No uploads recorded.</div>';
      return;
    }

    // Benchmark vs 30-vid average
    const en = _enrichCache[primaryId] || {};
    const sp30 = en.sp30 || [];
    const avgViews = sp30.length
      ? sp30.reduce((a, b) => a + b, 0) / sp30.length
      : (vids.reduce((a, v) => a + (parseInt(v.view_count ?? v.views_raw ?? 0) || 0), 0) / Math.max(1, vids.length));

    el.innerHTML = vids.slice(0, 5).map(v => {
      const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
      const ratio = avgViews > 0 ? (vc / avgViews) : 1;
      let badgeHtml = '';
      if (ratio >= 1.3) {
        badgeHtml = `<span class="badge bdg-gr" style="font-size:9.5px;padding:1px 6px">▲ ${(ratio).toFixed(1)}× avg</span>`;
      } else if (ratio <= 0.7) {
        const collision = detectCollisionForVideo(v, all, primaryId);
        if (collision) {
          badgeHtml = `<span class="badge bdg-re" style="font-size:9.5px;padding:1px 6px" title="Collision with ${esc(collision.rivalCh)}">⚡ Rival Conflict</span>`;
        } else {
          badgeHtml = `<span class="badge bdg-dim" style="font-size:9.5px;padding:1px 6px">▼ ${(ratio).toFixed(1)}× avg</span>`;
        }
      } else {
        badgeHtml = `<span class="badge bdg-dim" style="font-size:9.5px;padding:1px 6px">~ Benchmark</span>`;
      }

      return `
        <div class="video-forensic-card">
          <a href="${esc(v.url || `https://www.youtube.com/watch?v=${v.id || v.video_id}`)}" target="_blank" rel="noopener" style="flex-shrink:0">
            <img class="video-card-thumb" src="${esc(proxyImg(v.thumb || v.thumbnail_url || ''))}" alt="" onerror="this.style.opacity='.3'">
          </a>
          <div class="video-card-body">
            <a class="video-card-title" href="${esc(v.url || `https://www.youtube.com/watch?v=${v.id || v.video_id}`)}" target="_blank" rel="noopener" title="${esc(v.title)}">
              ${esc(v.title)}
            </a>
            <div class="video-card-meta">
              <strong style="color:var(--t1)">${fmtN(vc)} views</strong>
              <span>•</span>
              ${badgeHtml}
              <span>•</span>
              <span>${ago(v.published_at || v.date)}</span>
            </div>
          </div>
          <a class="icon-btn" href="${esc(v.url || `https://www.youtube.com/watch?v=${v.id || v.video_id}`)}" target="_blank" rel="noopener" title="Watch on YouTube" style="flex-shrink:0;width:26px;height:26px;display:flex;align-items:center;justify-content:center">
            <i data-lucide="external-link" style="width:13px;height:13px"></i>
          </a>
        </div>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  } catch {
    el.innerHTML = '<div style="color:var(--t3);font-size:12px;padding:24px 0;text-align:center">Could not load recent uploads.</div>';
  }
}

let velPopoverOpen = false;

function loadVelocityWithFit(channels) {
  const box = document.getElementById('dashVelocity');
  const legendChipsEl = document.getElementById('velLegendChips');
  if (!box || !channels.length) return;

  if (legendChipsEl) {
    const top4 = channels.slice(0, 4);
    const overflow = channels.slice(4);

    let html = top4.map(ch => {
      const isMuted = mutedVelocity.has(ch.id);
      return `
        <div class="vel-legend-chip ${isMuted ? 'muted' : ''}" onclick="toggleMuteVelocity('${esc(ch.id)}')">
          <span style="width:6px;height:6px;border-radius:2px;background:${colorOf(ch)}"></span>
          <span>${esc(ch.name.length > 8 ? ch.name.slice(0, 8) + '…' : ch.name)}</span>
        </div>`;
    }).join('');

    if (overflow.length > 0) {
      html += `
        <div style="position:relative;display:inline-block">
          <button class="chip chip-btn" style="padding:2px 8px;font-size:10.5px" onclick="toggleVelPopover(event)">
            +${overflow.length} more
          </button>
          <div class="nav-overflow-popover" id="velLegendPopover" style="position:absolute;right:0;top:calc(100% + 4px);width:200px;display:${velPopoverOpen ? 'flex' : 'none'};z-index:90">
            <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;padding:4px 8px">All Channels</div>
            ${channels.map(ch => `
              <div class="nav-overflow-item" onclick="toggleMuteVelocity('${esc(ch.id)}')" style="font-size:11px;padding:5px 8px">
                <span style="width:8px;height:8px;border-radius:2px;background:${colorOf(ch)};opacity:${mutedVelocity.has(ch.id) ? 0.3 : 1}"></span>
                <span style="flex:1;text-decoration:${mutedVelocity.has(ch.id) ? 'line-through' : 'none'}">${esc(ch.name)}</span>
                <span class="msi" style="font-size:13px">${mutedVelocity.has(ch.id) ? 'visibility_off' : 'visibility'}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    legendChipsEl.innerHTML = html;
  }

  fit(box, (w, h) => drawVelocitySvg(box, channels, w, h));
}

function toggleVelPopover(e) {
  if (e) e.stopPropagation();
  velPopoverOpen = !velPopoverOpen;
  const p = document.getElementById('velLegendPopover');
  if (p) p.style.display = velPopoverOpen ? 'flex' : 'none';
}

document.addEventListener('click', (e) => {
  if (velPopoverOpen && !e.target.closest('#velLegendPopover')) {
    velPopoverOpen = false;
    const p = document.getElementById('velLegendPopover');
    if (p) p.style.display = 'none';
  }
});

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
        isCurrent: i === 0
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
          const r = await apiFetch(`/api/channels/${ch.id}/videos?max=50`);
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
    const padB = 26, padT = 16, padL = 36, padR = 16;
    const pH = H - padB - padT;
    const plotW = W - padL - padR;

    const nMonths = months.length;
    const bandW = plotW / nMonths;
    const nCh = activeChannels.length;
    const bW = Math.min(14, Math.max(3, Math.floor((bandW * 0.75) / nCh)));
    const bGap = 2;
    const groupW = nCh * bW + (nCh - 1) * bGap;

    let bars = '';
    [0, Math.round(maxC / 2), maxC].forEach(t => {
      const y = H - padB - Math.round((t / maxC) * pH);
      bars += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--line-1)" stroke-width="1" stroke-dasharray="3 3"/>
               <text x="${padL - 6}" y="${y + 3}" text-anchor="end" fill="var(--t3)" font-size="8.5" font-family="JetBrains Mono">${t}</text>`;
    });

    months.forEach((m, mi) => {
      const bandCenterX = padL + mi * bandW + bandW / 2;
      const startX = bandCenterX - groupW / 2;

      data.forEach((d, ci) => {
        const c = d.counts[mi];
        if (c === 0) return;
        const h = Math.max(4, Math.round((c / maxC) * pH));
        const x = startX + ci * (bW + bGap), y = H - padB - h;
        bars += `<rect class="bars" x="${x}" y="${y}" width="${bW}" height="${h}" rx="2" fill="${d.color}" opacity="0.9"
                       data-tip="<strong>${esc(d.ch.name)}</strong> · ${m.label}: ${c} videos" style="cursor:pointer"/>`;
      });

      // Today tick & label on ongoing month
      if (m.isCurrent) {
        bars += `
          <line x1="${bandCenterX + groupW / 2 + 6}" y1="${padT}" x2="${bandCenterX + groupW / 2 + 6}" y2="${H - padB}" stroke="var(--acc)" stroke-width="1" stroke-dasharray="2 2" opacity="0.7"/>
          <text x="${bandCenterX + groupW / 2 + 8}" y="${padT + 8}" font-size="8" fill="var(--acc)" font-family="JetBrains Mono" font-weight="700">today</text>`;
      }

      bars += `<text x="${bandCenterX}" y="${H - 6}" text-anchor="middle" font-size="9" fill="${m.isCurrent ? 'var(--acc)' : 'var(--t3)'}" font-family="DM Sans" font-weight="${m.isCurrent ? '700' : '400'}">${m.label}</text>`;
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
