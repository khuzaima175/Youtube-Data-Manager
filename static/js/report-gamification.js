/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — REPORT CENTER, ACHIEVEMENTS & SHARING ENGINE
   ══════════════════════════════════════════════════════════════════════════════ */

function calcRankDeltas() {
  if (!_snapshotsCache || !all.length) return;
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 864e5;
  const thirtyDaysAgo = now - 30 * 864e5;

  // Current rank sorted by subscribers_raw
  const currentSorted = [...all].sort((a, b) => (b.subscribers_raw || 0) - (a.subscribers_raw || 0));
  const currentRankMap = {};
  currentSorted.forEach((ch, idx) => { currentRankMap[ch.id] = idx + 1; });

  // Compute past ranks from snapshots closest to 7d ago
  const pastSubsMap = {};
  all.forEach(ch => {
    const snaps = _snapshotsCache[ch.id] || [];
    if (!snaps.length) return;
    // Find closest snapshot <= sevenDaysAgo
    let closest7d = null;
    let closest30d = null;
    snaps.forEach(s => {
      const t = new Date(s.date).getTime();
      if (!closest7d || Math.abs(t - sevenDaysAgo) < Math.abs(new Date(closest7d.date).getTime() - sevenDaysAgo)) {
        closest7d = s;
      }
      if (!closest30d || Math.abs(t - thirtyDaysAgo) < Math.abs(new Date(closest30d.date).getTime() - thirtyDaysAgo)) {
        closest30d = s;
      }
    });

    pastSubsMap[ch.id] = {
      subs7d: closest7d?.subscribers ?? ch.subscribers_raw,
      subs30d: closest30d?.subscribers ?? ch.subscribers_raw,
      snapCount: snaps.length
    };
  });

  // Calculate past rank
  const pastSorted = [...all].sort((a, b) => {
    const aSubs = pastSubsMap[a.id]?.subs7d ?? (a.subscribers_raw || 0);
    const bSubs = pastSubsMap[b.id]?.subs7d ?? (b.subscribers_raw || 0);
    return bSubs - aSubs;
  });

  const pastRankMap = {};
  pastSorted.forEach((ch, idx) => { pastRankMap[ch.id] = idx + 1; });

  rankMovementMap = {};
  all.forEach(ch => {
    const cRank = currentRankMap[ch.id] || 1;
    const pRank = pastRankMap[ch.id] || cRank;
    const snapData = pastSubsMap[ch.id];
    const isNew = !snapData || snapData.snapCount <= 1;

    // delta > 0 means gained positions (e.g. from #4 to #2 -> 4 - 2 = +2)
    const rankDelta = pRank - cRank;
    const subDelta30d = (ch.subscribers_raw || 0) - (snapData?.subs30d || ch.subscribers_raw || 0);

    rankMovementMap[ch.id] = {
      rankDelta,
      currentRank: cRank,
      pastRank: pRank,
      subDelta30d,
      isNew
    };
  });
}

function renderRankDeltaChip(channelId) {
  const data = rankMovementMap[channelId];
  if (!data) return '';
  if (data.isNew) {
    return `<span class="rank-delta-chip rank-delta-new" title="Newly tracked channel (gathering daily snapshots)">★ NEW</span>`;
  }
  if (data.rankDelta > 0) {
    return `<span class="rank-delta-chip rank-delta-up" title="Rose ▲${data.rankDelta} spot${data.rankDelta > 1 ? 's' : ''} in subscribers over 7 days (+${fmtN(data.subDelta30d)} in 30d)">▲${data.rankDelta}</span>`;
  }
  if (data.rankDelta < 0) {
    const absD = Math.abs(data.rankDelta);
    return `<span class="rank-delta-chip rank-delta-down" title="Fell ▼${absD} spot${absD > 1 ? 's' : ''} in subscribers over 7 days">▼${absD}</span>`;
  }
  return `<span class="rank-delta-chip rank-delta-flat" title="Rank position steady in subscribers over 7 days">—</span>`;
}

