# Video Filter System — Bug Fix Implementation Plan
### All bugs identified in `app.js` with exact line numbers and fixes

---

## Summary of Every Bug Found

| # | Bug | Where | Impact |
|---|-----|--------|--------|
| 1 | "All-Time Best" only looks at 50 videos | L1145, L1244 | Wrong for channels with 100+ videos |
| 2 | Changing filter re-fetches from API every time | L1252–1261 | Slow, wasteful, inconsistent |
| 3 | Shorts count "17 Shorts" only counts from 50 fetched | L1159 | Misleading number |
| 4 | "Hot This Week/Month" means *uploaded* that period, not *currently hot* | L1232–1242 | Confusing label vs behaviour |
| 5 | "Recent 5" shows 5 long-form when filter is longform, but 5 of all when filter is "All" — inconsistently described | L1227–1230 | Confusing |
| 6 | No video cache for the overview tab — every filter change hits the network | L1145 | Slow UX |
| 7 | `_amFullVideos` is cached but never used by the Overview tab | L1103, L1330 | Wasted opportunity |

---

## Bug 1 + 2 + 6 + 7 — The Root Fix (Most Important)

**The problem in one sentence:** The Overview tab fetches `max=50` videos and re-fetches on every filter change. The Monthly tab fetches `/videos/full` (all videos) and caches it. The Overview tab should do the same.

### What to change

**Step 1: Add a module-level cache variable for overview videos** (around line 1103 where other state is declared):

```javascript
// BEFORE (line 1103–1104):
let _amVidPreset   = 'recent';   // 'recent' | 'hotWeek' | 'hotMonth' | 'alltime'
let _amVidFilter   = 'longform'; // 'longform' | 'all'

// AFTER — add one new variable:
let _amVidPreset   = 'recent';
let _amVidFilter   = 'longform';
let _amOvVids      = null;  // cached video list for overview tab (fetched once per channel)
```

**Step 2: Clear it when a new channel opens** (line 1041–1044):

```javascript
// BEFORE:
_amVidPreset='recent';
_amVidFilter='longform';

// AFTER:
_amVidPreset='recent';
_amVidFilter='longform';
_amOvVids=null;  // clear cache when switching channels
```

**Step 3: In `renderAmOverview`, fetch full videos instead of max=50, and cache them.**

Find this block (around line 1145–1148):

```javascript
// BEFORE:
fetch(`/api/channels/${ch.id}/videos?max=50`)
  .then(r => r.json())
  .then(vids => {
    if (_amChannelId !== thisChannelId) return;
```

Replace with:

```javascript
// AFTER:
const _fetchOvVids = _amOvVids
  ? Promise.resolve(_amOvVids)
  : fetch(`/api/channels/${ch.id}/videos/full`).then(r => r.json());

_fetchOvVids
  .then(vids => {
    if (_amChannelId !== thisChannelId) return;
    _amOvVids = vids;  // cache for this channel session
```

This means:
- First open: fetches all videos once via `/videos/full`
- Every filter change after: uses the cached list instantly, no network request
- Opening a different channel: cache is cleared (Step 2), fresh fetch happens

**Step 4: Update `setAmVidFilter` and `setAmVidPreset`** to just re-render from cache instead of calling the full `renderAmOverview` (which re-fetches):

```javascript
// BEFORE (lines 1252–1261):
function setAmVidFilter(filter) {
  _amVidFilter = filter;
  const ch = all.find(c => c.id === _amChannelId);
  if (ch) renderAmOverview(ch);
}

function setAmVidPreset(preset) {
  _amVidPreset = preset;
  const ch = all.find(c => c.id === _amChannelId);
  if (ch) renderAmOverview(ch);
}

// AFTER — just re-render the video list portion, not the whole overview:
function setAmVidFilter(filter) {
  _amVidFilter = filter;
  _reRenderAmVidList();
}

function setAmVidPreset(preset) {
  _amVidPreset = preset;
  _reRenderAmVidList();
}

function _reRenderAmVidList() {
  if (!_amOvVids || !_amChannelId) return;
  const vids = _amOvVids;
  const longFormVids = vids.filter(v => !isYouTubeShort(v));
  const channelAvgViews = longFormVids.length
    ? longFormVids.reduce((s, v) => s + (v.view_count ?? v.views_raw ?? 0), 0) / longFormVids.length
    : 0;
  const displayVids = getFilteredVideos(vids, _amVidFilter, _amVidPreset);
  const showRank = _amVidPreset !== 'recent';
  const ch = all.find(c => c.id === _amChannelId);
  if (!ch) return;
  const listEl = document.getElementById(`amVidListRich-${_amChannelId}`);
  if (!listEl) return;
  const emptyMsg = _amVidPreset === 'hotWeek'
    ? 'No videos uploaded this week.'
    : _amVidPreset === 'hotMonth'
    ? 'No videos uploaded this month.'
    : 'No videos found.';
  listEl.innerHTML = displayVids.length === 0
    ? `<div class="am-vid-empty">${emptyMsg}</div>`
    : displayVids.map((v, i) => buildAmVidRowRich(v, showRank ? i : null, channelAvgViews)).join('');
}
```

