# ⚡ YT Tracker — YouTube Competitive Intelligence & Growth Studio (v5.0)

A production-grade, full-spectrum competitive intelligence platform and creator workflow suite for YouTube creators. Built with a calm, disciplined **Linear / Raycast-grade dark workspace aesthetic** (`#0b0c0e` dark surfaces, desaturated indigo `#6672f5` accent, tabular typography, Lucide vector icons), a modular **Flask & Vanilla ES6+ JS** architecture, cloud PostgreSQL persistence via **Supabase** with `pgvector` & `HNSW` indexing, and a **zero-quota Google WebSub real-time ingestion engine**.

---

## 🌟 Platform Highlights & v5.0 Architecture

```mermaid
graph TD
    A[YouTube Platform Drops] -->|Google WebSub Atom XML Push: 0 Quota| B[WebSub Webhook Listener]
    B -->|Edit-Trap Guard: db_video_exists| C[Single-Video Ingest: 1 Quota Unit]
    C -->|Queue Milestones| D[(snapshot_schedule: T+2h, T+24h, T+168h)]
    D -->|50-ID Batches: 1 Unit| E[Snapshot Schedule Worker]
    E -->|Range Partitioned| F[(video_snapshots_v4)]
    F -->|23-25h & 164-172h Tolerance Windows| G[Materialized Baselines v2m & 168h]
    G -->|Concurrent Refresh RPC| G
    E -->|Time-Bucketed Thresholds| H[Time-Bucketed Outlier Alerts]
    H -->|2h >= 3.5x · 24h >= 2.5x · 7d >= 2.0x| I[Discord & Slack Webhooks]
    C -->|FastEmbed: all-MiniLM-L6-v2| J[(Supabase HNSW pgvector)]
    J -->|Cosine Distance Clustering| K[Semantic Topic Radar & Archetypes]
    K -->|WeakMap Deep Proxy + rAF 60fps| L[Creator Studio & Title Lab]
    L -->|AbortController Request Cancellation| M[Mobile Feed Simulator: 120px & 50-Char Fold]
```

---

## 🧠 Advanced Intelligence Systems & Math

### 1. Velocity-Weighted RPI ($\text{VRPI}$) with Age Decay
Static Relative Performance Index ($\text{RPI} = \frac{\text{Views}}{\text{Median Baseline}}$) fails to distinguish a 2-day-old video with 20K views from a 2-year-old video with 20K views. YT Tracker computes **Velocity-Weighted RPI ($\text{VRPI}$)** with publication age decay:

$$\text{Video Velocity } V = \frac{\text{Current Views}}{\max(0.04, \text{Days Published})}$$

$$\text{Daily Baseline Velocity } V_{\text{base}} = \max\left(1, \frac{\text{Channel 30-Day Median Views}}{30}\right)$$

$$\text{Raw VRPI} = \frac{V}{V_{\text{base}}}$$

$$\text{Age Decay Factor} = \begin{cases} 1.0 & \text{if } \text{Age} \le 7\text{ days} \\ \frac{1}{\sqrt{1 + (\text{Age} - 7) / 21}} & \text{if } \text{Age} > 7\text{ days} \end{cases}$$

$$\text{VRPI} = \text{Raw VRPI} \cdot \text{Age Decay Factor}$$

- 🔥 **Breakout Outliers**: Fresh competitor uploads ($\le 14\text{d}$) surging at $\text{VRPI} \ge 2.5\times$ baseline velocity are automatically flagged with breakout tags and dispatched to configured webhooks.
- ⚡ **Velocity Spikes**: Uploads with $1.5\times \le \text{VRPI} < 2.5\times$ are highlighted with velocity surge tags in the live drops feed.

---

### 2. Time-Bucketed Milestone Thresholds & 168h Baseline (v5.0)
Outlier velocity thresholds are dynamically adjusted based on milestone checkpoints to capture both viral bursts and evergreen compounders:
- **T+2h Viral Breakout**: Requires $\ge 3.5\times$ channel median velocity.
- **T+24h Velocity Surge**: Requires $\ge 2.5\times$ channel median velocity.
- **T+168h (Day 7) Sustained Evergreen**: Requires $\ge 2.0\times$ historical 168h baseline computed via `channel_baselines_v2m_168h` (8-hour tolerance window: `age_hours BETWEEN 164.0 AND 172.0`).

