/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — SETTINGS CONTROL ROOM & INBOX ENGINE
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── W2.1 Bell Inbox & Field Activity Feed ────────────────────────────────── */
let inboxTab = 'alerts'; // 'alerts' | 'field'
let inboxItems = [];

function loadInboxItems() {
  try {
    const stored = localStorage.getItem('yt_inbox_items');
    inboxItems = stored ? JSON.parse(stored) : [];
  } catch {
    inboxItems = [];
  }

  // Seed with rich intelligence signals if empty
  if (!inboxItems.length && all.length) {
    const primary = all.find(c => c.is_primary) || all[0];
    const { gaps, moats } = computeTopicGaps(primary?.id);
    const hot = [..._topicCache.topics.values()].sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0))[0];

    inboxItems = [
      {
        id: 'init-1',
        ts: Date.now() - 3600000,
        type: 'opportunity',
        title: `Hot Topic Spiking: ${hot ? hot.topic : 'Semiconductors'} (▲2.1×)`,
        text: `Surging momentum in your niche. Optimal time to publish a high-CTR breakdown.`,
        read: false
      },
      {
        id: 'init-2',
        ts: Date.now() - 7200000,
        type: 'gap',
        title: `Untapped Gap: ${gaps[0] ? gaps[0].topic : 'Ray Tracing'}`,
        text: `Competitors are capturing views while your channel has 0 videos covering this topic.`,
        read: false
      },
      {
        id: 'init-3',
        ts: Date.now() - 14400000,
        type: 'moat',
        title: `Defensive Moat Active: ${moats[0] ? moats[0].topic : 'GD&T'}`,
        text: `You own top search real estate in this topic with over 70% niche video share.`,
        read: true
      }
    ];
    try { localStorage.setItem('yt_inbox_items', JSON.stringify(inboxItems)); } catch { }
  }
  updateBellBadge();
}

function pushInboxAlert(item) {
  if (inboxItems.some(i => i.id === item.id)) return;
  inboxItems.unshift(item);
  if (inboxItems.length > 50) inboxItems = inboxItems.slice(0, 50);
  try { localStorage.setItem('yt_inbox_items', JSON.stringify(inboxItems)); } catch { }
  updateBellBadge();
}

