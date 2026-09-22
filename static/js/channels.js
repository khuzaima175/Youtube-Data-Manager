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
        <div class="empty-ico" style="width:48px;height:48px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <i data-lucide="users" style="width:24px;height:24px;color:var(--text-2)"></i>
        </div>
        <h3 style="font-size:16px;font-weight:600;color:var(--text-1);margin-bottom:8px">No Competitors Tracked</h3>
        <p style="color:var(--text-3);font-size:13px;line-height:1.5;margin-bottom:20px">Add channels in your niche to benchmark your performance and detect audience overlap.</p>
        <button class="btn btn-acc" onclick="toggleAdd()"><i data-lucide="plus" style="width:14px;height:14px"></i> Add Competitor Channel</button>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const primary = all.find(c => c.is_primary);
  const totSubs = all.reduce((s, c) => s + (c.subscribers_raw || 0), 0);
  const totViews = all.reduce((s, c) => s + (c.total_views_raw || 0), 0);
  const myShare = (primary && totSubs > 0) ? (((primary.subscribers_raw || 0) / totSubs) * 100).toFixed(1) + '%' : '—';

  if (summaryStrip) {
    summaryStrip.innerHTML = `
      <div class="reveal" style="--i: 0;font-size:13px;color:var(--text-2);margin-bottom:16px">
        Cohort: <strong>${all.length} channels</strong> · <strong>${fmtN(totSubs)}</strong> combined subs · <strong>${fmtN(totViews)}</strong> views · your share <strong>${myShare}</strong>
      </div>`;
  }

  const sorted = [...all].sort((a, b) => {
    if (chSort === 'threat_score') {
      const tA = calcThreatScore(a.id, primary?.id).score;
      const tB = calcThreatScore(b.id, primary?.id).score;
      return tB - tA;
    }
    return (b[chSort] || 0) - (a[chSort] || 0);
  });

  const filtered = chFilterQuery
    ? sorted.filter(c => (c.name || '').toLowerCase().includes(chFilterQuery.toLowerCase()) || (c.handle || '').toLowerCase().includes(chFilterQuery.toLowerCase()))
    : sorted;

  el.innerHTML = `
    <!-- Table Filter Input -->
    <div class="bench-toolbar reveal" style="--i: 1;display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div class="bench-search-box" style="flex:1;max-width:320px;position:relative">
        <i data-lucide="search" style="width:14px;height:14px;color:var(--text-3);position:absolute;left:10px;top:50%;transform:translateY(-50%)"></i>
        <input type="text" style="width:100%;padding:7px 10px 7px 32px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);color:var(--text-1);font-size:12.5px;outline:none" placeholder="Filter tracked channels…" value="${esc(chFilterQuery)}" oninput="filterCompetitorGrid(this.value)">
      </div>
    </div>

    <!-- Linear-grade Benchmark Table -->
    <div class="card reveal" style="--i: 2;padding:0;overflow:hidden">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:48px;text-align:center">#</th>
            <th style="min-width:200px">Channel</th>
            <th class="sortable num" onclick="setChSort('subscribers_raw')" data-tip="subscribers" style="min-width:110px">Subscribers ▾</th>
            <th class="sortable num" onclick="setChSort('avg_views_raw')" data-tip="avg_views" style="min-width:110px">Avg Views ▾</th>
            <th class="sortable num" onclick="setChSort('total_views_raw')" style="min-width:110px">Total Views ▾</th>
            <th style="text-align:center;width:100px" data-tip="views_velocity">Last 30 Days</th>
            <th class="sortable" onclick="setChSort('threat_score')" data-tip="threat_overlap" style="text-align:center;width:100px">Overlap ▾</th>
            <th style="text-align:center;width:48px"></th>
          </tr>
        </thead>
        <tbody id="benchTableBody">
          ${filtered.map((ch, i) => renderBenchmarkRow(ch, i, primary)).join('')}
        </tbody>
      </table>
    </div>
    ${renderFieldPulseRow()}
    ${renderCompetitorActivityFeed()}`;

  if (window.lucide) window.lucide.createIcons();

  if (window.Reveal && typeof window.Reveal.init === 'function') {
    window.Reveal.init();
  }

  // Async load sparklines
  filtered.forEach(async ch => {
    const en = await enrich(ch.id);
    const spEl = document.getElementById(`bench-spark-${ch.id}`);
    if (spEl) {
      if (en && en.sp30 && en.sp30.length) {
        spEl.innerHTML = sparkSVG(en.sp30, 80, 18, ch.is_primary ? 'var(--accent)' : '#8b919b');
      } else {
        spEl.innerHTML = '<span style="color:var(--text-3);font-size:11px">—</span>';
      }
    }
  });
}

