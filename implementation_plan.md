# YT Tracker — Dashboard Redesign Implementation Plan

> **Target:** Gemini 2.0 Flash (or any LLM) can implement this plan by editing `app.js` and `style.css` without touching the backend or `index.html`.  Every change is described precisely — class names, selectors, pixel values, and code snippets are all exact.

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Layout Restructure](#2-layout-restructure)
3. [Hero Section — My Channel Card](#3-hero-section--my-channel-card)
4. [This Month at a Glance](#4-this-month-at-a-glance)
5. [Competitor Leaderboard — Replace Bars with Readable Table](#5-competitor-leaderboard--replace-bars-with-readable-table)
6. [Latest Video Face-Off Grid](#6-latest-video-face-off-grid)
7. [Monthly Upload Velocity Chart — Full Rebuild](#7-monthly-upload-velocity-chart--full-rebuild)
8. [My Recent Uploads Strip](#8-my-recent-uploads-strip)
9. [New: Fastest-Growing Callout Card](#9-new-fastest-growing-callout-card)
10. [Section Headers — Unified Style](#10-section-headers--unified-style)
11. [CSS Changes Checklist](#11-css-changes-checklist)
12. [Implementation Order](#12-implementation-order)

---

## 1. Overview & Goals

### Problems visible in the screenshots

| # | Problem | Location |
|---|---------|----------|
| 1 | Bar chart in "Monthly Upload Velocity" is unreadable — tiny bars, missing labels, no tooltips, wrong colour separation | `.dash-mg-wrap` / `#dashVelocity` |
| 2 | Competitor Leaderboard thin progress bars are meaningless at different subscriber magnitudes (MrBeast 483M vs CADable 24K) | `buildLB()` in `app.js` |
| 3 | "This Month at a Glance" widget looks disjointed and disconnected from the rest of the layout | `#dashMonthGlance` |
| 4 | Video Face-Off grid uses inconsistent card sizes depending on screen width | `.vr-grid` |
| 5 | My Recent Uploads has too much vertical space, hard to scan | `.ru-grid` |
| 6 | No clear visual hierarchy — all sections have the same weight, so nothing stands out | Global `app.js` `renderDash()` |
| 7 | Section dividers (`.sl`) use a gradient line that feels decorative but not scannable | `.sl` in `style.css` |

### Design principles for the redesign

- **Scannable first** — the user must read subscriber and view counts without squinting.
- **Colour only for meaning** — green = good, red = bad, gold = user's own channel, cyan = primary accent. Stop using colour for decoration.
- **Consistent grid** — use a single 12-column mental model. Dashboard max-width stays `1100px`.
- **No horizontal scrolling** on desktop at `1024px+`.
- **Accessible contrast** — all text on dark backgrounds must be at minimum WCAG AA.

---

## 2. Layout Restructure

### Current order (from `renderDash()` in `app.js`)

```
Greeting text
My Channel Hero Card
#dashMonthGlance   ← loaded async
Competitor Leaderboard (if >1 channel)
#dashFastGrow      ← loaded async (currently hidden/empty)
Latest Video Face-Off
#dashVelocity      ← loaded async (the broken bar chart)
My Recent Uploads
```

### New order

```
Greeting + Quick Stats Row    ← merge greeting with 3 KPI chips
My Channel Hero Card          ← keep, minor style fixes
── SECTION: Performance ──────────────────────────────
This Month at a Glance        ← repositioned above leaderboard
Competitor Leaderboard        ← simplified table (no bars)
── SECTION: Content ──────────────────────────────────
Upload Velocity Chart         ← rebuilt as grouped bar chart
Latest Video Face-Off         ← keep, fix grid
── SECTION: Your Channel ─────────────────────────────
My Recent Uploads             ← horizontal scroll strip
```

### How to reorder in `renderDash()` in `app.js`

Find the block that builds `html` string (~line 219–311).  
Reorder the concatenation as follows:

```js
// 1. Greeting + title (unchanged)
html += `<div class="dash-greet">${greet()}</div>
         <div class="dash-title">${...}</div>`;

// 2. My Channel Hero
html += `<div class="my-hero ...">...</div>`;

// 3. Performance section header (new)
html += `<div class="dash-section-hdr">📊 Performance</div>`;

// 4. Month glance placeholder (keep)
html += `<div id="dashMonthGlance" ...>...</div>`;

// 5. Leaderboard (if >1 channel)
if (all.length > 1) html += buildLB(primary, comps);

// 6. Content section header (new)
html += `<div class="dash-section-hdr">🎬 Content</div>`;

// 7. Upload velocity placeholder (keep id, move position)
html += `<div id="dashVelocity"></div>`;

// 8. Video Face-off
html += `<div class="sl d1">...Face-off...</div>
         <div class="vr-grid d2">...</div>`;

// 9. My Channel section header (new)
html += `<div class="dash-section-hdr">📁 Your Uploads</div>`;

// 10. My recent uploads
html += `<div class="ru-grid d4" id="ruGrid">...</div>`;

// 11. Fastest growing (keep async placeholder, last)
html += `<div id="dashFastGrow"></div>`;
```

---

## 3. Hero Section — My Channel Card

### Current issues
- "Click to view full analytics ›" hint is barely visible.
- Stats row (Subscribers / Total Views / Videos / Avg Views) have no trend indicator.
- The latest-video mini card on the right feels cramped at 210 px.

### Changes to `style.css` — `.my-hero` block

**Find `.my-hero` (around line 885) and replace with:**

```css
.my-hero {
  background: var(--sf-low);
  border: 1px solid var(--bd2);
  border-radius: 18px;
  cursor: pointer;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
  margin-bottom: 20px;
  overflow: hidden;
}
.my-hero:hover {
  border-color: rgba(0,212,255,0.35);
  box-shadow: 0 0 0 4px rgba(0,212,255,0.06);
}
.my-hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 24px 16px;
  gap: 20px;
}
.my-hero-l { display: flex; align-items: flex-start; gap: 18px; flex: 1; min-width: 0; }
.my-hero-logo {
  width: 68px; height: 68px; border-radius: 50%;
  object-fit: cover; background: var(--sf-highest);
  border: 2px solid var(--bd2); flex-shrink: 0;
}
.my-hero-name {
  font-family: 'Outfit', sans-serif;
  font-weight: 800; font-size: 22px; color: var(--t1);
  letter-spacing: -0.5px; line-height: 1.2; margin-bottom: 4px;
}
.my-hero-meta {
  font-size: 12px; color: var(--t3);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.my-hero-hint {
  font-size: 11px; color: var(--pr); margin-top: 8px;
  opacity: 0.7; transition: opacity var(--dur-fast);
}
.my-hero:hover .my-hero-hint { opacity: 1; }
/* Stats strip at the bottom of the hero */
.my-stats {
  display: grid; grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--bd2);
}
.my-stat {
  padding: 14px 20px;
  border-right: 1px solid var(--bd2);
  transition: background var(--dur-fast);
}
.my-stat:last-child { border-right: none; }
.my-stat:hover { background: rgba(255,255,255,0.02); }
.my-stat-lbl {
  font-size: 10.5px; color: var(--t3); text-transform: uppercase;
  letter-spacing: 0.6px; margin-bottom: 4px;
}
.my-stat-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 20px; font-weight: 700; color: var(--t1);
}
.my-stat-val.gold { color: var(--gold); }
.my-stat-val.green { color: var(--gr); }
/* Latest video mini card */
.my-hero-vid {
  flex-shrink: 0; width: 230px;
  background: var(--sf-high); border-radius: 12px;
  border: 1px solid var(--bd2); overflow: hidden;
  transition: border-color var(--dur-fast);
}
.my-hero-vid:hover { border-color: var(--bd3); }
.my-vid-lbl {
  font-size: 10px; font-weight: 700; color: var(--t3);
  text-transform: uppercase; letter-spacing: 0.6px;
  padding: 10px 12px 0;
}
.my-vid-mini { display: flex; flex-direction: column; }
.my-vid-thumb {
  width: 100%; aspect-ratio: 16/9; object-fit: cover;
  display: block; margin-top: 8px;
}
.my-vid-body { padding: 10px 12px; }
.my-vid-title {
  font-size: 12.5px; font-weight: 600; color: var(--t1);
  line-height: 1.4; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.my-vid-meta {
  font-size: 11px; color: var(--t3); margin-top: 6px;
  display: flex; align-items: center; gap: 6px;
}
```

**No changes needed to the JS template in `renderDash()` for this section — the CSS handles everything.**

---

## 4. This Month at a Glance

### Current issues
- Loads async into `#dashMonthGlance` but renders 3 sparse cards with a spinner.
- The emoji prefix (`🗓️`) looks out of place.
- The cards have a dashed border that signals "empty" even when loaded.

### Changes to `style.css` — `.dash-mg-wrap`

Find `.dash-mg-wrap` (around line 954) and replace the block:

```css
.dash-mg-wrap {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}
.dash-mg-card {
  background: var(--sf-low);
  border: 1px solid var(--bd2);
  border-radius: 14px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dash-mg-icon {
  font-family: 'Material Symbols Outlined';
  font-size: 20px;
  color: var(--t3);
  margin-bottom: 6px;
  line-height: 1;
}
.dash-mg-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px; font-weight: 700; color: var(--t1);
}
.dash-mg-lbl {
  font-size: 11px; color: var(--t3);
  text-transform: uppercase; letter-spacing: 0.5px;
}
.dash-mg-delta {
  font-size: 11px; font-weight: 600; margin-top: 6px;
}
.dash-mg-delta.up   { color: var(--gr); }
.dash-mg-delta.down { color: var(--rd); }
.dash-mg-delta.flat { color: var(--t3); }
```

### Changes to `app.js` — `loadThisMonthPanel()`

Find the function `loadThisMonthPanel` (search for `dashMonthGlance`). Its inner HTML builder currently renders whatever template it has. Replace the inner HTML assignment with:

```js
// Build three cards: Views, Videos Uploaded, Engagement Rate
const deltaViews = /* compute % vs last month, keep existing logic */;
const deltaClass = deltaViews > 0 ? 'up' : deltaViews < 0 ? 'down' : 'flat';
const deltaSign  = deltaViews > 0 ? '▲' : deltaViews < 0 ? '▼' : '●';

wrap.innerHTML = `
  <div class="dash-mg-card">
    <div class="dash-mg-icon">visibility</div>
    <div class="dash-mg-val">${fmtN(viewsThisMonth)}</div>
    <div class="dash-mg-lbl">Views This Month</div>
    <div class="dash-mg-delta ${deltaClass}">${deltaSign} ${Math.abs(deltaViews)}% vs last mo</div>
  </div>
  <div class="dash-mg-card">
    <div class="dash-mg-icon">upload</div>
    <div class="dash-mg-val">${videosThisMonth}</div>
    <div class="dash-mg-lbl">Videos Uploaded</div>
    <div class="dash-mg-delta flat">${videosLastMonth} last month</div>
  </div>
  <div class="dash-mg-card">
    <div class="dash-mg-icon">favorite</div>
    <div class="dash-mg-val">${engRate}%</div>
    <div class="dash-mg-lbl">Engagement Rate</div>
    <div class="dash-mg-delta ${engRate >= 4 ? 'up' : engRate >= 2 ? 'flat' : 'down'}">
      ${engRate >= 4 ? 'Excellent' : engRate >= 2 ? 'Average' : 'Below avg'}
    </div>
  </div>
`;
```

> **Note:** Keep the existing logic for computing `viewsThisMonth`, `videosThisMonth`, `engRate` — only change the HTML template, not the data calculations.

---

## 5. Competitor Leaderboard — Replace Bars with Readable Table

### Current problems

The `buildLB()` function in `app.js` (line ~364) generates thin 4 px horizontal bars.  
When one channel has 483 M subscribers and another has 24 K, all bars except the leader render at ~0 % width — **completely useless**.

### Strategy

Replace bars with a **data table** that uses:
- Ranked position badges (1st/2nd/3rd/…) with colour differentiation.
- Large, readable monospaced numbers.
- A subtle `progress` element capped logarithmically (not linearly).
- Colour-coded "vs leader" percentage.

### Full replacement of `buildLB()` in `app.js`

```js
function buildLB(primary, comps) {
  const rows_all = [primary, ...comps];
  const sorted = [...rows_all].sort((a, b) => (b[sort] || 0) - (a[sort] || 0));

  const lbl  = sort === 'subscribers_raw' ? 'Subscribers'
             : sort === 'avg_views_raw'   ? 'Avg Views'
             : 'Total Views';
  const lbl2 = sort === 'subscribers_raw' ? 'Avg Views' : 'Subscribers';
  const fld2 = sort === 'subscribers_raw' ? 'avg_views' : 'subscribers';

  // Logarithmic scale so MrBeast vs small channels both show a meaningful bar
  const maxVal = Math.max(...rows_all.map(c => c[sort] || 0), 1);
  function logPct(val) {
    if (!val || val <= 0) return 0;
    return Math.round((Math.log10(val + 1) / Math.log10(maxVal + 1)) * 100);
  }

  const rk = ['1st', '2nd', '3rd'];
  let rows = '';
  sorted.forEach((ch, i) => {
    const mine  = ch.id === primary.id;
    const pct   = logPct(ch[sort] || 0);
    const dispV = sort === 'subscribers_raw' ? ch.subscribers
                : sort === 'avg_views_raw'   ? ch.avg_views
                : ch.total_views;
    const vsLeader = sorted[0][sort] > 0
      ? Math.round(((ch[sort] - sorted[0][sort]) / sorted[0][sort]) * 100)
      : 0;
    const vsColor = vsLeader === 0 ? 'var(--gold)'
                  : vsLeader < -50 ? 'var(--rd)'
                  : 'var(--t3)';
    const vsText = i === 0 ? '👑 Leader' : `${vsLeader}%`;

    rows += `
    <div class="lb-row ${mine ? 'mine' : ''}" onclick="openAnalyticsModal('${esc(ch.id)}')">
      <div class="lb-rk">
        <span class="rank-badge rank-${i + 1}">${rk[i] || i + 1}</span>
      </div>
      <div class="lb-ch">
        ${ch.logo_url
          ? `<img class="lb-logo" src="${esc(proxyImg(ch.logo_url))}" onerror="this.style.background='var(--sf-highest)'" alt="">`
          : `<div class="lb-logo-fb">${(ch.name || '?')[0].toUpperCase()}</div>`}
        <div>
          <div class="lb-ch-name">${esc(ch.name)}${mine ? '<span class="lb-you">⭐ You</span>' : ''}</div>
          <div class="lb-ch-hdl">${esc(ch.handle || '')}</div>
        </div>
      </div>
      <div class="lb-bar-col">
        <div class="lb-log-bar-bg">
          <div class="lb-log-bar ${mine ? 'mb' : ''}" data-pct="${pct}" style="width:0%"></div>
        </div>
        <span class="lb-vs" style="color:${vsColor}">${vsText}</span>
      </div>
      <div class="lb-num ${mine ? 'hi' : ''}">${esc(dispV)}</div>
      <div class="lb-num lo">${esc(ch[fld2])}</div>
      <div class="lb-upload">${ch.video?.date ?? '—'}</div>
      <div class="lb-arr">›</div>
    </div>`;
  });

  return `
  <div class="section-hdr">
    <span style="font-family:'Material Symbols Outlined';font-size:16px;vertical-align:middle">leaderboard</span>
    Competitor Leaderboard
  </div>
  <div class="lb d2">
    <div class="lb-top">
      <span class="lb-top-t">Ranked by ${lbl}</span>
      <div class="lb-sorts">
        <button class="lsb ${sort === 'subscribers_raw' ? 'on' : ''}" onclick="setSort('subscribers_raw')">Subscribers</button>
        <button class="lsb ${sort === 'avg_views_raw'   ? 'on' : ''}" onclick="setSort('avg_views_raw')">Avg Views</button>
        <button class="lsb ${sort === 'total_views_raw' ? 'on' : ''}" onclick="setSort('total_views_raw')">Total Views</button>
      </div>
    </div>
    <div class="lb-head">
      <span class="lh">#</span>
      <span class="lh" style="text-align:left">Channel</span>
      <span class="lh">Scale</span>
      <span class="lh">${lbl}</span>
      <span class="lh">${lbl2}</span>
      <span class="lh">Last Upload</span>
      <span class="lh"></span>
    </div>
    ${rows}
  </div>`;
}
```

### CSS additions for the new leaderboard

Add these rules to `style.css` **after** the existing `.lb-bar` block:

```css
/* Logarithmic bar — replaces the thin 4px bar */
.lb-bar-col {
  display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.lb-log-bar-bg {
  height: 8px; background: var(--sf-highest);
  border-radius: 4px; overflow: hidden;
}
.lb-log-bar {
  height: 100%; border-radius: 4px;
  background: var(--t3);
  transition: width 1.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.lb-log-bar.mb { background: var(--gold); }
.lb-vs {
  font-size: 10px; font-family: 'JetBrains Mono', monospace;
  font-weight: 600; white-space: nowrap;
}
.lb-upload {
  font-size: 11px; color: var(--t3);
  text-align: right; white-space: nowrap;
}

/* Update grid template for the lb-head and lb-row to accommodate new bar column */
.lb-head,
.lb-row {
  display: grid;
  /* rank | channel | bar+vs | primary-val | secondary-val | last-upload | arrow */
  grid-template-columns: 48px 1fr 140px 90px 80px 90px 24px;
  align-items: center; gap: 12px;
  padding: 12px 16px;
}
```

### Update `animateBars()` for the new class name

Find `animateBars()` in `app.js` (line ~423) and change:

```js
// BEFORE
function animateBars() {
  document.querySelectorAll('.lb-bar').forEach(b => b.style.width = (b.dataset.pct || 0) + '%');
}

// AFTER
function animateBars() {
  document.querySelectorAll('.lb-log-bar').forEach(b => b.style.width = (b.dataset.pct || 0) + '%');
}
```

---

## 6. Latest Video Face-Off Grid

### Current issues
- `minmax(200px, 1fr)` causes ugly wrapping when 6 cards are shown.
- Cards are too short — title clips after 2 lines but view count is always readable, so the priority is inverted.

### CSS changes to `style.css`

Find `.vr-grid` (line ~1029) and change:

```css
/* BEFORE */
.vr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }

/* AFTER — fixed 3-per-row on desktop, 2 on tablet, 1 on mobile */
.vr-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}
@media (max-width: 860px) { .vr-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .vr-grid { grid-template-columns: 1fr; } }
```

Find `.vr-title` (line ~1043) and change line-clamp from 2 to 3:

```css
.vr-title {
  font-size: 12.5px; font-weight: 500; line-height: 1.4;
  color: var(--t2); height: 4.2em;               /* ← was 2.8em */
  overflow: hidden; display: -webkit-box;
  -webkit-line-clamp: 3;                           /* ← was 2 */
  -webkit-box-orient: vertical;
}
```

Find `.vr-views` and increase contrast:

```css
.vr-views {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;                                 /* ← was 16px */
  font-weight: 700; color: var(--t1); margin-top: 8px;
}
```

---

## 7. Monthly Upload Velocity Chart — Full Rebuild

This is the **most broken section**. The current implementation (`loadUploadVelocity()`) renders raw `<canvas>`-less bars with no axis labels, no tooltips, and no readable month labels on mobile.

### Full replacement of `loadUploadVelocity()` in `app.js`

Find the function `loadUploadVelocity` (search for `dashVelocity`). Replace the entire body with:

```js
async function loadUploadVelocity(channels) {
  const el = document.getElementById('dashVelocity');
  if (!el) return;

  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:13px;padding:20px 0"><div class="spin"></div>Building upload chart…</div>`;

  try {
    // ── 1. Collect last 6 months of video data per channel ──────────────
    const now    = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short' }) + " '" + String(d.getFullYear()).slice(2),
        year:  d.getFullYear(),
        month: d.getMonth(),
      });
    }

    const channelData = await Promise.all(
      channels.map(async ch => {
        try {
          const r    = await fetch(`/api/channels/${ch.id}/videos?max=60`);
          const vids = await r.json();
          if (!Array.isArray(vids)) return { ch, counts: Array(6).fill(0) };
          const counts = months.map(m =>
            vids.filter(v => {
              const d = new Date(v.published_at || v.date || 0);
              return d.getFullYear() === m.year && d.getMonth() === m.month;
            }).length
          );
          return { ch, counts };
        } catch {
          return { ch, counts: Array(6).fill(0) };
        }
      })
    );

    // ── 2. Build SVG grouped bar chart ───────────────────────────────────
    // Chart dimensions
    const W       = 900, H = 220;
    const padL    = 32, padR = 12, padT = 20, padB = 40;
    const plotW   = W - padL - padR;
    const plotH   = H - padT - padB;
    const nMonths = months.length;          // 6
    const nCh     = channelData.length;

    const allCounts = channelData.flatMap(d => d.counts);
    const maxCount  = Math.max(...allCounts, 1);

    // Assign colours from a fixed palette
    const palette = [
      '#00d4ff', '#f5c842', '#22c55e', '#f97316',
      '#a855f7', '#ec4899', '#14b8a6', '#ef4444',
    ];

    const groupW  = plotW / nMonths;
    const barW    = Math.min(18, Math.floor((groupW * 0.8) / nCh));
    const barGap  = 3;
    const groupPad = (groupW - nCh * barW - (nCh - 1) * barGap) / 2;

    // Y axis grid lines
    const yTicks = [0, Math.round(maxCount / 2), maxCount];
    const gridLines = yTicks.map(t => {
      const y = padT + plotH - (t / maxCount) * plotH;
      return `
        <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
              stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="4 4"/>
        <text x="${padL - 4}" y="${y + 4}" text-anchor="end"
              fill="rgba(255,255,255,0.3)" font-size="9"
              font-family="JetBrains Mono,monospace">${t}</text>`;
    }).join('');

    // Bars + tooltips
    let bars = '';
    channelData.forEach(({ ch, counts }, ci) => {
      const colour = palette[ci % palette.length];
      counts.forEach((count, mi) => {
        if (count === 0) return;
        const barH = Math.max(4, (count / maxCount) * plotH);
        const x    = padL + mi * groupW + groupPad + ci * (barW + barGap);
        const y    = padT + plotH - barH;
        bars += `
          <rect x="${x}" y="${y}" width="${barW}" height="${barH}"
                rx="3" ry="3" fill="${colour}" opacity="0.85">
            <title>${esc(ch.name)} — ${months[mi].label}: ${count} video${count !== 1 ? 's' : ''}</title>
          </rect>
          <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle"
                fill="${colour}" font-size="9"
                font-family="JetBrains Mono,monospace"
                opacity="${count > 0 ? '1' : '0'}">${count}</text>`;
      });
    });

    // X axis month labels
    const xLabels = months.map((m, mi) => {
      const x = padL + mi * groupW + groupW / 2;
      return `<text x="${x}" y="${H - 6}" text-anchor="middle"
                    fill="rgba(255,255,255,0.45)" font-size="10"
                    font-family="DM Sans,sans-serif">${m.label}</text>`;
    }).join('');

    // Legend
    const legendItems = channelData.map(({ ch }, ci) =>
      `<span class="vel-legend-dot" style="background:${palette[ci % palette.length]}"></span>
       <span class="vel-legend-name">${esc(ch.name)}</span>`
    ).join('');

    el.innerHTML = `
      <div class="section-hdr">
        <span style="font-family:'Material Symbols Outlined';font-size:16px;vertical-align:middle">bar_chart</span>
        Monthly Upload Velocity <em>last 6 months</em>
      </div>
      <div class="vel-wrap d2">
        <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet"
             style="display:block;overflow:visible">
          ${gridLines}
          ${bars}
          ${xLabels}
        </svg>
        <div class="vel-legend">${legendItems}</div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div class="err" style="display:block">Could not load velocity chart.</div>`;
  }
}
```

### CSS additions for the new chart

Add to `style.css` (after existing `.lb-` blocks, before `.vr-grid`):

```css
/* ── Upload Velocity Chart ─────────────────────────── */
.vel-wrap {
  background: var(--sf-low);
  border: 1px solid var(--bd2);
  border-radius: 16px;
  padding: 20px 20px 8px;
  margin-bottom: 24px;
  overflow: hidden;
}
.vel-legend {
  display: flex; flex-wrap: wrap;
  align-items: center; gap: 6px 16px;
  padding: 12px 0 4px;
  border-top: 1px solid var(--bd2);
  margin-top: 8px;
}
.vel-legend-dot {
  display: inline-block; width: 10px; height: 10px;
  border-radius: 50%; flex-shrink: 0;
}
.vel-legend-name {
  font-size: 11.5px; color: var(--t2);
  font-family: 'DM Sans', sans-serif;
  white-space: nowrap;
}
```

---

## 8. My Recent Uploads Strip

### Current issues
- Grid of cards wastes vertical space; user can't scan more than 2–3 cards at once.
- Cards have redundant padding.

### Change grid to a horizontal scroll strip

In `style.css`, find `.ru-grid` (line ~1048) and replace:

```css
/* BEFORE */
.ru-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }

/* AFTER */
.ru-grid {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 8px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--bd2) transparent;
  margin-bottom: 24px;
}
.ru-card {
  flex: 0 0 220px;                /* fixed width, no wrap */
  scroll-snap-align: start;
  border-radius: 12px;
  background: var(--sf-low);
  border: 1px solid var(--bd2);
  overflow: hidden;
  text-decoration: none;
  transition: border-color var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast);
}
.ru-card:hover {
  border-color: var(--bd2);
  transform: translateY(-3px);
  box-shadow: 0 8px 28px rgba(0,0,0,0.4);
}
.ru-thumb { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
.ru-body  { padding: 10px 12px 12px; }
.ru-title {
  font-family: 'Outfit', sans-serif;
  font-size: 13px; font-weight: 600; line-height: 1.4;
  color: var(--t1);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.ru-meta {
  font-size: 11px; color: var(--t3);
  margin-top: 8px; display: flex; align-items: center; gap: 10px;
}
.ru-stat { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 600; }
```

**No JS changes needed** — the template in `renderDash()` already uses these same class names.

---

## 9. New: Fastest-Growing Callout Card

The placeholder `#dashFastGrow` is inserted but `loadFastestGrowing()` renders nothing visible when there's only one page of channels. Make it useful.

### Replace `loadFastestGrowing()` in `app.js`

Find the function `loadFastestGrowing` (search for `dashFastGrow`). Replace the entire body with:

```js
async function loadFastestGrowing(channels) {
  const el = document.getElementById('dashFastGrow');
  if (!el || channels.length < 2) return;

  // score = avg_views_raw / subscribers_raw (efficiency proxy)
  const scored = channels.map(ch => ({
    ch,
    score: ch.avg_views_raw && ch.subscribers_raw
      ? (ch.avg_views_raw / ch.subscribers_raw) * 100
      : 0,
  })).sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score === 0) return;
  const isPrimary = top.ch.id === channels.find(c => c.is_primary)?.id;

  el.innerHTML = `
    <div class="fg-card d2" onclick="openAnalyticsModal('${esc(top.ch.id)}')">
      <div class="fg-badge">🚀 Highest View Efficiency</div>
      <div class="fg-body">
        ${top.ch.logo_url
          ? `<img class="fg-logo" src="${esc(proxyImg(top.ch.logo_url))}" onerror="this.style.background='var(--sf-highest)'" alt="">`
          : `<div class="fg-logo-fb">${(top.ch.name || '?')[0]}</div>`}
        <div class="fg-info">
          <div class="fg-name">${esc(top.ch.name)}${isPrimary ? ' <span class="lb-you">⭐ You</span>' : ''}</div>
          <div class="fg-stat">
            Avg views per subscriber: <strong style="color:var(--gr);font-family:'JetBrains Mono',monospace">
            ${top.score.toFixed(1)}%</strong>
          </div>
          <div class="fg-sub" style="color:var(--t3);font-size:11px">
            ${fmtN(top.ch.avg_views_raw)} avg views · ${fmtN(top.ch.subscribers_raw)} subscribers
          </div>
        </div>
        <div class="fg-arrow">›</div>
      </div>
    </div>`;
}
```

### CSS additions for the callout card

```css
/* ── Fastest-Growing Callout ───────────────────────── */
.fg-card {
  background: linear-gradient(135deg, rgba(34,197,94,0.07), rgba(0,212,255,0.04));
  border: 1px solid rgba(34,197,94,0.25);
  border-radius: 16px;
  padding: 16px 20px;
  cursor: pointer;
  margin-bottom: 20px;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.fg-card:hover {
  border-color: rgba(34,197,94,0.5);
  box-shadow: 0 0 0 4px rgba(34,197,94,0.06);
}
.fg-badge {
  font-size: 10.5px; font-weight: 700; color: var(--gr);
  text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px;
}
.fg-body { display: flex; align-items: center; gap: 14px; }
.fg-logo {
  width: 44px; height: 44px; border-radius: 50%;
  object-fit: cover; background: var(--sf-highest); flex-shrink: 0;
}
.fg-logo-fb {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--sf-highest); display: flex;
  align-items: center; justify-content: center;
  font-family: 'Outfit', sans-serif; font-weight: 800;
  font-size: 18px; color: var(--t3); flex-shrink: 0;
}
.fg-info { flex: 1; min-width: 0; }
.fg-name {
  font-family: 'Outfit', sans-serif;
  font-weight: 700; font-size: 15px; color: var(--t1); margin-bottom: 3px;
}
.fg-stat { font-size: 12.5px; color: var(--t2); }
.fg-arrow {
  font-size: 20px; color: var(--t3);
  transition: transform var(--dur-fast), color var(--dur-fast);
}
.fg-card:hover .fg-arrow { color: var(--gr); transform: translateX(3px); }
```

---

## 10. Section Headers — Unified Style

The current `.sl` class uses an inline gradient left-border that doesn't align with anything. Replace with a cleaner, more semantic style.

### CSS — replace `.sl` rule

Find `.sl` in `style.css` (search for `.sl{`) and replace:

```css
/* ── Section header label ────────────────────────── */
.sl {
  font-family: 'Outfit', sans-serif;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--t3);
  margin: 28px 0 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sl::before {
  content: '';
  display: block;
  width: 3px;
  height: 14px;
  background: var(--pr);
  border-radius: 2px;
  flex-shrink: 0;
}
.sl em {
  font-style: normal;
  font-weight: 400;
  color: var(--t4);
  letter-spacing: 0;
  text-transform: none;
  font-size: 10.5px;
}
```

### New `.dash-section-hdr` class (for the major section breaks)

Add to `style.css`:

```css
.dash-section-hdr {
  font-family: 'Outfit', sans-serif;
  font-size: 13px; font-weight: 700; color: var(--t2);
  margin: 36px 0 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--bd2);
  display: flex; align-items: center; gap: 8px;
}
```

---

## 11. CSS Changes Checklist

Work through `style.css` in order and make these targeted changes.  
Each row lists: the **selector to find**, the **property to change**, and the **new value**.

| # | Selector | Property | New Value |
|---|----------|----------|-----------|
| 1 | `.my-hero` | `border-radius` | `18px` |
| 2 | `.my-stats` | `grid-template-columns` | `repeat(4, 1fr)` |
| 3 | `.my-stat` | `padding` | `14px 20px` |
| 4 | `.my-stat-val` | `font-size` | `20px` |
| 5 | `.lb-head, .lb-row` | `grid-template-columns` | `48px 1fr 140px 90px 80px 90px 24px` |
| 6 | `.lb-bar-bg` | `height` | `8px` (was 4px) |
| 7 | `.vr-grid` | `grid-template-columns` | `repeat(3, 1fr)` |
| 8 | `.vr-title` | `-webkit-line-clamp` | `3` (was 2); `height` → `4.2em` |
| 9 | `.vr-views` | `font-size` | `18px` (was 16px) |
| 10 | `.ru-grid` | `display` | `flex` (was grid) |
| 11 | `.ru-card` | `flex` | `0 0 220px` |
| 12 | `.sl` | full replacement | see §10 |
| 13 | `.dash-mg-wrap` | full replacement | see §4 |
| 14 | Add `.vel-wrap`, `.vel-legend*` | new rules | see §7 |
| 15 | Add `.fg-card`, `.fg-body`, etc. | new rules | see §9 |
| 16 | Add `.lb-log-bar-bg`, `.lb-log-bar`, `.lb-vs` | new rules | see §5 |
| 17 | Add `.dash-section-hdr` | new rule | see §10 |

---

## 12. Implementation Order

Follow this sequence to avoid breaking intermediate states:

1. **CSS only — typography & grid fixes** (§3, §6, §8, §10) — safe, no JS changes.
2. **CSS — new component classes** (§4, §5, §7, §9) — add to bottom of `style.css`.
3. **JS — leaderboard (`buildLB`)** (§5) — standalone function, safe to replace.
4. **JS — velocity chart (`loadUploadVelocity`)** (§7) — standalone function.
5. **JS — fastest-growing (`loadFastestGrowing`)** (§9) — standalone function.
6. **JS — month glance HTML template** (§4) — only the `innerHTML` assignment changes.
7. **JS — `renderDash()` section order** (§2) — last, after all helpers are updated.
8. **Final pass** — test at 1280 px, 860 px, 560 px viewport widths.

---

## Quick Reference — Key Function Locations in `app.js`

| Function | Approx line | What it does |
|----------|-------------|--------------|
| `renderDash()` | ~212 | Master dashboard renderer |
| `buildLB()` | ~364 | Competitor leaderboard HTML |
| `animateBars()` | ~423 | Animates bar widths after render |
| `loadThisMonthPanel()` | search `dashMonthGlance` | Fills the glance widget |
| `loadFastestGrowing()` | search `dashFastGrow` | Fastest-growing callout |
| `loadUploadVelocity()` | search `dashVelocity` | Monthly upload bar chart |
| `fmtN()` | ~72 | Number formatter (K/M/B) |
| `proxyImg()` | ~99 | YT image proxy |

---

*End of implementation plan — all changes are scoped to `app.js` and `style.css`. The backend, `index.html`, and all modal/drawer logic are untouched.*