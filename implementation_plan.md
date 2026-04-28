# YT Tracker — Complete Upgrade Implementation Plan
**For AI-assisted implementation (Gemini, Claude, etc.)**
**Version 2.0 — Full Spec**

---

## Overview of All Changes

This plan covers **6 major upgrade areas**:
1. **Bar graph tooltips** — show video title + views on hover
2. **Shorts filtering** — exclude YouTube Shorts from "latest video" and "most popular" picks
3. **Professional UI polish** — typography, spacing, color hierarchy
4. **Channel Details Drawer** — redesign from sidebar to full bottom sheet / center modal
5. **Analytics Tab** — restructure into collapsed sections with hover/expand
6. **New Features** — Top 5 videos this month, All-time #1 (collapsible), Best Non-Short video

---

## 1. Bar Graph (Spark Chart) — Add Tooltip with Video Info

### Problem
The 8-bar spark chart on each channel card shows bars with no context. Hovering shows nothing useful. User can't tell which bar = which video.

### Files to edit
- `static/style.css` — add tooltip CSS
- `static/app.js` — modify the spark bar rendering in the `enrichCards()` function (around line 500–510)

### Current code (app.js ~line 503–508)
```js
sparkEl.innerHTML = last8.map(v => {
  const vc = v.view_count ?? v.views_raw ?? 0;
  const pct = Math.max(8, Math.round((vc/maxV)*100));
  const c = vc >= (maxV*0.8) ? 'var(--pr)' : 'var(--t4)';
  return `<div class="cc-spark-bar" style="height:${pct}%;background:${c}" title="${v.views||vc} views"></div>`;
}).join('');
```

### New code (replace the above)
```js
sparkEl.innerHTML = last8.map(v => {
  const vc = v.view_count ?? v.views_raw ?? 0;
  const pct = Math.max(8, Math.round((vc/maxV)*100));
  const c = vc >= (maxV*0.8) ? 'var(--pr)' : 'var(--t4)';
  const isShort = isYouTubeShort(v);
  const shortMark = isShort ? ' · Short' : '';
  // Truncate title to 40 chars
  const titleStr = v.title ? v.title.substring(0, 40) + (v.title.length > 40 ? '…' : '') : '';
  const dateStr = v.published_at ? new Date(v.published_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : (v.date||'');
  return `<div class="cc-spark-bar cc-spark-tip-wrap" style="height:${pct}%;background:${c}${isShort?';opacity:0.45':''}">
    <div class="cc-spark-tooltip">
      <div class="cc-spark-tip-title">${esc(titleStr)}${shortMark}</div>
      <div class="cc-spark-tip-views">${fmtN(vc)} views</div>
      <div class="cc-spark-tip-date">${dateStr}</div>
    </div>
  </div>`;
}).join('');
```

### CSS to add (style.css — append near `.cc-spark-bar` styles)
```css
/* Spark bar tooltip */
.cc-spark-tip-wrap {
  position: relative;
}
.cc-spark-tooltip {
  display: none;
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(18,22,30,0.97);
  border: 1px solid var(--bd2);
  border-radius: 7px;
  padding: 7px 10px;
  white-space: nowrap;
  z-index: 50;
  pointer-events: none;
  box-shadow: 0 6px 20px rgba(0,0,0,0.5);
  min-width: 140px;
  max-width: 220px;
  white-space: normal;
  word-break: break-word;
}
.cc-spark-tip-wrap:hover .cc-spark-tooltip {
  display: block;
}
.cc-spark-tip-title {
  font-family: 'Outfit', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: var(--t1);
  line-height: 1.4;
  margin-bottom: 4px;
}
.cc-spark-tip-views {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  color: var(--pr);
}
.cc-spark-tip-date {
  font-size: 10px;
  color: var(--t3);
  margin-top: 2px;
}
/* Tooltip may overflow card — allow overflow on spark container */
.cc-spark {
  overflow: visible !important;
}
```

---

## 2. YouTube Shorts Filtering