function filterCompetitorGrid(val) {
  chFilterQuery = (val || '').trim();
  renderChannels();
}

function renderBenchmarkRow(ch, i, primary) {
  const isMine = ch.is_primary;
  const col = isMine ? 'var(--accent)' : '#8b919b';
  
  const threat = calcThreatScore(ch.id, primary?.id);
  const threatScore = threat.score;

  return `
    <tr class="bench-row" style="cursor:pointer" onclick="openDeepDive('${esc(ch.id)}')">
      <td style="font-size:12px;color:var(--text-3);text-align:center">
        #${i + 1}
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          ${ch.logo_url
            ? `<img src="${esc(proxyImg(ch.logo_url))}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0" alt="">`
            : `<div style="width:28px;height:28px;border-radius:50%;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">${(ch.name || '?')[0]}</div>`}
          <div style="min-width:0">
            <div style="font-weight:500;font-size:13px;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${esc(ch.name)} ${isMine ? '<span style="font-size:11px;color:var(--accent);margin-left:4px">(Your channel)</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${esc(ch.handle || '')} ${ch.country ? `· ${esc(ch.country)}` : ''}
            </div>
          </div>
        </div>
      </td>
      <td class="num" style="font-weight:500;color:var(--text-1)">${esc(ch.subscribers)}</td>
      <td class="num" style="color:var(--text-2)">${esc(ch.avg_views)}</td>
      <td class="num" style="color:var(--text-3)">${esc(ch.total_views)}</td>
      <td style="text-align:center">
        <div id="bench-spark-${esc(ch.id)}" style="display:flex;align-items:center;justify-content:center;min-width:80px">
          <div class="skel" style="width:75px;height:14px;border-radius:3px"></div>
        </div>
      </td>
      <td style="text-align:center;font-size:12px;color:var(--text-2)" onclick="event.stopPropagation()">
        ${isMine
          ? `<span style="color:var(--accent)">—</span>`
          : !_topicCache.topics.size
            ? `<span style="color:var(--text-3)">—</span>`
            : `${threatScore}%`}
      </td>
      <td style="text-align:center" onclick="event.stopPropagation()">
        <button class="row-menu-btn" title="Channel options" onclick="showChannelRowMenu(event, '${esc(ch.id)}')">
          <i data-lucide="more-horizontal" style="width:15px;height:15px"></i>
        </button>
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
  if (btn) {
    btn.innerHTML = isHidden 
      ? '<i data-lucide="x" style="width:13px;height:13px"></i> Cancel' 
      : '<i data-lucide="plus" style="width:13px;height:13px"></i> Add Channel';
    if (window.lucide) window.lucide.createIcons();
  }
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
    <div class="card" style="padding:20px;margin-top:16px;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:12px">
          <img src="${esc(proxyImg(d.logo_url))}" style="width:44px;height:44px;border-radius:50%;object-fit:cover" alt="">
          <div>
            <div style="font-size:15px;font-weight:600;color:var(--text-1)">${esc(d.name)}</div>
            <div style="font-size:12px;color:var(--text-3)">${esc(d.handle || '')} ${d.created ? `· Joined ${d.created}` : ''}</div>
          </div>
        </div>
        <button class="btn ${inList ? 'btn-gh' : 'btn-acc'}" onclick="toggleTrackSearchResult('${esc(d.id)}')">
          <i data-lucide="${inList ? 'check' : 'plus'}" style="width:14px;height:14px"></i>
          ${inList ? 'Tracking' : 'Track Channel'}
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        <div class="tile"><span class="lbl">Subscribers</span><span class="val num">${esc(d.subscribers)}</span></div>
        <div class="tile"><span class="lbl">Total Views</span><span class="val num">${esc(d.total_views)}</span></div>
        <div class="tile"><span class="lbl">Videos</span><span class="val num">${esc(d.total_videos)}</span></div>
        <div class="tile"><span class="lbl">Avg Views</span><span class="val num">${esc(d.avg_views)}</span></div>
      </div>

      ${vid.title ? `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;display:flex;gap:12px;align-items:center">
          <img src="${esc(vid.thumb)}" style="width:80px;height:45px;border-radius:4px;object-fit:cover" alt="">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:500;color:var(--text-3)">Latest upload</div>
            <div style="font-size:13px;font-weight:500;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(vid.title)}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">${esc(vid.views)} views · ${vid.date || ''}</div>
          </div>
        </div>` : ''}
    </div>`;

  if (window.lucide) window.lucide.createIcons();
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
    <div class="field-pulse-row" style="margin-top:16px;padding:14px 18px;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--r-md);font-size:13px;color:var(--text-2);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div>
        <span style="color:var(--text-3);font-size:12px">Fastest riser:</span>
        <strong style="color:var(--text-1);font-weight:500;margin-left:4px">${esc(fastestRiser?.name || '—')}</strong>
        <span style="color:var(--text-3);font-size:12px;margin-left:4px">(${esc(fastestRiser?.avg_views || '0')} avg)</span>
      </div>
      <div style="width:1px;height:14px;background:var(--border)"></div>
      <div>
        <span style="color:var(--text-3);font-size:12px">Most active:</span>
        <strong style="color:var(--text-1);font-weight:500;margin-left:4px">${esc(mostActive?.name || '—')}</strong>
        <span style="color:var(--text-3);font-size:12px;margin-left:4px">(${maxVids} uploads)</span>
      </div>
      <div style="width:1px;height:14px;background:var(--border)"></div>
      <div>
        <span style="color:var(--text-3);font-size:12px">Quietest:</span>
        <strong style="color:var(--text-1);font-weight:500;margin-left:4px">${esc(quietest?.name || '—')}</strong>
        <span style="color:var(--text-3);font-size:12px;margin-left:4px">(${maxDays > 0 && maxDays < 900 ? maxDays + 'd ago' : 'inactive'})</span>
      </div>
    </div>`;
}

function renderCompetitorActivityFeed() {
  const competitors = all.filter(c => !c.is_primary);
  if (!competitors.length) return '';

  const drops = [];
  competitors.forEach(ch => {
    const en = _enrichCache[ch.id];
    if (en && en.vids && en.vids.length > 0) {
      en.vids.forEach(vid => {
        drops.push({
          ch,
          vid,
          published: new Date(vid.published_at || vid.date || 0).getTime()
        });
      });
    }
  });

  drops.sort((a, b) => b.published - a.published);
  const topDrops = drops.slice(0, 8);

  return `
    <div class="card" style="margin-top:20px;padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px">
          <i data-lucide="radio" style="width:16px;height:16px;color:var(--accent)"></i>
          <span style="font-size:14px;font-weight:600;color:var(--text-1)">Recent Competitor Drops</span>
        </div>
        <span style="font-size:12px;color:var(--text-3)">Latest videos across tracked niche</span>
      </div>

      ${!topDrops.length ? `
        <div style="color:var(--text-3);font-size:12.5px;padding:24px 0;text-align:center">
          Loading competitor telemetry…
        </div>` : `
        <div style="display:flex;flex-direction:column;gap:4px">
          ${topDrops.map(item => {
            const v = item.vid;
            const ch = item.ch;
            const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
            const pub = item.published;
            const days = Math.max(0.1, (Date.now() - pub) / 864e5);
            const vpd = Math.round(vc / days);

            return `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">
                  <a href="${esc(v.url || `https://www.youtube.com/watch?v=${v.id || v.video_id}`)}" target="_blank" rel="noopener" style="flex-shrink:0">
                    <img src="${esc(proxyImg(v.thumb || v.thumbnail_url || ''))}" style="width:72px;height:40px;border-radius:4px;object-fit:cover;background:var(--surface-2)" alt="" onerror="this.style.opacity='.3'">
                  </a>
                  <div style="min-width:0">
                    <a href="${esc(v.url || `https://www.youtube.com/watch?v=${v.id || v.video_id}`)}" target="_blank" rel="noopener" style="font-size:13px;font-weight:500;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;text-decoration:none" title="${esc(v.title)}">
                      ${esc(v.title)}
                    </a>
                    <div style="font-size:11.5px;color:var(--text-3);margin-top:2px;display:flex;align-items:center;gap:6px">
                      <span style="color:var(--text-2);font-weight:500;cursor:pointer" onclick="openDeepDive('${esc(ch.id)}')">${esc(ch.name)}</span>
                      <span>·</span>
                      <span class="num">${fmtN(vc)} views</span>
                      <span>·</span>
                      <span style="color:var(--accent);font-weight:500">+${fmtN(vpd)}/d</span>
                      <span>·</span>
                      <span>${ago(v.published_at || v.date)}</span>
                    </div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                  <button class="icon-btn" onclick="openDeepDive('${esc(ch.id)}')" title="Inspect Channel" style="width:28px;height:28px">
                    <i data-lucide="compass" style="width:13px;height:13px"></i>
                  </button>
                  <a class="icon-btn" href="${esc(v.url || `https://www.youtube.com/watch?v=${v.id || v.video_id}`)}" target="_blank" rel="noopener" title="Watch on YouTube" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center">
                    <i data-lucide="external-link" style="width:13px;height:13px"></i>
                  </a>
                </div>
              </div>`;
          }).join('')}
        </div>`}
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