/* ── 2. Achievements Engine & Gamification System ─────────────────────────── */
function saveAchievements() {
  try { localStorage.setItem('yt_achievements', JSON.stringify(achievementsState)); } catch { }
}

function checkAchievements() {
  if (!all.length) return;
  const primary = all.find(c => c.is_primary) || all[0];
  const primaryEnrich = _enrichCache[primary?.id] || {};
  const primaryVids = primaryEnrich.longForm || primaryEnrich.vids || [];
  const latestV = primaryVids[0];

  // 1. velocity_vanguard
  if (latestV) {
    const vel = raceVelOf(latestV);
    if (vel >= 500) unlockAchievement('velocity_vanguard');
  }

  // 2. giant_slayer
  if (primary) {
    const myAvg = primary.avg_views_raw || 0;
    const mySubs = primary.subscribers_raw || 0;
    const giants = all.filter(c => !c.is_primary && (c.subscribers_raw || 0) >= mySubs * 1.8);
    if (giants.some(g => (g.avg_views_raw || 0) < myAvg && myAvg > 0)) {
      unlockAchievement('giant_slayer');
    }
  }

  // 3. upload_machine
  if (primaryEnrich.streak >= 3 || primaryVids.filter(v => (Date.now() - new Date(v.published_at || v.date).getTime()) <= 30 * 864e5).length >= 4) {
    unlockAchievement('upload_machine');
  }

  // 4. evergreen_master
  if (primaryEnrich.evergreenPct >= 40) {
    unlockAchievement('evergreen_master');
  }

  // 5. radar_commander
  const surgeTopics = [..._topicCache.topics.values()].filter(t => (t.momentum || 0) >= 1.3);
  if (surgeTopics.length >= 5) {
    unlockAchievement('radar_commander');
  }

  // 6. moat_defender
  if (primary) {
    const { moats } = computeTopicGaps(primary.id);
    if (moats && moats.length >= 1) {
      unlockAchievement('moat_defender');
    }
  }

  // 7. collision_dodger
  if (primaryVids.length >= 3) {
    unlockAchievement('collision_dodger');
  }

  // 9. pipeline_producer
  if (pipelineCards && pipelineCards.filter(c => c.stage === 'production' || c.stage === 'published').length >= 3) {
    unlockAchievement('pipeline_producer');
  }

  // 10. deep_diver
  if (achievementsState.inspectionsCount >= 10) {
    unlockAchievement('deep_diver');
  }

  // 11. benchmarker
  if (compareSet.length >= 4) {
    unlockAchievement('benchmarker');
  }

  // 12. niche_dominator
  if (primary) {
    const topSub = [...all].sort((a, b) => (b.subscribers_raw || 0) - (a.subscribers_raw || 0))[0];
    const topAvg = [...all].sort((a, b) => (b.avg_views_raw || 0) - (a.avg_views_raw || 0))[0];
    if (topSub?.id === primary.id || topAvg?.id === primary.id) {
      unlockAchievement('niche_dominator');
    }
  }
}

function unlockAchievement(id) {
  if (achievementsState.unlocked[id]) return;
  const ach = ACHIEVEMENTS_CATALOG.find(a => a.id === id);
  if (!ach) return;

  achievementsState.unlocked[id] = { ts: Date.now(), xp: ach.xp };
  achievementsState.totalXp = (achievementsState.totalXp || 0) + ach.xp;
  saveAchievements();

  showAchievementToast(ach);
  if (document.getElementById('myPulsePopover')?.classList.contains('open')) {
    renderMyPulseHtml();
  }
}

