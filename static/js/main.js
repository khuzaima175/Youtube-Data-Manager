/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — MAIN BOOTSTRAP, ROUTING & WAYFINDING
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── 00. Boot Font Guard (C1: Zero-CLS & Fail-safe Fallback) ─────────────── */
(function initIconGuard() {
  if ('fonts' in document) {
    document.fonts.load('16px "' + ICON_FONT + '"').then(fonts => {
      if (fonts && fonts.length > 0) {
        document.body.classList.add('icons-ready');
      } else {
        document.body.classList.add('icons-fallback');
      }
    }).catch(() => {
      document.body.classList.add('icons-fallback');
    });
    // Fallback safety timer
    setTimeout(() => {
      if (!document.body.classList.contains('icons-ready') && !document.body.classList.contains('icons-fallback')) {
        document.body.classList.add('icons-ready');
      }
    }, 1500);
  } else {
    document.body.classList.add('icons-ready');
  }
})();

/* ── 04. Navigation & Workspace Controller ────────────────────────────────── */
function renderTabSkeleton(p) {
  if (p === 'dash') {
    const el = document.getElementById('dashMain');
    if (!el || el.children.length > 0) return;
    el.innerHTML = `
      <div class="tab-skeleton-grid">
        <!-- Hero Skeleton -->
        <div class="card" style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:76px">
          <div style="display:flex;align-items:center;gap:14px">
            <div class="skel" style="width:44px;height:44px;border-radius:50%"></div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <div class="skel" style="width:140px;height:16px"></div>
              <div class="skel" style="width:220px;height:11px"></div>
            </div>
          </div>
          <div class="skel" style="width:280px;height:38px;border-radius:var(--r-m)"></div>
        </div>

        <!-- 4 KPI Tiles Skeleton -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px">
          <div class="tile" style="min-height:92px"><div class="skel" style="width:70px;height:12px"></div><div class="skel" style="width:110px;height:24px;margin:4px 0"></div><div class="skel" style="width:100%;height:4px"></div></div>
          <div class="tile" style="min-height:92px"><div class="skel" style="width:80px;height:12px"></div><div class="skel" style="width:90px;height:24px;margin:4px 0"></div><div class="skel" style="width:80%;height:10px"></div></div>
          <div class="tile" style="min-height:92px"><div class="skel" style="width:90px;height:12px"></div><div class="skel" style="width:80px;height:24px;margin:4px 0"></div><div class="skel" style="width:60%;height:10px"></div></div>
          <div class="tile" style="min-height:92px"><div class="skel" style="width:100px;height:12px"></div><div class="skel" style="width:70px;height:24px;margin:4px 0"></div><div class="skel" style="width:100%;height:4px"></div></div>
        </div>

        <!-- Chart Skeleton -->
        <div class="card" style="padding:22px;height:340px;display:flex;flex-direction:column;justify-content:space-between">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="skel" style="width:200px;height:18px"></div>
            <div class="skel" style="width:180px;height:28px;border-radius:var(--r-full)"></div>
          </div>
          <div class="skel" style="width:100%;height:230px;border-radius:var(--r-m)"></div>
        </div>

        <!-- Activity 2-Col Skeleton -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:20px">
          <div class="card" style="padding:20px;gap:12px">
            <div class="skel" style="width:140px;height:16px;margin-bottom:4px"></div>
            <div class="skel" style="height:48px;border-radius:var(--r-m)"></div>
            <div class="skel" style="height:48px;border-radius:var(--r-m)"></div>
          </div>
          <div class="card" style="padding:20px;gap:12px">
            <div class="skel" style="width:160px;height:16px;margin-bottom:4px"></div>
            <div class="skel" style="height:48px;border-radius:var(--r-m)"></div>
            <div class="skel" style="height:48px;border-radius:var(--r-m)"></div>
          </div>
        </div>
      </div>`;
  } else if (p === 'channels') {
    const el = document.getElementById('chTbl');
    const strip = document.getElementById('channelsSummaryStrip');
    if (strip && !strip.children.length) {
      strip.innerHTML = `
        <div class="tile" style="min-height:74px"><div class="skel" style="width:70px;height:11px"></div><div class="skel" style="width:50px;height:20px;margin-top:4px"></div></div>
        <div class="tile" style="min-height:74px"><div class="skel" style="width:90px;height:11px"></div><div class="skel" style="width:80px;height:20px;margin-top:4px"></div></div>
        <div class="tile" style="min-height:74px"><div class="skel" style="width:90px;height:11px"></div><div class="skel" style="width:80px;height:20px;margin-top:4px"></div></div>
        <div class="tile" style="min-height:74px"><div class="skel" style="width:90px;height:11px"></div><div class="skel" style="width:60px;height:20px;margin-top:4px"></div></div>`;
    }
    if (el && !el.children.length) {
      el.innerHTML = `
        <div class="tab-skeleton-grid">
          <div class="skel" style="height:44px;border-radius:var(--r-m);width:100%"></div>
          <div class="card" style="padding:0;overflow:hidden">
            <div style="padding:14px;border-bottom:1px solid var(--line-1);display:flex;gap:16px">
              <div class="skel" style="width:40px;height:14px"></div>
              <div class="skel" style="width:160px;height:14px"></div>
              <div class="skel" style="width:120px;height:14px"></div>
              <div class="skel" style="width:100px;height:14px"></div>
            </div>
            <div style="padding:14px;display:flex;flex-direction:column;gap:12px">
              <div class="skel" style="height:36px;border-radius:var(--r-s)"></div>
              <div class="skel" style="height:36px;border-radius:var(--r-s)"></div>
              <div class="skel" style="height:36px;border-radius:var(--r-s)"></div>
              <div class="skel" style="height:36px;border-radius:var(--r-s)"></div>
            </div>
          </div>
        </div>`;
    }
  } else if (p === 'radar') {
    const el = document.getElementById('radarMain');
    if (el && !el.children.length) {
      el.innerHTML = `
        <div class="tab-skeleton-grid">
          <div class="card" style="padding:20px;gap:14px">
            <div class="skel" style="width:240px;height:18px"></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px">
              <div class="skel" style="height:80px;border-radius:var(--r-m)"></div>
              <div class="skel" style="height:80px;border-radius:var(--r-m)"></div>
              <div class="skel" style="height:80px;border-radius:var(--r-m)"></div>
            </div>
          </div>
          <div class="skel" style="height:44px;border-radius:var(--r-m);width:100%"></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:14px">
            <div class="skel" style="height:110px;border-radius:var(--r-l)"></div>
            <div class="skel" style="height:110px;border-radius:var(--r-l)"></div>
            <div class="skel" style="height:110px;border-radius:var(--r-l)"></div>
            <div class="skel" style="height:110px;border-radius:var(--r-l)"></div>
          </div>
        </div>`;
    }
  } else if (p === 'studio') {
    const el = document.getElementById('studioMain');
    if (el && !el.children.length) {
      el.innerHTML = `
        <div class="tab-skeleton-grid">
          <div class="card" style="padding:22px;gap:14px">
            <div style="display:flex;justify-content:space-between"><div class="skel" style="width:200px;height:18px"></div><div class="skel" style="width:80px;height:24px"></div></div>
            <div class="skel" style="width:100%;height:44px;border-radius:var(--r-m)"></div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
              <div class="skel" style="height:40px;border-radius:var(--r-s)"></div>
              <div class="skel" style="height:40px;border-radius:var(--r-s)"></div>
              <div class="skel" style="height:40px;border-radius:var(--r-s)"></div>
              <div class="skel" style="height:40px;border-radius:var(--r-s)"></div>
            </div>
          </div>
        </div>`;
    }
  }
}

