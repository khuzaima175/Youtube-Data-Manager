/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — TIMING INTELLIGENCE ENGINE (PHASE 12 V2)
   Best-Time Heatmap + Slot Recommender + Confidence Tiering & Timezones
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── 01. Configuration & Constants ────────────────────────────────────────── */
const DEFAULT_TIMING = {
  minAge: 3,     // days — younger than this, velocity is unsettled (launch-spike skew)
  maxAge: 180,   // days — older than this, views are SEO/evergreen-driven, not slot-driven
  tier1: 10,     // mature-video threshold to unlock day-only view
  tier2: 30,     // mature-video threshold to unlock full 7x12 grid
  minCellN: 3    // cell needs >=3 videos to be solid-confidence / eligible as "best"
};

function getTimingConfig() {
  const prefs = typeof userPrefs !== 'undefined' ? userPrefs : (typeof window !== 'undefined' ? window.userPrefs : null);
  return { ...DEFAULT_TIMING, ...(prefs?.timing || {}) };
}

const COUNTRY_TZ = {
  US: 'America/New_York',
  PK: 'Asia/Karachi',
  IN: 'Asia/Kolkata',
  NL: 'Europe/Amsterdam',
  GB: 'Europe/London',
  DE: 'Europe/Berlin',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  BR: 'America/Sao_Paulo',
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  FR: 'Europe/Paris'
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HEAT_HOURS = ['12a', '2a', '4a', '6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'];

/* ── 02. Timezone & Maturity Helpers ──────────────────────────────────────── */
let _lastResolvedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
let _fmtMemo = {};

function tzOf(ch) {
  return (ch && ch.country && COUNTRY_TZ[ch.country]) || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function tzFmt(tz, opts) {
  const currentSysTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (currentSysTz !== _lastResolvedTz) {
    _lastResolvedTz = currentSysTz;
    _fmtMemo = {};
  }
  const key = tz + (opts.weekday || '') + (opts.hour || '') + (opts.timeZoneName || '');
  return _fmtMemo[key] ??= new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts });
}

const WEEKDAY_IDX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function dayIn(tz, d) {
  const w = tzFmt(tz, { weekday: 'short' }).format(d);
  return WEEKDAY_IDX[w] ?? 0;
}

function hourIn(tz, d) {
  const formatted = tzFmt(tz, { hour: '2-digit', hour12: false }).format(d);
  const h = parseInt(formatted, 10);
  return isNaN(h) ? 0 : (h % 24);
}

function matureVideos(ch) {
  if (!ch) return [];
  const cfg = getTimingConfig();
  const now = Date.now();
  const rawVids = _enrichCache[ch.id]?.vids || (ch.video ? [ch.video] : []);

  return rawVids.map(v => {
    const pub = v.published_at || v.date;
    if (!pub) return null;
    const pubDate = new Date(pub);
    if (!pubDate || isNaN(pubDate.getTime())) return null;

    const age = Math.max(0.01, (now - pubDate.getTime()) / 864e5);
    if (age < cfg.minAge || age > cfg.maxAge || isNaN(age)) return null;

    const views = parseInt(v.view_count ?? v.views_raw ?? 0, 10);
    if (isNaN(views) || views <= 0) return null;

    return { v, pub: pubDate, age, views, vel: views / age };
  }).filter(Boolean);
}

/* ── 03. Format Helpers ───────────────────────────────────────────────────── */
function formatHourBucket(hourBucket) {
  const hourStart = hourBucket * 2;
  const hourEnd = hourStart + 2;
  const startSuffix = hourStart < 12 ? 'AM' : 'PM';
  const endSuffix = (hourEnd === 24 || hourEnd < 12) ? 'AM' : 'PM';
  const startNum = hourStart === 0 ? 12 : (hourStart > 12 ? hourStart - 12 : hourStart);
  const endNum = hourEnd === 0 || hourEnd === 24 ? 12 : (hourEnd > 12 ? hourEnd - 12 : hourEnd);
  if (startSuffix === endSuffix && hourEnd !== 24 && hourEnd !== 12) {
    return `${startNum}–${endNum}${endSuffix}`;
  }
  return `${startNum}${startSuffix}–${endNum}${endSuffix}`;
}

