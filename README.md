# ⚡ YT Tracker — YouTube Competitive Intelligence & Growth Studio

A production-grade, full-spectrum competitive intelligence platform and creator workflow suite for YouTube creators. Built with a high-performance **Flask & Modular Vanilla JS** architecture, cloud PostgreSQL persistence via **Supabase**, and zero unnecessary YouTube Data API quota overhead.

---

## 🌟 Platform Highlights (Phases 1–12)

### 1. 📊 Executive Command Center (Dashboard)
- **Primary Channel Hero Bento** — Real-time subscriber counters, 30-day velocity sparklines, next subscriber milestone progress rings, and engagement rate telemetry.
- **You vs. Field Matrix** — Multi-metric comparative ladder (Subscribers, Avg Views, Total Views), interactive grouped SVG comparison bars with field medians, and automated competitor gap insights.
- **Full Competitor Leaderboard** — Sortable columns, comparative progress bars, 7-day historical rank delta chips (`▲2`, `▼1`, `—`, `★ NEW`), and real-time **Topic Overlap Threat Scores**.
- **6-Month Upload Velocity Matrix** — Interactive multi-channel SVG bar chart visualizing long-term upload cadence with interactive channel muting/toggling.
- **Recent Uploads Rail** — Horizontal momentum rail displaying your channel's latest drops with instant view-per-day velocity badges.

---

### 2. ⚡ Latest Drops Race Window
- **Real-Time Upload Face-Off** — Ranks all competitor drops within customizable time windows (**7 Days**, **30 Days**, or **90 Days**).
- **Sorting Modes** — Rank by daily velocity (`⚡ Views/Day`), raw view count (`👁 Views`), or publish freshness (`🕒 Newest`).
- **Relative Pace Indicator** — Dynamic progress bars displaying performance relative to the period's top-performing video.
- **Deep Inset Expanders** — Expand any competitor row to inspect their recent catalog performance without leaving the dashboard.
- **Slim Mode Toggle** — Minimize into a compact live caption ticker.

---

### 3. 🛰️ Topic Radar & Competitive Forensics
- **NLP N-Gram Topic Extraction** — Automated multi-word topic clustering and alias normalization running 100% client-side.
- **Surge Velocity & Heat Matrix** — Visual heatmap identifying trending topics with momentum spikes ($>1.3\times$).
- **Topic Defensive Moats** — Identifies niches where your channel holds $>60\%$ video share.
- **Untapped Competitor Gaps** — Pinpoints high-traffic topics that competitors are dominating while your channel has 0 uploads.
- **Algorithmic Threat Engine** — Evaluates competitor threat levels based on topic cannibalization risk and velocity.
- **Video Series & Evergreen Detection** — Identifies recurring video franchises and Evergreen Fingerprints ($\ge 40\%$ long-tail views).
- **Collision Warning & Copycat Detector** — Warns when competitor drops overlap with your scheduled releases or borrow title phrasing.

---

### 4. 🎨 Creator Studio & Content Pipeline
- **🧪 Title Lab (0–100 CTR Scorer)**:
  - Real-time scoring algorithm evaluating **Power Words**, **Curiosity & Intrigue**, **Clarity**, **Character Length**, and **Niche Keywords**.
  - Interactive token suggestions to boost click-through rates.
  - 1-Click clipboard copy & seamless transfer to Kanban pipeline.
- **💡 Algorithmic Idea Generator**:
  - Automatically synthesizes your topic moats, competitor gaps, and surging radar keywords into pre-tested title formulas.
- **📋 Content Pipeline Kanban Board**:
  - 4-stage visual drag-and-drop board: `💡 Idea` $\to$ `🛠 In Production` $\to$ `⏳ Scheduled` $\to$ `🚀 Published`.
  - Auto-publish synchronizer that detects uploaded videos upon refresh and links live telemetry.

---

### 5. 📄 Competitor Intelligence Report Center
- **Executive PDF & Print Briefs** — Generates complete intelligence dossiers with ink-saving `@media print` layout formatting.
- **Configurable Horizons & Scopes** — Switch between **Last 30 Days**, **Last 90 Days**, or **All-Time 6-Month Horizon** across all channels or your custom Compare Set.
- **Comprehensive Dossier Sections**:
  - Executive KPI cards (Subscriber Rank, View Efficiency, Market Leader, Top Surging Niche).
  - Head-to-head comparative matrix with 7-day rank movements.
  - Top breakout drops across the field.
  - Topic Moats vs. Opportunity Gaps side-by-side breakdown.
  - Automated strategic action items.
- **Multi-Format Export** — 🖨️ Save as PDF, 📋 1-Click Markdown (for Notion/Obsidian), or 💾 Download standalone HTML.

---

### 6. 🏆 Achievements & Dopamine Loops
- **12 Milestones with XP & Level Progression** — Track milestones like *Velocity Vanguard*, *Giant Slayer*, *Upload Machine*, *Evergreen Master*, *Radar Commander*, *Moat Defender*, and *Niche Dominator*.
- **Level & XP Progress Bar** — Dynamic leveling system (`Level 3 Creator • 650 / 1000 XP`).
- **Celebration Banners** — Animated celebratory toast notification on milestone unlocks.
- **💓 My Pulse Popover** — Topbar popover featuring live channel pulse telemetry, engagement rates, 30-day velocity sparklines, and the 12-badge interactive achievements grid.

---