### Problem
Shorts (videos under ~60 seconds, or with `/shorts/` in their URL) inflate "latest video" and "most popular" picks even though they aren't real content.

### New Utility Function (add to app.js near top, after line ~80)
```js
/**
 * Returns true if a video object is a YouTube Short.
 * Checks: duration <= 62s, or URL contains /shorts/, or title has #shorts.
 */
function isYouTubeShort(v) {
  if (!v) return false;
  // Check URL
  if (v.url && v.url.includes('/shorts/')) return true;
  // Check duration (in seconds)
  const dur = parseInt(v.duration ?? v.duration_seconds ?? 0);
  if (dur > 0 && dur <= 62) return true;
  // Check title for #shorts tag
  const title = (v.title || '').toLowerCase();
  if (title.includes('#shorts') || title.includes('#short')) return true;
  return false;
}
```

### Where to apply this filter — 4 locations in app.js:

#### 2a. Latest Video on card (openDrawer, ~line 571)
```js
// BEFORE (gets ch.video which may be a Short):
const v = ch.video || {};

// AFTER — ch.video is set server-side; when building the latest upload section
// in the drawer, filter from the fetched videos list:
// In the fetch callback (~line 648), find the most recent non-Short:
const latestNonShort = vids.find(v => !isYouTubeShort(v));
// Then use latestNonShort instead of vids[0] for "Latest Upload" section
```

**Exact edit in the `fetch('/api/channels/${id}/videos')` callback (around line 650–690):**

Find where the drawer renders "Latest Upload" — currently it uses `ch.video` from the initial channel data. Add a secondary "latest non-short" display:
```js
// After loading vids in openDrawer fetch callback, add this before rendering:
const latestNonShort = vids.find(v => !isYouTubeShort(v));
const shortsCount = vids.filter(isYouTubeShort).length;

// In the HTML render for drwRecent, at the top before the video list:
// Add badge showing: "X Shorts hidden" if shortsCount > 0
```

#### 2b. Best video this month (enrichCards, ~line 540–552)
```js
// CURRENT:
const mVids = vids.filter(v => {
  const t = new Date(v.published_at||v.date).getTime();
  return !isNaN(t) && (now-t) < 30*864e5;
});
if(mVids.length>1){
  const best = mVids.reduce((a,b) => ...);

// CHANGE TO:
const mVids = vids.filter(v => {
  const t = new Date(v.published_at||v.date).getTime();
  return !isNaN(t) && (now-t) < 30*864e5 && !isYouTubeShort(v); // <-- ADD !isYouTubeShort(v)
});
```

#### 2c. Spark chart bars — short videos should be visually distinct
Already handled in Section 1 above (opacity: 0.45 for shorts, and tooltip says "· Short").

#### 2d. Analytics modal — Monthly, Growth, Top Videos tabs
In all loops that iterate `videos` or `vids`, wrap with:
```js
const longFormVids = allVids.filter(v => !isYouTubeShort(v));
// Use longFormVids for performance calculations, keep allVids for total count display
```
Show a small notice: `"Shorts (N) are excluded from analytics"` if any were filtered.

---

## 3. Professional UI Polish

### 3a. Typography — Fix Font Inconsistency

**Problem:** Multiple font families (Outfit, DM Sans, Syne, JetBrains Mono, Fraunces) create visual noise. "DM Sans" is referenced in CSS but not loaded in index.html.

**Fix in index.html:** Add DM Sans to the Google Fonts import:
```html
<!-- FIND: -->
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;400;600&display=swap" rel="stylesheet"/>

<!-- REPLACE WITH: -->
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;400;600&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
```

**Remove `Syne` references** — search and replace all `font-family:'Syne'` with `font-family:'Outfit'` in app.js and style.css.

### 3b. Card Polish — Add subtle gradient accent on hover
Find `.ch-card:hover` in style.css and add:
```css
.ch-card:hover {
  /* existing rules + add: */
  background: linear-gradient(160deg, rgba(0,212,255,0.02) 0%, var(--sf) 30%);
}
.ch-card.mine:hover {
  background: linear-gradient(160deg, rgba(245,200,66,0.05) 0%, var(--sf) 35%);
}
```