function toggleSidebar(forceState) {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;
  const isOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', isOpen);
  if (backdrop) backdrop.classList.toggle('open', isOpen);
  if (isOpen) {
    document.body.style.overflow = 'hidden';
  } else if (!document.getElementById('page-channel')?.classList.contains('open')) {
    document.body.style.overflow = '';
  }
}
window.toggleSidebar = toggleSidebar;

function sp(p) {
  closeDeepDive();
  toggleSidebar(false);
  const inner = document.querySelector('.canvas-body-inner');
  if (inner && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    inner.classList.add('is-transitioning');
    setTimeout(() => {
      _executeSp(p);
      inner.classList.remove('is-transitioning');
    }, 80);
  } else {
    _executeSp(p);
  }
}

function _executeSp(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.sb-nav-item').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.m-nav-item').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.mobile-tab').forEach(x => {
    x.classList.remove('active');
    x.classList.remove('on');
  });

  const pageEl = document.getElementById('page-' + p);
  const sbItem = document.getElementById('sb-nav-' + p);
  const mLinkEl = document.getElementById('m-nav-' + p);
  const mTabEl = document.getElementById('m-tab-' + p);
  const crumbEl = document.getElementById('crumbCurrent');

  const titles = {
    dash: 'Overview',
    channels: 'Competitors',
    radar: 'Topic Opportunities',
    studio: 'Creator Studio',
    search: 'Channel Search'
  };

  if (pageEl) pageEl.classList.add('on');
  if (sbItem) sbItem.classList.add('active');
  if (mLinkEl) mLinkEl.classList.add('on');
  if (mTabEl) {
    mTabEl.classList.add('active');
    mTabEl.classList.add('on');
  }
  if (crumbEl) crumbEl.textContent = titles[p] || 'Overview';

  renderTabSkeleton(p);

  if (p === 'dash') {
    renderDash().then(() => {
      const el = document.getElementById('dashMain');
      if (el) el.classList.add('view-content-ready');
    }).catch(() => {});
  }
  if (p === 'channels') {
    renderChannels().then(() => {
      const el = document.getElementById('chTbl');
      if (el) el.classList.add('view-content-ready');
    }).catch(() => {});
  }
  if (p === 'radar') {
    if (typeof renderTopicRadarPage === 'function') {
      renderTopicRadarPage();
      const el = document.getElementById('radarMain');
      if (el) el.classList.add('view-content-ready');
    } else if (typeof renderTopicRadar === 'function') {
      renderTopicRadar('radarMain');
      const el = document.getElementById('radarMain');
      if (el) el.classList.add('view-content-ready');
    }
  }
  if (p === 'studio') {
    renderStudio();
    const el = document.getElementById('studioMain');
    if (el) el.classList.add('view-content-ready');
  }
  if (p === 'search') {
    setTimeout(() => document.getElementById('srInput')?.focus(), 50);
  }

  if (typeof updateSidebarChannelPill === 'function') updateSidebarChannelPill();
  if (window.lucide && typeof lucide.createIcons === 'function') {
    setTimeout(() => lucide.createIcons(), 20);
  }
  serializeStateToHash();
  const canvasBody = document.getElementById('canvasBody');
  if (canvasBody) canvasBody.scrollTo({ top: 0, behavior: 'instant' });
}