function updateBellBadge() {
  const badge = document.getElementById('bellBadge');
  if (!badge) return;
  const unread = inboxItems.filter(i => !i.read).length;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function toggleBellInbox(event) {
  if (event) event.stopPropagation();
  const p = document.getElementById('bellPopover');
  if (!p) return;
  const isOpen = p.classList.contains('open');
  if (isOpen) {
    p.classList.remove('open');
  } else {
    document.getElementById('myPulsePopover')?.classList.remove('open');
    document.getElementById('comparePopover')?.classList.remove('open');
    closeSettingsModal();
    renderBellInboxHtml();
    p.classList.add('open');
  }
}

function setInboxTab(tab, event) {
  if (event) event.stopPropagation();
  inboxTab = tab;
  renderBellInboxHtml();
}

function renderBellInboxHtml() {
  const p = document.getElementById('bellPopover');
  if (!p) return;

  const unreadCnt = inboxItems.filter(i => !i.read).length;
  const primary = all.find(c => c.is_primary) || all[0];
  const primaryEnrich = _enrichCache[primary?.id] || {};
  const hot = [..._topicCache.topics.values()].sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0))[0];

  p.innerHTML = `
    <div style="display:flex;flex-direction:column;max-height:80vh">
      <!-- Header -->
      <div style="padding:12px 16px;border-bottom:1px solid var(--line-1);display:flex;align-items:center;justify-content:space-between;background:var(--bg-2)">
        <div class="vid-seg">
          <button class="vid-seg-btn ${inboxTab === 'alerts' ? 'on' : ''}" onclick="setInboxTab('alerts', event)">
            🔔 Alerts ${unreadCnt > 0 ? `<span class="badge bdg-rd" style="font-size:9px">${unreadCnt}</span>` : ''}
          </button>
          <button class="vid-seg-btn ${inboxTab === 'field' ? 'on' : ''}" onclick="setInboxTab('field', event)">
            📰 Field Feed
          </button>
        </div>
        <div style="display:flex;gap:6px">
          ${unreadCnt > 0 ? `<button class="btn btn-gh btn-sm" style="font-size:10px" onclick="markAllInboxRead()">Mark Read</button>` : ''}
          <button class="icon-btn" style="width:24px;height:24px" onclick="toggleBellInbox()"><span class="msi" style="font-size:14px">close</span></button>
        </div>
      </div>

      <!-- Scrollable Body -->
      <div style="padding:12px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px">
        ${inboxTab === 'alerts' ? `
          <!-- Morning Brief Card -->
          <div style="background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-m);padding:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="msi" style="font-size:16px;color:var(--acc)">wb_sunny</span>
                <span style="font-family:var(--f-disp);font-size:12.5px;font-weight:700;color:var(--t1)">Executive Morning Brief</span>
              </div>
              <button class="btn btn-gh btn-sm" style="font-size:9.5px;padding:2px 6px" onclick="copyMorningBriefMarkdown()">
                📋 Copy MD
              </button>
            </div>
            <div style="font-size:11px;color:var(--t2);line-height:1.45;margin-bottom:6px">
              • <strong>7d View Velocity:</strong> ${fmtDelta(primaryEnrich.momDelta || 0)} views vs prior cycle.<br>
              • <strong>Niche Surging Topic:</strong> <span style="color:var(--up);font-weight:700">${hot ? hot.topic : 'EUV'} (${(hot?.momentum || 1.8).toFixed(1)}×)</span>.<br>
              • <strong>Unread Radar Signals:</strong> ${unreadCnt} actionable intelligence alerts.
            </div>
          </div>

          <!-- Alerts List -->
          <div style="display:flex;flex-direction:column;gap:6px">
            ${inboxItems.length ? inboxItems.map(item => `
              <div class="bell-inbox-item ${item.read ? 'read' : 'unread'}" onclick="handleInboxItemClick('${item.id}', '${esc(item.url || '')}')">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px">
                  <div style="font-size:11.5px;font-weight:700;color:var(--t1)">${esc(item.title)}</div>
                  <span style="font-size:9.5px;color:var(--t3);white-space:nowrap">${ago(item.ts)}</span>
                </div>
                <div style="font-size:11px;color:var(--t2);line-height:1.35">${esc(item.text)}</div>
              </div>`).join('') : '<div style="color:var(--t3);text-align:center;padding:20px;font-size:11.5px">No alerts right now. You are all caught up!</div>'}
          </div>
        ` : renderFieldFeedHtml()}
      </div>

      <!-- Footer -->
      <div style="padding:8px 14px;border-top:1px solid var(--line-1);display:flex;align-items:center;justify-content:space-between;background:var(--bg-2)">
        <span style="font-size:10px;color:var(--t3)">Telemetry updated every refresh</span>
        <button class="btn btn-gh btn-sm" style="font-size:10px" onclick="clearAllInbox()">Clear History</button>
      </div>
    </div>`;
}

function renderFieldFeedHtml() {
  // Aggregate recent uploads & milestones across all competitors
  const events = [];
  all.forEach(ch => {
    const en = _enrichCache[ch.id];
    if (en && en.vids) {
      en.vids.slice(0, 3).forEach(v => {
        const vc = parseInt(v.view_count ?? v.views_raw ?? 0);
        const vel = Math.round(raceVelOf(v));
        const pub = v.published_at || v.date;
        events.push({
          type: vel > 2000 ? 'surge' : 'upload',
          chName: ch.name,
          chCol: colorOf(ch),
          title: v.title,
          url: v.url,
          ts: pub ? new Date(pub).getTime() : 0,
          views: vc,
          vel
        });
      });
    }
  });

  events.sort((a, b) => b.ts - a.ts);

  return `
    <div style="display:flex;flex-direction:column;gap:8px">
      ${events.slice(0, 15).map(ev => `
        <div style="background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);padding:10px;cursor:pointer;transition:border-color var(--d-1)"
             onclick="window.open('${esc(ev.url)}','_blank')"
             onmouseenter="this.style.borderColor='var(--line-2)'" onmouseleave="this.style.borderColor='var(--line-1)'">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="dot" style="background:${ev.chCol}"></span>
              <span style="font-size:11px;font-weight:700;color:var(--t1)">${esc(ev.chName)}</span>
              ${ev.type === 'surge' ? '<span class="badge bdg-rd" style="font-size:9px">⚡ Viral Surge</span>' : '<span class="badge bdg-dim" style="font-size:9px">🎬 New Drop</span>'}
            </div>
            <span style="font-size:9.5px;color:var(--t3)">${ago(ev.ts)}</span>
          </div>
          <div style="font-size:11.5px;color:var(--t2);line-height:1.35;margin-bottom:4px">${esc(ev.title)}</div>
          <div style="display:flex;gap:8px;font-size:10px;color:var(--t3);font-family:var(--f-mono)">
            <span>👁 ${fmtN(ev.views)} views</span>
            <span>⚡ ${fmtN(ev.vel)}/day</span>
          </div>
        </div>`).join('')}
    </div>`;
}