### 3c. Stat number size hierarchy on cards
In the card HTML (rendered in app.js `renderChCard` or equivalent), ensure:
- Subscriber count: `font-size: 22px`, `font-weight: 700`, `color: var(--gold)` for my channel, `color: var(--t1)` for competitors
- Secondary stats (total views, avg views): `font-size: 13px`, `color: var(--t2)`
- Labels: `font-size: 9px`, `text-transform: uppercase`, `letter-spacing: 1px`, `color: var(--t3)`

Find `.cc-stat-val` in style.css and adjust accordingly.

### 3d. Section dividers on Dashboard
Existing `.sl` styles are good. Make sure the dashboard uses them consistently between sections (Leaderboard, Recent Uploads, etc.). Add `margin-top: 40px` to first `.sl` after the hero card.

---

## 4. Channel Details — Replace Sidebar Drawer with Center Modal

### Problem
The current drawer (right sidebar, 520px wide) is:
- Hard to read on smaller screens
- Shows too much at once without visual hierarchy
- Feels like an afterthought, not a proper detail view

### Solution: Convert `.drw` to a centered modal with max-width 720px

#### 4a. style.css — Modify drawer to modal

**Find `.drw` and replace entirely:**
```css
/* OLD: */
.drw {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 520px; max-width: 100vw;
  ...
  transform: translateX(100%);
}
.drw.open { transform: translateX(0); }

/* NEW: Center modal */
.drw {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -40%);
  opacity: 0;
  width: 720px;
  max-width: calc(100vw - 32px);
  max-height: 88vh;
  z-index: 201;
  background: var(--sf);
  border: 1px solid var(--bd2);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  transition: transform var(--dur-slow) var(--e), opacity var(--dur-mid) var(--e);
}
.drw.open {
  transform: translate(-50%, -50%);
  opacity: 1;
  pointer-events: all;
}
```

**Modify `.drw-body`:**
```css
.drw-body {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 24px;
  /* Custom scrollbar */
  scrollbar-width: thin;
  scrollbar-color: var(--bd2) transparent;
}
```

**Modify `.drw-bar`:**
```css
.drw-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--bd);
  background: var(--sf-low);
  border-radius: 16px 16px 0 0; /* match parent radius */
  flex-shrink: 0;
}
```

#### 4b. Restructure drawer content into 3 columns for stats

In `openDrawer()` function in app.js, replace the `.drw-bento` section with a cleaner layout:

```js
// Replace current drw-bento HTML with:
`<div class="drw-stats-grid">
  <div class="drw-stat-hero">
    <div class="drw-stat-lbl">Subscribers</div>
    <div class="drw-stat-val gold">${esc(ch.subscribers)}</div>
  </div>
  <div class="drw-stat-cell">
    <div class="drw-stat-lbl">Total Views</div>
    <div class="drw-stat-val">${esc(ch.total_views)}</div>
  </div>
  <div class="drw-stat-cell">
    <div class="drw-stat-lbl">Videos</div>
    <div class="drw-stat-val cyan">${esc(ch.total_videos)}</div>
  </div>
  <div class="drw-stat-cell">
    <div class="drw-stat-lbl">Avg Views</div>
    <div class="drw-stat-val green">${esc(ch.avg_views)}</div>
  </div>
  <div class="drw-stat-cell">
    <div class="drw-stat-lbl">Audience %</div>
    <div class="drw-stat-val" id="drwSubRatio" style="color:var(--t3)">—</div>
  </div>
  <div class="drw-stat-cell">
    <div class="drw-stat-lbl">vs Avg</div>
    <div class="drw-stat-val" id="drwRecentVsAvg" style="color:var(--t3)">—</div>
  </div>
</div>`
```