function updateSidebarChannelPill() {
  const primary = all.find(c => c.is_primary) || all[0];
  const avatarEl = document.getElementById('sbChAvatar');
  const nameEl = document.getElementById('sbChName');
  const subsEl = document.getElementById('sbChSubs');
  const badgeEl = document.getElementById('sbBadge');

  if (badgeEl) badgeEl.textContent = all.length;

  if (!primary) {
    if (nameEl) nameEl.textContent = 'No Channel Tracked';
    if (subsEl) subsEl.textContent = 'Click to add';
    return;
  }

  if (avatarEl) {
    avatarEl.innerHTML = primary.logo_url
      ? `<img src="${esc(proxyImg(primary.logo_url))}" alt="">`
      : (primary.name || '?')[0].toUpperCase();
  }
  if (nameEl) nameEl.textContent = primary.name || 'Primary Channel';
  if (subsEl) subsEl.textContent = (primary.subscribers || '0') + ' subs';
}

function toggleChannelPicker(e) {
  if (e) e.stopPropagation();
  const primary = all.find(c => c.is_primary) || all[0];
  if (primary) {
    openDeepDive(primary.id, 'overview');
  } else {
    sp('channels');
  }
}

function setDensity(mode) {
  appDensity = mode;
  try { localStorage.setItem('yt_density', mode); } catch { }
  if (mode === 'compact') {
    document.body.classList.add('density-compact');
    toast('Density: Compact mode', 's');
  } else {
    document.body.classList.remove('density-compact');
    toast('Density: Comfortable mode', 's');
  }
  if (navOverflowOpen) renderNavOverflow();
}

function toggleDensity() {
  setDensity(appDensity === 'compact' ? 'comfortable' : 'compact');
}

/* ── 04b. Top Bar Overflow Menu (⋯) & A11y ────────────────────────────────── */
let navOverflowOpen = false;
let navOverflowIndex = 0;

function toggleNavOverflow(e) {
  if (e) e.stopPropagation();
  navOverflowOpen = !navOverflowOpen;
  const p = document.getElementById('navOverflowPopover');
  const btn = document.getElementById('navOverflowBtn');
  if (!p) return;

  if (navOverflowOpen) {
    renderNavOverflow();
    p.classList.add('open');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    navOverflowIndex = 0;
    setTimeout(() => {
      const items = p.querySelectorAll('.nav-overflow-item');
      if (items[0]) items[0].focus();
    }, 50);
  } else {
    p.classList.remove('open');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  }
}

