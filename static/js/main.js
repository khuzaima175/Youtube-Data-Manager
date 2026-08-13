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

/* ── 04. Navigation & Density Controller ──────────────────────────────────── */
function sp(p) {
  closeDeepDive();
  document.querySelectorAll('.page').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('on'));
  const pageEl = document.getElementById('page-' + p);
  const linkEl = document.getElementById('nav-' + p);
  if (pageEl) pageEl.classList.add('on');
  if (linkEl) linkEl.classList.add('on');

  if (p === 'dash') renderDash();
  if (p === 'channels') renderChannels();
  if (p === 'studio') renderStudio();
  if (p === 'search') {
    setTimeout(() => document.getElementById('srInput')?.focus(), 50);
  }
  serializeStateToHash();
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

function openShortcutsModal() {
  document.getElementById('shortcutsModal')?.classList.add('open');
}

function closeShortcutsModal() {
  document.getElementById('shortcutsModal')?.classList.remove('open');
}

/* ── 09. Spotlight Product Tour Engine ────────────────────────────────────── */
let tourCurrentStep = 0;
const tourSteps = [
  {
    target: '#sec-hero',
    lbl: 'Step 1 of 6 • Command Hero Strip',
    title: 'Your Channel Pulse',
    body: 'Monitor live sub targets, next milestone progress, and view velocity metrics in one unified strip.'
  },
  {
    target: '#sec-yvf',
    lbl: 'Step 2 of 6 • You vs Field',
    title: 'Rank Ladder & Benchmarking',
    body: 'Inspect your exact position across the tracked field with automated algorithmic insights.'
  },
  {
    target: '#sec-drops',
    lbl: 'Step 3 of 6 • Latest Drops',
    title: 'Real-time Release Race',
    body: 'See who is publishing what right now, ranked by instant 24h upload velocity.'
  },
  {
    target: '#sec-radar',
    lbl: 'Step 4 of 6 • Topic Intelligence',
    title: 'Niche Topic Heatmap',
    body: 'Discover surge topics, breakout trends, and which competitor owns what keyword niche.'
  },
  {
    target: '#sec-timing',
    lbl: 'Step 5 of 6 • Timing Heatmap',
    title: 'Optimal Release Windows',
    body: 'Find high-viewer activity time slots tailored to your audience to maximize drop performance.'
  },
  {
    target: '#sec-hero',
    lbl: 'Step 6 of 6 • Deep Dive Inspector',
    title: 'Deep Channel Forensics',
    body: 'Click any channel strip or leaderboard row to open 5-tab deep analytics and series detection.'
  }
];

function startSpotlightTour() {
  tourCurrentStep = 0;
  const overlay = document.getElementById('spotlightOverlay');
  const card = document.getElementById('spotlightCard');
  if (overlay) overlay.style.display = 'block';
  if (card) card.style.display = 'block';
  renderTourStep();
}

function renderTourStep() {
  const step = tourSteps[tourCurrentStep];
  if (!step) return;

  const targetEl = document.querySelector(step.target);
  const cardEl = document.getElementById('spotlightCard');

  const lblEl = document.getElementById('spotlightStepLbl');
  const titleEl = document.getElementById('spotlightTitle');
  const bodyEl = document.getElementById('spotlightBody');
  const prevBtn = document.getElementById('tourPrevBtn');
  const nextBtn = document.getElementById('tourNextBtn');

  if (lblEl) lblEl.textContent = step.lbl;
  if (titleEl) titleEl.textContent = step.title;
  if (bodyEl) bodyEl.textContent = step.body;

  if (prevBtn) prevBtn.style.display = tourCurrentStep === 0 ? 'none' : 'block';
  if (nextBtn) nextBtn.textContent = tourCurrentStep === tourSteps.length - 1 ? 'Finish 🎉' : 'Next →';

  if (targetEl && cardEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      const rect = targetEl.getBoundingClientRect();
      const cardTop = Math.min(window.innerHeight - 220, Math.max(80, rect.bottom + 12));
      const cardLeft = Math.min(window.innerWidth - 340, Math.max(20, rect.left));
      cardEl.style.top = cardTop + 'px';
      cardEl.style.left = cardLeft + 'px';
    }, 150);
  }
}

function nextTourStep() {
  if (tourCurrentStep < tourSteps.length - 1) {
    tourCurrentStep++;
    renderTourStep();
  } else {
    skipTour();
  }
}

function prevTourStep() {
  if (tourCurrentStep > 0) {
    tourCurrentStep--;
    renderTourStep();
  }
}

function switchHelpTab(tab) {
  const isShortcuts = tab === 'shortcuts';
  document.getElementById('helpTabShortcuts')?.classList.toggle('on', isShortcuts);
  document.getElementById('helpTabGlossary')?.classList.toggle('on', !isShortcuts);
  const p1 = document.getElementById('helpPanelShortcuts');
  const p2 = document.getElementById('helpPanelGlossary');
  if (p1) p1.style.display = isShortcuts ? 'flex' : 'none';
  if (p2) p2.style.display = !isShortcuts ? 'flex' : 'none';
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
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    sp('search');
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCommandPalette();
    return;
  }

  if (e.key === '?' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    openShortcutsModal();
    return;
  }

  if (e.key === '[' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    setDensity('compact');
    return;
  }

  if (e.key === ']' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
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
    closeSearchSuggestions();
    closeAddSuggestions();
    closeNavOverflow();
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