function formatSlotKey(key, short = false) {
  if (!key) return '—';
  const [day, hourBucket] = key.split('-').map(Number);
  const dayName = short ? DAY_SHORT[day] : DAY_NAMES[day];
  return `${dayName} ${formatHourBucket(hourBucket)}`;
}

function formatSlot(slotObj) {
  if (!slotObj) return '—';
  if (slotObj.key) return formatSlotKey(slotObj.key);
  if (slotObj.day !== undefined) return DAY_NAMES[slotObj.day];
  return '—';
}

/* ── 04. Compute Timing Data Engine ───────────────────────────────────────── */
let _timingCache = null;

function computeTimingData(mode = 'local', targetCh = null) {
  if (_timingCache?.[mode] && !targetCh) return _timingCache[mode];

  const cfg = getTimingConfig();
  const primary = all.find(c => c.is_primary) || all[0];
  const yourSlots = new Map();     // key "day-hourBucket" -> { count, totalVel, videos: [] }
  const fieldSlots = new Map();
  const yourDaySlots = new Map(); // fallback tier: key "day" -> { count, totalVel, videos: [] }

  let totalMature = 0;

  all.forEach(ch => {
    const isTarget = mode === 'channel' ? ch.id === targetCh?.id : ch.id === primary?.id;
    const tz = mode === 'channel' ? tzOf(targetCh || ch) : Intl.DateTimeFormat().resolvedOptions().timeZone;

    const mature = matureVideos(ch);
    mature.forEach(({ v, pub, vel }) => {
      const day = dayIn(tz, pub);
      const hourBucket = Math.floor(hourIn(tz, pub) / 2);
      const key = `${day}-${hourBucket}`;

      const slotMap = isTarget ? yourSlots : fieldSlots;
      if (!slotMap.has(key)) slotMap.set(key, { count: 0, totalVel: 0, videos: [] });
      const s = slotMap.get(key);
      s.count++;
      s.totalVel += vel;
      s.videos.push(v);

      if (isTarget) {
        totalMature++;
        if (!yourDaySlots.has(day)) yourDaySlots.set(day, { count: 0, totalVel: 0, videos: [] });
        const ds = yourDaySlots.get(day);
        ds.count++;
        ds.totalVel += vel;
        ds.videos.push(v);
      }
    });
  });

  yourSlots.forEach(s => s.avgVel = s.count > 0 ? s.totalVel / s.count : 0);
  fieldSlots.forEach(s => s.avgVel = s.count > 0 ? s.totalVel / s.count : 0);
  yourDaySlots.forEach(s => s.avgVel = s.count > 0 ? s.totalVel / s.count : 0);

  const tier = totalMature >= cfg.tier2 ? 2 : (totalMature >= cfg.tier1 ? 1 : 0);

  // bestSlot only draws from cells with n >= minCellN — thin cells never win "best"
  const yourArr = [...yourSlots.entries()].map(([key, v]) => ({ key, ...v }));
  const eligible = yourArr.filter(s => s.count >= cfg.minCellN);
  eligible.sort((a, b) => b.avgVel - a.avgVel);

  const dayArr = [...yourDaySlots.entries()].map(([day, v]) => ({ day: Number(day), ...v }));
  dayArr.sort((a, b) => b.avgVel - a.avgVel);

  const fieldArr = [...fieldSlots.entries()].map(([key, v]) => ({ key, ...v }));
  fieldArr.sort((a, b) => b.count - a.count);

  const worstSource = eligible.length >= 3 ? eligible : yourArr.slice().sort((a, b) => b.avgVel - a.avgVel);
  const worstSlots = worstSource.slice(-3).reverse();

  const resolvedTz = mode === 'channel' ? tzOf(targetCh || primary) : Intl.DateTimeFormat().resolvedOptions().timeZone;

  const result = {
    tier,
    totalMature,
    mode,
    yourSlots,
    fieldSlots,
    yourDaySlots,
    bestSlot: tier === 2 ? (eligible[0] || null) : null,
    worstSlots,
    bestDay: dayArr[0] || null,
    competitorHot: fieldArr[0] || null,
    timezone: resolvedTz,
    targetCh: targetCh || primary
  };

  if (!targetCh) {
    _timingCache = _timingCache || {};
    _timingCache[mode] = result;
    // Check and trigger Bell Inbox alerts for high confidence signals
    if (mode === 'local') {
      checkTimingAlerts(result);
    }
  }
  return result;
}