function closeNavOverflow() {
  navOverflowOpen = false;
  const p = document.getElementById('navOverflowPopover');
  const btn = document.getElementById('navOverflowBtn');
  if (p) p.classList.remove('open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function renderNavOverflow() {
  const p = document.getElementById('navOverflowPopover');
  if (!p) return;

  const isCompact = appDensity === 'compact';

  p.innerHTML = `
    <button class="nav-overflow-item" role="menuitem" onclick="closeNavOverflow();copyShareLink()">
      <span class="msi">share</span>
      <span>Share Workspace Link</span>
    </button>
    <button class="nav-overflow-item" role="menuitem" onclick="closeNavOverflow();openReportModal()">
      <span class="msi">description</span>
      <span>Export Intelligence Report</span>
    </button>
    <button class="nav-overflow-item" role="menuitem" onclick="closeNavOverflow();toggleDataHealthPopover()">
      <span class="msi">monitor_heart</span>
      <span>Data Health & Quota</span>
    </button>
    <div class="nav-overflow-div"></div>
    <button class="nav-overflow-item" role="menuitem" onclick="toggleDensity()">
      <span class="msi">${isCompact ? 'check_box' : 'check_box_outline_blank'}</span>
      <span>Compact Density</span>
      <kbd class="mono" style="margin-left:auto;font-size:10px;color:var(--t3);background:var(--bg-3);padding:1px 4px;border-radius:3px">[ ]</kbd>
    </button>
    <button class="nav-overflow-item" role="menuitem" onclick="closeNavOverflow();openShortcutsModal()">
      <span class="msi">help</span>
      <span>Help & Metric Glossary</span>
      <kbd class="mono" style="margin-left:auto;font-size:10px;color:var(--t3);background:var(--bg-3);padding:1px 4px;border-radius:3px">?</kbd>
    </button>
    <button class="nav-overflow-item" role="menuitem" onclick="closeNavOverflow();startSpotlightTour()">
      <span class="msi">explore</span>
      <span>Replay Product Tour</span>
    </button>
    <div class="nav-overflow-div"></div>
    <button class="nav-overflow-item" role="menuitem" onclick="closeNavOverflow();openSettingsModal()">
      <span class="msi">settings</span>
      <span>Settings & Control Room</span>
    </button>`;

  // Setup keyboard accessibility for overflow menu
  const items = p.querySelectorAll('.nav-overflow-item');
  items.forEach((item, idx) => {
    item.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (idx + 1) % items.length;
        items[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (idx - 1 + items.length) % items.length;
        items[prev]?.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeNavOverflow();
        document.getElementById('navOverflowBtn')?.focus();
      }
    });
  });
}

/* ── 04c. Status Footer Bar & Data Health Inspector ───────────────────────── */
let dataHealthOpen = false;

function updateStatusFooter() {
  try {
    const quotaUsed = typeof getDailyQuota === 'function' ? getDailyQuota() : 0;
    const quotaMax = 10000;
    const pct = Math.min(100, Math.max(1, Math.round((quotaUsed / quotaMax) * 100)));

    const fillEl = document.getElementById('sfQuotaFill');
    const valEl = document.getElementById('sfQuotaVal');
    if (fillEl) {
      fillEl.style.width = pct + '%';
      fillEl.className = 'sf-quota-fill' + (pct > 85 ? ' danger' : pct > 60 ? ' warn' : '');
    }
    if (valEl) {
      valEl.textContent = `${quotaUsed.toLocaleString()} / 10,000u`;
    }

    // Cache & freshness calculation
    const health = typeof getDataHealthReport === 'function' ? getDataHealthReport() : [];
    const freshCount = health.filter(h => !h.isStale).length;
    const totalCount = health.length || (all ? all.length : 0);
    const dotEl = document.getElementById('sfCacheDot');
    const textEl = document.getElementById('sfCacheText');

    if (dotEl) {
      dotEl.className = 'sf-cache-dot' + (freshCount < totalCount ? ' stale' : '');
    }
    if (textEl) {
      textEl.textContent = `cache ${freshCount}/${totalCount} fresh · ⟳ ${ago(lastRefreshedTs)}`;
    }

    const agoEl = document.getElementById('lastUpdatedAgo');
    if (agoEl) {
      agoEl.textContent = ago(lastRefreshedTs);
    }
  } catch (err) {
    console.error('Error updating status footer:', err);
  }
}

function toggleDataHealthPopover(e) {
  if (e) e.stopPropagation();
  dataHealthOpen = !dataHealthOpen;
  const p = document.getElementById('dataHealthPopover');
  if (!p) return;
  if (dataHealthOpen) {
    renderDataHealthPopover();
    p.classList.add('open');
  } else {
    p.classList.remove('open');
  }
}

function renderDataHealthPopover() {
  const list = document.getElementById('dhPopoverList');
  if (!list) return;
  const health = typeof getDataHealthReport === 'function' ? getDataHealthReport() : [];

  if (!health.length) {
    list.innerHTML = '<div style="color:var(--t3);font-size:11.5px;padding:12px 0;text-align:center">No channel caches recorded yet.</div>';
    return;
  }

  list.innerHTML = health.map(h => {
    const isFresh = !h.isStale;
    return `
      <div class="dh-ch-row">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="width:7px;height:7px;border-radius:50%;background:${isFresh ? 'var(--up)' : 'var(--warn)'}"></span>
          <div style="min-width:0">
            <div style="font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(h.name)} ${h.isPrimary ? '⭐' : ''}</div>
            <div style="font-size:10px;color:var(--t3)">${h.vidsCount} videos cached · enriched ${h.ts ? ago(h.ts) : 'never'}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="badge ${isFresh ? 'bdg-gr' : 'bdg-rd'}" style="font-size:9.5px">${isFresh ? 'FRESH' : 'STALE'}</span>
          <button class="icon-btn" style="width:22px;height:22px" onclick="refreshOne('${esc(h.id)}')" title="Force re-enrich">
            <span class="msi" style="font-size:12px">refresh</span>
          </button>
        </div>
      </div>`;
  }).join('');
}