---

### 3. Empirical Bayes Shrinkage for Topic RPI
To prevent small-sample flukes (e.g. a topic with only 1 upload having high views) from distorting recommendations, the engine applies **Empirical Bayes Shrinkage**:

$$\text{RPI}_{\text{shrunken}} = w \cdot \text{RPI}_{\text{raw}} + (1 - w) \cdot 1.0, \quad \text{where } w = \frac{n}{n + 5}$$

*(As sample size $n$ increases, confidence smoothly approaches true field RPI).*

---

### 4. Supply vs. Demand 2×2 Saturation Matrix
Every topic is classified into one of 4 market quadrants:
- 💎 **Untapped Blue Ocean** (*High Demand · Low Supply*): High competitor views, low recent uploads, and **0 videos by your channel**. High breakout potential.
  $$\text{Blue Ocean Score} = \frac{\text{RPI}_{\text{shrunken}}}{1 + \text{Recent 14d Supply}}$$
- 🔥 **High Demand Staple** (*High Demand · High Supply*): Proven evergreen topics with steady search volume across the niche.
- 🌱 **Emerging Trend** (*Surging 14d Velocity*): Rapidly accelerating keyword velocity with low competitor saturation.
- ⚠️ **Saturated** (*Low Demand · High Supply*): Overcrowded topics with diminishing returns.

---

### 5. Strict FastEmbed Semantic Clustering & Zero-Shot Archetype Mapping
- **Dense 384-d Embeddings**: Uses CPU-optimized `fastembed` (`sentence-transformers/all-MiniLM-L6-v2`) with `vector(384)` HNSW indexing in Supabase PostgreSQL (`scripts/migration_v4_schema.sql`).
- **Strict Vector Enforcement**: Zero silent N-gram degradation; fails loudly and safely if embeddings are unavailable.
- **Zero-Shot Archetype Classification**: Formats topic keywords into pseudo-sentences (`f"This video is about {kw1, kw2, ...}"`) and maps them to Creator Studio viral packaging frameworks (*B2B Engineering, Vlog Entertainment, Educational Tutorial, News*).

---

### 6. YouTube Mobile Feed & 50-Char Title Fold Simulator
Over 70% of YouTube viewership occurs on mobile devices where browse titles truncate after 45–55 characters:
- **120px Scale Thumbnail Mockup**: Live 16:9 feed preview with timestamp badge and high-contrast concept overlay.
- **50-Character Dynamic Fold Indicator**: Visual cutoff boundary marking characters 1–50 (`Visible on Mobile`) vs 51+ (`Truncated in Browse Feed`).
- **Hook Placement Intelligence**: Live diagnostic checking if the primary curiosity trigger / power keyword is front-loaded before the mobile truncation cutoff.
- **Network Race Prevention**: Title Lab input uses `AbortController` to cancel in-flight async scoring requests on every keystroke.

---

### 7. Zero-Quota Google WebSub Ingestion Engine
- **Endpoint**: `GET` & `POST` `/api/webhooks/youtube-sub`.
- Handles Google PubSubHubbub subscription challenges (`hub.challenge`) for **0 quota units**.
- **Edit-Trap Guard (`db_video_exists`)**: Prevents historical video edits from queuing duplicate snapshot records.
- Enqueues $T+2\text{h}$, $T+24\text{h}$, and $T+168\text{h}$ snapshot milestones into `snapshot_schedule`.
- **Zombie Video Cleanup**: Missing/deleted/privatized videos are automatically flagged `deleted_or_privatized`, keeping queue throughput at 100%.

---

### 8. Pacific Time Midnight Quota Ledger & Circuit Breaker (v5.0)
- **Strict PT Alignment**: Redis quota keys are date-stamped (`quota:spend:YYYY-MM-DD-PT`) using `America/Los_Angeles` timezone to synchronize with Google's quota reset clock.
- **85% Capacity Circuit Breaker**: Throttles exploratory UI queries at $\ge 8,500$ units while **preserving all 24h & 168h baseline snapshots**, completely eliminating survivorship bias.

