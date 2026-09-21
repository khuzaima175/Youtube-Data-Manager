/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — CHANNELS & SEARCH MANAGEMENT ENGINE
   ══════════════════════════════════════════════════════════════════════════════ */

let chFilterQuery = '';

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
      <div class="empty card rev in" style="padding:48px 24px;text-align:center;max-width:540px;margin:40px auto">
        <div class="empty-ico" style="width:48px;height:48px;border-radius:50%;background:var(--bg-3);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <i data-lucide="users" style="width:24px;height:24px;color:var(--t2)"></i>
        </div>
        <h3 style="font-family:var(--f-disp);font-size:18px;font-weight:700;color:var(--t1);margin-bottom:8px">No Competitors Tracked</h3>
        <p style="color:var(--t3);font-size:13px;line-height:1.5;margin-bottom:20px">Add channels in your niche to benchmark your performance and detect audience overlap.</p>
        <button class="btn btn-acc" onclick="toggleAdd()"><i data-lucide="plus" style="width:14px;height:14px"></i> Add Competitor Channel</button>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (summaryStrip) {
    const totSubs = all.reduce((s, c) => s + (c.subscribers_raw || 0), 0);
    const totViews = all.reduce((s, c) => s + (c.total_views_raw || 0), 0);
    const primary = all.find(c => c.is_primary);
    const myShare = (primary && totSubs > 0) ? (((primary.subscribers_raw || 0) / totSubs) * 100).toFixed(1) + '%' : '—';

    summaryStrip.innerHTML = `
      <div class="tile"><span class="lbl">Tracked Cohort</span><span class="val count-val" data-val="${all.length}">${all.length}</span></div>
      <div class="tile"><span class="lbl">Total Audience Reach</span><span class="val count-val" data-val="${totSubs}">${fmtN(totSubs)}</span></div>
      <div class="tile"><span class="lbl">Combined Video Views</span><span class="val count-val" data-val="${totViews}">${fmtN(totViews)}</span></div>
      <div class="tile"><span class="lbl">Your Audience Share</span><span class="val">${myShare}</span></div>`;
  }

  const primary = all.find(c => c.is_primary);
  const sorted = [...all].sort((a, b) => {
    if (chSort === 'threat_score') {
      const tA = calcThreatScore(a.id, primary?.id).score;
      const tB = calcThreatScore(b.id, primary?.id).score;
      return tB - tA;
    }
    return (b[chSort] || 0) - (a[chSort] || 0);
  });

  const maxSubs = Math.max(...all.map(c => c.subscribers_raw || 0), 1);

  const filtered = chFilterQuery
    ? sorted.filter(c => (c.name || '').toLowerCase().includes(chFilterQuery.toLowerCase()) || (c.handle || '').toLowerCase().includes(chFilterQuery.toLowerCase()))
    : sorted;

  el.innerHTML = `
    <!-- Toolbar with instant search filter -->
    <div class="bench-toolbar">
      <div class="bench-search-box">
        <i data-lucide="search" style="width:14px;height:14px;color:var(--t3)"></i>
        <input type="text" placeholder="Filter tracked channels…" value="${esc(chFilterQuery)}" oninput="filterCompetitorGrid(this.value)">
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="race-seg">
          <button class="race-seg-btn ${chSort === 'subscribers_raw' ? 'on' : ''}" onclick="setChSort('subscribers_raw')">Subs</button>
          <button class="race-seg-btn ${chSort === 'avg_views_raw' ? 'on' : ''}" onclick="setChSort('avg_views_raw')">Avg Views</button>
          <button class="race-seg-btn ${chSort === 'total_views_raw' ? 'on' : ''}" onclick="setChSort('total_views_raw')">Total Views</button>
          <button class="race-seg-btn ${chSort === 'threat_score' ? 'on' : ''}" onclick="setChSort('threat_score')">Threat</button>
        </div>
        <button class="btn btn-gh btn-sm" onclick="exportCSV()"><i data-lucide="download" style="width:13px;height:13px"></i> CSV</button>
        <button class="btn btn-gh btn-sm" onclick="refreshAll()"><i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Refresh</button>
        <button class="btn btn-acc btn-sm" onclick="toggleAdd()"><i data-lucide="plus" style="width:13px;height:13px"></i> Track Channel</button>
      </div>
    </div>

    <!-- Linear-grade Benchmark Table -->
    <div class="bench-table-wrap">
      <table class="bench-table">
        <thead>
          <tr>
            <th style="width:40px;text-align:center">#</th>
            <th style="min-width:200px">Channel</th>
            <th onclick="setChSort('subscribers_raw')" style="min-width:140px">Subscribers ▾</th>
            <th onclick="setChSort('avg_views_raw')">Avg Views ▾</th>
            <th onclick="setChSort('total_views_raw')">Total Views ▾</th>
            <th onclick="setChSort('total_videos_raw')">Videos ▾</th>
            <th>30-Day Trend</th>
            <th onclick="setChSort('threat_score')" style="text-align:center">Threat Index ▾</th>
            <th style="text-align:center;width:140px">Actions</th>
          </tr>
        </thead>
        <tbody id="benchTableBody">
          ${filtered.map((ch, i) => renderBenchmarkRow(ch, i, primary, maxSubs)).join('')}
        </tbody>
      </table>
    </div>
    ${renderFieldPulseRow()}`;

  if (window.lucide) window.lucide.createIcons();
  summaryStrip?.querySelectorAll('.count-val').forEach(v => countUp(v, v.dataset.val));

  // Async load sparklines
  filtered.forEach(async ch => {
    const en = await enrich(ch.id);
    const spEl = document.getElementById(`bench-spark-${ch.id}`);
    if (spEl) {
      if (en && en.sp30 && en.sp30.length) {
        spEl.innerHTML = sparkSVG(en.sp30, 80, 18, colorOf(ch));
      } else {
        spEl.innerHTML = '<span style="color:var(--t3);font-size:11px">—</span>';
      }
    }
  });
}