function showAchievementToast(ach) {
  const toastEl = document.getElementById('achievementToast');
  if (!toastEl) return;

  toastEl.innerHTML = `
    <div style="font-size:32px;animation:rot 0.6s var(--e-out)">${ach.icon}</div>
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--me);letter-spacing:0.06em">Achievement Unlocked!</div>
      <div style="font-size:13px;font-weight:700;color:#fff">${esc(ach.title)}</div>
      <div style="font-size:11px;color:var(--t2)">${esc(ach.desc)} <span class="badge bdg-gd" style="margin-left:4px">+${ach.xp} XP</span></div>
    </div>`;

  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 4500);
}

/* ── 3. My Pulse Popover ─────────────────────────────────────────────────── */
function toggleMyPulse(event) {
  if (event) event.stopPropagation();
  const p = document.getElementById('myPulsePopover');
  if (!p) return;
  const isOpen = p.classList.contains('open');
  if (isOpen) {
    p.classList.remove('open');
  } else {
    document.getElementById('bellPopover')?.classList.remove('open');
    document.getElementById('comparePopover')?.classList.remove('open');
    closeSettingsModal();
    renderMyPulseHtml();
    p.classList.add('open');
  }
}

function switchMyPulseTab(tab, event) {
  if (event) event.stopPropagation();
  myPulseTab = tab;
  renderMyPulseHtml();
}