**CSS for new stat grid (add to style.css):**
```css
.drw-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1px;
  background: var(--bd);
  border-radius: 12px;
  overflow: hidden;
  margin: 0 24px 20px;
  border: 1px solid var(--bd);
}
.drw-stat-hero {
  grid-column: span 3;
  background: linear-gradient(135deg, rgba(245,200,66,0.07), var(--sf-low));
  padding: 20px 24px;
  border-bottom: 1px solid var(--bd);
}
.drw-stat-cell {
  background: var(--sf-low);
  padding: 16px 20px;
}
.drw-stat-lbl {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--t3);
  margin-bottom: 6px;
  font-family: 'Outfit', sans-serif;
}
.drw-stat-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 20px;
  font-weight: 700;
  color: var(--t1);
  letter-spacing: -0.5px;
}
.drw-stat-val.gold { color: var(--gold); font-size: 28px; }
.drw-stat-val.cyan { color: var(--pr); }
.drw-stat-val.green { color: var(--gr); }
```

#### 4c. Two-column layout for lower sections

After the stats grid, use a 2-column layout for "Latest Upload" + "About":
```css
.drw-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 0 24px 20px;
}
@media (max-width: 600px) {
  .drw-two-col { grid-template-columns: 1fr; }
}
```

#### 4d. Collapsible "Recent Uploads" section

Wrap the video list in a collapsible accordion:
```js
// Replace:
s.innerHTML = `<div class="drw-sh">Recent Uploads</div>
  <div style="padding:0 2px">${vidCards}</div>...`

// With:
s.innerHTML = `
<div class="drw-accordion">
  <button class="drw-acc-hdr" onclick="toggleAcc(this)">
    <span>Recent Uploads <em>(${tbl10.length})</em></span>
    <span class="drw-acc-arrow">expand_more</span>
  </button>
  <div class="drw-acc-body open">
    ${vidCards}
  </div>
</div>
<div class="drw-accordion">
  <button class="drw-acc-hdr" onclick="toggleAcc(this)">
    <span>Views Trend</span>
    <span class="drw-acc-arrow">expand_more</span>
  </button>
  <div class="drw-acc-body open">
    ${buildViewsTrend(vids)}
  </div>
</div>
<div class="drw-accordion">
  <button class="drw-acc-hdr" onclick="toggleAcc(this)">
    <span>Upload Calendar</span>
    <span class="drw-acc-arrow">expand_more</span>
  </button>
  <div class="drw-acc-body">
    ${buildCalendar(vids)}
  </div>
</div>
<div class="drw-accordion">
  <button class="drw-acc-hdr" onclick="toggleAcc(this)">
    <span>Engagement Trend</span>
    <span class="drw-acc-arrow">expand_more</span>
  </button>
  <div class="drw-acc-body">
    ${buildEngTrend(vids)}
  </div>
</div>
<div class="drw-accordion">
  <button class="drw-acc-hdr" onclick="toggleAcc(this)">
    <span>Word Cloud</span>
    <span class="drw-acc-arrow">expand_more</span>
  </button>
  <div class="drw-acc-body">
    ${buildWordCloud(vids)}
  </div>
</div>`
```

**Add `toggleAcc()` function to app.js:**
```js
function toggleAcc(btn) {
  const body = btn.nextElementSibling;
  const arrow = btn.querySelector('.drw-acc-arrow');
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (arrow) arrow.textContent = isOpen ? 'expand_more' : 'expand_less';
}
```

**Accordion CSS (add to style.css):**
```css
.drw-accordion {
  border-top: 1px solid var(--bd);
}
.drw-acc-hdr {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--t2);
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.drw-acc-hdr:hover {
  background: rgba(255,255,255,0.03);
  color: var(--t1);
}
.drw-acc-hdr em {
  color: var(--t3);
  font-style: normal;
  text-transform: none;
  letter-spacing: 0;
  font-size: 11px;
  font-weight: 400;
}
.drw-acc-arrow {
  font-family: 'Material Symbols Outlined';
  font-size: 18px;
  color: var(--t3);
  transition: transform var(--dur-fast);
}
.drw-acc-body {
  display: none;
  padding: 0 24px 16px;
}
.drw-acc-body.open {
  display: block;
}
```