/* ── 05. Compare Tray Engine ──────────────────────────────────────────────── */
function renderCompareTray() {
  const sidebarPill = document.getElementById('sidebarComparePill');
  const sbText = document.getElementById('sbCompareText');
  if (sidebarPill && sbText) {
    if (compareSet.length > 0) {
      sidebarPill.style.display = 'flex';
      sbText.textContent = `Compare (${compareSet.length})`;
    } else {
      sidebarPill.style.display = 'none';
    }
  }

  const chipsEl = document.getElementById('compareTrayChips');
  const popoverList = document.getElementById('comparePopoverList');
  const compareNowWrap = document.getElementById('compareNowWrap');
  if (!chipsEl) return;

  const me = all.find(c => c.is_primary);
  const primaryId = me ? me.id : (all[0]?.id || null);

  const currentSet = new Set(compareSet);
  if (primaryId) currentSet.add(primaryId);

  const displayChannels = all.filter(c => currentSet.has(c.id)).slice(0, 5);

  chipsEl.innerHTML = displayChannels.map(ch => {
    const isMe = ch.is_primary;
    const col = colorOf(ch);
    return `
      <div class="compare-chip ${isMe ? 'chip-me' : ''}" onclick="toggleCompare('${esc(ch.id)}')">
        <span class="dot" style="background:${col}"></span>
        <span>${esc(ch.name.length > 8 ? ch.name.slice(0, 8) + '…' : ch.name)}</span>
        ${!isMe ? '<span class="rm">✕</span>' : ''}
      </div>`;
  }).join('');

  if (popoverList) {
    popoverList.innerHTML = all.map(ch => {
      const checked = currentSet.has(ch.id) ? 'checked' : '';
      const isMe = ch.is_primary;
      return `
        <label class="compare-popover-item">
          <input type="checkbox" ${checked} ${isMe ? 'disabled' : ''} onchange="toggleCompare('${esc(ch.id)}')">
          <span style="color:${colorOf(ch)}">●</span>
          <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ch.name)} ${isMe ? '(You)' : ''}</span>
        </label>`;
    }).join('');
  }

  if (compareNowWrap) {
    compareNowWrap.style.display = displayChannels.length >= 2 ? 'block' : 'none';
  }
}

function filterComparePopover(q) {
  const term = q.toLowerCase();
  document.querySelectorAll('.compare-popover-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(term) ? 'flex' : 'none';
  });
}

function toggleCompare(channelId) {
  const me = all.find(c => c.is_primary);
  if (me && channelId === me.id) return;

  const idx = compareSet.indexOf(channelId);
  if (idx >= 0) {
    compareSet.splice(idx, 1);
  } else {
    if (compareSet.length >= 4) {
      toast('Max 4 rival channels in compare set', 'e');
      return;
    }
    compareSet.push(channelId);
  }
  localStorage.setItem('yt_compare_set', JSON.stringify(compareSet));
  renderCompareTray();
  checkAchievements();
  serializeStateToHash();

  if (document.getElementById('page-dash')?.classList.contains('on')) {
    const tbody = document.getElementById('lbTableBody');
    const primary = all.find(c => c.is_primary) || all[0];
    if (tbody) tbody.innerHTML = renderLeaderboardRows(primary, all);
  }

  if (ddChannelId && ddActiveTab === 'compare') {
    renderDDCompare(all.find(c => c.id === ddChannelId));
  }
}

function toggleComparePopover(event) {
  if (event) event.stopPropagation();
  const p = document.getElementById('comparePopover');
  if (p) p.classList.toggle('open');
}

function openCompareSet() {
  const p = document.getElementById('comparePopover');
  if (p) p.classList.remove('open');
  const me = all.find(c => c.is_primary) || all[0];
  if (me) openDeepDive(me.id, 'compare');
}

/* ── 06. Command Palette & Shortcuts Modal ────────────────────────────────── */
let cmdIndex = 0;

function openCommandPalette() {
  const ovrl = document.getElementById('cmdOvrl');
  const pal = document.getElementById('cmdPal');
  const inp = document.getElementById('cmdInp');
  if (ovrl) ovrl.classList.add('open');
  if (pal) pal.classList.add('open');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
  renderCommandPalette('');
}

function closeCommandPalette() {
  document.getElementById('cmdOvrl')?.classList.remove('open');
  document.getElementById('cmdPal')?.classList.remove('open');
}