function renderMyPulseHtml() {
  const p = document.getElementById('myPulsePopover');
  if (!p) return;

  const primary = all.find(c => c.is_primary) || all[0];
  const primaryEnrich = _enrichCache[primary?.id] || {};
  const unlockedCount = Object.keys(achievementsState.unlocked || {}).length;
  const totalCount = ACHIEVEMENTS_CATALOG.length;
  const totalXp = achievementsState.totalXp || 0;
  const creatorLevel = Math.floor(totalXp / 250) + 1;
  const levelProgressXp = totalXp % 250;
  const levelProgressPct = Math.min(100, Math.round((levelProgressXp / 250) * 100));

  const sp30Vals = primaryEnrich.sp30 && primaryEnrich.sp30.length ? primaryEnrich.sp30 : [10, 14, 12, 18, 22, 20, 26];

  p.innerHTML = `
    <div style="display:flex;flex-direction:column;max-height:85vh;width:100%;min-width:0">
      <!-- Header with Tab switcher -->
      <div style="padding:12px 16px;border-bottom:1px solid var(--line-1);display:flex;align-items:center;justify-content:space-between;background:var(--bg-2)">
        <div class="vid-seg">
          <button class="vid-seg-btn ${myPulseTab === 'overview' ? 'on' : ''}" onclick="switchMyPulseTab('overview', event)">
            ⚡ Pulse
          </button>
          <button class="vid-seg-btn ${myPulseTab === 'badges' ? 'on' : ''}" onclick="switchMyPulseTab('badges', event)">
            🏆 Badges (${unlockedCount}/${totalCount})
          </button>
        </div>
        <button class="icon-btn" style="width:24px;height:24px" onclick="toggleMyPulse(event)"><span class="msi" style="font-size:14px">close</span></button>
      </div>

      <!-- Body -->
      <div style="padding:16px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:14px">
        ${myPulseTab === 'overview' ? `
          <!-- Creator Identity -->
          <div style="display:flex;align-items:center;gap:12px">
            ${primary?.logo_url ? `<img src="${esc(proxyImg(primary.logo_url))}" style="width:44px;height:44px;border-radius:50%;border:2px solid var(--me);object-fit:cover" alt="">` : `<div style="width:44px;height:44px;border-radius:50%;background:var(--bg-3);border:2px solid var(--me);display:flex;align-items:center;justify-content:center;font-weight:700">${(primary?.name || '?')[0]}</div>`}
            <div>
              <div style="font-size:14px;font-weight:700;color:var(--t1)">${esc(primary?.name || 'Your Channel')}</div>
              <div style="font-size:11px;color:var(--t3)">${esc(primary?.handle || '')} • <span class="xp-level-badge" style="padding:1px 6px;font-size:9.5px">Level ${creatorLevel}</span></div>
            </div>
          </div>

          <!-- Quick Metrics Cards -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div style="background:var(--bg-3);padding:10px;border-radius:var(--r-s);border:1px solid var(--line-1)">
              <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase">Subscribers</div>
              <div style="font-family:var(--f-mono);font-size:15px;font-weight:800;color:var(--me);margin-top:2px">${esc(primary?.subscribers || '—')}</div>
              <div style="margin-top:4px">${renderRankDeltaChip(primary?.id)}</div>
            </div>
            <div style="background:var(--bg-3);padding:10px;border-radius:var(--r-s);border:1px solid var(--line-1)">
              <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase">Engagement</div>
              <div style="font-family:var(--f-mono);font-size:15px;font-weight:800;color:var(--acc);margin-top:2px">${primaryEnrich.engagement || 0}%</div>
              <div style="font-size:9.5px;color:var(--t3);margin-top:4px">Across long-form</div>
            </div>
          </div>

          <!-- 30-Day Trend Sparkline -->
          <div style="background:var(--bg-3);padding:12px;border-radius:var(--r-s);border:1px solid var(--line-1)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:11px;font-weight:700;color:var(--t2)">30-Day View Velocity Sparkline</span>
              <span style="font-size:10.5px;font-family:var(--f-mono);color:var(--me)">${primaryEnrich.latestVpd ? fmtN(primaryEnrich.latestVpd) + '/d' : 'Active'}</span>
            </div>
            <div style="display:flex;justify-content:center;padding:4px 0;width:100%">
              ${sparkSVG(sp30Vals, 360, 42, 'var(--me)')}
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div style="display:flex;gap:8px">
            <button class="btn btn-acc btn-sm" style="flex:1;white-space:nowrap;justify-content:center" onclick="toggleMyPulse();openDeepDive('${esc(primary?.id)}','overview')">
              <span class="msi" style="font-size:14px">dashboard</span> Deep Dive
            </button>
            <button class="btn btn-gh btn-sm" style="flex:1;white-space:nowrap;justify-content:center" onclick="toggleMyPulse();openReportModal()">
              <span class="msi" style="font-size:14px">description</span> Report
            </button>
          </div>
        ` : `
          <!-- Level & XP Progress -->
          <div style="background:var(--bg-3);padding:12px;border-radius:var(--r-s);border:1px solid var(--line-1)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span class="xp-level-badge" style="white-space:nowrap">Level ${creatorLevel} Creator</span>
              <span style="font-family:var(--f-mono);font-size:11px;color:var(--t2);white-space:nowrap">${totalXp} Total XP</span>
            </div>
            <div class="xp-bar-track">
              <div class="xp-bar-fill" style="width:${levelProgressPct}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--t3);margin-top:4px">
              <span>${levelProgressXp} / 250 XP to Level ${creatorLevel + 1}</span>
              <span>${unlockedCount}/${totalCount} Unlocked</span>
            </div>
          </div>

          <!-- Badge Grid -->
          <div class="badge-grid">
            ${ACHIEVEMENTS_CATALOG.map(ach => {
    const unlockInfo = achievementsState.unlocked[ach.id];
    const isUnlocked = !!unlockInfo;
    return `
                <div class="badge-card ${isUnlocked ? 'unlocked' : 'locked'}" title="${esc(ach.desc)}">
                  <div class="badge-card-icon">${ach.icon}</div>
                  <div class="badge-card-info">
                    <div class="badge-card-title">
                      <span>${esc(ach.title)}</span>
                      <span style="font-size:9px;color:var(--me)">+${ach.xp}</span>
                    </div>
                    <div class="badge-card-desc">${esc(ach.desc)}</div>
                    <div class="badge-card-meta">${isUnlocked ? `Unlocked ${ago(unlockInfo.ts)}` : '🔒 Incomplete'}</div>
                  </div>
                </div>`;
  }).join('')}
          </div>
        `}
      </div>
    </div>`;
}