function clearTimingCache() {
  _timingCache = null;
}

/* ── 05. Bell Inbox Alert Integration ─────────────────────────────────────── */
function checkTimingAlerts(data) {
  if (typeof pushInboxAlert !== 'function') return;
  const today = new Date().toISOString().slice(0, 10);

  if (data.tier === 2 && data.bestSlot) {
    const slotName = formatSlot(data.bestSlot);
    const alertKey = `timing:best:${slotName}:${today}`;
    if (typeof _alertDedup !== 'undefined' && !_alertDedup.has(alertKey)) {
      _alertDedup.add(alertKey);
      try { localStorage.setItem('yt_alert_dedup', JSON.stringify([..._alertDedup])); } catch { }
      pushInboxAlert({
        id: 'timing-best-' + Date.now(),
        ts: Date.now(),
        type: 'opportunity',
        title: `⏰ Optimal Slot: ${slotName}`,
        text: `Your videos average ${fmtN(data.bestSlot.avgVel)}/day here (${data.bestSlot.count} videos). Schedule your next video in this window.`,
        url: '#sec-timing',
        read: false
      });
    }
  }

  const worst = data.worstSlots?.[0];
  const cfg = getTimingConfig();
  if (data.tier === 2 && worst && worst.count >= cfg.minCellN) {
    const slotName = formatSlot(worst);
    const alertKey = `timing:worst:${slotName}:${today}`;
    if (typeof _alertDedup !== 'undefined' && !_alertDedup.has(alertKey)) {
      _alertDedup.add(alertKey);
      try { localStorage.setItem('yt_alert_dedup', JSON.stringify([..._alertDedup])); } catch { }
      pushInboxAlert({
        id: 'timing-worst-' + Date.now(),
        ts: Date.now(),
        type: 'threat',
        title: `⚠️ Avoid Low-Velocity Slot: ${slotName}`,
        text: `Historically lowest velocity window (${fmtN(worst.avgVel)}/day). Consider shifting your release schedule.`,
        url: '#sec-timing',
        read: false
      });
    }
  }
}

/* ── 06. Pipeline Slot Recommender ────────────────────────────────────────── */
function suggestSlotForCard(card) {
  const data = computeTimingData('local');
  if (data.tier === 0) return null;               // no chip — not enough data to guess
  if (data.bestSlot) return formatSlot(data.bestSlot);   // Tier 2, n>=3 cell
  if (data.bestDay) return formatSlot(data.bestDay);     // Tier 1, or Tier 2 with no qualifying cell
  return null;
}

