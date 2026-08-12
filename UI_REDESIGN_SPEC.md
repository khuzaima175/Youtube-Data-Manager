# YT Tracker — Full UI Rebuild Specification

> **How to use:** Save this as `UI_REDESIGN_SPEC.md` in the repo root. Instruct the model: *"Implement the phases in order, do not touch backend/API endpoints, do not drop any existing feature (see Feature Preservation Map), commit per phase, and run the QA checklist at the end."*

---

## 0. North Star

The product's #1 job is: **"Compare MY channel against the field, instantly; go deep only if I choose."** Every decision below serves this rule:

| Depth | Experience |
|---|---|
| **0 clicks** | Dashboard opens directly on a "You vs Field" panel (rank, gaps, bars). Comparison is visible on load. |
| **1 click** | Any row/card → full **Deep Dive** page. Any checkbox/"+" → adds channel to the global **Compare set**. |
| **2 clicks** | Deep Dive → **Compare tab** → full matrix + overlay charts + auto-insights. |

Design principles:
1. **One surface per job.** Kill the duplicate Drawer + Modal; replace with a single full-page Deep Dive.
2. **No voids.** Every card is dense edge-to-edge; if a region has >32px of unexplained empty space, it must be filled with data or the card must shrink.
3. **Connected visuals.** Each channel gets a permanent color hue used in *every* bar, spark, chip, and column. "My channel" is gold everywhere.
4. **One source of truth** for derived metrics (engagement, avg views, views/day) — computed once, cached, reused on all surfaces (fixes current 9.7% vs 8.4% mismatch).
5. **No raw browser controls, no emoji icons.** Everything styled; Material Symbols only.

---

## 1. Diagnosis — Why the current UI feels broken (from your screenshots)

1. **Two overlapping inspection surfaces** (slide-in Drawer with Videos/Analytics/About AND Analytics Modal with Overview/Monthly/Top Videos/vs Competitors/Timeline). Duplicate purpose, duplicate tabs, different triggers → "not connected".
2. **Dashboard hero card is ~60% empty** — identity block top-left, thumbnail floating right, stats pinned bottom, huge dead zone between.
3. **Modal Overview grid has dead cells** — empty area right of the AVG VIEWS / AUDIENCE % cards; misaligned 2-column composition.
4. **vs Competitors table clips the last column** (CADa… cut), hidden scrollbar affordance, and ~40% of the modal below the table is empty black.
5. **My Channels rows are hollow** — data pushed to far left/right edges, entire middle of every card is empty.
6. **Native `<select>` controls** (Sort, Long-form, 5 Most Recent) render OS-styled → looks broken against the dark theme.
7. **Emoji as icons** (👁 🎬 💬 in Performance cards) clash with Material Symbols used elsewhere.
8. **Inconsistent color semantics** — red/green/gold values with no legend; red used for plain view counts (reads as "bad").
9. **Comparison is buried** 2 clicks deep in a modal tab, although it's the main task.
10. **No skeleton/empty/error states** → rough patches and layout jumps while data loads.
11. **Data inconsistency**: engagement shows 9.7% on dashboard but 8.4% on the expanded card for the same channel.

---

## 2. New Information Architecture

```
Top Bar (persistent):  YTTracker | Dashboard | Channels | Search |  COMPARE TRAY [You][BG][BE][+] | ⟳ | (/)
│
├─ #page-dash        Dashboard (comparison-first command center)
├─ #page-channels    My Channels (management, dense rows)
├─ #page-search      Search (unchanged logic, restyled)
└─ #page-channel     DEEP DIVE (full-viewport overlay route; replaces Drawer AND Modal)
     Tabs: Overview | Videos | Growth | Compare
```

### Feature Preservation Map (nothing may be lost)

| Old location | New home |
|---|---|
| Drawer → Videos tab (Shorts toggle, filters) | Deep Dive → **Videos** |
| Drawer → Analytics (views curve, 52-wk calendar, word cloud) | Deep Dive → **Growth** |
| Drawer → About (bio, joined, IDs) | Deep Dive → **Overview** side card |
| Modal → Overview KPIs | Deep Dive → **Overview** |
| Modal → Monthly history | Deep Dive → **Growth** (monthly table) |
| Modal → Top Videos (range filters) | Deep Dive → **Videos** (sort by views + 30/90/all-time filter) |
| Modal → vs Competitors matrix | Deep Dive → **Compare** (full width) + Dashboard "You vs Field" |
| Modal → Timeline (snapshots) | Deep Dive → **Growth** (snapshot line chart) |
| Dashboard hero card | "My Channel Strip" (dense) |
| Dashboard leaderboards | Full-width Leaderboard table |
| Set Mine / Refresh / Delete / Export CSV / Add Channel / autocomplete / '/' shortcut / Esc / toasts / img-proxy / caches | Unchanged behavior, restyled |