### 7. 🔗 Deep URL State Sharing & Wayfinding
- **Bi-Directional State Serialization** — Every view, channel inspection, deep-dive tab, compare set, and report filter synchronizes seamlessly to the URL hash (`#view=...&dd=...&tab=...&compare=...`).
- **1-Click Share Link** — Instantly copies direct URLs that restore the exact state on any machine.
- **Command Palette (`Ctrl + K` / `Cmd + K`)** — Quick search across channels, pages, actions, and reports.
- **Section Scroll-Spy Rail** — Floating right-edge wayfinding rail with closest-midpoint tracking.
- **Spotlight Onboarding Tour** — 6-step interactive walkthrough for first-time onboarding.
- **🔔 Bell Inbox & Morning Brief** — Unread badge and notification drawer for threat alerts, gap opportunities, and 1-click Markdown morning briefing export.

---

### 8. ⚙️ Settings Control Room & Customization
- **Algorithmic Parameter Tuning** — Customize threat multipliers, copycat thresholds, and collision detection windows.
- **NLP Dictionary Manager** — Add/remove custom stopwords and topic aliases.
- **Backup & Restore** — 1-Click complete workspace JSON backup and restore engine.
- **5 Accent Themes** — Switch between Cyan, Gold, Purple, Emerald, and Crimson palettes.

---

## 🏗️ Architecture & Codebase Structure

The frontend is cleanly structured into **7 CSS modules** and **10 single-responsibility JS modules** for maximum performance and maintainability:

```text
Youtube-Data-Manager/
├── server.py                   # Flask backend & YouTube API / Supabase proxy
├── requirements.txt            # Python dependencies
├── Procfile                    # Production deployment configuration (Gunicorn)
├── channels.json / snapshots.json # Local fallback cache
│
├── static/
│   ├── index.html              # Core application DOM shell & modal containers
│   ├── style.css               # Master stylesheet aggregator (@import)
│   ├── app.js                  # Modular architecture stub
│   │
│   ├── css/                    # Modular Style System (7 Files)
│   │   ├── variables.css       # Design tokens, themes & color palettes
│   │   ├── base.css            # Reset, typography, buttons, badges, topnav
│   │   ├── dashboard.css       # Hero, You vs Field, Leaderboard, Race, Radar, Velocity
│   │   ├── deep-dive.css       # Channel forensics inspector, Bento cards, Video table
│   │   ├── studio.css          # Title Lab, Idea generator, Kanban board
│   │   ├── modals.css          # Command palette, Settings, Reports, Popovers, Tour
│   │   └── print.css           # @media print rules for PDF report dossiers
│   │
│   └── js/                     # Modular JavaScript Engine (10 Modules)
│       ├── state.js            # Global state, constants, formatters & AnimKit
│       ├── api.js              # API communication, enrichment & sync queue
│       ├── nlp-topics.js       # Topic intelligence, radar, threats & moats
│       ├── dashboard.js        # Dashboard, Leaderboard, Race & Velocity charts
│       ├── channels.js         # Channels grid, sorting & search autocomplete
│       ├── studio.js           # Title Lab CTR scorer, Ideas & Pipeline Kanban
│       ├── deep-dive.js        # Deep dive inspector, bento & video matrix
│       ├── settings-inbox.js   # Settings control room & alert inbox feed
│       ├── report-gamification.js # Report Center, Achievements, Pulse & State URL sync
│       └── main.js             # Routing, wayfinding, shortcuts & boot sequence
│
└── yt_channel_viewer.py        # Standalone Python Desktop GUI (Tkinter + Pillow)
```

---

## 🛠️ Technology Stack

- **Backend**: Python 3.8+ / Flask / Gunicorn
- **Database & Snapshots**: Supabase (PostgreSQL) via `supabase-py` SDK
- **Frontend Architecture**: Vanilla HTML5, Modular CSS3 (Tokens & Glassmorphism), Modular ES6+ JavaScript
- **API**: YouTube Data API v3 (`google-api-python-client`) with thread-local client pooling and zero-quota client caching
- **Desktop Companion**: Python Tkinter / Pillow (PIL)
- **Typography & Icons**: Syne, DM Sans, JetBrains Mono, Google Material Symbols

---

## 📦 Setup & Installation

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/khuzaima175/Youtube-Data-Manager.git
cd Youtube-Data-Manager

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\activate       # Windows
source .venv/bin/activate      # macOS/Linux

# Install requirements
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
YOUTUBE_API_KEY=your_youtube_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_key_here
FLASK_DEBUG=0
PORT=5000
ALLOWED_ORIGINS=http://localhost:5000,http://127.0.0.1:5000
```

### 3. Run Locally
```bash
# Start Flask Server
python server.py

# Open your browser at http://localhost:5000
```

### 4. Optional: Run Desktop Viewer Companion
```bash
python yt_channel_viewer.py
```

---

## ☁️ Deployment (Railway)

1. Connect your repository to [Railway](https://railway.app).
2. Set environment variables (`YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).
3. Railway automatically detects `Procfile` (`gunicorn server:app`).
4. **Prevent Cold Starts**: Use [UptimeRobot](https://uptimerobot.com) to ping `https://your-app.up.railway.app/ping` every 5 minutes.

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action |
|---|---|
| `Ctrl + K` / `Cmd + K` | Open Command Palette |
| `/` | Focus Search Channels |
| `?` | Open Keyboard Shortcuts & Help |
| `1` | Switch to Dashboard |
| `2` | Switch to My Channels |
| `3` | Switch to Creator Studio |
| `R` | Refresh All Tracked Channels |
| `Escape` | Close any open modal / deep dive / popover |

---

## ⚖️ License
MIT License. Developed for YouTube creators and analytics intelligence. Ensure compliance with YouTube API Terms of Service.