/* ── 07. Heatmap & UI Rendering ───────────────────────────────────────────── */
function renderTimingHeatmap(mode = 'local', targetCh = null, showField = true) {
  const data = computeTimingData(mode, targetCh);
  const cfg = getTimingConfig();

  if (data.tier === 0) return renderTimingEmptyState(data.totalMature);
  if (data.tier === 1) return renderTimingDayFallback(data, showField);

  const { yourSlots, fieldSlots } = data;
  const maxVel = Math.max(...[...yourSlots.values()].map(s => s.avgVel), 1);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const hours = HEAT_HOURS;

  let svg = `
    <div style="overflow-x:auto;padding-bottom:4px">
      <svg viewBox="0 0 620 290" class="timing-heatmap" role="grid" aria-label="Publishing Timing Velocity Grid">
        <defs>
          <pattern id="tm-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--me)" stroke-width="1.2" opacity="0.65"/>
          </pattern>
        </defs>`;

  // Top hour bucket headers
  hours.forEach((h, i) => {
    svg += `<text x="${72 + i * 44}" y="20" class="heat-label" role="columnheader">${h}</text>`;
  });

  days.forEach((day, row) => {
    const y = 34 + row * 32;
    svg += `<text x="24" y="${y + 19}" class="heat-label" role="rowheader" style="text-anchor:start;font-weight:700">${day}</text>`;

    hours.forEach((_, col) => {
      const x = 50 + col * 44;
      const key = `${row}-${col}`;
      const yourSlot = yourSlots.get(key);
      const fieldSlot = fieldSlots.get(key);

      // Base cell container
      svg += `<rect x="${x}" y="${y}" width="40" height="28" fill="var(--bg-3)" opacity="0.3" rx="4"/>`;

      // Secondary layer: Competitor field activity
      if (showField && fieldSlot && fieldSlot.count > 0) {
        const fieldOpacity = Math.min(0.35, Math.max(0.08, fieldSlot.count / 12));
        svg += `<rect x="${x}" y="${y}" width="40" height="28" fill="var(--t3)" opacity="${fieldOpacity.toFixed(2)}" rx="4"/>`;
      }

      // Foreground layer: Target performance
      if (yourSlot && yourSlot.count > 0) {
        const lowConfidence = yourSlot.count < cfg.minCellN;
        const intensity = yourSlot.avgVel / maxVel;
        const opacity = lowConfidence ? 0.95 : (0.28 + intensity * 0.72);
        const tipSuffix = lowConfidence ? ` (low confidence, n=${yourSlot.count})` : '';
        const fill = lowConfidence ? 'url(#tm-hatch)' : 'var(--me)';
        const strokeAttr = lowConfidence ? `stroke="var(--me)" stroke-width="1.2"` : '';
        const tipText = `${DAY_SHORT[row]} ${formatHourBucket(col)}: ${yourSlot.count} video${yourSlot.count === 1 ? '' : 's'}, avg ${fmtN(yourSlot.avgVel)}/day${tipSuffix}${showField && fieldSlot ? ` · Rivals: ${fieldSlot.count}` : ''}`;

        svg += `<rect x="${x}" y="${y}" width="40" height="28" fill="${fill}" opacity="${lowConfidence ? '1' : opacity.toFixed(2)}" rx="4" ${strokeAttr}
                      class="heat-cell" role="gridcell" tabindex="0" data-row="${row}" data-col="${col}"
                      aria-label="${esc(tipText)}" data-tip="${esc(tipText)}"/>`;
      } else if (showField && fieldSlot && fieldSlot.count > 0) {
        // Field only hoverable
        const fieldTip = `${DAY_SHORT[row]} ${formatHourBucket(col)}: Rivals published ${fieldSlot.count} video${fieldSlot.count === 1 ? '' : 's'} (You: 0)`;
        svg += `<rect x="${x}" y="${y}" width="40" height="28" fill="transparent" rx="4"
                      class="heat-cell" role="gridcell" tabindex="0" data-row="${row}" data-col="${col}"
                      aria-label="${esc(fieldTip)}" data-tip="${esc(fieldTip)}"/>`;
      }
    });
  });

  // Heatmap Footer Legend
  svg += `
    <g transform="translate(50, 268)">
      <rect x="0" y="0" width="12" height="12" rx="2" fill="var(--me)" opacity="0.3"/>
      <text x="16" y="10" class="heat-legend-label">Low vel</text>

      <rect x="70" y="0" width="12" height="12" rx="2" fill="var(--me)" opacity="0.65"/>
      <text x="86" y="10" class="heat-legend-label">Mid vel</text>

      <rect x="140" y="0" width="12" height="12" rx="2" fill="var(--me)" opacity="1"/>
      <text x="156" y="10" class="heat-legend-label">High vel</text>

      <rect x="215" y="0" width="12" height="12" rx="2" fill="url(#tm-hatch)" stroke="var(--me)" stroke-width="1"/>
      <text x="231" y="10" class="heat-legend-label">Hatched = low-confidence (n&lt;${cfg.minCellN})</text>

      <rect x="410" y="0" width="12" height="12" rx="2" fill="var(--t3)" opacity="0.3"/>
      <text x="426" y="10" class="heat-legend-label">Gray = Competitors</text>
    </g>`;

  svg += `</svg></div>`;
  return svg;
}