function renderCommandPalette(query) {
  const listEl = document.getElementById('cmdList');
  if (!listEl) return;
  const q = query.toLowerCase().trim();

  const channels = all.filter(c => c.name.toLowerCase().includes(q) || (c.handle || '').toLowerCase().includes(q));
  const actions = [
    { title: 'Go to Dashboard', icon: 'dashboard', action: () => sp('dash') },
    { title: 'Go to My Channels', icon: 'subscriptions', action: () => sp('channels') },
    { title: 'Go to Studio (Title Lab & Kanban)', icon: 'movie_filter', action: () => sp('studio') },
    { title: 'Generate Intelligence Report (PDF / Markdown)', icon: 'description', action: () => openReportModal() },
    { title: 'Toggle Compact / Comfortable Density', icon: 'view_compact', action: () => toggleDensity() },
    { title: 'Data Health & Cache Inspector', icon: 'monitor_heart', action: () => toggleDataHealthPopover() },
    { title: 'Copy Shareable Dashboard State Link', icon: 'share', action: () => copyShareLink() },
    { title: 'My Channel Pulse & Achievements', icon: 'person', action: () => toggleMyPulse() },
    { title: 'Settings & Control Room', icon: 'settings', action: () => openSettingsModal() },
    { title: 'Search YouTube Channels', icon: 'search', action: () => sp('search') },
    { title: 'Export Channels as CSV', icon: 'download', action: () => exportCSV() },
    { title: 'Refresh All Data', icon: 'refresh', action: () => refreshAll() },
    { title: 'Keyboard Shortcuts Cheat Sheet', icon: 'help', action: () => openShortcutsModal() },
  ].filter(a => a.title.toLowerCase().includes(q));

  cmdIndex = 0;
  let html = '';

  if (channels.length) {
    html += '<div class="cmd-group-label">Channels</div>';
    channels.slice(0, 5).forEach((ch, i) => {
      html += `
        <div class="cmd-item ${i === 0 ? 'selected' : ''}" data-type="channel" data-id="${esc(ch.id)}">
          <span style="color:${colorOf(ch)}">●</span>
          <span style="flex:1">${esc(ch.name)}</span>
          <span style="font-family:var(--f-mono);font-size:11px;color:var(--t3)">${esc(ch.subscribers)}</span>
        </div>`;
    });
  }

  if (actions.length) {
    html += '<div class="cmd-group-label">Actions</div>';
    actions.forEach((a, i) => {
      const isSelected = !channels.length && i === 0;
      html += `
        <div class="cmd-item ${isSelected ? 'selected' : ''}" data-type="action" data-index="${i}">
          <span class="msi" style="font-size:16px;color:var(--t3)">${a.icon}</span>
          <span style="flex:1">${esc(a.title)}</span>
        </div>`;
    });
  }

  if (!channels.length && !actions.length) {
    html = '<div style="padding:24px;text-align:center;color:var(--t3)">No results found.</div>';
  }

  listEl.innerHTML = html;

  listEl.querySelectorAll('.cmd-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.type;
      if (type === 'channel') {
        openDeepDive(item.dataset.id);
        closeCommandPalette();
      } else if (type === 'action') {
        actions[parseInt(item.dataset.index)]?.action();
        closeCommandPalette();
      }
    });
  });
}

document.getElementById('cmdInp')?.addEventListener('input', e => {
  renderCommandPalette(e.target.value);
});