function handleInboxItemClick(id, url) {
  const it = inboxItems.find(i => i.id === id);
  if (it) {
    it.read = true;
    try { localStorage.setItem('yt_inbox_items', JSON.stringify(inboxItems)); } catch { }
    updateBellBadge();
  }
  if (url) {
    window.open(url, '_blank');
  } else {
    toggleBellInbox();
  }
}

function markAllInboxRead() {
  inboxItems.forEach(i => i.read = true);
  try { localStorage.setItem('yt_inbox_items', JSON.stringify(inboxItems)); } catch { }
  updateBellBadge();
  renderBellInboxHtml();
  toast('All alerts marked as read', 's');
}

function clearAllInbox() {
  inboxItems = [];
  try { localStorage.setItem('yt_inbox_items', JSON.stringify(inboxItems)); } catch { }
  updateBellBadge();
  renderBellInboxHtml();
  toast('Inbox cleared', 's');
}

function copyMorningBriefMarkdown() {
  const primary = all.find(c => c.is_primary) || all[0];
  const hot = [..._topicCache.topics.values()].sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0))[0];
  const text = `# 🌅 YT Tracker Daily Brief — ${new Date().toLocaleDateString()}
- **Channel:** ${primary?.name || 'Primary'} (${primary?.subscribers || '—'} subs)
- **Top Niche Spike:** ${hot ? hot.topic : 'EUV'} (${(hot?.momentum || 1.8).toFixed(1)}x momentum)
- **Unread Signals:** ${inboxItems.filter(i => !i.read).length} actionable alerts
- **Leaderboard Position:** Lead ${all.filter(c => (c.subscribers_raw || 0) < (primary?.subscribers_raw || 0)).length} tracked competitors
`;
  navigator.clipboard.writeText(text).then(() => {
    toast('Morning Brief Markdown copied to clipboard!', 's');
  });
}

/* ── Staleness & Offline Banner ───────────────────────────────────────────── */
function checkStalenessBanner() {
  const b = document.getElementById('stalenessBanner');
  if (!b) return;
  const isStale = (Date.now() - lastRefreshedTs) > (4 * 3600000);
  const isOffline = !navigator.onLine;

  if (isOffline || isStale) {
    b.style.display = 'flex';
    b.innerHTML = `
      <span class="msi" style="font-size:16px;color:var(--warn)">warning</span>
      <span>Viewing cached telemetry from <strong>${ago(lastRefreshedTs)}</strong> (${isOffline ? 'Offline mode' : 'Background update ready'}).</span>
      <button class="btn btn-acc btn-sm" style="margin-left:auto;font-size:10.5px;padding:3px 8px" onclick="refreshAll()">Refresh Now</button>`;
  } else {
    b.style.display = 'none';
  }
}


/* ══════════════════════════════════════════════════════════════════════════════
   PHASE 11: SETTINGS CONTROL ROOM & HARDENING (W3 + W5)
   ══════════════════════════════════════════════════════════════════════════════ */

let userPrefs = {
  customStopwords: [],
  topicAliases: { 'gdt': 'geometric dimensioning', 'euv': 'extreme ultraviolet' },
  copycatThreshold: 60,
  collisionRatio: 1.8,
  surgeVelThreshold: 2000,
  accentColor: 'cyan'
};

try {
  const stored = localStorage.getItem('yt_user_prefs');
  if (stored) userPrefs = { ...userPrefs, ...JSON.parse(stored) };
} catch { }

function saveUserPrefs() {
  try { localStorage.setItem('yt_user_prefs', JSON.stringify(userPrefs)); } catch { }
}