function renderTimingDayFallback(data, showField = true) {
  const { yourDaySlots, fieldSlots } = data;
  const cfg = getTimingConfig();
  const maxVel = Math.max(...[...yourDaySlots.values()].map(s => s.avgVel), 1);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return `
    <div class="timing-day-strip-wrap">
      <div style="font-size:11.5px;color:var(--acc);margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <span class="msi" style="font-size:16px">info</span>
        <span>Day-level velocity view (${data.totalMature} mature uploads). Add ~${Math.max(0, cfg.tier2 - data.totalMature)} more to unlock the 2-hour hourly grid.</span>
      </div>
      <div class="timing-day-strip" role="grid">
        ${days.map((day, row) => {
    const yourDay = yourDaySlots.get(row);
    const dayVels = yourDay ? yourDay.avgVel : 0;
    const count = yourDay ? yourDay.count : 0;
    const pct = yourDay ? Math.max(4, Math.round((dayVels / maxVel) * 100)) : 0;

    let fieldDayCount = 0;
    for (let c = 0; c < 12; c++) {
      const fs = fieldSlots.get(`${row}-${c}`);
      if (fs) fieldDayCount += fs.count;
    }
    const fieldOpacity = Math.min(0.35, fieldDayCount / 18);
    const tip = `${DAY_NAMES[row]}: ${count} video${count !== 1 ? 's' : ''}, avg ${fmtN(dayVels)}/day${showField && fieldDayCount ? ` · Rivals: ${fieldDayCount}` : ''}`;

    return `
            <div class="timing-day-row heat-cell" role="row" tabindex="0" data-row="${row}" data-col="0" data-tip="${esc(tip)}" aria-label="${esc(tip)}">
              <span class="timing-day-lbl">${day}</span>
              <div class="timing-day-bar-track">
                ${showField && fieldDayCount > 0 ? `<div class="timing-day-field-fill" style="width:100%;opacity:${fieldOpacity.toFixed(2)}"></div>` : ''}
                ${pct > 0 ? `<div class="timing-day-bar-fill" style="width:${pct}%;background:var(--me)"></div>` : ''}
              </div>
              <span class="timing-day-stat mono">${count > 0 ? fmtN(dayVels) + '/d' : '—'}</span>
            </div>`;
  }).join('')}
      </div>
    </div>`;
}

function renderTimingEmptyState(n) {
  const cfg = getTimingConfig();
  const remaining = Math.max(0, cfg.tier1 - (n || 0));
  return `
    <div class="timing-empty">
      <div style="font-size:26px;margin-bottom:8px">⏰</div>
      <div style="font-size:13.5px;font-weight:600;color:var(--t1);margin-bottom:4px">Timing Intelligence Initializing</div>
      <div style="color:var(--t3);max-width:380px;margin:0 auto;line-height:1.4">
        Need ~<strong>${remaining}</strong> more upload${remaining === 1 ? '' : 's'} (aged ${cfg.minAge}–${cfg.maxAge} days) to unlock publishing slot recommendations.
      </div>
      <div style="font-size:11px;color:var(--t4);margin-top:8px">
        ${n || 0} mature videos detected in cache so far.
      </div>
    </div>`;
}