---

## 5. Analytics Tab — Reorganize with Collapsible Sections

### Problem
The Analytics modal Overview panel dumps everything in a vertical scroll with no hierarchy. Hard to scan. Features overlap visually.

### Solution: Bento-style overview with collapsible detail cards

#### 5a. Overview Panel Layout

Rebuild `renderAmOverview()` in app.js to use this layout structure:
```
[Hero Stats Row — 4 stat tiles]
[2-col grid]
  [Left: Upload Activity card]   [Right: Performance Score card]
[Full-width: Top 5 This Month — collapsible]
[Full-width: All-Time Best Video — collapsible, collapsed by default]
[Full-width: vs Competitors snapshot]
```

**Top-level stats row CSS (add to style.css):**
```css
.am-stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--bd);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--bd);
  margin-bottom: 20px;
}
.am-stat-tile {
  background: var(--sf-low);
  padding: 18px 20px;
}
.am-stat-tile:first-child {
  background: linear-gradient(135deg, rgba(245,200,66,0.06), var(--sf-low));
}
.am-stat-lbl {
  font-size: 9px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.2px;
  color: var(--t3); margin-bottom: 6px;
  font-family: 'Outfit', sans-serif;
}
.am-stat-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px; font-weight: 700;
  letter-spacing: -0.5px; color: var(--t1);
}
.am-stat-val.gold { color: var(--gold); }
.am-stat-val.green { color: var(--gr); }
.am-stat-val.cyan { color: var(--pr); }
```

#### 5b. New Feature: Top 5 Videos This Month (collapsible)

**Add this section to `renderAmOverview()` (after loading videos):**
```js
async function buildTop5ThisMonth(channelId, containerEl) {
  const vids = await getAmFullVideos(channelId); // reuse existing cache getter
  const now = Date.now();
  const monthVids = vids
    .filter(v => !isYouTubeShort(v))
    .filter(v => {
      const t = new Date(v.published_at || v.date).getTime();
      return !isNaN(t) && (now - t) < 30 * 864e5;
    })
    .sort((a, b) => (b.view_count ?? b.views_raw ?? 0) - (a.view_count ?? a.views_raw ?? 0))
    .slice(0, 5);

  if (!monthVids.length) {
    containerEl.innerHTML = `<p style="color:var(--t3);font-size:13px;padding:16px 0">No long-form videos published this month.</p>`;
    return;
  }

  containerEl.innerHTML = monthVids.map((v, i) => {
    const vc = v.view_count ?? v.views_raw ?? 0;
    const eng = calcEngagementRate(v.like_count ?? 0, v.comment_count ?? 0, vc);
    const medals = ['🥇','🥈','🥉','4.','5.'];
    return `
    <div class="am-top-row">
      <div class="am-top-rank">${medals[i]}</div>
      <img class="am-top-thumb" src="${esc(proxyImg(v.thumbnail_url || v.thumb || ''))}" onerror="this.style.background='var(--sf-highest)'" alt="">
      <div class="am-top-info">
        <div class="am-top-title">${esc((v.title||'').substring(0,60))}${(v.title||'').length>60?'…':''}</div>
        <div class="am-top-meta">
          <span style="color:var(--pr);font-family:'JetBrains Mono',monospace;font-weight:700">${fmtN(vc)} views</span>
          ${eng !== null ? `<span style="color:${engagementColor(eng).replace('color:','')}">· ${eng}% eng</span>` : ''}
          <span style="color:var(--t3)">${v.date || ''}</span>
        </div>
      </div>
      <a href="${esc(v.url||'#')}" target="_blank" rel="noopener" class="am-top-link" onclick="event.stopPropagation()">↗</a>
    </div>`;
  }).join('');
}
```

