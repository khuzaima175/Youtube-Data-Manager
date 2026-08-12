# UI_RACE_SPEC.md — Phase 3: Latest Drops Race Window + Deep-Dive Density

> Agent instruction: *"Structure & motion from Phases 1–2 stay. This spec (a) adds one new flagship component — the Latest Drops window — and (b) rebuilds Deep-Dive Overview & Videos so no voids or broken placeholders remain. Vanilla JS/CSS only, data only from `all[]` + `_enrichCache` (zero new YouTube calls). Implement in order, QA at end."*

---

## 1. Audit (your 3 screenshots)

**Deep Dive → Videos**
1. Rows are hollow: huge dead middle between title and right stats; `— likes` gray dashes on every row read as *broken data*.
2. Filters are two floating selects; no counts, no context strip; 65 videos but no "load more" rhythm — an endless identical wall.
3. No velocity metric, no comparative bars, no duration chips, no hover affordances → a list, not an analytics surface.

**Deep Dive → Overview**
4. **~45% of the viewport is empty black** below two cards — the tab simply has too little content for a full-viewport route.
5. `AUDIENCE % 0%` looks like a bug (it's subs÷views ≈ 2.4%, mis-rounded); right column = one About card then void.

**Dashboard** — good now; the old "Face-off" list (one video per channel, 3 stats) is the weakest block → it gets **replaced by the new Drops window**.

---

## 2. New flagship component: **LATEST DROPS** window

### 2.1 Mental model (why it's instantly readable)
One rounded "app window" that answers a single question: **"Whose newest upload is winning right now?"** Every channel = one row. One fair metric = **⚡ velocity = views ÷ days since publish** (a 2-day-old video can beat a 30-day-old one). Toggles change range/sort; a chevron expands a row to see that channel's *previous* drops; the whole window can collapse to a slim bar. Nothing else — that's why it stays clean.

### 2.2 Anatomy & wireframe

```
┌─ WIN BAR: (pulse-dot) LATEST DROPS · newest uploads head-to-head │ [7d|30d|90d] [seg sort: ⚡Velocity|👁Views|🕒Newest] [⤢ Expand all] [— Collapse window] ┐
│  caption: "⚡ fastest right now: Branch Education · 41.2K views/day" (auto-updates)                                        │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🥇 (●hue) Branch Education · YOU? no · 2d ago                                                                              │
│    [thumb 96×54 + duration]  The Incredible Evolution of Computers…                                                        │
│    756.6K 👁   41.2K/day ⚡   5.1% eng   [████████░░ vs-best bar]   [˅ chevron]                                             │
│    └─(expanded inset, slides open)──────────────────────────────────────────────────────────────────────┐                │
│       #2 [thumb] How do Wireless Headphones Work? · 2025-04-29 · 183.2K 👁 · 15.3K/day · 7.3%              │                │
│       #3 …  #4 …  #5 …                                                              [Full catalog →]     │                │
│    └────────────────────────────────────────────────────────────────────────────────────────────────────┘                │
│ 🥈 (●) Blender Guru · 3d ago …                                                                                             │
│  🟡 CADable [YOU] · 4d ago …  (gold inset bar on your row)                                                               │
│ ── muted row: (●) Unreal Sensei — no drops in 90d · last upload 14mo ago (grayed, unranked) ──                             │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Win-bar controls (all with tooltips):** range segmented `7d/30d/90d` (default 30d); sort segmented `Velocity/Views/Newest` (default Velocity); `⤢` expand-all / collapse-all; `—` collapses window to slim bar showing only the caption (state persisted).
- **Row grid columns:** `rank | channel(avatar+name+ago) | video(thumb+title) | views | velocity | eng | vs-best bar | chevron` — fixed template, tabular nums, one line each → scannable.
- **Rank medals** 🥇🥈 = conic-gradient rings by current sort; **YOU** row = gold left inset + chip.
- **vs-best bar** = width `views ÷ best-in-window`, channel hue → instant visual race.
- **`NEW` pulse dot** on videos <48h.
- **Muted state** (no upload in range): grayed unranked row at bottom — honest, not empty.
- **Expanded inset:** videos #2–#5 of that channel inside the range (same mini columns) + footer button `Full catalog →` that calls `openDeepDive(id,'videos')` — cross-wires the whole app.
- **Placement:** Dashboard, full width, directly under *You vs Field* (replaces Face-off). Dashboard stack becomes: Strip → You-vs-Field → **Drops window** → Leaderboard → Velocity → Your uploads.

### 2.3 Data & math (zero quota)
```js
// RACE WINDOW — app.js new section
const raceState = { range: +lsGet('race.range',30), sort: lsGet('race.sort','vel'),
                    open: new Set(), slim: lsGet('race.slim',0) };

function raceData(){
  const now = Date.now(), cut = now - raceState.range*864e5;
  return all.map(ch => {
    const vids = (_enrichCache[ch.id]?.videos || [])
      .filter(v => +new Date(v.publishedAt) >= cut)
      .map(v => ({ ...v,
        days: Math.max(1,(now - +new Date(v.publishedAt))/864e5),
        vel:  v.statistics.viewCount / Math.max(1,(now-+new Date(v.publishedAt))/864e5),
        eng:  engOf(v) }))                     // (likes+comments)/views, null-safe
      .sort((a,b)=> b.publishedAt - a.publishedAt);
    return { ch, vids };                        // vids[0] = latest drop
  });
}
function renderRace(){
  const rows = raceData();
  rows.forEach(r => r.vids[0] ? undefined : enqueueEnrich(r.ch.id)); // reuse Phase-2 queue → skeletons
  const ranked = rows.filter(r=>r.vids[0])
    .sort(sorters[raceState.sort]);             // {vel:(a,b)=>b.vids[0].vel-a.vids[0].vel, …}
  const best = Math.max(...ranked.map(r=>r.vids[0].statistics.viewCount));
  // caption, then ranked rows (medals), then muted rows; FLIP() on re-sort
}
```
Row/inset events: **chevron or row-click** → toggle `open` (inset animates); **thumb/title click** → YouTube new tab; **channel name click** → Deep Dive Overview. Persist `range/sort/slim/open-all`.

### 2.4 The two expand animations (the "professional" part)
```css
/* row inset AND window body: pure-CSS height animation, no JS measuring */
.fold{display:grid;grid-template-rows:0fr;transition:grid-template-rows .38s var(--e-out)}
.fold.open{grid-template-rows:1fr}
.fold>.inner{overflow:hidden;min-height:0}
/* chevron rotate, inset content stagger */
.rrow .chev{transition:transform .3s var(--e-out)} .rrow.open .chev{transform:rotate(180deg)}
.fold.open .vrow{animation:fadeUp .4s var(--e-out) backwards;animation-delay:calc(var(--i)*50ms)}
```
Re-sort on segmented switch → wrap list mutation in `flip()` (Phase 2) so rows glide to new ranks. Segmented controls use the same sliding glider as nav tabs.

---

## 3. Deep Dive → **Overview** rebuild (kill the 45% void)

Full-viewport route now gets a **6-card bento**, 12-col grid, every column filled:

```
┌ KPI STRIP (12col): SUBS · TOTAL VIEWS · AVG VIEWS · AUDIENCE RATIO — count-ups, sparks, delta rules ┐
┌ PULSE (8col) ─────────────────────────────────┐ ┌ ABOUT (4col, existing) ──────────────┐
│ 90-day views area-line (hue, crosshair tooltip)│ │ bio / country / joined / ID / open   │
│ + THIS MONTH chip row: views ▲/▼ · uploads n · │ ├ HEALTH (same 4col, stacked below) ───┤
 │ best video (thumb+title)                      │ │ engagement gauge · cadence/mo ·      │
├ TOP VIDEOS (8col, upgraded existing list) ─────┤ │ streak · audience ratio (fixed)      │
│ rows + vs-#1 hue bars + eng chips + ↗          │ └──────────────────────────────────────┘
└────────────────────────────────────────────────┘
```
Fixes baked in:
- **Audience ratio** = `subs/views*100`, 1 decimal, label `subs ÷ views`; if views missing → neutral `—`. No more `0%`.
- **Pulse chart** reuses snapshot/video data already fetched for Growth tab (`dd.snapshots`) — cached, no quota.
- Right column now = About **+** Health card → no void under About; left column height matches via `grid-auto-rows:1fr` + flex-fill charts (`fit()` ResizeObserver from Phase 2).
- Everything enters with `.rev` stagger; values `countUp()`.

---

## 4. Deep Dive → **Videos** rebuild

**Filter bar (sticky inside card, blur bg):**
`[seg: All 65 | Long-form 49 | Shorts 16]  [seg: Newest | Most viewed | ⚡Velocity]  [context chips: Σ 114.5M views · avg 1.94M · best 11.36M]`
Segmented buttons show live counts; switching animates rows via `flip()`.

**New row anatomy** (no hollow middle, no broken dashes):
```
[#n] [thumb + duration chip + NEW dot] | title (2-line clamp)          | 11.36M 👁   | 9.1K/day ⚡ | 4.6% eng | [↗]
                                       | 2024-05-17 · 2y ago           | [vs-#1 hue bar under views]
```
Implementation rules:
- **Likes:** render `👍 12.3K` *only when the field exists*; otherwise render nothing (never `—`).
- **Velocity** column = the same `vel` from raceData → consistency app-wide.
- **vs-#1 bar** under views (width = views/max, hue) fills the old dead middle with meaning.
- **Pagination:** render 10, footer button `Show 10 more (55 left)` with 300ms spinner → slice cached array; entrance stagger on appended rows.
- Row hover: lift + `↗` brightens; title click → YouTube; `#n` click → scroll+flash that video in *Top videos* on Overview (nice cross-link, optional).
- Skeleton rows while `enqueueEnrich` runs on first open; cached thereafter (Phase-2 localStorage layer).

**Growth & Compare tabs:** unchanged IA; just ensure Phase-2 kit applied (crosshair line chart, matrix count-ups) so all four tabs feel same family.

---

## 5. Global micro-fixes (small, do now)

1. `ago()` everywhere for dates (exact date in tooltip). 2. `fmtN` 3-sig-fig everywhere. 3. Red only for negative deltas; missing = `var(--t3)` dash. 4. Every control ≥32px hit-area + `data-tip`. 5. Persist: race state, video filters, deep-dive last tab per channel.

---

## 6. Phased tasks & DoD

| Phase | Work | DoD |
|---|---|---|
| R1 | Drops window component (bar, segs, rows, fold anims, muted rows, caption, persistence) on Dashboard | window renders 8 channels from cache; sort/range/expand/collapse all animated; no API calls added |
| R2 | Overview bento (Pulse, Health, fixed ratio, void-free at 1280/1440) | no empty viewport region >32px |
| R3 | Videos tab (segs w/ counts, new rows, load-more, sticky bar) | no `— likes`, no hollow middle, 65→10+10… paging |
| R4 | Micro-fixes + persistence + QA | checklist passes |

**QA:** race caption updates on every toggle; expanding a row doesn't shift layout jitter (grid-rows anim); muted channels listed grayed; `Full catalog →` lands on Videos tab sorted Newest; Overview shows real audience ratio; all numbers tabular-mono; reduced-motion respected; network tab shows zero extra YouTube quota vs previous build.

This gives the app its signature, instantly-readable "race" surface while making every deep-dive tab dense, honest, and animated.
