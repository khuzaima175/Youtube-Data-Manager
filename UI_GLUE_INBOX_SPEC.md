# YT Tracker — Phase 10 Spec: Glue, Always-On Inbox & Field Feed (W1 + W2)

> **Agent instruction:** *"100% client-side computation from `all[]`, `_enrichCache`, `_topicCache`, and `pipelineCards`. Zero new API calls. Smooth animations, robust error handling, and persistent state."*

---

## 1. Workstream 1: Wayfinding & Cohesion (W1)

### W1.1 Section Scroll-Spy Rail (`#dashSpyRail`)
- Floating vertical mini-TOC on the right margin of the Dashboard.
- Section anchors:
  - `#sec-hero`: My Channel
  - `#sec-yvf`: You vs Field
  - `#sec-drops`: Latest Drops Race
  - `#sec-radar`: Topic Radar
  - `#sec-vel`: Comparative Velocity
  - `#sec-lb`: Full Leaderboard
  - `#sec-recent`: Recent Uploads
- Active dot updates smoothly on scroll. Clicking any dot glides to the target section with smooth easing.
- Section collapse buttons (`sec-collapse-btn`) with state saved in `localStorage('yt_dash_collapsed')`.

### W1.2 Interactive Metric Glossary & `data-def`
- Metric glossary tab added to the Keyboard Shortcuts help modal (`?`).
- Metric definitions dictionary:
  - `velocity`: Daily view run-rate ($views / age$).
  - `hotScore`: Formula $recentAvg \times \log_2(n+1)$ measuring niche interest.
  - `momentum`: Recent topic views $\div$ older historical views ($>1.2\times$ = rising).
  - `threat`: Jaccard index measuring audience & topic vector overlap.
  - `evergreen`: Percentage of channel's top-10 videos that are $>1\text{ year old}$.
  - `collision`: Traffic cannibalization from publishing within $\pm 24\text{h}$ of a competitor $\ge 1.8\times$ size.
  - `health_chip`: Velocity multiplier vs your 30-video average ($▲\ge 1.3\times$, $▼\le 0.7\times$).
- `data-def="[term]"` class added with subtle dotted underlines; hovering or clicking opens a floating explanation tooltip.

### W1.3 First-Run Spotlight Tour
- 6-step guided walkthrough:
  1. `#compareTray`: Persistent Channel Compare Tray
  2. `#myPulseBtn`: Real-Time Channel Pulse & Cadence
  3. `#dashRaceWindow`: Latest Drops Head-to-Head Race
  4. `#dashTopicRadar`: Hot Topic Radar & Heat Matrix
  5. `#nav-studio`: Creator Studio, Title Lab & Kanban Pipeline
  6. `#dashHeroStrip`: Deep Dive Channel Inspector
- Dynamic Spotlight overlay using high-contrast box-shadow cutout (`box-shadow: 0 0 0 9999px rgba(0,0,0,0.78)`).
- Persisted completion in `localStorage('yt_tour_completed')`. Replayable from `?` modal.

---

## 2. Workstream 2: Inbox, Morning Brief & Field Feed (W2)

### W2.1 Bell Inbox Popover (`#bellBtn` & `#bellPopover`)
- Persistent notification bell with unread badge in topbar.
- Persistent inbox items stored in `localStorage('yt_inbox_items')`.
- Alerts collected from:
  - Rival moat threats (`threat`)
  - Hot topic spikes (`opportunity`)
  - Copycat detections (`copycat`)
  - Collision shadows (`collision`)
  - Auto-published pipeline updates (`pipeline`)
- Clicking an item jumps to the exact UI surface (topic row, video catalog, or pipeline board) and marks item as read.

### W2.2 Morning Brief Executive Digest
- Executive summary card at the top of the Bell dropdown:
  - 24h & 7d view pace
  - Upload cadence status
  - Top 3 urgent field signals
  - Niche's fastest mover
- "📋 Copy as Markdown" button for daily notes/updates.

### W2.3 Field Activity Feed (2nd Tab in Bell)
- Unified chronological stream aggregating:
  - 🎬 **Uploads**: New competitor drops with velocity & view tags.
  - 🏅 **Milestones**: Channels crossing subscriber milestones.
  - ⚡ **Surges**: Videos with velocity $> 2\times$ channel average.
  - 🔄 **Topic Pivots**: Rivals shifting $> 30\%$ upload share to new topics.
- Filter chips: `All Events`, `Uploads`, `Milestones`, `Surges`.

### W2.4 Offline & Cache Staleness Banner
- Subtle floating banner when telemetry was loaded $> 4\text{ hours ago}$ or client is offline.