**DELETE entirely:** `#drw`, `#analyticsModal`, `openDrawer()`, `switchDrwTab()`, `openAnalyticsModal()`, `switchAnalyticsTab()`, all emoji icons, all unstyled `<select>`s.

---

## 3. Design System (implement first — everything else uses it)

### 3.1 Tokens (replace `:root`)

```css
:root{
  /* surfaces */
  --bg-0:#090d11; --bg-1:#0d1319; --bg-2:#121a22; --bg-3:#18222c;
  --line-1:rgba(148,163,184,.08); --line-2:rgba(148,163,184,.18);
  /* text */
  --t1:#eaf1f7; --t2:#9fb0bf; --t3:#64788a;
  /* semantics: cyan=interactive, gold=ME, green=good/up, red=bad/down */
  --acc:#22d3ee; --me:#f5c542; --up:#3ddc97; --down:#ff6b6b; --warn:#ffb454;
  /* shape & spacing (4px grid) */
  --r-s:8px; --r-m:12px; --r-l:16px;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px; --s7:48px;
  /* type */
  --f-disp:'Syne'; --f-ui:'DM Sans'; --f-mono:'JetBrains Mono';
  --sh-1:0 6px 24px rgba(0,0,0,.45);
}
```

### 3.2 Type & number rules
- Page title: `Syne 700 28px`; card title: `DM Sans 600 15px`; body: `13px var(--t2)`.
- Section label: `11px 600 uppercase letter-spacing:.08em color:var(--t3)` with a 16px Material icon left.
- **Every numeric value** = `JetBrains Mono 700` (20–24px in tiles, 13px in tables).
- Deltas: `▲ +12.4%` green / `▼ −8.1%` red / `• 0.0%` gray — arrows are Material Symbols, never colored plain numbers without an arrow.
- One formatter everywhere: `fmtN()` → `24.5K`, `3.70M` (always 3 sig figs).

### 3.3 Channel color system (the "connected" glue)
```js
const hueOf = id => id==='PRIMARY' ? null : (hash(id) % 360);
const colorOf = ch => ch.isPrimary ? 'var(--me)' : `hsl(${hueOf(ch.id)} 70% 62%)`;
```
Use `colorOf()` in: leaderboard inline bars, velocity chart series, compare tray chips, sparklines, compare-table column headers, face-off medals. Same channel = same color on every screen.

### 3.4 Core components (CSS classes to create)
`.card` (bg-2, line-1 border, r-m, padding s4, flex-column), `.tile` (stat tile: label top, mono value, spark+delta bottom — **no empty middle**), `.chip`, `.chip-me` (gold), `.delta-up/.delta-down`, `.btn`, `.btn-acc`, `.btn-ghost`, `.icon-btn`, `.tabs/.tab/.tab.on`, `.sel` (styled select wrapper: `appearance:none` + custom chevron `::after`, mono text, bg-3), `.table` (dense, row hover bg-3, 1px line-1 separators), `.skel` (shimmer block), `.empty` (centered inline-SVG + text + CTA), `.toast`, styled scrollbars (6px, bg-3 thumb), `.ic-tile` (28px rounded square, tinted bg, 16px Material icon — replaces all emoji).

**Rule:** every async region renders one of 3 states: `.skel` while loading, `.empty` when no data, inline retry card on error.

---

