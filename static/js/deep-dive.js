/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — DEEP DIVE FORENSICS ENGINE
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

  achievementsState.inspectionsCount = (achievementsState.inspectionsCount || 0) + 1;
  saveAchievements();
  checkAchievements();

  switchDDTab(tab);
  serializeStateToHash();
}

function closeDeepDive() {
  const ddEl = document.getElementById('page-channel');
  if (ddEl) {
    ddEl.classList.remove('open');
    document.body.style.overflow = '';
  }
  ddChannelId = null;
  serializeStateToHash();
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

  serializeStateToHash();

  if (tab === 'overview') renderDDOverview(ch);
  if (tab === 'videos') renderDDVideos(ch);
  if (tab === 'growth') renderDDGrowth(ch);
  if (tab === 'compare') renderDDCompare(ch);
  if (tab === 'topics') renderDDTopics(ch);
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
  const mKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthVids = allVids.filter(v => (v.published_at || v.date || '').startsWith(mKey));
  const thisMonthViews = thisMonthVids.reduce((s, v) => s + parseInt(v.view_count ?? v.views_raw ?? 0), 0);
  const bestThisMonth = thisMonthVids.sort((a, b) => (b.view_count ?? b.views_raw ?? 0) - (a.view_count ?? a.views_raw ?? 0))[0];

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
                <span style="font-family:var(--f-mono);font-size:10.5px;font-weight:700;color:var(--t3)">#${i + 1}</span>
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
            <span class="dd-health-val" style="color:${(en.streak || 0) >= 3 ? 'var(--up)' : 'var(--t1)'}">
              ${(en.streak || 0) > 0 ? en.streak + ' week' + ((en.streak || 0) !== 1 ? 's' : '') : '—'}
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
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    label: '',
    count: 0,
    startMs: now - (weeks - i) * weekMs
  }));

  vids.forEach(v => {
    const pub = new Date(v.published_at || v.date || 0).getTime();
    if (!pub) return;
    const idx = buckets.findIndex((b, i) => pub >= b.startMs && (i === weeks - 1 || pub < buckets[i + 1].startMs));
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
      data-tip="${b.count} upload${b.count !== 1 ? 's' : ''} (week ${i + 1})" style="cursor:pointer"/>`;
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
  const shorts = allVids.filter(v => isYouTubeShort(v));
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
            <button class="vid-seg-btn ${ddVidFilter === 'all' ? 'on' : ''}"     onclick="setDDVidFilter('all','${esc(ch.id)}')"     title="All videos">All ${allVids.length}</button>
            <button class="vid-seg-btn ${ddVidFilter === 'longform' ? 'on' : ''}" onclick="setDDVidFilter('longform','${esc(ch.id)}')" title="Long-form only">Long-form ${longForm.length}</button>
            <button class="vid-seg-btn ${ddVidFilter === 'shorts' ? 'on' : ''}"   onclick="setDDVidFilter('shorts','${esc(ch.id)}')"   title="Shorts only">Shorts ${shorts.length}</button>
          </div>
          <div class="vid-seg" id="ddVidSortSeg">
            <button class="vid-seg-btn ${ddVidPreset === 'recent' ? 'on' : ''}" onclick="setDDVidSort('recent','${esc(ch.id)}')" title="Newest first">🕒 Newest</button>
            <button class="vid-seg-btn ${ddVidPreset === 'views' ? 'on' : ''}"  onclick="setDDVidSort('views','${esc(ch.id)}')"  title="Most viewed">👁 Most Viewed</button>
            <button class="vid-seg-btn ${ddVidPreset === 'vel' ? 'on' : ''}"    onclick="setDDVidSort('vel','${esc(ch.id)}')"    title="Highest velocity">⚡ Velocity</button>
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
  if (c) flip(c, () => { c.innerHTML = renderDDVideoRows(ddFullVideos || [], f, ddVidPreset, 0, col, chId); });
  updateDDLoadMore(chId, col);
}

function setDDVidSort(s, chId) {
  ddVidPreset = s;
  ddVidPage = 0;
  localStorage.setItem('dd_vid_sort_' + chId, s);
  document.querySelectorAll('#ddVidSortSeg .vid-seg-btn').forEach(b => b.classList.toggle('on', b.textContent.includes(s === 'recent' ? 'Newest' : s === 'views' ? 'Viewed' : 'Velocity')));
  const c = document.getElementById('ddVidListContainer');
  const col = colorOf(all.find(x => x.id === chId) || all[0]);
  if (c) flip(c, () => { c.innerHTML = renderDDVideoRows(ddFullVideos || [], ddVidFilter, s, 0, col, chId); });
  updateDDLoadMore(chId, col);
}

function getDDVidSorted(vids, formatFilter, sortPreset) {
  let list = formatFilter === 'longform' ? vids.filter(v => !isYouTubeShort(v))
    : formatFilter === 'shorts' ? vids.filter(v => isYouTubeShort(v))
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
        <div style="font-size:12.5px;color:var(--t1);line-height:1.5">
          ${focusedCh.id === me.id
      ? `Viewing yourself against the field median. You lead <strong>${sorted.filter(c => (c.subscribers_raw || 0) < (me.subscribers_raw || 0)).length}</strong> competitor channels in total reach.`
      : `<strong>${esc(focusedCh.name)}</strong> currently has <strong>${esc(focusedCh.subscribers)}</strong> subscribers (${(focusedCh.subscribers_raw || 0) > (me.subscribers_raw || 0) ? 'leading you by ' + fmtN((focusedCh.subscribers_raw || 0) - (me.subscribers_raw || 0)) : 'trailing you by ' + fmtN((me.subscribers_raw || 0) - (focusedCh.subscribers_raw || 0))}) with <strong>${esc(focusedCh.avg_views)}</strong> average views per video.`}
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   PHASE 9: STUDIO (TITLE LAB, IDEA GENERATOR, PIPELINE KANBAN)
   ══════════════════════════════════════════════════════════════════════════════ */

let studioSubTab = 'lab'; // 'lab' | 'pipeline'
let titleLabDraft = 'How EUV Lithography Works: The Secret to 2nm Chips (Explained)';
let pipelineCards = [];
let pipelineIdeaFilter = 'all';

try {
  const stored = localStorage.getItem('yt_pipeline_cards');
  pipelineCards = stored ? JSON.parse(stored) : [
    { id: 'card-1', title: 'Why GD&T Tolerances Fail in High Volume Production', topic: 'gdt', stage: 'making', score: 94, targetDate: '2026-08-20', notes: 'Focus on CMM inspection pitfalls', createdAt: Date.now() - 3 * 864e5 },
    { id: 'card-2', title: 'EUV Lithography Explained: The Physics of 2nm Chips', topic: 'euv', stage: 'scheduled', score: 98, targetDate: '2026-08-18', notes: 'ASML mirror optics teardown', createdAt: Date.now() - 5 * 864e5 },
    { id: 'card-3', title: 'How Ray Tracing Shaders Really Work Under the Hood', topic: 'ray tracing', stage: 'idea', score: 88, notes: 'BVH traversal walkthrough', createdAt: Date.now() - 1 * 864e5 }
  ];
} catch {
  pipelineCards = [];
}

/* ══════════════════════════════════════════════════════════════════════════════
   T3: DEEP DIVE — TOPICS TAB (5th tab)
   ══════════════════════════════════════════════════════════════════════════════ */

function renderDDTopics(ch) {
  const panel = document.getElementById('ddPanel-topics');
  if (!panel || !ch) return;

  if (!_topicCache.topics.size) {
    buildTopicCache();
  }

  const primaryId = (all.find(c => c.is_primary) || all[0])?.id;
  const myTopics = _topicCache.perChannel.get(ch.id) || new Map();
  const globalTopics = _topicCache.topics;
  const col = colorOf(ch);
  const isMe = ch.is_primary;
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
    const pct = maxChAvg > 0 ? Math.max(4, Math.round(t.avgViews / maxChAvg * 100)) : 4;
    const myStat = myChTopics.get(t.topic);
    const myPct = myStat && maxChAvg > 0 ? Math.max(2, Math.round(myStat.avgViews / maxChAvg * 100)) : 0;
    const mom = globalT?.momentum ?? null;
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