document.getElementById('cmdInp')?.addEventListener('keydown', e => {
  const items = document.querySelectorAll('.cmd-item');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[cmdIndex]?.classList.remove('selected');
    cmdIndex = (cmdIndex + 1) % items.length;
    items[cmdIndex]?.classList.add('selected');
    items[cmdIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[cmdIndex]?.classList.remove('selected');
    cmdIndex = (cmdIndex - 1 + items.length) % items.length;
    items[cmdIndex]?.classList.add('selected');
    items[cmdIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    items[cmdIndex]?.click();
  } else if (e.key === 'Escape') {
    closeCommandPalette();
  }
});

function openShortcutsModal(tab = 'shortcuts') {
  document.getElementById('scModal')?.classList.add('open');
  document.getElementById('scOvrl')?.classList.add('open');
  switchHelpTab(tab);
}

function closeShortcutsModal() {
  document.getElementById('scModal')?.classList.remove('open');
  document.getElementById('scOvrl')?.classList.remove('open');
}

function renderGlossaryList(query = '') {
  const container = document.getElementById('glossaryTermsList');
  if (!container || !window.GLOSSARY) return;

  const q = (query || '').toLowerCase().trim();
  const entries = Object.entries(window.GLOSSARY);

  const filtered = q
    ? entries.filter(([k, v]) =>
        v.title.toLowerCase().includes(q) ||
        v.p.toLowerCase().includes(q) ||
        (v.category && v.category.toLowerCase().includes(q)) ||
        (v.calc && v.calc.toLowerCase().includes(q))
      )
    : entries;

  if (!filtered.length) {
    container.innerHTML = `<div style="text-align:center;padding:24px 12px;color:var(--text-3);font-size:12px">No metrics or terms matching "${esc(query)}"</div>`;
    return;
  }

  const categories = {};
  filtered.forEach(([key, term]) => {
    const cat = term.category || 'General';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ key, ...term });
  });

  let html = '';
  for (const [catName, items] of Object.entries(categories)) {
    html += `
      <div style="margin-top:6px;margin-bottom:4px">
        <div style="font-size:11px;font-weight:600;color:var(--text-3);margin-bottom:6px">${esc(catName)}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${items.map(item => `
            <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
                <strong style="color:var(--text-1);font-size:12.5px">${esc(item.title)}</strong>
                <button class="ui-tip-link" onclick="closeShortcutsModal();window.openMetricSheet('${esc(item.key)}')" style="font-size:11px">
                  View formula & guide →
                </button>
              </div>
              <div style="color:var(--text-2);font-size:11.5px;line-height:1.45;margin-bottom:6px">${item.p}</div>
              <div style="font-size:11px;color:var(--text-3);background:var(--surface-1);border:1px solid var(--border);border-radius:var(--r-xs);padding:4px 8px;font-family:var(--f-mono);overflow-x:auto">
                ${esc(item.calc)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();
}

function switchHelpTab(tab) {
  const isShortcuts = tab === 'shortcuts';
  document.getElementById('helpTabShortcuts')?.classList.toggle('on', isShortcuts);
  document.getElementById('helpTabGlossary')?.classList.toggle('on', !isShortcuts);
  const p1 = document.getElementById('helpPanelShortcuts');
  const p2 = document.getElementById('helpPanelGlossary');
  if (p1) p1.style.display = isShortcuts ? 'flex' : 'none';
  if (p2) {
    p2.style.display = !isShortcuts ? 'flex' : 'none';
    if (!isShortcuts) {
      renderGlossaryList(document.getElementById('glossarySearchInput')?.value || '');
    }
  }
}

/* ── W1.1 Section Scroll-Spy (Dots-Only Default, Focal Point Tracking) ──────── */
let _isClickScrolling = false;
let _clickScrollTimer = null;

function setupDashScrollSpy() {
  const sections = ['sec-hero', 'sec-yvf', 'sec-drops', 'sec-radar', 'sec-lb', 'sec-vel', 'sec-timing', 'sec-recent'];
  const items = document.querySelectorAll('#dashSpyRail .dash-spy-item');
  if (!items.length) return;

  const onScroll = () => {
    if (_isClickScrolling) return;

    const winHeight = window.innerHeight;
    const focalY = winHeight * 0.35;

    let closestSec = sections[0];
    let minDistance = Infinity;

    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        const elemCenter = (rect.top + rect.bottom) / 2;
        const distance = Math.abs(elemCenter - focalY);

        if (distance < minDistance) {
          minDistance = distance;
          closestSec = id;
        }
      }
    });

    items.forEach(it => {
      it.classList.toggle('on', it.dataset.sec === closestSec);
    });
  };

  window.removeEventListener('scroll', window._dashScrollSpyFn || (() => { }));
  window._dashScrollSpyFn = onScroll;
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;

  _isClickScrolling = true;
  clearTimeout(_clickScrollTimer);
  _clickScrollTimer = setTimeout(() => { _isClickScrolling = false; }, 650);

  const items = document.querySelectorAll('#dashSpyRail .dash-spy-item');
  items.forEach(it => it.classList.toggle('on', it.dataset.sec === id));

  const top = el.getBoundingClientRect().top + window.scrollY - 75;
  window.scrollTo({ top, behavior: 'smooth' });
}