---

## Bug 3 — Shorts Count Is Wrong

**The problem:** Line 1159 calculates `shortsCount` from only the 50 fetched videos:

```javascript
// Line 1158–1159 — BROKEN: only counts shorts in the 50-video sample
const longFormVids = vids.filter(v => !isYouTubeShort(v));
const shortsCount  = vids.length - longFormVids.length;
```

The dropdown then shows `All (17 Shorts)` — but "17" is just how many shorts appeared in the 50 fetched. The real number could be much higher.

**After Bug 1 fix**, `vids` will be from `/videos/full` so this count will be accurate. No additional change needed — fixing Bug 1 fixes this automatically.

However, also update the label to be honest about what "All" means:

```javascript
// BEFORE (line 1168–1170):
<option value="all" ${_amVidFilter==='all'?'selected':''}>
  All${shortsCount > 0 ? ` (${shortsCount} Shorts)` : ''}
</option>

// AFTER — clearer label:
<option value="all" ${_amVidFilter==='all'?'selected':''}>
  All Videos${shortsCount > 0 ? ` · ${shortsCount} Shorts` : ''}
</option>
```

---

## Bug 4 — "Hot This Week/Month" Means Wrong Thing

**The problem:** "Hot This Week" finds videos *published* in the last 7 days, sorted by views. This is not what "hot" means to users. A user expects "what's getting the most views right now" — not "what was uploaded this week."

For MrBeast who uploads 1 video/week, this returns 0–1 video. For a channel that uploads daily, it returns up to 5. Completely inconsistent.

**Two options — pick one:**

### Option A (Simple): Rename the labels to match the actual behaviour

```javascript
// BEFORE (lines 1175–1178):
<option value="recent">Recent 5</option>
<option value="hotWeek">🔥 Hot This Week</option>
<option value="hotMonth">📅 Hot This Month</option>
<option value="alltime">🏆 All-Time Best</option>

// AFTER — honest labels:
<option value="recent">5 Most Recent</option>
<option value="hotWeek">Uploaded This Week</option>
<option value="hotMonth">Uploaded This Month</option>
<option value="alltime">All-Time Top 5</option>
```

### Option B (Better): Fix the logic to match user expectation

Change `hotWeek` and `hotMonth` to mean "highest views-per-day ratio" (velocity), not "uploaded this period":

```javascript
// In getFilteredVideos (line 1221), replace the hotWeek and hotMonth blocks:

// BEFORE:
if (preset === 'hotWeek') {
  return [...base]
    .filter(v => (now - new Date(v.published_at || v.date).getTime()) <= weekMs)
    .sort((a, b) => (b.view_count ?? b.views_raw ?? 0) - (a.view_count ?? a.views_raw ?? 0))
    .slice(0, 5);
}
if (preset === 'hotMonth') {
  return [...base]
    .filter(v => (now - new Date(v.published_at || v.date).getTime()) <= monthMs)
    .sort((a, b) => (b.view_count ?? b.views_raw ?? 0) - (a.view_count ?? a.views_raw ?? 0))
    .slice(0, 5);
}

// AFTER — sort by views-per-day (velocity), no date filter:
if (preset === 'hotWeek') {
  // "Trending" = highest views-per-day among videos from the past 90 days
  return [...base]
    .filter(v => (now - new Date(v.published_at || v.date).getTime()) <= 90 * 24 * 60 * 60 * 1000)
    .map(v => {
      const daysOld = Math.max(1, (now - new Date(v.published_at || v.date).getTime()) / 86400000);
      return { ...v, _vpd: (v.view_count ?? v.views_raw ?? 0) / daysOld };
    })
    .sort((a, b) => b._vpd - a._vpd)
    .slice(0, 5);
}
if (preset === 'hotMonth') {
  // "Best this month" = published in last 30 days, most total views
  return [...base]
    .filter(v => (now - new Date(v.published_at || v.date).getTime()) <= monthMs)
    .sort((a, b) => (b.view_count ?? b.views_raw ?? 0) - (a.view_count ?? a.views_raw ?? 0))
    .slice(0, 5);
}
```