**CSS for top-5 rows:**
```css
.am-top-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.am-top-row:last-child { border-bottom: none; }
.am-top-rank {
  font-size: 16px;
  width: 28px;
  flex-shrink: 0;
  text-align: center;
}
.am-top-thumb {
  width: 80px;
  aspect-ratio: 16/9;
  object-fit: cover;
  border-radius: 6px;
  background: var(--sf-highest);
  flex-shrink: 0;
}
.am-top-info {
  flex: 1;
  min-width: 0;
}
.am-top-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--t1);
  line-height: 1.4;
}
.am-top-meta {
  font-size: 11.5px;
  color: var(--t3);
  margin-top: 4px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  font-family: 'Outfit', sans-serif;
}
.am-top-link {
  width: 28px; height: 28px;
  display: grid; place-items: center;
  background: rgba(255,255,255,0.05);
  border-radius: 6px;
  color: var(--t3);
  font-size: 13px;
  text-decoration: none;
  transition: all var(--dur-fast);
  flex-shrink: 0;
}
.am-top-link:hover { background: rgba(255,255,255,0.1); color: var(--t1); }
```

#### 5c. New Feature: All-Time Best Video (collapsible, collapsed by default)

**Add after top-5 section:**
```js
async function buildAllTimeBest(channelId, containerEl) {
  const vids = await getAmFullVideos(channelId);
  const longForm = vids.filter(v => !isYouTubeShort(v));
  if (!longForm.length) return;

  const best = longForm.reduce((a, b) =>
    (b.view_count ?? b.views_raw ?? 0) > (a.view_count ?? a.views_raw ?? 0) ? b : a
  );
  const vc = best.view_count ?? best.views_raw ?? 0;
  const eng = calcEngagementRate(best.like_count ?? 0, best.comment_count ?? 0, vc);

  containerEl.innerHTML = `
  <div class="am-best-card">
    <img class="am-best-thumb" src="${esc(proxyImg(best.thumbnail_url || best.thumb || ''))}" onerror="this.style.background='var(--sf-highest)'" alt="">
    <div class="am-best-body">
      <div class="am-best-title">${esc(best.title || '')}</div>
      <div class="am-best-stats">
        <span class="am-best-views">${fmtN(vc)} views</span>
        ${eng !== null ? `<span style="color:${engagementColor(eng).replace('color:','')}">· ${eng}% engagement</span>` : ''}
        <span style="color:var(--t3)">${best.date || ''}</span>
      </div>
      <a href="${esc(best.url || '#')}" target="_blank" rel="noopener" class="btn btn-gh btn-sm" style="margin-top:10px;display:inline-flex" onclick="event.stopPropagation()">Watch on YouTube ↗</a>
    </div>
  </div>`;
}
```

**CSS:**
```css
.am-best-card {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 4px 0;
}
.am-best-thumb {
  width: 160px;
  aspect-ratio: 16/9;
  object-fit: cover;
  border-radius: 8px;
  background: var(--sf-highest);
  flex-shrink: 0;
}
.am-best-body {
  flex: 1;
  min-width: 0;
}
.am-best-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--t1);
}
.am-best-stats {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  margin-top: 8px;
  font-family: 'Outfit', sans-serif;
  color: var(--t3);
}
.am-best-views {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--gold);
}
```

#### 5d. Overview Panel Full HTML structure (renderAmOverview replacement)

Replace the entire `renderAmOverview(ch)` function body with this structure. Note: some data is available immediately from `ch`, the rest loads async:

