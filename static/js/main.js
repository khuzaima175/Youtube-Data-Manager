/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — MAIN BOOTSTRAP, ROUTING & WAYFINDING
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── 04. Navigation ───────────────────────────────────────────────────────── */
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
          <span class="msi" style="font-size:16px">${a.icon}</span>
          <span style="flex:1">${esc(a.title)}</span>
        </div>`;
    });
  }

  if (!channels.length && !actions.length) {
    html = '<div style="color:var(--t3);padding:24px;text-align:center">No matching channels or commands.</div>';
  }

  listEl.innerHTML = html;

  listEl.querySelectorAll('.cmd-item').forEach(item => {
    item.addEventListener('click', () => executeCmdItem(item, actions));
  });
}

function executeCmdItem(item, actions) {
  closeCommandPalette();
  const type = item.dataset.type;
  if (type === 'channel') {
    openDeepDive(item.dataset.id);
  } else if (type === 'action') {
    const idx = parseInt(item.dataset.index);
    if (actions[idx]) actions[idx].action();
  }
}

document.getElementById('cmdInp')?.addEventListener('input', e => {
  renderCommandPalette(e.target.value);
});

document.getElementById('cmdInp')?.addEventListener('keydown', e => {
  const listEl = document.getElementById('cmdList');
  const items = listEl ? [...listEl.querySelectorAll('.cmd-item')] : [];
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdIndex = (cmdIndex + 1) % items.length;
    items.forEach((it, i) => it.classList.toggle('selected', i === cmdIndex));
    items[cmdIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdIndex = (cmdIndex - 1 + items.length) % items.length;
    items.forEach((it, i) => it.classList.toggle('selected', i === cmdIndex));
    items[cmdIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (items[cmdIndex]) items[cmdIndex].click();
  }
});

function openShortcutsModal() {
  document.getElementById('scOvrl')?.classList.add('open');
  document.getElementById('scModal')?.classList.add('open');
}

function closeShortcutsModal() {
  document.getElementById('scOvrl')?.classList.remove('open');
  document.getElementById('scModal')?.classList.remove('open');
}

/* ── W1.1 Section Scroll-Spy ──────────────────────────────────────────────── */
let _isClickScrolling = false;
let _clickScrollTimer = null;

function setupDashScrollSpy() {
  const sections = ['sec-hero', 'sec-yvf', 'sec-drops', 'sec-radar', 'sec-lb', 'sec-vel', 'sec-timing', 'sec-recent'];
  const items = document.querySelectorAll('#dashSpyRail .dash-spy-item');
  if (!items.length) return;

  const onScroll = () => {
    if (_isClickScrolling) return; // Don't fight deliberate dot click target during smooth scroll

    const winHeight = window.innerHeight;
    const focalY = winHeight * 0.35; // Target focal line 35% from viewport top

    let closestSec = sections[0];
    let minDistance = Infinity;

    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Calculate center of the visible element relative to focal line
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

  // Set click-scroll lock so smooth scrolling animation doesn't jitter
  _isClickScrolling = true;
  clearTimeout(_clickScrollTimer);
  _clickScrollTimer = setTimeout(() => { _isClickScrolling = false; }, 650);

  // Instantly highlight target dot for crisp user feedback
  const items = document.querySelectorAll('#dashSpyRail .dash-spy-item');
  items.forEach(it => it.classList.toggle('on', it.dataset.sec === id));

  const top = el.getBoundingClientRect().top + window.scrollY - 75;
  window.scrollTo({ top, behavior: 'smooth' });
}

/* ── W1.2 Metric Glossary / Help Modal ─────────────────────────────────────── */
function switchHelpTab(tab) {
  const isShortcuts = tab === 'shortcuts';
  document.getElementById('helpTabShortcuts')?.classList.toggle('on', isShortcuts);
  document.getElementById('helpTabGlossary')?.classList.toggle('on', !isShortcuts);
  const p1 = document.getElementById('helpPanelShortcuts');
  const p2 = document.getElementById('helpPanelGlossary');
  if (p1) p1.style.display = isShortcuts ? 'flex' : 'none';
  if (p2) p2.style.display = !isShortcuts ? 'flex' : 'none';
}

/* ── W1.3 Spotlight Onboarding Tour ───────────────────────────────────────── */
let tourCurrentStep = 0;
const tourSteps = [
  {
    target: '#compareTray',
    lbl: 'Step 1 of 6 • Compare Tray',
    title: 'Multi-Channel Compare Tray',
    body: 'Pin up to 5 rival channels here to compare them head-to-head anywhere across the dashboard.'
  },
  {
    target: '#myPulseBtn',
    lbl: 'Step 2 of 6 • My Pulse',
    title: 'Real-Time Health & Cadence',
    body: 'Click your profile pulse icon in the topbar to inspect 7-day views, upload streak, and velocity.'
  },
  {
    target: '#sec-drops',
    lbl: 'Step 3 of 6 • Latest Drops',
    title: 'Latest Drops Race Window',
    body: 'Track newest uploads across the field in 7d/30d/90d windows, ranked by daily view velocity.'
  },
  {
    target: '#sec-radar',
    lbl: 'Step 4 of 6 • Topic Radar',
    title: 'Topic Intelligence & Heat Matrix',
    body: 'Discover what is hot now, detect surging momentum topics, and inspect untapped gaps.'
  },
  {
    target: '#nav-studio',
    lbl: 'Step 5 of 6 • Creator Studio',
    title: 'Title Lab & Content Pipeline',
    body: 'Turn intelligence into high-CTR titles with live 0-100 scoring and manage your production Kanban.'
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

function skipTour() {
  const overlay = document.getElementById('spotlightOverlay');
  const card = document.getElementById('spotlightCard');
  if (overlay) overlay.style.display = 'none';
  if (card) card.style.display = 'none';
  try { localStorage.setItem('yt_tour_completed', '1'); } catch { }
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

  if (e.key === 'Escape') {
    closeDeepDive();
    closeCommandPalette();
    closeShortcutsModal();
    closeSettingsModal();
    closeReportModal();
    closeSearchSuggestions();
    closeAddSuggestions();
    document.getElementById('comparePopover')?.classList.remove('open');
    document.getElementById('bellPopover')?.classList.remove('open');
    document.getElementById('myPulsePopover')?.classList.remove('open');
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
});

(async () => {
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
