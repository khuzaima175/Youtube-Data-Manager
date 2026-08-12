/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — CHANNELS & SEARCH MANAGEMENT ENGINE
   ══════════════════════════════════════════════════════════════════════════════ */

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
      <div class="empty card rev in">
        <div class="empty-ico"><span class="msi" style="font-size:24px">subscriptions</span></div>
        <h3 style="font-family:var(--f-disp);font-size:18px;color:var(--t1)">No Channels Tracked</h3>
        <p style="max-width:360px">Add channels to start tracking performance metrics and comparisons.</p>
        <button class="btn btn-acc" onclick="toggleAdd()">+ Add Channel</button>
      </div>`;
    return;
  }

  if (summaryStrip) {
    const totSubs = all.reduce((s, c) => s + (c.subscribers_raw || 0), 0);
    const totViews = all.reduce((s, c) => s + (c.total_views_raw || 0), 0);
    const primary = all.find(c => c.is_primary);
    const myShare = (primary && totSubs > 0) ? (((primary.subscribers_raw || 0) / totSubs) * 100).toFixed(1) + '%' : '—';

    summaryStrip.innerHTML = `
      <div class="tile"><span class="lbl">Tracked</span><span class="val cyan count-val" data-val="${all.length}">${all.length}</span></div>
      <div class="tile"><span class="lbl">Combined Subs</span><span class="val gold count-val" data-val="${totSubs}">${fmtN(totSubs)}</span></div>
      <div class="tile"><span class="lbl">Combined Views</span><span class="val count-val" data-val="${totViews}">${fmtN(totViews)}</span></div>
      <div class="tile"><span class="lbl">Your Share</span><span class="val green">${myShare}</span></div>`;
  }

  const primary = all.find(c => c.is_primary);
  const rivals = all.filter(c => !c.is_primary).sort((a, b) => (b[chSort] || 0) - (a[chSort] || 0));
  const sortedAll = primary ? [primary, ...rivals] : rivals;

  el.innerHTML = `
    <div class="ch-list-dense" id="chListContainer">
      ${sortedAll.map(ch => renderDenseChannelRow(ch)).join('')}
    </div>
    <div class="ghost-add-card" onclick="toggleAdd()">
      <span class="msi">add</span> + Track another channel
    </div>`;

  summaryStrip?.querySelectorAll('.count-val').forEach(v => countUp(v, v.dataset.val));

  sortedAll.forEach(async ch => {
    const en = await enrich(ch.id);
    const spEl = document.getElementById(`row-spark-${ch.id}`);
    const engEl = document.getElementById(`row-eng-${ch.id}`);
    if (spEl) {
      if (en && en.sp30 && en.sp30.length) {
        spEl.innerHTML = sparkSVG(en.sp30, 80, 18, colorOf(ch));
      } else {
        spEl.innerHTML = '<span style="color:var(--t3)">—</span>';
      }
    }
    if (engEl) {
      if (en && en.engagement > 0) {
        engEl.textContent = `${en.engagement}%`;
        engEl.style.color = en.engagement >= 4 ? 'var(--up)' : en.engagement >= 2 ? 'var(--warn)' : 'var(--t2)';
      } else {
        engEl.textContent = '—';
        engEl.style.color = 'var(--t3)';
      }
    }
  });
}

function renderDenseChannelRow(ch) {
  const isMine = ch.is_primary;
  const col = colorOf(ch);
  const inCompare = compareSet.includes(ch.id) || isMine;

  return `
    <div class="ch-row ${isMine ? 'me' : ''}" onclick="openDeepDive('${esc(ch.id)}')">
      <!-- 1. Avatar -->
      <div>
        ${ch.logo_url
      ? `<img class="ch-row-av" src="${esc(proxyImg(ch.logo_url))}" style="border:2px solid ${col}" alt="">`
      : `<div class="ch-row-av" style="background:var(--bg-3);border:2px solid ${col};display:flex;align-items:center;justify-content:center;font-weight:700">${(ch.name || '?')[0]}</div>`}
      </div>

      <!-- 2. Identity -->
      <div class="ch-row-ident">
        <div class="ch-row-name">
          ${esc(ch.name)}
          ${isMine ? '<span class="badge bdg-gd">⭐ Mine</span>' : ''}
        </div>
        <div class="ch-row-sub">
          <span>${esc(ch.handle || '')}</span>
          ${ch.country ? `<span>• ${esc(ch.country)}</span>` : ''}
        </div>
      </div>

      <!-- 3. Sparkline (30-day views) -->
      <div id="row-spark-${esc(ch.id)}" style="display:flex;align-items:center;justify-content:center">
        <div class="skel" style="width:75px;height:16px"></div>
      </div>

      <!-- 4. Subscribers -->
      <div>
        <div style="font-family:var(--f-mono);font-weight:700;color:var(--t1);display:flex;align-items:center;gap:4px">
          ${esc(ch.subscribers)} ${renderRankDeltaChip(ch.id)}
        </div>
        <div style="font-size:10px;color:var(--t3)">subscribers</div>
      </div>

      <!-- 5. Avg Views -->
      <div>
        <div style="font-family:var(--f-mono);font-weight:700;color:var(--up)">${esc(ch.avg_views)}</div>
        <div style="font-size:10px;color:var(--t3)">avg views</div>
      </div>

      <!-- 6. Engagement -->
      <div>
        <div style="font-family:var(--f-mono);font-weight:700;color:var(--t3)" id="row-eng-${esc(ch.id)}">—</div>
        <div style="font-size:10px;color:var(--t3)">engagement</div>
      </div>

      <!-- 7. Last Upload -->
      <div>
        <div style="font-size:11px;color:var(--t2)">${ch.video?.date || '—'}</div>
        <div style="font-size:10px;color:var(--t3)">last upload</div>
      </div>

      <!-- 8. Actions -->
      <div class="ch-row-acts" onclick="event.stopPropagation()">
        ${!isMine ? `<button class="icon-btn" title="Set as My Channel" onclick="setPrimary('${esc(ch.id)}')"><span class="msi" style="font-size:14px">star</span></button>` : ''}
        <button class="icon-btn ${inCompare ? 'active' : ''}" title="Toggle compare" onclick="toggleCompare('${esc(ch.id)}')"><span class="msi" style="font-size:14px">compare_arrows</span></button>
        <button class="icon-btn" title="Refresh" onclick="refreshOne('${esc(ch.id)}')"><span class="msi" style="font-size:14px">refresh</span></button>
        <button class="icon-btn" title="Delete" style="color:var(--down)" onclick="deleteChannel('${esc(ch.id)}')"><span class="msi" style="font-size:14px">delete</span></button>
      </div>
    </div>`;
}

function setChSort(field) {
  chSort = field;
  const container = document.getElementById('chListContainer');
  const primary = all.find(c => c.is_primary);
  const rivals = all.filter(c => !c.is_primary).sort((a, b) => (b[chSort] || 0) - (a[chSort] || 0));
  const sortedAll = primary ? [primary, ...rivals] : rivals;

  if (container) {
    flip(container, () => {
      container.innerHTML = sortedAll.map(ch => renderDenseChannelRow(ch)).join('');
    });
  }
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
    <div class="card rev in" style="padding:22px;gap:16px">
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
        <div class="tile"><span class="lbl">Subscribers</span><span class="val gold">${esc(d.subscribers)}</span></div>
        <div class="tile"><span class="lbl">Total Views</span><span class="val">${esc(d.total_views)}</span></div>
        <div class="tile"><span class="lbl">Videos</span><span class="val cyan">${esc(d.total_videos)}</span></div>
        <div class="tile"><span class="lbl">Avg Views</span><span class="val green">${esc(d.avg_views)}</span></div>
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
    const r = await fetch('/api/channels/search-suggest?q=' + encodeURIComponent(q));
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