function filterCompetitorGrid(val) {
  chFilterQuery = (val || '').trim();
  renderChannels();
}

function renderBenchmarkRow(ch, i, primary, maxSubs) {
  const isMine = ch.is_primary;
  const col = colorOf(ch);
  const inCompare = compareSet.includes(ch.id) || isMine;
  const subPct = Math.max(4, Math.round(((ch.subscribers_raw || 0) / maxSubs) * 100));
  
  const threat = calcThreatScore(ch.id, primary?.id);
  const threatScore = threat.score;
  const threatCol = threatScore >= 50 ? 'var(--down)' : threatScore >= 25 ? 'var(--warn)' : 'var(--t3)';

  return `
    <tr class="bench-row ${isMine ? 'me' : ''}" onclick="openDeepDive('${esc(ch.id)}')">
      <td style="font-family:var(--f-mono);font-size:11.5px;font-weight:700;color:var(--t3);text-align:center">
        ${i < 3 ? (i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉') : `#${i + 1}`}
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          ${ch.logo_url
            ? `<img src="${esc(proxyImg(ch.logo_url))}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:1.5px solid ${col};flex-shrink:0" alt="">`
            : `<div style="width:30px;height:30px;border-radius:50%;background:var(--bg-3);border:1.5px solid ${col};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${(ch.name || '?')[0]}</div>`}
          <div style="min-width:0">
            <div style="font-weight:600;font-size:13px;color:${isMine ? 'var(--me)' : 'var(--t1)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${esc(ch.name)} ${isMine ? '<span class="badge bdg-gd" style="font-size:9px;margin-left:4px">Primary</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${esc(ch.handle || '')} ${ch.country ? `• ${esc(ch.country)}` : ''}
            </div>
          </div>
        </div>
      </td>
      <td class="bench-bar-cell">
        <div style="font-family:var(--f-mono);font-size:13px;font-weight:700;color:var(--t1)">${esc(ch.subscribers)}</div>
        <div class="bench-bar-bg">
          <div class="bench-bar-fill" style="width:${subPct}%;background:${col}"></div>
        </div>
      </td>
      <td>
        <div style="font-family:var(--f-mono);font-size:13px;font-weight:700;color:var(--t1)">${esc(ch.avg_views)}</div>
      </td>
      <td style="font-family:var(--f-mono);font-size:12.5px;color:var(--t2)">${esc(ch.total_views)}</td>
      <td style="font-family:var(--f-mono);font-size:12.5px;color:var(--t3)">${esc(ch.total_videos)}</td>
      <td>
        <div id="bench-spark-${esc(ch.id)}" style="display:flex;align-items:center;justify-content:center;min-width:80px">
          <div class="skel" style="width:75px;height:16px"></div>
        </div>
      </td>
      <td style="text-align:center" onclick="event.stopPropagation()">
        ${isMine
          ? `<span class="badge bdg-gd" style="font-size:10px">YOU</span>`
          : !_topicCache.topics.size
            ? `<span class="badge bdg-dim" style="font-size:10px">—</span>`
            : `<span class="badge" style="font-size:10px;background:${threatScore >= 50 ? 'rgba(244,63,94,0.12)' : threatScore >= 25 ? 'rgba(245,158,11,0.12)' : 'var(--bg-3)'};color:${threatCol}" title="Shared topics: ${(threat.sharedTopics || []).join(', ') || 'none'}">${threatScore}% overlap</span>`}
      </td>
      <td style="text-align:center" onclick="event.stopPropagation()">
        <div style="display:inline-flex;align-items:center;gap:4px">
          ${!isMine ? `
            <button class="icon-btn" title="Set as Primary Channel" onclick="setPrimary('${esc(ch.id)}')">
              <i data-lucide="star" style="width:13px;height:13px"></i>
            </button>` : ''}
          <button class="icon-btn ${inCompare ? 'active' : ''}" title="Toggle compare tray" onclick="toggleCompare('${esc(ch.id)}')">
            <i data-lucide="git-compare" style="width:13px;height:13px"></i>
          </button>
          <button class="icon-btn" title="Inspect Channel" onclick="openDeepDive('${esc(ch.id)}')">
            <i data-lucide="scan-eye" style="width:13px;height:13px"></i>
          </button>
          ${!isMine ? `
            <button class="icon-btn" title="Delete Channel" style="color:var(--down)" onclick="deleteChannel('${esc(ch.id)}')">
              <i data-lucide="trash-2" style="width:13px;height:13px"></i>
            </button>` : ''}
        </div>
      </td>
    </tr>`;
}

function setChSort(field) {
  chSort = field;
  renderChannels();
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
    <div class="card rev" style="padding:24px;gap:16px">
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
        <div class="tile"><span class="lbl">Subscribers</span><span class="val">${esc(d.subscribers)}</span></div>
        <div class="tile"><span class="lbl">Total Views</span><span class="val">${esc(d.total_views)}</span></div>
        <div class="tile"><span class="lbl">Videos</span><span class="val">${esc(d.total_videos)}</span></div>
        <div class="tile"><span class="lbl">Avg Views</span><span class="val">${esc(d.avg_views)}</span></div>
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

function renderFieldPulseRow() {
  if (!all || all.length < 2) return '';

  let fastestRiser = null, maxAvg = -1;
  let mostActive = null, maxVids = -1;
  let quietest = null, maxDays = -1;
  const now = Date.now();

  all.forEach(ch => {
    const avg = ch.avg_views_raw || 0;
    if (avg > maxAvg) { maxAvg = avg; fastestRiser = ch; }

    const en = _enrichCache[ch.id];
    const nVids = en?.vids?.length || (ch.total_videos_raw || 0);
    if (nVids > maxVids) { maxVids = nVids; mostActive = ch; }

    const lastD = ch.video?.date;
    const days = lastD ? Math.floor((now - new Date(lastD).getTime()) / 864e5) : 999;
    if (days > maxDays && lastD) { maxDays = days; quietest = ch; }
  });

  return `
    <div class="field-pulse-row" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-top:16px;padding:12px 16px;background:var(--bg-2);border:1px solid var(--line-1);border-radius:var(--r-m)">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="ic-tile green"><span class="msi" style="font-size:15px">trending_up</span></span>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:0.04em">Fastest Riser</div>
          <div style="font-size:12px;font-weight:700;color:var(--t1)">${esc(fastestRiser?.name || '—')} <span style="font-size:10.5px;color:var(--up);font-weight:600">(${esc(fastestRiser?.avg_views || '')} avg)</span></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="ic-tile cyan"><span class="msi" style="font-size:15px">bolt</span></span>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:0.04em">Most Active</div>
          <div style="font-size:12px;font-weight:700;color:var(--t1)">${esc(mostActive?.name || '—')} <span style="font-size:10.5px;color:var(--acc);font-weight:600">(${maxVids} vids)</span></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="ic-tile gold"><span class="msi" style="font-size:15px">bedtime</span></span>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:0.04em">Quietest Cohort</div>
          <div style="font-size:12px;font-weight:700;color:var(--t1)">${esc(quietest?.name || '—')} <span style="font-size:10.5px;color:var(--warn);font-weight:600">(${maxDays > 0 && maxDays < 900 ? maxDays + 'd ago' : 'inactive'})</span></div>
        </div>
      </div>
    </div>`;
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
    const r = await apiFetch('/api/channels/search-suggest?q=' + encodeURIComponent(q));
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