/* ── 4. Report Center Engine ─────────────────────────────────────────────── */
function openReportModal() {
  document.getElementById('reportOvrl')?.classList.add('open');
  const modal = document.getElementById('reportModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('open');
  }
  renderReportPreview();
  serializeStateToHash();
}

function closeReportModal() {
  document.getElementById('reportOvrl')?.classList.remove('open');
  const modal = document.getElementById('reportModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('open');
  }
  serializeStateToHash();
}

function setReportPeriod(p) {
  reportPeriod = p;
  document.querySelectorAll('#reportPeriodSeg .vid-seg-btn').forEach(b => {
    b.classList.toggle('on', b.id === 'repPeriod-' + p);
  });
  renderReportPreview();
  serializeStateToHash();
}

function setReportScope(s) {
  reportScope = s;
  document.querySelectorAll('#reportScopeSeg .vid-seg-btn').forEach(b => {
    b.classList.toggle('on', b.id === 'repScope-' + s);
  });
  renderReportPreview();
  serializeStateToHash();
}

function generateReportData() {
  const primary = all.find(c => c.is_primary) || all[0];
  const targetChannels = reportScope === 'compare'
    ? all.filter(c => compareSet.includes(c.id) || c.id === primary?.id)
    : all;

  // Sorting
  const sortedSubs = [...targetChannels].sort((a, b) => (b.subscribers_raw || 0) - (a.subscribers_raw || 0));
  const sortedViews = [...targetChannels].sort((a, b) => (b.total_views_raw || 0) - (a.total_views_raw || 0));
  const sortedAvg = [...targetChannels].sort((a, b) => (b.avg_views_raw || 0) - (a.avg_views_raw || 0));

  // Top Movers (breakout drops in period)
  const allPeriodDrops = [];
  targetChannels.forEach(ch => {
    const en = _enrichCache[ch.id];
    if (en && en.vids) {
      en.vids.forEach(v => {
        const pub = v.published_at || v.date;
        const ts = pub ? new Date(pub).getTime() : 0;
        const days = Math.max(1, (Date.now() - ts) / 864e5);
        if (reportPeriod === '30d' && days > 30) return;
        if (reportPeriod === '90d' && days > 90) return;
        const vel = raceVelOf(v);
        allPeriodDrops.push({
          title: v.title,
          url: v.url,
          chName: ch.name,
          views: parseInt(v.view_count ?? v.views_raw ?? 0),
          vel: Math.round(vel),
          publishedAt: pub
        });
      });
    }
  });
  allPeriodDrops.sort((a, b) => b.vel - a.vel);

  // Topics
  const hotTopics = [..._topicCache.topics.values()].sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0)).slice(0, 5);
  const { gaps, moats } = computeTopicGaps(primary?.id);

  return {
    generatedAt: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    periodLabel: reportPeriod === '30d' ? 'Last 30 Days' : reportPeriod === '90d' ? 'Last 90 Days' : 'All-Time (6-Month Horizon)',
    primary,
    channels: targetChannels,
    sortedSubs,
    sortedViews,
    sortedAvg,
    breakoutDrops: allPeriodDrops.slice(0, 5),
    hotTopics,
    gaps: gaps.slice(0, 3),
    moats: moats.slice(0, 3)
  };
}