```js
function renderAmOverview(ch) {
  const panel = document.getElementById('amPanel-overview');
  panel.innerHTML = `
  <!-- Stat Row -->
  <div class="am-stat-row">
    <div class="am-stat-tile">
      <div class="am-stat-lbl">Subscribers</div>
      <div class="am-stat-val gold">${esc(ch.subscribers)}</div>
    </div>
    <div class="am-stat-tile">
      <div class="am-stat-lbl">Total Views</div>
      <div class="am-stat-val">${esc(ch.total_views)}</div>
    </div>
    <div class="am-stat-tile">
      <div class="am-stat-lbl">Videos</div>
      <div class="am-stat-val cyan">${esc(ch.total_videos)}</div>
    </div>
    <div class="am-stat-tile">
      <div class="am-stat-lbl">Avg Views</div>
      <div class="am-stat-val green">${esc(ch.avg_views)}</div>
    </div>
  </div>

  <!-- Top 5 This Month — open by default -->
  <div class="am-section">
    <div class="am-sec-hdr" onclick="this.nextElementSibling.classList.toggle('open');this.querySelector('.am-sec-arrow').style.transform=this.nextElementSibling.classList.contains('open')?'rotate(0deg)':'rotate(-90deg)'">
      <div class="am-sec-title">
        <span style="font-size:16px">📅</span> Top 5 This Month
        <span class="am-sec-sub">Long-form only · Shorts excluded</span>
      </div>
      <span class="am-sec-arrow" style="font-family:'Material Symbols Outlined';font-size:20px;color:var(--t3);transition:transform .2s">expand_more</span>
    </div>
    <div class="am-sec-body open" id="amTop5Container">
      <div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:13px;padding:12px 0"><div class="spin"></div>Loading…</div>
    </div>
  </div>

  <!-- All-Time Best — collapsed by default -->
  <div class="am-section">
    <div class="am-sec-hdr" onclick="this.nextElementSibling.classList.toggle('open');this.querySelector('.am-sec-arrow').style.transform=this.nextElementSibling.classList.contains('open')?'rotate(0deg)':'rotate(-90deg)'">
      <div class="am-sec-title">
        <span style="font-size:16px">🏆</span> All-Time Best Video
        <span class="am-sec-sub">Most views ever · Long-form only</span>
      </div>
      <span class="am-sec-arrow" style="font-family:'Material Symbols Outlined';font-size:20px;color:var(--t3);transition:transform .2s;transform:rotate(-90deg)">expand_more</span>
    </div>
    <div class="am-sec-body" id="amAllTimeBestContainer">
      <div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:13px;padding:12px 0"><div class="spin"></div>Loading…</div>
    </div>
  </div>

  <!-- About -->
  ${ch.description ? `
  <div class="am-section">
    <div class="am-sec-hdr" onclick="this.nextElementSibling.classList.toggle('open');this.querySelector('.am-sec-arrow').style.transform=this.nextElementSibling.classList.contains('open')?'rotate(0deg)':'rotate(-90deg)'">
      <div class="am-sec-title">
        <span style="font-size:16px">ℹ️</span> About
      </div>
      <span class="am-sec-arrow" style="font-family:'Material Symbols Outlined';font-size:20px;color:var(--t3);transition:transform .2s">expand_more</span>
    </div>
    <div class="am-sec-body open">
      <p style="font-size:13.5px;color:var(--t2);line-height:1.65">${esc(ch.description)}${ch.description.length>=400?'…':''}</p>
    </div>
  </div>` : ''}
  `;

  // Async load the video-dependent sections
  const amTop5El = document.getElementById('amTop5Container');
  const amBestEl = document.getElementById('amAllTimeBestContainer');
  if (amTop5El) buildTop5ThisMonth(ch.id, amTop5El);
  if (amBestEl) buildAllTimeBest(ch.id, amBestEl);
}
```

**Section CSS:**
```css
.am-section {
  border-top: 1px solid var(--bd);
  margin: 0 -24px;
  padding: 0 24px;
}
.am-sec-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  cursor: pointer;
  user-select: none;
  transition: opacity var(--dur-fast);
}
.am-sec-hdr:hover { opacity: 0.8; }
.am-sec-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: var(--t1);
}
.am-sec-sub {
  font-size: 10.5px;
  color: var(--t3);
  font-weight: 400;
  letter-spacing: 0;
}
.am-sec-body {
  display: none;
  padding-bottom: 20px;
}
.am-sec-body.open {
  display: block;
}
```

---

## 6. Analytics Modal — General Improvements

### 6a. Modal sizing (style.css)

Find `.am` (the modal container) and update:
```css
.am {
  /* existing: keep most, change: */
  width: 860px;         /* was probably smaller */
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  border-radius: 16px;  /* rounder */
  box-shadow: 0 32px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset;
}
```

### 6b. Tab bar improvement