function renderTimingInsights(data) {
  const cfg = getTimingConfig();
  const best = data.bestSlot || data.bestDay;
  const worst = data.worstSlots && data.worstSlots.length ? data.worstSlots[0] : null;
  const competitor = data.competitorHot;

  const isHourlyBest = !!data.bestSlot;
  const bestMeta = best
    ? `Avg velocity: ${fmtN(best.avgVel || 0)}/day · (${best.count || 0} video${best.count !== 1 ? 's' : ''}${isHourlyBest ? `, n≥${cfg.minCellN} ✓` : ''})`
    : 'Awaiting video uploads';

  const worstMeta = worst
    ? `Avg velocity: ${fmtN(worst.avgVel || 0)}/day · (${worst.count || 0} video${worst.count !== 1 ? 's' : ''})`
    : '—';

  const compSlotName = competitor ? (competitor.key ? formatSlotKey(competitor.key) : formatSlot(competitor)) : '—';
  const compMeta = competitor
    ? `${competitor.count} video${competitor.count !== 1 ? 's' : ''} published here · opportunity to stand out`
    : 'No competitor clustering detected';

  // 4th Card: Topic Synergy Cross-Link
  let topicSynergyHtml = '';
  let synergyTopic = null;
  if (best && best.videos && best.videos.length && typeof topicTokens === 'function') {
    const tokenCounts = {};
    best.videos.forEach(v => {
      const toks = topicTokens(v.title || '');
      toks.forEach(t => { tokenCounts[t] = (tokenCounts[t] || 0) + 1; });
    });
    const sortedToks = Object.entries(tokenCounts).sort((a, b) => b[1] - a[1]);
    if (sortedToks.length) synergyTopic = sortedToks[0][0];
  }
  if (!synergyTopic && typeof _topicCache !== 'undefined' && _topicCache.topics?.size) {
    const hotTop = [..._topicCache.topics.values()].sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0))[0];
    if (hotTop) synergyTopic = hotTop.topic;
  }

  if (synergyTopic) {
    const capName = typeof capWords === 'function' ? capWords(synergyTopic) : synergyTopic;
    topicSynergyHtml = `
      <div class="timing-insight-card" style="cursor:pointer" onclick="filterRaceByTopic('${esc(synergyTopic)}')" title="Click to filter Topic Radar and Race Window">
        <div class="lbl" style="display:flex;align-items:center;justify-content:space-between">
          <span>🎯 Topic Synergy</span>
          <span class="msi" style="font-size:13px;color:var(--acc)">open_in_new</span>
        </div>
        <div class="val" style="color:var(--acc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(capName)}</div>
        <div class="meta">Top topic in ${formatSlot(best)} · Click to inspect in Radar →</div>
      </div>`;
  }

  return `
    <div class="timing-insights" style="grid-template-columns:repeat(auto-fit, minmax(200px, 1fr))">
      <div class="timing-insight-card">
        <div class="lbl">🔥 Your Best Slot</div>
        <div class="val">${formatSlot(best)}</div>
        <div class="meta">${bestMeta}</div>
      </div>
      <div class="timing-insight-card">
        <div class="lbl">⚠️ Avoid These Slots</div>
        <div class="val">${formatSlot(worst)}</div>
        <div class="meta">${worstMeta}</div>
      </div>
      <div class="timing-insight-card">
        <div class="lbl">📊 Competitor Patterns</div>
        <div class="val">${compSlotName}</div>
        <div class="meta">${compMeta}</div>
      </div>
      ${topicSynergyHtml}
    </div>`;
}

/* ── 08. Dashboard & Deep Dive Entrypoints ─────────────────────────────────── */
function renderDashTiming() {
  const timingData = computeTimingData('local');
  const caption = `All times in your timezone (${timingData.timezone}) — the frame your audience experiences`;

  return `
    <div id="sec-timing" class="card rev in" style="margin-top:var(--s5);--i:6">
      <div class="card-h">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="ic-tile"><span class="msi" style="font-size:16px">schedule</span></div>
            <div>
              <div class="card-title" style="display:flex;align-items:center;gap:8px">
                ⏰ Timing Intelligence
                <span class="badge bdg-dim" style="font-size:10px">${timingData.tier === 2 ? '7×12 Heatmap' : timingData.tier === 1 ? 'Day-Level Strip' : 'Needs More Data'}</span>
              </div>
              <div class="card-meta">when to publish for max early velocity</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="font-size:11px;color:var(--t3);display:flex;align-items:center;gap:4px">
              <span class="msi" style="font-size:14px">public</span> ${timingData.timezone}
            </div>
            <button class="icon-btn" onclick="openSettingsModal();switchSettingsTab('timing')" title="Adjust Timing Thresholds in Settings">
              <span class="msi" style="font-size:14px">tune</span>
            </button>
          </div>
        </div>
      </div>
      <div class="card-b">
        <div class="timing-tz-caption">🌐 ${caption}</div>
        ${renderTimingHeatmap('local')}
        ${timingData.tier > 0 ? renderTimingInsights(timingData) : ''}
      </div>
    </div>`;
}