---

### 9. Deep-Reactive Vanilla JS Event Store (`appState`)
- **WeakMap Identity Stability**: `appState.a.b === appState.a.b` maintains identity caching across deeply nested object and array mutations.
- **60fps `requestAnimationFrame` Batching**: Coalesces rapid state modifications with `dirtyKeys` tracking.
- **Event Bridging**: Dispatches `appstate:${key}` CustomEvents with both `value` and `oldValue` for full backward compatibility.

---

## 🎨 Linear / Raycast-Grade Design & Explanation Layer

### 1. The 4-Tier Progressive Disclosure System
Never leaves the creator wondering *"What does this metric mean?"*:
- **L0 (Numbers)**: Clean tabular figures (`1.2K`, `4.5%`, `↑ 4%`) with no rainbow clutter.
- **L1 (Tooltips)**: Fast 120ms hover & focus tooltips on all `[data-tip]` metrics with a `"Learn more →"` trigger.
- **L2 (Detail Sheets)**: Slide-out drawer displaying exact mathematical formulas, interpretation guides, and tactical next steps.
- **L3 (Deep Dive)**: Dedicated full-screen forensics view with 90-day upload pulse, split-pane right-rail inspection (`.dd-split-layout`), and topic moats.

### 2. Data Honesty & The "—" Rule
- If data is missing or calculations fail, the UI renders a clean em-dash (`—`) or `< 1%`, never a misleading `0` or hardcoded fallback.
- Professional SaaS tone: **Zero exclamation marks** in copy, tooltips, or toast notifications.

---

## 🏗️ Architecture & Codebase Structure

```text
Youtube-Data-Manager/
├── server.py                   # Flask backend, WebSub listener, FastEmbed & Outlier Radar
├── requirements.txt            # Python dependencies (flask, supabase, fastembed, redis, etc.)
├── Procfile                    # Production deployment configuration (Gunicorn)
├── settings.json               # Outlier Radar webhook configuration
├── test_phase1_6.py            # Automated test suite (13/13 backend tests)
│
├── scripts/
│   ├── migration_v4_schema.sql # v5.0 PostgreSQL schema (HNSW vector index, partitions, 168h view, RPC)
│   ├── migration_pgvector.sql  # Supabase pgvector extension & IVFFlat cosine index
│   └── schema_v2.sql           # Baseline relational schema
│
├── static/
│   ├── index.html              # Core application DOM shell (2-Pane Layout + Mobile Nav)
│   ├── style.css               # Master stylesheet aggregator (@import)
│   │
│   ├── css/                    # Modular Style System
│   │   ├── variables.css       # Design tokens (Surfaces, borders, text, single accent)
│   │   ├── base.css            # Layout resets, sidebar skeleton, typography
│   │   ├── ui.css              # Primitives: context menu, tooltips, sheets, mobile nav
│   │   ├── dashboard.css       # Executive KPIs, Chart.js wrap, activity feeds
│   │   ├── deep-dive.css       # Forensics inspector overlay, split-pane & pulse charts
│   │   ├── studio.css          # Title Lab, Mobile Simulator, Synthesizer modal, Kanban
│   │   ├── modals.css          # Command palette, Settings, Glossary modal
│   │   └── print.css           # @media print rules for PDF export
│   │
│   └── js/                     # Modular JavaScript Engine
│       ├── ui/
│       │   ├── format.js       # Single source of truth for numbers, deltas & dates
│       │   ├── tooltip.js      # Singleton L1 hover/focus tooltip engine
│       │   ├── sheet.js        # Singleton L2 slide-out detail drawer
│       │   ├── glossary-modal.js # Searchable metric glossary reference modal (?)
│       │   ├── menu.js         # Singleton context dropdown menu (⋯)
│       │   ├── countup.js      # 60fps hardware-accelerated KPI tickers
│       │   └── reveal.js       # Single-fire IntersectionObserver viewport reveal
│       │
│       ├── data/
│       │   └── glossary.js     # Comprehensive data dictionary with 30+ definitions
│       │
│       ├── state.js            # DeepReactiveStore (WeakMap Proxy + rAF Batching)
│       ├── dashboard.js        # Overview KPI grid, trajectory chart, next step card
│       ├── channels.js         # Competitor benchmark table & VRPI drops activity feed
│       ├── nlp-topics.js       # Topic radar, VRPI math, Bayes shrinkage, Blue Ocean scoring
│       ├── studio.js           # Title Lab scorer, AbortController, Mobile Simulator, Kanban
│       ├── deep-dive.js        # Channel forensics inspector modal & split-pane layout
│       ├── timing.js           # Publication timing heatmap & timezone engine
│       ├── api.js              # API client & quota accounting
│       ├── settings-inbox.js   # Settings modal, Outlier Radar webhooks & alert inbox
│       ├── report-gamification.js # Report Center & export utilities
│       └── main.js             # Routing, mobile navigation drawer, reactive event listeners
```