## 4. Shell / Top Bar

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ YTTracker │ Dashboard │ Channels(8) │ Search │   COMPARE [🟡 CAD][BG][BE] [+] │ ⟳ │ (/) │
└────────────────────────────────────────────────────────────────────────────────┘
```
- **Compare Tray (new, persistent on all pages):** chips = current compare set (max 4 + You). `[+]` opens a popover listing all tracked channels with checkboxes (uses existing `all[]`, zero API calls). Clicking a chip removes it. Tray state stored in `compareSet[]` (localStorage-persisted).
- Sticky, `backdrop-filter: blur(12px)`, bg `rgba(9,13,17,.8)`.
- Shortcuts preserved: `/` → search, `Esc` → closes Deep Dive / popovers.

---

## 5. Page 1 — Dashboard (rebuild, comparison-first)

```
┌─ MY CHANNEL STRIP (single dense card, no voids) ─────────────────────────────────────┐
│ (●avatar) CADable  ⭐ My Channel · PK · @cadable      [TILE Subs][TILE Views][TILE Avg][TILE Eng]  [Deep Dive →] │
│            since 2016-10-15                            24.5K ▲0.4%  3.70M  7.9K  9.7%            │
│                                                        (each tile: 30-day spark + delta)          │
├─ YOU VS FIELD  (THE main-task panel — visible without scrolling) ────────────────────┤
│ metric chips: [Subscribers][Avg Views][Engagement][Uploads/mo]                        │
│ ┌ RANK LADDER ──────┐ ┌ GROUPED BARS ────────────┐ ┌ AUTO-INSIGHTS ─────────────────┐ │
│ │ #1 Blender 3.42M  │ │ You vs top-3 rivals,     │ │ • You rank #7/8 in subs        │ │
│ │ #2 Branch  2.70M  │ │ selected metric, value   │ • 4.8K subs to overtake 3D World │ │
│ │ …                 │ │ labels, you=gold bar     │ • Best metric: Engagement #2/8   │ │
│ │ #7 CADable ◀ gold │ │                          │ • ▼68% views vs last month       │ │
│ └───────────────────┘ └──────────────────────────┘ └────────────────────────────────┘ │
├─ LEADERBOARD (full-width dense table; row click → Deep Dive; [+] adds to compare) ──┤
│ # │ Channel │ Subscribers ▓▓▓▓ (hue bar) │ Avg Views │ Total Views │ Videos │ Last Upload │ + │
├──────────────────────────────────────────┬───────────────────────────────────────────┤
│ UPLOAD VELOCITY (6-mo grouped bars,        │ LATEST VIDEO FACE-OFF (ranked medal cards │
│ legend + hover tooltip + axis labels)      │ #1 🥇 name · views · eng · hrs ago)       │
├──────────────────────────────────────────┴───────────────────────────────────────────┤
│ YOUR RECENT UPLOADS (horizontal scroll cards: thumb, title, views, eng chip, date)   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Block specs:
- **My Channel Strip:** grid `auto 1fr auto`; 4 `.tile`s fill the former void; whole strip hover = pointer, click = `openDeepDive(me.id)`.
- **You vs Field:** metric chips switch all 3 sub-panels at once. Rank ladder = mini table, your row gold-tinted with `◀ YOU`. Grouped bars = SVG, 4 groups max (You + top 3 by metric), value labels on bars, hover tooltip. **Auto-Insights card** = `genInsights()` output (spec below) — this card guarantees no empty space and delivers the "easiest" comparison: plain sentences.
- **Leaderboard table:** sorted by active tray metric (default subs); inline horizontal hue bar under subscriber number; last column `+` icon-btn = add/remove from compareSet; row click → Deep Dive **Compare** tab focused on that channel.
- **Velocity & Face-off:** restyle only (legend, axis labels, tooltips, medal chips #1/#2/#3 in gold/silver/bronze), same zero-quota data.

### `genInsights(me, all)` — auto comparison sentences (new function)
Returns 4–6 items `{tone:'up'|'down'|'info', text}` computed purely from cached `all[]` + `_enrichCache`:
1. Rank per metric: `You rank #${r}/8 in ${metric}.`
2. Gap to next: `${fmtN(gap)} subs to overtake ${nameAbove}.` (or "leads you by…")
3. Strongest metric (best rank) and weakest metric.
4. Momentum: this-month views vs last month (▲/▼ %).
5. Cadence: your uploads/mo vs field median.
Render as bullet list with tinted Material icons (`trending_up`, `trending_down`, `insights`).

---

## 6. Page 2 — My Channels (fill the hollow rows)

Toolbar: `[filter input] [ .sel Sort ] [view: list|grid] [Export CSV] [Refresh All] [+ Add Channel]` (Add Channel expands inline panel with existing autocomplete).

Row = 12-col grid, **no empty middle**:

```
┌───────┬──────────────────────┬──────────┬────────┬─────────┬─────────┬──────────┬─────┐
│ avatar│ CADable              │ sparkline│ 24.5K  │ 7.9K    │ 9.7%    │ 2d ago   │ ⋯   │
│ (hue  │ @cadable ⭐Me PK [+cmp]│ 30d views│ subs   │ avg views│ engage │ last up  │acts │
└───────┴──────────────────────┴──────────┴────────┴─────────┴─────────┴──────────┴─────┘
```
- Hover reveals actions in last col: `open_in_new` (Deep Dive), `star` (Set Mine), `compare_arrows` (add to tray), `refresh`, `delete`.
- Row click → Deep Dive Overview. Primary row has gold left border + `--me` tint.
- Remove the old inline "expand" behavior entirely (Deep Dive replaces it — one surface).

---

## 7. Page 3 — Search
Logic unchanged. Restyle: input as `.card` with leading icon, results as dense rows matching Channels rows, Track button `.btn-acc`. Add `.skel` rows during fetch and `.empty` state ("No channels found for 'x' — try @handle").

---

## 8. Deep Dive (replaces Drawer + Modal) — `#page-channel`

Full-viewport overlay (position:fixed, bg-0, own scroll), sticky header:

```
[← Back]  (●) Blender Guru  @blenderguru · US · joined 2012        [☆ Set Mine][+ Compare][⟳][🗑][×]
          3.42M subs · 251 videos
Tabs: [Overview] [Videos] [Growth] [Compare]
```

### Tab: Overview (fixes old dead-zone grid → uniform 12-col)
```
┌ KPI TILES ×4 (Subs+spark, Total Views, Avg Views, Audience %) ────────┐ ┌ ABOUT CARD ─────────┐
│ each .tile dense: label / mono value / delta or spark                 │ │ bio (3-line clamp), │
├───────────────────────────────────────────────────────────────────────┤ │ country, joined,    │
│ THIS MONTH: views ▲/▼, uploads n, best video (thumb+title+views)      │ │ channel ID copy btn │
├ TOP 5 VIDEOS mini-list (thumb, title, views mono, eng chip, age) ─────┤ └─────────────────────┘
```
No cell may be empty: if a metric is missing, show `—` + `.skel`-sized placeholder with tooltip "no data".

### Tab: Videos
Merges old Drawer-Videos + Modal-Top-Videos: toolbar `[.sel Long-form/Shorts/All] [.sel 5/10/25 Most Recent / Most Viewed] [.sel 30d/90d/All-time]`; list rows identical to Overview mini-list but full width; "Most Viewed" sort = old Top Videos with rank medals; external-link icon per row → YouTube.

### Tab: Growth
Stacked cards: (1) **Snapshot timeline** line chart (Supabase snapshots; your hue vs focused channel hue, legend, tooltip); (2) **Monthly table** (month, uploads, views, Δ%); (3) two half-cards: **52-week calendar heatmap** + **title word cloud**. All moved from old surfaces, restyled with axis labels & legends.

### Tab: Compare (the money screen — fixes clipped table + dead space)
```
metric chips: [Subs][Total Views][Avg Views/Video][Videos][Engagement]
┌ OVERLAY CHART: snapshot curves, focused + compareSet channels (hue lines, legend) ┐
┌ MATRIX TABLE (full width) ────────────────────────────────────────────────────────┐
│ METRIC (sticky) │ 🟡 CADable(YOU) │ ● Focused │ ● rival │ ● rival │ … all 8, scroll │
│ Subscribers     │ 24.5K #8        │ 3.42M #1▲Best │ …                              │
└───────────────────────────────────────────────────────────────────────────────────┘
┌ READ-OUT CARD (kills the old dead space): genInsights() comparing focused vs YOU ┐
```
Table rules (exact CSS in Appendix B): `overflow-x:auto`; column `min-width:128px`; **first column `position:sticky;left:0`**; right-edge gradient fade + "scroll →" hint only while scrollable; YOU column gold-tinted + inset border; focused column cyan-tinted; each cell = mono value + `#rank` below; best cell green + `▲ Best` chip. Because the page is full-viewport (not a 960px modal), all 8 columns nearly fit and scrolling is graceful.

---

## 9. JavaScript Refactor Plan (app.js)

**State additions:** `compareSet` (localStorage), `hueMap`, `dd = {id, tab, videos, snapshots}`.
**Single source of truth:** extend existing `enrich()` to compute `{engagement, avgViews, viewsPerDay, audiencePct, momDelta}` once into `_enrichCache`; **all surfaces read from cache only** (fixes 9.7 vs 8.4 bug).
**DELETE:** `openDrawer, switchDrwTab, openAnalyticsModal, switchAnalyticsTab`, `#drw`, `#analyticsModal` DOM/CSS.
**ADD:** `openDeepDive(id, tab='overview')`, `renderDDOverview/Videos/Growth/Compare`, `renderCompareTray()`, `toggleCompare(id)`, `genInsights(me, all)`, `hueOf/colorOf`, `sparkSVG(vals,w,h,color)` (Appendix A), `groupBarsSVG(...)`, `lineSVG(series[])`, `skeleton(htmlFor)`, `fmtDelta(v)`.
**MODIFY:** `sp()` to handle overlay route + body scroll-lock; `renderDash()` → new 5-block layout; `renderChannels()` → dense rows; keep every `/api/*` call, `_enrichCache` TTL, img-proxy usage, CSV export, set-primary, refresh flows **byte-identical** (quota parity: zero new YouTube calls).

---

## 10. Phased Build Order (execute sequentially)

**Phase A — Foundation:** A1 replace `:root` tokens; A2 type/number rules; A3 build component classes (§3.4); A4 swap every emoji → Material `.ic-tile`; A5 replace every native `<select>` with `.sel`; A6 global styled scrollbars + focus rings. *DoD: no emoji, no raw selects anywhere.*
**Phase B — Shell:** B1 top bar blur + active tab underline; B2 Compare Tray + popover + localStorage; B3 `/` and `Esc` wiring. *DoD: tray visible on all pages; add/remove chip updates state.*
**Phase C — Dashboard:** C1 My Channel Strip; C2 You-vs-Field panel + `genInsights()`; C3 Leaderboard table with hue bars + `+` column; C4 restyle velocity/face-off/uploads. *DoD: comparison visible at 0 clicks; no card with voids.*
**Phase D — Channels page** dense rows + hover actions + skeletons.
**Phase E — Deep Dive:** E1 overlay route + header + tabs; E2 Overview; E3 Videos; E4 Growth; E5 Compare table + read-out; E6 delete drawer & modal code. *DoD: every old feature reachable in ≤2 clicks.*
**Phase F — Data consistency:** single `enrich()` derived metrics; verify identical numbers on strip, row, tiles, matrix.
**Phase G — States & responsive:** skeletons/empty/error for all async regions; breakpoints 1280 / 960 / 768 (grids collapse 4→2→1 cols; matrix scrolls with fade).
**Phase H — QA** (below).

---

## 11. QA Checklist (final gate)

- [ ] Dashboard shows You-vs-Field on load (0-click comparison); insights sentence card populated.
- [ ] Row/card click → Deep Dive; `Esc`/Back returns; no drawer/modal remnants in DOM.
- [ ] Matrix shows all 8 channels (scroll + fade + sticky metric col); YOU gold, focused cyan, best green.
- [ ] Same channel hue on tray chips, leaderboard bars, velocity, overlay chart; ME gold everywhere.
- [ ] Engagement/avg-views values identical on strip, channels row, overview tiles, matrix.
- [ ] No emoji, no native selects, no unexplained empty region >32px, no clipped text at 1280/1024/768.
- [ ] All async regions show `.skel` → content; empty & error+retry states exist.
- [ ] Network tab: identical API call count as before redesign (quota parity).
- [ ] CSV export, Set Mine, Refresh, Delete, Add-channel autocomplete, toasts all still work.

---

## Appendix — Reference snippets

**A. `sparkSVG`**
```js
const sparkSVG=(v,w=120,h=32,c='var(--acc)')=>{const mn=Math.min(...v),mx=Math.max(...v),r=mx-mn||1;
const p=v.map((x,i)=>`${i/(v.length-1)*w},${h-3-(x-mn)/r*(h-6)}`).join(' ');
return `<svg viewBox="0 0 ${w} ${h}" class="spark"><polyline points="${p}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`;};
```

**B. Compare matrix essentials**
```css
.cmp-wrap{position:relative;overflow-x:auto}
.cmp-wrap.can-r::after{content:"";position:sticky;right:0;top:0;bottom:0;width:48px;
  background:linear-gradient(90deg,transparent,var(--bg-2));pointer-events:none}
.cmp th:first-child,.cmp td:first-child{position:sticky;left:0;z-index:2;background:var(--bg-2)}
.cmp td,.cmp th{min-width:128px;padding:12px;border-bottom:1px solid var(--line-1)}
.cmp .col-me{background:color-mix(in srgb,var(--me) 7%,transparent);box-shadow:inset 3px 0 0 var(--me)}
.cmp .col-focus{background:color-mix(in srgb,var(--acc) 7%,transparent)}
.cmp .rank{display:block;font:600 10px var(--f-mono);color:var(--t3)}
.cmp .best{color:var(--up)} 
```

**C. Stat tile (the void-killer)**
```html
<div class="tile"><span class="lbl">Subscribers</span>
 <span class="val">24.5K</span>
 <span class="foot">${sparkSVG(sp30)} <em class="delta-up">▲ 0.4%</em></span></div>
```
```css
.tile{display:flex;flex-direction:column;gap:6px;background:var(--bg-3);border:1px solid var(--line-1);
 border-radius:var(--r-m);padding:12px 14px;min-width:150px}
.tile .val{font:700 22px var(--f-mono);color:var(--t1)}
.tile .foot{display:flex;align-items:center;gap:8px;margin-top:auto}
```