And update the dropdown labels to match:

```javascript
<option value="recent">5 Most Recent</option>
<option value="hotWeek">🔥 Trending (Views/Day)</option>
<option value="hotMonth">📅 Best This Month</option>
<option value="alltime">🏆 All-Time Top 5</option>
```

And update the empty messages (lines 1191–1195) to match:

```javascript
const emptyMsg = _amVidPreset === 'hotWeek'
  ? 'No recent videos found to calculate trend.'
  : _amVidPreset === 'hotMonth'
  ? 'No videos uploaded this month.'
  : 'No videos found.';
```

---

## Bug 5 — "Recent 5" Count Is Affected by Filter

**The problem:** When filter is "Long-form", "Recent 5" = 5 most recent long-form. When filter is "All", "Recent 5" = 5 most recent including shorts. The label "Recent 5" doesn't tell the user which.

**Fix:** Show the actual count in the rendered section header, not just the label:

In `renderAmOverview` around line 1163, change the section label:

```javascript
// BEFORE:
<div class="am-sect-lbl" style="margin:0">Recent Videos</div>

// AFTER — shows how many are displayed:
<div class="am-sect-lbl" style="margin:0">
  Recent Videos
  <em style="font-weight:400;color:var(--t3);font-style:normal">
    — showing ${getFilteredVideos(vids, _amVidFilter, _amVidPreset).length} of ${
      _amVidFilter === 'longform'
        ? longFormVids.length + ' long-form'
        : vids.length + ' total'
    }
  </em>
</div>
```

---

## Bug — `isYouTubeShort` Duration Threshold Is Wrong

**Location:** Line 129:

```javascript
if (dur > 0 && dur <= 63) return true;
```

YouTube Shorts can be up to **3 minutes (180 seconds)** as of 2024. The 63-second threshold misses all 1–3 minute Shorts, causing them to be classified as long-form. This inflates long-form stats and under-counts shorts.

**Fix:**

```javascript
// BEFORE:
if (dur > 0 && dur <= 63) return true;

// AFTER:
if (dur > 0 && dur <= 180) return true;
```

---

## Summary — Order to Apply Changes

1. **Add `_amOvVids = null`** to the state variables block (line ~1104)
2. **Clear `_amOvVids = null`** in `openAnalyticsModal` when channel changes (line ~1044)
3. **Replace the `fetch` in `renderAmOverview`** to use `/videos/full` with caching
4. **Replace `setAmVidFilter` and `setAmVidPreset`** to call `_reRenderAmVidList()` instead of full re-render
5. **Add the `_reRenderAmVidList()` function** after `setAmVidPreset`
6. **Fix `isYouTubeShort` threshold** from `<= 63` to `<= 180`
7. **Update dropdown labels** to be honest about what each preset does
8. **Update empty messages** to match the new labels

---

## What Each Fix Does in Plain Terms

| Fix | Before | After |
|-----|--------|-------|
| Fetch full videos | Sees 50 videos max | Sees all videos for the channel |
| Cache on first load | Re-fetches on every filter click | Fetches once, filters in memory instantly |
| Shorts count | Shows count from 50-video sample | Shows real count from all videos |
| All-Time Best | Best of 50 most recent | Truly best across all videos ever |
| Hot This Week | Videos uploaded in last 7 days | Videos with highest views-per-day velocity |
| Short detection | Misses 64–180 second shorts | Correctly catches all YouTube Shorts |