let ddTimingVsField = true;

function toggleDDTimingVsField(chId) {
  ddTimingVsField = !ddTimingVsField;
  const wrap = document.getElementById('ddTimingHeatmapWrap');
  const btn = document.getElementById('ddTimingVsFieldBtn');
  const ch = all.find(c => c.id === chId);
  if (btn) {
    btn.classList.toggle('on', ddTimingVsField);
    btn.textContent = `vs Field Overlay: ${ddTimingVsField ? 'ON' : 'OFF'}`;
  }
  if (wrap && ch) {
    wrap.innerHTML = renderTimingHeatmap('channel', ch, ddTimingVsField);
    attachTimingTooltips(wrap);
  }
}

function renderDDTimingSection(ch) {
  const timingData = computeTimingData('channel', ch);
  const chTz = tzOf(ch);
  return `
    <div class="card rev in">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <div class="sect-lbl" style="margin:0">
          <span class="msi">schedule</span> Publishing Timing Forensics
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button id="ddTimingVsFieldBtn" class="chip chip-btn ${ddTimingVsField ? 'on' : ''}" onclick="toggleDDTimingVsField('${esc(ch.id)}')">
            vs Field Overlay: ${ddTimingVsField ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
      <div class="timing-tz-caption">
        📍 <strong>${esc(ch.name)}</strong> local time (${chTz}) — inferred from channel country (${esc(ch.country || 'Global')})
      </div>
      <div id="ddTimingHeatmapWrap">
        ${renderTimingHeatmap('channel', ch, ddTimingVsField)}
      </div>
      ${timingData.tier > 0 ? renderTimingInsights(timingData) : ''}
    </div>`;
}

function attachTimingTooltips(container = document) {
  const cells = container.querySelectorAll('.heat-cell');
  cells.forEach(el => {
    if (el._hasTip) return;
    el._hasTip = true;

    el.addEventListener('mouseenter', e => {
      const tipText = el.dataset.tip;
      if (!tipText) return;
      const r = e.target.getBoundingClientRect();
      showTip(tipText, r.left + r.width / 2, r.top);
    });

    el.addEventListener('mouseleave', hideTip);

    // Keyboard accessibility navigation
    el.addEventListener('focus', e => {
      const tipText = el.dataset.tip;
      if (!tipText) return;
      const r = e.target.getBoundingClientRect();
      showTip(tipText, r.left + r.width / 2, r.top);
    });

    el.addEventListener('blur', hideTip);

    el.addEventListener('keydown', e => {
      const row = parseInt(el.dataset.row ?? '0', 10);
      const col = parseInt(el.dataset.col ?? '0', 10);
      let targetEl = null;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        targetEl = container.querySelector(`.heat-cell[data-row="${row}"][data-col="${(col + 1) % 12}"]`);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        targetEl = container.querySelector(`.heat-cell[data-row="${row}"][data-col="${(col - 1 + 12) % 12}"]`);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        targetEl = container.querySelector(`.heat-cell[data-row="${(row + 1) % 7}"][data-col="${col}"]`);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        targetEl = container.querySelector(`.heat-cell[data-row="${(row - 1 + 7) % 7}"][data-col="${col}"]`);
      } else if (e.key === 'Escape') {
        hideTip();
      }

      if (targetEl) {
        targetEl.focus();
      }
    });
  });
}