/* ── 10. Global Shortcuts & Init ──────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
    if (e.key === 'Escape') {
      document.activeElement.blur();
    }
    return;
  }

  if (e.key === '1') {
    e.preventDefault();
    sp('dash');
    return;
  }

  if (e.key === '2') {
    e.preventDefault();
    sp('channels');
    return;
  }

  if (e.key === '3') {
    e.preventDefault();
    sp('radar');
    return;
  }

  if (e.key === '4') {
    e.preventDefault();
    sp('studio');
    return;
  }

  if (e.key === '/') {
    e.preventDefault();
    sp('search');
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCommandPalette();
    return;
  }

  if (e.key === '?') {
    e.preventDefault();
    openShortcutsModal();
    return;
  }

  if (e.key === '[') {
    e.preventDefault();
    setDensity('compact');
    return;
  }

  if (e.key === ']') {
    e.preventDefault();
    setDensity('comfortable');
    return;
  }

  if (e.key === 'Escape') {
    closeDeepDive();
    closeCommandPalette();
    closeShortcutsModal();
    closeSettingsModal();
    closeReportModal();
    if (typeof closeAiSynthesizerModal === 'function') closeAiSynthesizerModal();
    closeSearchSuggestions();
    closeAddSuggestions();
    closeNavOverflow();
    skipTour();
    document.getElementById('comparePopover')?.classList.remove('open');
    document.getElementById('bellPopover')?.classList.remove('open');
    document.getElementById('myPulsePopover')?.classList.remove('open');
    document.getElementById('dataHealthPopover')?.classList.remove('open');
    dataHealthOpen = false;
  }
});

document.addEventListener('click', e => {
  const path = e.composedPath ? e.composedPath() : [];

  const p = document.getElementById('comparePopover');
  const btn = document.getElementById('compareAddBtn');
  if (p && p.classList.contains('open') && !p.contains(e.target) && !path.includes(p) && e.target !== btn && !path.includes(btn)) {
    p.classList.remove('open');
  }

  const bp = document.getElementById('bellPopover');
  const bBtn = document.getElementById('bellBtn');
  if (bp && bp.classList.contains('open') && !bp.contains(e.target) && !path.includes(bp) && e.target !== bBtn && !path.includes(bBtn)) {
    bp.classList.remove('open');
  }

  const mp = document.getElementById('myPulsePopover');
  const mpBtn = document.getElementById('myPulseBtn');
  if (mp && mp.classList.contains('open') && !mp.contains(e.target) && !path.includes(mp) && e.target !== mpBtn && !path.includes(mpBtn)) {
    mp.classList.remove('open');
  }

  const op = document.getElementById('navOverflowPopover');
  const oBtn = document.getElementById('navOverflowBtn');
  if (op && op.classList.contains('open') && !op.contains(e.target) && !path.includes(op) && e.target !== oBtn && !path.includes(oBtn)) {
    closeNavOverflow();
  }

  const dh = document.getElementById('dataHealthPopover');
  const dhBtn = document.getElementById('sfCacheChip');
  if (dh && dh.classList.contains('open') && !dh.contains(e.target) && !path.includes(dh) && e.target !== dhBtn && !path.includes(dhBtn)) {
    dh.classList.remove('open');
    dataHealthOpen = false;
  }
});

(async () => {
  // Update OS-specific button text
  const kbdChip = document.getElementById('topbarKbdLabel');
  if (kbdChip) kbdChip.textContent = kbdShortcutText;
  const sfHint = document.getElementById('sfKbdHint');
  if (sfHint) sfHint.textContent = kbdShortcutText;

  await fetchAll();
  await loadAllSnapshots();
  loadInboxItems();
  checkAchievements();
  checkStalenessBanner();
  renderDash();

  deserializeStateFromHash();

  // First run onboarding tour check
  try {
    if (!localStorage.getItem('yt_tour_completed')) {
      setTimeout(() => startSpotlightTour(), 800);
    }
  } catch { }
})();

/* ── 11. Touch Ergonomics & Orientation Handlers (Phase 14) ───────────────── */
let _touchTipTimer = null;

document.addEventListener('touchstart', e => {
  const target = e.target.closest('[data-tip]');
  if (target) {
    const tipText = target.dataset.tip;
    if (tipText) {
      const touch = e.touches[0];
      const x = Math.min(window.innerWidth - 80, Math.max(80, touch.clientX));
      const y = Math.max(40, touch.clientY - 10);
      showTip(tipText, x, y);
      clearTimeout(_touchTipTimer);
      _touchTipTimer = setTimeout(hideTip, 3200);
    }
  } else if (!e.target.closest('.tip')) {
    hideTip();
  }
}, { passive: true });

// Handle mobile orientation changes & resize re-fits
let _resizeDebounce = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeDebounce);
  _resizeDebounce = setTimeout(() => {
    // Re-render chart boxes if active
    const yvfBox = document.getElementById('yvfChartWrap');
    const primary = all.find(c => c.is_primary) || all[0];
    if (yvfBox && primary && typeof drawYvfBarsSvg === 'function') {
      drawYvfBarsSvg(yvfBox, primary, all, yvfMetric, yvfBox.clientWidth, yvfBox.clientHeight);
    }
    if (typeof loadVelocityWithFit === 'function' && document.getElementById('dashVelocity')) {
      loadVelocityWithFit(all);
    }
  }, 200);
});

window.addEventListener('orientationchange', () => {
  hideTip();
  setTimeout(() => {
    if (document.getElementById('page-dash')?.classList.contains('on')) renderDash();
    else if (ddChannelId) switchDDTab(ddActiveTab);
  }, 250);
});