function renderReportPreview() {
  const container = document.getElementById('reportPreviewContainer');
  if (!container) return;

  const data = generateReportData();
  const primary = data.primary;
  const myRankSubs = data.sortedSubs.findIndex(c => c.id === primary?.id) + 1;
  const myRankAvg = data.sortedAvg.findIndex(c => c.id === primary?.id) + 1;

  container.innerHTML = `
    <div class="rep-paper">
      <!-- Cover / Header -->
      <div class="rep-cover">
        <div>
          <div class="rep-title">Executive Competitor Intelligence Brief</div>
          <div class="rep-sub">Generated on ${data.generatedAt} • Scope: <strong>${data.periodLabel}</strong> (${data.channels.length} channels analyzed)</div>
        </div>
        <div style="text-align:right">
          <span class="badge bdg-gd" style="font-size:11px">Focus: ${esc(primary?.name || 'Primary')}</span>
        </div>
      </div>

      <!-- Executive KPI Cards -->
      <div class="rep-kpi-grid">
        <div class="rep-kpi-card">
          <div class="rep-kpi-lbl">Subscriber Rank</div>
          <div class="rep-kpi-val" style="color:var(--me)">#${myRankSubs} of ${data.channels.length}</div>
          <div style="font-size:10.5px;color:var(--t3);margin-top:2px">${esc(primary?.subscribers || '—')} total subs</div>
        </div>
        <div class="rep-kpi-card">
          <div class="rep-kpi-lbl">Avg View Efficiency</div>
          <div class="rep-kpi-val" style="color:var(--up)">#${myRankAvg} of ${data.channels.length}</div>
          <div style="font-size:10.5px;color:var(--t3);margin-top:2px">${esc(primary?.avg_views || '—')}/vid</div>
        </div>
        <div class="rep-kpi-card">
          <div class="rep-kpi-lbl">Market Leader</div>
          <div class="rep-kpi-val" style="color:var(--t1)">${esc(data.sortedSubs[0]?.name || '—')}</div>
          <div style="font-size:10.5px;color:var(--t3);margin-top:2px">${esc(data.sortedSubs[0]?.subscribers || '—')} subs</div>
        </div>
        <div class="rep-kpi-card">
          <div class="rep-kpi-lbl">Top Surging Niche</div>
          <div class="rep-kpi-val" style="color:var(--acc)">${esc(data.hotTopics[0]?.topic || 'Cad/Cam')}</div>
          <div style="font-size:10.5px;color:var(--t3);margin-top:2px">${(data.hotTopics[0]?.momentum || 1.8).toFixed(1)}× velocity spike</div>
        </div>
      </div>

      <!-- Head-to-Head Comparative Matrix -->
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:8px">📊 Head-to-Head Performance Matrix</div>
        <div class="rep-table-wrap">
          <table class="rep-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Channel</th>
                <th>Subscribers</th>
                <th>Avg Views</th>
                <th>Total Views</th>
                <th>Videos</th>
                <th>7d Movement</th>
              </tr>
            </thead>
            <tbody>
              ${data.sortedSubs.map((ch, i) => `
                <tr style="${ch.id === primary?.id ? 'background:rgba(245,166,35,0.08);font-weight:700' : ''}">
                  <td style="font-family:var(--f-mono)">#${i + 1}</td>
                  <td>${esc(ch.name)} ${ch.id === primary?.id ? '⭐ (You)' : ''}</td>
                  <td style="font-family:var(--f-mono)">${esc(ch.subscribers)}</td>
                  <td style="font-family:var(--f-mono);color:var(--up)">${esc(ch.avg_views)}</td>
                  <td style="font-family:var(--f-mono)">${esc(ch.total_views)}</td>
                  <td style="font-family:var(--f-mono)">${esc(ch.total_videos)}</td>
                  <td>${renderRankDeltaChip(ch.id)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Breakout Field Movers -->
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:8px">⚡ Top Breakout Competitor Drops in ${data.periodLabel}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${data.breakoutDrops.length ? data.breakoutDrops.map((d, i) => `
            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-3);padding:8px 12px;border-radius:var(--r-s);border:1px solid var(--line-1)">
              <div style="min-width:0;flex:1">
                <div style="font-size:12px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  <span style="font-family:var(--f-mono);color:var(--acc);margin-right:6px">#${i + 1}</span>${esc(d.title)}
                </div>
                <div style="font-size:10.5px;color:var(--t3)">by <strong>${esc(d.chName)}</strong> • ${ago(d.publishedAt)}</div>
              </div>
              <div style="text-align:right;font-family:var(--f-mono);flex-shrink:0;margin-left:12px">
                <div style="font-size:12px;font-weight:700;color:var(--t1)">${fmtN(d.views)} views</div>
                <div style="font-size:10px;color:var(--acc)">${fmtN(d.vel)}/day ⚡</div>
              </div>
            </div>`).join('') : '<div style="font-size:11px;color:var(--t3)">No drops recorded in this timeframe.</div>'}
        </div>
      </div>

      <!-- Topic Moats & Untapped Gaps -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:var(--bg-3);padding:12px;border-radius:var(--r-s);border:1px solid var(--line-1)">
          <div style="font-size:11.5px;font-weight:700;color:var(--up);margin-bottom:6px">🏰 Defensive Moats (You Lead)</div>
          ${data.moats.length ? data.moats.map(m => `
            <div style="font-size:11px;color:var(--t2);margin-bottom:4px">
              • <strong>${esc(m.topic)}</strong>: ${m.myCount} videos (${m.sharePct}% category share)
            </div>`).join('') : '<div style="font-size:11px;color:var(--t3)">No strong content moats established yet.</div>'}
        </div>

        <div style="background:var(--bg-3);padding:12px;border-radius:var(--r-s);border:1px solid var(--line-1)">
          <div style="font-size:11.5px;font-weight:700;color:var(--warn);margin-bottom:6px">⚠️ Untapped Competitor Gaps</div>
          ${data.gaps.length ? data.gaps.map(g => `
            <div style="font-size:11px;color:var(--t2);margin-bottom:4px">
              • <strong>${esc(g.topic)}</strong>: ${g.rivalCount} competitor videos (${fmtN(g.avgViews)} avg views)
            </div>`).join('') : '<div style="font-size:11px;color:var(--t3)">Zero major competitor gaps detected.</div>'}
        </div>
      </div>

      <!-- Automated Strategic Takeaways -->
      <div class="rep-insights-box">
        <div class="rep-insights-title">
          <span class="msi" style="font-size:16px">lightbulb</span> Strategic Intelligence Takeaways
        </div>
        <ul class="rep-insights-list">
          <li><strong>Content Opportunity:</strong> Produce a high-production video targeting <em>"${data.gaps[0]?.topic || data.hotTopics[0]?.topic || 'Topic'}"</em> to capture untapped niche search traffic.</li>
          <li><strong>View Efficiency:</strong> You achieve <strong>${esc(primary?.avg_views || '—')} views per video</strong>, ranking #${myRankAvg} in the tracked competitive field.</li>
          <li><strong>Collision Risk:</strong> Monitor upload windows of <strong>${esc(data.sortedSubs[0]?.name || 'Top Competitor')}</strong> to prevent thumbnail cannibalization.</li>
        </ul>
      </div>
    </div>`;
}