---

## 🛠️ Technology Stack

- **Backend**: Python 3.9+ / Flask / Gunicorn
- **Embeddings & NLP**: FastEmbed (`sentence-transformers/all-MiniLM-L6-v2`) on CPU
- **Database & Vector Search**: Supabase (Cloud PostgreSQL) + `pgvector` HNSW & IVFFlat Cosine Similarity Indexing
- **Database Range Partitioning**: Native PostgreSQL partitioning by `recorded_at` (`video_snapshots_v4`)
- **Frontend Architecture**: Vanilla HTML5, Modular CSS3 (Obsidian Dark Tokens, Linear Indigo `#6672f5`), Deep Reactive ES6+ Proxy Store (`WeakMap` + `requestAnimationFrame`)
- **Real-Time Drop Ingestion**: Google WebSub (PubSubHubbub Atom Feeds) — **0 Quota Cost**
- **Quota Accounting**: Pacific Time Midnight Redis Ledger (`quota:spend:YYYY-MM-DD-PT`) with 85% Circuit Breaker
- **Charting & Visualizations**: Chart.js 4.x (Linear curves, subtle gradient fills), SVG Sparklines
- **Icons**: Lucide Icons (vector SVG)
- **Typography**: Inter (UI & Displays), JetBrains Mono (Tabular Numerals & Code)

---

## 📦 Local Setup & Installation

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/khuzaima175/Youtube-Data-Manager.git
cd Youtube-Data-Manager

# Create and activate virtual environment
python -m venv venv

# On Windows PowerShell:
.\venv\Scripts\Activate.ps1

# On macOS / Linux:
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Create a `.env` file in the project root:
```env
YOUTUBE_API_KEY=your_youtube_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_key_here
REDIS_URL=redis://localhost:6379/0
FLASK_DEBUG=1
PORT=5000
```

### 3. Run Database Migrations
In your Supabase SQL Editor, execute:
1. [`scripts/migration_v4_schema.sql`](file:///g:/Important%20Projects/Youtube%20Data%20Manager/scripts/migration_v4_schema.sql) (HNSW vector indexing, `snapshot_schedule`, partitions, materialized views, RPC refresh procedure).

### 4. Run Automated Test Suite
```bash
python test_phase1_6.py
```

### 5. Run Locally
```bash
python server.py
```
Open your browser at **[http://localhost:5000](http://localhost:5000)**.

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action |
| :--- | :--- |
| <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> | Open Command Palette |
| <kbd>/</kbd> | Focus Channel Search |
| <kbd>?</kbd> | Open Metric Glossary & Help Modal |
| <kbd>1</kbd> | Switch to Overview |
| <kbd>2</kbd> | Switch to Competitors |
| <kbd>3</kbd> | Switch to Topic Radar |
| <kbd>4</kbd> | Switch to Creator Studio |
| <kbd>R</kbd> | Refresh All Tracked Channels |
| <kbd>Esc</kbd> | Close active modal, detail sheet, or menu |

---

## ⚖️ License
MIT License. Developed for YouTube creators and analytics intelligence. Ensure compliance with YouTube API Terms of Service.