let settingsTab = 'topics'; // 'topics' | 'alerts' | 'data' | 'theme'

function openSettingsModal() {
  document.getElementById('settingsOvrl')?.classList.add('open');
  document.getElementById('settingsModal')?.classList.add('open');
  switchSettingsTab(settingsTab);
}

function closeSettingsModal() {
  document.getElementById('settingsOvrl')?.classList.remove('open');
  document.getElementById('settingsModal')?.classList.remove('open');
}

function switchSettingsTab(tab) {
  settingsTab = tab;
  document.querySelectorAll('#settingsModalSeg .vid-seg-btn').forEach(b => {
    b.classList.toggle('on', b.id === 'setTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  });
  renderSettingsBody();
}

function renderSettingsBody() {
  const body = document.getElementById('settingsPanelBody');
  if (!body) return;

  if (settingsTab === 'topics') {
    body.innerHTML = `
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:4px">Custom Stopwords Filter</div>
        <div style="font-size:10.5px;color:var(--t3);margin-bottom:8px">Exclude generic niche terms from the topic intelligence engine.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${userPrefs.customStopwords.map((w, idx) => `
            <span class="chip" style="display:inline-flex;align-items:center;gap:6px;padding:3px 8px">
              <span>${esc(w)}</span>
              <span style="cursor:pointer;color:var(--down);font-weight:700" onclick="removeCustomStopword(${idx})">✕</span>
            </span>`).join('')}
          ${!userPrefs.customStopwords.length ? '<span style="font-size:11px;color:var(--t4)">No custom stopwords added yet.</span>' : ''}
        </div>
        <div style="display:flex;gap:6px">
          <input type="text" id="addStopwordInp" placeholder="Add stopword (e.g. review, ep)..."
            style="flex:1;padding:6px 10px;font-size:11.5px;background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);color:var(--t1);outline:none">
          <button class="btn btn-acc btn-sm" onclick="addCustomStopword()">+ Add</button>
        </div>
      </div>

      <div style="padding-top:14px;border-top:1px solid var(--line-1)">
        <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:4px">Topic Aliases & Synonym Merge</div>
        <div style="font-size:10.5px;color:var(--t3);margin-bottom:8px">Merge synonyms under a single canonical topic keyword.</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
          ${Object.entries(userPrefs.topicAliases).map(([from, to]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-3);padding:6px 10px;border-radius:var(--r-s);font-size:11.5px">
              <span><strong style="color:var(--acc)">${esc(from)}</strong> → <span style="color:var(--t1)">${esc(to)}</span></span>
              <button class="icon-btn" style="width:20px;height:20px;color:var(--down)" onclick="removeTopicAlias('${esc(from)}')">✕</button>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <input type="text" id="aliasFromInp" placeholder="From (e.g. gdt)" style="flex:1;padding:6px 10px;font-size:11px;background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);color:var(--t1);outline:none">
          <input type="text" id="aliasToInp" placeholder="To (e.g. geometric dimensioning)" style="flex:1;padding:6px 10px;font-size:11px;background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);color:var(--t1);outline:none">
          <button class="btn btn-acc btn-sm" onclick="addTopicAlias()">+ Link</button>
        </div>
      </div>

      <div style="padding-top:10px;border-top:1px solid var(--line-1);display:flex;justify-content:flex-end">
        <button class="btn btn-gh btn-sm" onclick="rebuildTopicEngine()"><span class="msi">refresh</span> Rebuild Topic Index</button>
      </div>`;
  } else if (settingsTab === 'alerts') {
    body.innerHTML = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="font-size:12px;font-weight:700;color:var(--t1)">🕵️ Copycat Match Sensitivity</div>
          <span class="badge bdg-pr" id="lblCopycat">${userPrefs.copycatThreshold}% Overlap</span>
        </div>
        <div style="font-size:10.5px;color:var(--t3);margin-bottom:8px">Minimum token overlap ratio to flag competitor uploads as copycats.</div>
        <input type="range" min="40" max="90" step="5" value="${userPrefs.copycatThreshold}"
          style="width:100%;accent-color:var(--acc)" oninput="updateAlertPref('copycatThreshold', this.value, 'lblCopycat', '% Overlap')">
      </div>

      <div style="padding-top:14px;border-top:1px solid var(--line-1)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="font-size:12px;font-weight:700;color:var(--t1)">⚡ Collision Size Multiplier</div>
          <span class="badge bdg-pr" id="lblCollision">${userPrefs.collisionRatio}× Size</span>
        </div>
        <div style="font-size:10.5px;color:var(--t3);margin-bottom:8px">Competitor must be at least this much larger than your channel to flag traffic cannibalization.</div>
        <input type="range" min="1.2" max="3.5" step="0.1" value="${userPrefs.collisionRatio}"
          style="width:100%;accent-color:var(--acc)" oninput="updateAlertPref('collisionRatio', this.value, 'lblCollision', '× Size')">
      </div>

      <div style="padding-top:14px;border-top:1px solid var(--line-1)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="font-size:12px;font-weight:700;color:var(--t1)">🚀 Viral Surge Velocity Trigger</div>
          <span class="badge bdg-pr" id="lblSurge">${fmtN(userPrefs.surgeVelThreshold)}/day</span>
        </div>
        <div style="font-size:10.5px;color:var(--t3);margin-bottom:8px">Daily view rate threshold to flag viral competitor breakout videos in Field Feed.</div>
        <input type="range" min="500" max="10000" step="500" value="${userPrefs.surgeVelThreshold}"
          style="width:100%;accent-color:var(--acc)" oninput="updateAlertPref('surgeVelThreshold', this.value, 'lblSurge', '/day', true)">
      </div>`;
  } else if (settingsTab === 'data') {
    const storageKb = Math.round(JSON.stringify(localStorage).length / 1024);
    body.innerHTML = `
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:4px">Storage & Cache Inspector</div>
        <div style="font-size:11px;color:var(--t2);line-height:1.45;margin-bottom:12px">
          • <strong>Local Cache Size:</strong> ~${storageKb} KB<br>
          • <strong>Tracked Channels:</strong> ${all.length} channels cached<br>
          • <strong>Topic Index Size:</strong> ${_topicCache.topics.size} topics indexed
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-gh btn-sm" onclick="purgeTopicCache()"><span class="msi">delete_sweep</span> Purge Topic Index</button>
          <button class="btn btn-gh btn-sm" onclick="purgeVideoEnrichCache()"><span class="msi">cached</span> Clear Video Cache</button>
        </div>
      </div>

      <div style="padding-top:14px;border-top:1px solid var(--line-1)">
        <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:4px">Full Data Backup & Restore</div>
        <div style="font-size:10.5px;color:var(--t3);margin-bottom:10px">Export or restore your tracked channels, pipeline cards, topic merges, and custom settings.</div>
        <div style="display:flex;gap:10px;align-items:center">
          <button class="btn btn-acc btn-sm" onclick="exportDataBackup()"><span class="msi">download</span> 📦 Export JSON Backup</button>
          <label class="btn btn-gh btn-sm" style="cursor:pointer">
            <span class="msi">upload</span> 📥 Restore JSON Backup
            <input type="file" accept=".json" style="display:none" onchange="importDataBackup(event)">
          </label>
        </div>
      </div>`;
  } else if (settingsTab === 'theme') {
    const themes = [
      { key: 'cyan', name: 'Cyan (Default)', color: '#00e5ff' },
      { key: 'emerald', name: 'Emerald', color: '#3ddc97' },
      { key: 'gold', name: 'Gold', color: '#f5a623' },
      { key: 'purple', name: 'Purple', color: '#a78bfa' },
      { key: 'crimson', name: 'Crimson', color: '#ff4d4d' }
    ];
    body.innerHTML = `
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:6px">Accent Color Palette</div>
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px">
          ${themes.map(th => `
            <div onclick="setThemeAccent('${th.key}', '${th.color}')"
                 style="width:32px;height:32px;border-radius:50%;background:${th.color};cursor:pointer;border:2.5px solid ${userPrefs.accentColor === th.key ? '#fff' : 'transparent'};box-shadow:0 0 10px ${th.color}66"
                 title="${th.name}"></div>`).join('')}
        </div>
      </div>

      <div style="padding-top:14px;border-top:1px solid var(--line-1);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--t1)">Onboarding Tour</div>
          <div style="font-size:10.5px;color:var(--t3)">Replay the 6-step guided walkthrough across the dashboard.</div>
        </div>
        <button class="btn btn-gh btn-sm" onclick="closeSettingsModal();startSpotlightTour()">Replay Tour 🚀</button>
      </div>`;
  }
}

function addCustomStopword() {
  const inp = document.getElementById('addStopwordInp');
  const val = (inp?.value || '').trim().toLowerCase();
  if (!val) return;
  if (!userPrefs.customStopwords.includes(val)) {
    userPrefs.customStopwords.push(val);
    saveUserPrefs();
    rebuildTopicEngine();
    renderSettingsBody();
    toast(`Added stopword: ${val}`, 's');
  }
  if (inp) inp.value = '';
}

function removeCustomStopword(idx) {
  userPrefs.customStopwords.splice(idx, 1);
  saveUserPrefs();
  rebuildTopicEngine();
  renderSettingsBody();
}

function addTopicAlias() {
  const fromInp = document.getElementById('aliasFromInp');
  const toInp = document.getElementById('aliasToInp');
  const f = (fromInp?.value || '').trim().toLowerCase();
  const t = (toInp?.value || '').trim().toLowerCase();
  if (!f || !t) return;
  userPrefs.topicAliases[f] = t;
  saveUserPrefs();
  rebuildTopicEngine();
  renderSettingsBody();
  toast(`Linked '${f}' → '${t}'`, 's');
  if (fromInp) fromInp.value = '';
  if (toInp) toInp.value = '';
}

function removeTopicAlias(key) {
  delete userPrefs.topicAliases[key];
  saveUserPrefs();
  rebuildTopicEngine();
  renderSettingsBody();
}

function rebuildTopicEngine() {
  buildTopicCache();
  renderTopicRadar();
  toast('Topic Intelligence index recomputed!', 's');
}

function updateAlertPref(key, val, lblId, suffix, isFmt = false) {
  const num = parseFloat(val);
  userPrefs[key] = num;
  saveUserPrefs();
  const lbl = document.getElementById(lblId);
  if (lbl) lbl.textContent = (isFmt ? fmtN(num) : num) + suffix;
}

function purgeTopicCache() {
  _topicCache.topics.clear();
  _topicCache.perChannel.clear();
  try { localStorage.removeItem('yt_topic_cache'); } catch { }
  buildTopicCache();
  renderTopicRadar();
  renderSettingsBody();
  toast('Topic cache purged & rebuilt!', 's');
}

function purgeVideoEnrichCache() {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('yt_enrich_')) {
      localStorage.removeItem(k);
    }
  }
  toast('Video history cache cleared!', 's');
  renderSettingsBody();
}

function exportDataBackup() {
  const data = {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    prefs: userPrefs,
    pipelineCards: pipelineCards || [],
    inboxItems: inboxItems || [],
    channels: all || []
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yt_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup exported successfully!', 's');
}

function importDataBackup(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.prefs) userPrefs = { ...userPrefs, ...data.prefs };
      if (data.pipelineCards) pipelineCards = data.pipelineCards;
      if (data.inboxItems) inboxItems = data.inboxItems;
      saveUserPrefs();
      savePipelineCards();
      try { localStorage.setItem('yt_inbox_items', JSON.stringify(inboxItems)); } catch { }
      rebuildTopicEngine();
      updateBellBadge();
      renderSettingsBody();
      toast('Backup restored successfully!', 's');
    } catch {
      toast('Invalid backup file format', 'e');
    }
  };
  reader.readAsText(file);
}

function setThemeAccent(key, hex) {
  userPrefs.accentColor = key;
  saveUserPrefs();
  document.documentElement.style.setProperty('--acc', hex);
  renderSettingsBody();
  toast(`Accent set to ${key.toUpperCase()}`, 's');
}

// Initialize theme on boot
if (userPrefs?.accentColor) {
  const themeMap = { cyan: '#00e5ff', emerald: '#3ddc97', gold: '#f5a623', purple: '#a78bfa', crimson: '#ff4d4d' };
  if (themeMap[userPrefs.accentColor]) {
    document.documentElement.style.setProperty('--acc', themeMap[userPrefs.accentColor]);
  }
}



/* ══════════════════════════════════════════════════════════════════════════════
   PHASE 12: OUTPUT, GAMIFICATION & SHARING ENGINES
   ══════════════════════════════════════════════════════════════════════════════ */