function printReport() {
  window.print();
}

function copyReportMarkdown() {
  const data = generateReportData();
  const primary = data.primary;
  const text = `# 📄 Competitor Intelligence Brief — ${data.generatedAt}
**Period:** ${data.periodLabel}  
**Primary Channel:** ${primary?.name || 'Primary'} (${primary?.subscribers || '—'} subs, ${primary?.avg_views || '—'} avg views)

---

## 📊 Head-to-Head Leaderboard
| # | Channel | Subscribers | Avg Views | Total Views |
|---|---|---|---|---|
${data.sortedSubs.map((c, i) => `| #${i + 1} | ${c.name} ${c.id === primary?.id ? '⭐ (You)' : ''} | ${c.subscribers} | ${c.avg_views} | ${c.total_views} |`).join('\n')}

---

## ⚡ Top Breakout Competitor Drops
${data.breakoutDrops.map((d, i) => `${i + 1}. **${d.title}** (${d.chName}) — ${fmtN(d.views)} views (${fmtN(d.vel)}/day) [Watch](${d.url})`).join('\n')}

---

## 💡 Strategic Takeaways
- **Top Niche Spike:** ${data.hotTopics[0]?.topic || 'N/A'} (${(data.hotTopics[0]?.momentum || 1.8).toFixed(1)}x velocity momentum)
- **Top Untapped Gap:** ${data.gaps[0]?.topic || 'None'}
- **Content Moat:** ${data.moats[0]?.topic || 'None'}
`;

  navigator.clipboard.writeText(text).then(() => {
    toast('Report Markdown copied to clipboard!', 's');
  });
}

function downloadReportHtml() {
  const container = document.getElementById('reportPreviewContainer');
  if (!container) return;
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>YT Tracker Intelligence Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; padding: 40px; }
    .rep-paper { max-width: 800px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .rep-title { font-size: 24px; font-weight: 800; margin-bottom: 4px; }
    .rep-sub { font-size: 13px; color: #64748b; margin-bottom: 24px; }
    .rep-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .rep-kpi-card { background: #f1f5f9; padding: 12px; border-radius: 8px; }
    .rep-kpi-lbl { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .rep-kpi-val { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; }
    .rep-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .rep-table th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #475569; }
    .rep-table td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    .rep-insights-box { background: #f0fdfa; border: 1px solid #99f6e4; padding: 16px; border-radius: 8px; margin-top: 24px; }
  </style>
</head>
<body>
  ${container.innerHTML}
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yt_tracker_report_${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
  toast('HTML report downloaded!', 's');
}

/* ── 5. Shareable State Links & Deep URL Router ───────────────────────────── */
function serializeStateToHash() {
  if (_isDeserializingHash) return;
  const params = new URLSearchParams();

  // Active page
  const activePageEl = document.querySelector('.page.on');
  const pageId = activePageEl ? activePageEl.id.replace('page-', '') : 'dash';
  params.set('view', pageId);

  // Deep dive open
  if (ddChannelId) {
    params.set('dd', ddChannelId);
    if (ddActiveTab) params.set('tab', ddActiveTab);
  }

  // Compare set
  if (compareSet.length) {
    params.set('compare', compareSet.join(','));
  }

  // Metrics & Topic filter
  if (yvfMetric !== 'subscribers_raw') params.set('metric', yvfMetric);
  if (raceTopicFilter) params.set('topic', raceTopicFilter);

  // Report modal
  const reportModal = document.getElementById('reportModal');
  if (reportModal && reportModal.classList.contains('open')) {
    params.set('report', '1');
    params.set('period', reportPeriod);
    params.set('scope', reportScope);
  }

  const hashStr = params.toString();
  if (window.location.hash.slice(1) !== hashStr) {
    history.replaceState(null, '', '#' + hashStr);
  }
}

function deserializeStateFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  _isDeserializingHash = true;

  try {
    const params = new URLSearchParams(hash);
    const view = params.get('view') || 'dash';
    const dd = params.get('dd');
    const tab = params.get('tab');
    const compare = params.get('compare');
    const metric = params.get('metric');
    const topic = params.get('topic');
    const report = params.get('report');
    const period = params.get('period');
    const scope = params.get('scope');

    if (compare) {
      compareSet = compare.split(',').filter(id => all.some(c => c.id === id));
      localStorage.setItem('yt_compare_set', JSON.stringify(compareSet));
      renderCompareTray();
    }

    if (metric) {
      yvfMetric = metric;
    }

    if (topic) {
      raceTopicFilter = topic;
    }

    if (period) reportPeriod = period;
    if (scope) reportScope = scope;

    if (dd && all.some(c => c.id === dd)) {
      openDeepDive(dd, tab || 'overview');
    } else {
      sp(view);
    }

    if (report === '1') {
      openReportModal();
    }
  } catch { }

  _isDeserializingHash = false;
}

function copyShareLink() {
  serializeStateToHash();
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    toast('Shareable dashboard link copied to clipboard!', 's');
  });
}

window.addEventListener('hashchange', () => {
  deserializeStateFromHash();
});