Tabs currently use text + icon inline. Make them cleaner:
```css
.am-tab {
  /* Find existing .am-tab and add/change: */
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 12.5px;
  gap: 6px;
  /* Remove bottom border indicator — use background pill instead */
  border-bottom: none !important;
}
.am-tab.on {
  background: rgba(0,212,255,0.1);
  color: var(--pr);
  border: 1px solid rgba(0,212,255,0.2);
}
```

### 6c. Analytics modal body padding
```css
.am-body {
  padding: 24px;  /* ensure consistent padding */
  overflow-y: auto;
  flex: 1;
}
.am-panel {
  display: none;
}
.am-panel.on {
  display: block;
  animation: fadeUp 0.25s var(--e) both;
}
```

---

## 7. Summary of All File Changes

### `index.html`
- Add `DM+Sans` to Google Fonts URL

### `static/style.css`
- Add `.cc-spark-tooltip` and related styles (Section 1)
- Add `.drw` modal redesign (Section 4a)
- Add `.drw-stats-grid`, `.drw-stat-*` styles (Section 4b)
- Add `.drw-two-col` (Section 4c)
- Add `.drw-accordion`, `.drw-acc-*` styles (Section 4d)
- Add `.am-stat-row`, `.am-stat-tile` (Section 5a)
- Add `.am-top-row`, `.am-top-*` (Section 5b)
- Add `.am-best-card`, `.am-best-*` (Section 5c)
- Add `.am-section`, `.am-sec-*` (Section 5d)
- Modify `.am` sizing (Section 6a)
- Modify `.am-tab` styles (Section 6b)
- Modify `.am-body`, `.am-panel` (Section 6c)
- Replace all `font-family:'Syne'` → `'Outfit'`
- Add `.ch-card:hover` gradient (Section 3b)

### `static/app.js`
- Add `isYouTubeShort(v)` utility function (Section 2)
- Modify spark bar render to use tooltips (Section 1)
- Apply `isYouTubeShort` filter in 4 locations (Section 2a–2d)
- Add `toggleAcc(btn)` function (Section 4d)
- Add `buildTop5ThisMonth(channelId, el)` function (Section 5b)
- Add `buildAllTimeBest(channelId, el)` function (Section 5c)
- Replace `renderAmOverview(ch)` body (Section 5d)
- Restructure `openDrawer()` HTML output (Sections 4b–4d)

---

## 8. Implementation Order (recommended)

1. **Start with `isYouTubeShort()`** — it's a dependency for everything else
2. Spark bar tooltips (CSS + JS, self-contained)
3. Shorts filtering (apply to existing code)
4. Drawer → modal CSS changes (no JS needed for the layout shift)
5. Drawer content restructure (accordion, 2-col)
6. Analytics modal: stat row + section wrappers
7. Top 5 This Month + All-Time Best (new async functions)
8. UI polish (fonts, card hover, tab styles)

---

## 9. Important Notes for the AI Implementing This

- **Do not break existing functionality** — the drawer's existing API calls (`/api/channels/${id}/videos`) stay the same, only the HTML output changes
- **`getAmFullVideos(channelId)`** — this is an existing function in app.js that caches the full video list. Reuse it in `buildTop5ThisMonth` and `buildAllTimeBest`
- **`proxyImg(url)`** — always use this for image URLs from YouTube CDN
- **`esc(str)`** — always use this for user-supplied strings in HTML
- **All new CSS should use existing CSS variables** (`--pr`, `--gold`, `--gr`, `--sf`, `--bd`, etc.) — do not hardcode colors
- **Test on both wide (1440px) and narrow (900px) viewports** — the drawer modal and analytics modal need `max-width: calc(100vw - 32px)` to be mobile-safe
- **The `.am-panel.on` animation** should reset when switching tabs — the existing `switchAnalyticsTab()` function handles this
- **Shorts badge on spark chart** — dim the bar (opacity: 0.45) and note it in tooltip. Do NOT remove shorts from the spark chart entirely since it's useful to see upload frequency