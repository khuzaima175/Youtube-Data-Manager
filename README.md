# ⚡ YT Tracker — YouTube Competitive Intelligence & Growth Studio (v5.0)

A production-grade, full-spectrum competitive intelligence platform and creator workflow suite for YouTube creators. Built with a calm, disciplined **Linear / Raycast-grade dark workspace aesthetic** (`#0b0c0e` dark surfaces, desaturated indigo `#6672f5` accent, tabular typography, Lucide vector icons), a modular **Flask & Vanilla ES6+ JS** architecture, cloud PostgreSQL persistence via **Supabase** with `pgvector` & `HNSW` indexing, and a **zero-quota Google WebSub real-time ingestion engine**.

---

## 🌟 Platform Highlights & System Architecture

```mermaid
graph TD
    A[YouTube Platform Drops] -->|Google WebSub Atom XML Push: 0 Quota| B[WebSub Webhook Listener]
    B -->|Edit-Trap Guard: db_video_exists| C[Single-Video Ingest: 1 Quota Unit]
    C -->|Queue Milestones| D[(snapshot_schedule: T+2h, T+24h, T+168h)]
    D -->|50-ID Batches: 1 Unit| E[Snapshot Schedule Worker]
    E -->|Range Partitioned| F[(video_snapshots_v4)]
    F -->|23-25h & 164-172h Tolerance Windows| G[Materialized Baselines v2m & 168h]
    G -->|Decoupled Concurrent Refresh RPC| G
    E -->|Time-Bucketed Thresholds| H[Time-Bucketed Outlier Radar]
    H -->|2h >= 3.5x · 24h >= 2.5x · 7d >= 2.0x| I[Discord & Slack Webhooks]
    C -->|FastEmbed: all-MiniLM-L6-v2| J[(Supabase HNSW pgvector)]
    J -->|Cosine Distance Clustering| K[Semantic Topic Radar & Opportunity Matrix]
    K -->|Blue Ocean & Bayes Shrinkage| L[Next Best Action Engine]
    L -->|5 Viral Packaging Archetypes| M[Creator Studio & Title Lab]
    M -->|AbortController Request Cancellation| N[Mobile Feed Simulator: 120px & 50-Char Fold]
```

---

## 🧠 Advanced Recommendation System & Opportunity Discovery

YT Tracker features a state-of-the-art recommendation system built specifically for YouTube creators. Rather than relying on simple view counts or vanity metrics, the engine employs statistical modeling, vector similarity clustering, and competitive whitespace analysis to guide creator decisions.

### 1. The 2×2 Market Saturation Matrix
Every detected topic cluster across the competitor landscape is classified into one of four dynamic market quadrants:

```text
               ▲ High Demand (High Shrunken RPI)
               │
    💎 UNTAPPED BLUE OCEAN      │    🔥 HIGH-DEMAND STAPLE
    (Low Supply · High Demand   │    (High Supply · High Demand
     0 Videos on Your Channel)  │     Proven Niche Evergreen)
  ─────────────┼────────────────────────────────────────►
               │                               Recent Supply
    🌱 EMERGING TREND           │    ⚠️ SATURATED ZONE
    (Low Supply · Surging 14d   │    (High Supply · Low Demand
     Early Velocity Spikes)     │     Diminishing Returns)
               │
```

- 💎 **Untapped Blue Ocean** (*High Demand · Low Supply · 0 Channel Coverage*): Topics where competitors are generating high Relative Performance Index ($\text{RPI}$) but total niche supply is minimal and your channel has **zero published videos**. Represents the highest breakout ROI.
- 🔥 **High-Demand Staple** (*High Demand · High Supply*): Proven evergreen topics that consistently generate above-average views across the entire niche.
- 🌱 **Emerging Trend** (*Surging 14d Velocity · Low Total Supply*): Rapidly accelerating keywords and concepts experiencing early velocity spikes.
- ⚠️ **Saturated Zone** (*Low Demand · High Supply*): Overcrowded topics with declining viewer interest and fierce competition.

---

### 2. The Blue Ocean Mathematical Formula
To rank opportunities objectively, YT Tracker calculates a continuous **Blue Ocean Opportunity Score**:

$$\text{Blue Ocean Score} = \frac{\text{RPI}_{\text{shrunken}}}{1 + \text{Recent 14d Supply}}$$

Where:
- $\text{RPI}_{\text{shrunken}}$ is the Bayesian-shrunk Relative Performance Index of the topic cluster.
- $\text{Recent 14d Supply}$ is the count of competitor uploads on this topic in the last 14 days.

---

### 3. Empirical Bayes Shrinkage (Noise & Small-Sample Filtering)
Raw average views or raw RPI can be heavily distorted by small sample sizes (e.g. a topic with only 1 upload that went viral for unrelated reasons). YT Tracker eliminates this noise by applying **Empirical Bayes Shrinkage**, pulling low-sample topic scores toward the global prior mean ($1.0\times$):

$$\text{RPI}_{\text{shrunken}} = w \cdot \text{RPI}_{\text{raw}} + (1 - w) \cdot 1.0, \quad \text{where } w = \frac{n}{n + 5}$$

- When $n = 1$, $w = \frac{1}{6} \approx 0.17$ (heavily shrunk to prevent false positives).
- When $n = 20$, $w = \frac{20}{25} = 0.80$ (high statistical confidence).
- As $n \to \infty$, $w \to 1.0$ (converges to pure empirical RPI).

---

### 4. Next Best Action (NBA) Recommendation Engine
The **Next Best Action** card on the Overview dashboard synthesizes market opportunities into a single, high-conviction recommendation for the creator:
1. **Identifies the Top Blue Ocean Topic**: Scans all active semantic clusters for the highest Blue Ocean score where your channel coverage is $0$.
2. **Assigns Packaging Archetype**: Automatically selects the optimal viral structure for the topic.
3. **Calculates Projected Lift**: Predicts expected performance multiplier based on competitor baseline benchmarks.
4. **One-Click Export to Studio**: Transfers the suggested title, topic tags, and packaging framework directly to the Creator Studio Idea Canvas.

---

### 5. Competitive Moat & Vocabulary Overlap
Using Jaccard distance over normalized title n-grams and video tags, the engine computes:
- **Shared Keyword Overlap**: Terms and topics where your channel directly competes with the niche.
- **Competitor Monopoly Topics**: High-performing keywords owned by competitors with 0 coverage on your channel.
- **Channel Unique Moat**: Distinct vocabulary clusters where your channel commands exclusive authority.

---

### 6. The 5 Viral Packaging Archetypes
The Creator Studio Synthesizer maps raw topic ideas into 5 battle-tested YouTube narrative archetypes:

| Archetype | Core Psychological Trigger | Example Title Structure |
| :--- | :--- | :--- |
| **1. The Contrarian / Debunking** | Cognitive dissonance & counter-intuitive truth | *"Why Everyone is Wrong About [Topic] (Do This Instead)"* |
| **2. The Benchmark / Showdown** | High effort, empirical proof & objective data | *"I Tested Top 10 [Topic Tools] for 1,000 Hours — Here's The Best"* |
| **3. The Zero-to-One Blueprint** | Actionable mastery & complete step-by-step path | *"The Only [Topic] Guide You Need in 2026 (From Scratch to Pro)"* |
| **4. The High-Stakes Transformation** | Extreme challenge, urgency & visible progression | *"I Built a Full [Topic System] in 30 Days Without Code"* |
| **5. The Insider / Behind Closed Doors** | Exclusivity, curiosity gap & trade secrets | *"What [Niche Authority] Won't Tell You About [Topic]"* |

---

### 7. Title Lab & Click-Through (CTR) Scoring
The Title Lab provides real-time scoring (0–100) and optimization feedback:
- **Curiosity & Power Word Detection**: Evaluates psychological urgency triggers (*Secret, Mistake, Proven, Exposed, Complete*).
- **50-Character Mobile Fold Cutoff**: Highlights characters 1–50 (`Visible on Mobile`) vs 51+ (`Truncated in Browse Feed`).
- **Hook Placement Diagnostic**: Confirms whether primary power keywords are front-loaded before character 50.
- **Keystroke `AbortController`**: Prevents asynchronous network race conditions during fast typing.

---

## ⚡ Statistical & Time-Series Engine

### 1. Velocity-Weighted RPI ($\text{VRPI}$) with Age Decay
$$\text{Video Velocity } V = \frac{\text{Current Views}}{\max(0.04, \text{Days Published})}$$

$$\text{Daily Baseline Velocity } V_{\text{base}} = \max\left(1, \frac{\text{Channel 30-Day Median Views}}{30}\right)$$

$$\text{Raw VRPI} = \frac{V}{V_{\text{base}}}$$

$$\text{Age Decay Factor} = \begin{cases} 1.0 & \text{if } \text{Age} \le 7\text{ days} \\ \frac{1}{\sqrt{1 + (\text{Age} - 7) / 21}} & \text{if } \text{Age} > 7\text{ days} \end{cases}$$

$$\text{VRPI} = \text{Raw VRPI} \cdot \text{Age Decay Factor}$$

- 🔥 **Breakout Outliers**: Fresh uploads ($\le 14\text{d}$) surging at $\text{VRPI} \ge 2.5\times$ baseline velocity.
- ⚡ **Velocity Spikes**: Uploads with $1.5\times \le \text{VRPI} < 2.5\times$.

---

### 2. Time-Bucketed Milestone Thresholds & 168h Baselines
- **T+2h Viral Breakout**: Requires $\ge 3.5\times$ channel median velocity.
- **T+24h Velocity Surge**: Requires $\ge 2.5\times$ channel median velocity.
- **T+168h (Day 7) Sustained Evergreen**: Requires $\ge 2.0\times$ historical 168h baseline computed via `channel_baselines_v2m_168h` (8-hour tolerance window: `age_hours BETWEEN 164.0 AND 172.0`).

---

## 🛡️ Production Hardening & Bug Fixes (v5.0)

During v5.0 development, seven critical distributed systems and operational bugs were audited and permanently resolved:

### 🔧 Fix 1: Pacific Time Midnight Quota Ledger (Drift-Free)
- **Problem**: YouTube API quota strictly resets at Midnight Pacific Time (`America/Los_Angeles`). Rolling 24-hour keys caused ledger drift and quota exhaustion.
- **Solution**: Quota keys are formatted with the current Pacific Date string (`quota:spend:YYYY-MM-DD-PT`) and dynamically set with the exact number of seconds remaining until the next PT Midnight reset.

### 🔧 Fix 2: Batch 429 & Transient Error Protection (Anti-Wipeout)
- **Problem**: Temporary YouTube API 429/403/500 errors could cause the batch snapshot processor to misinterpret empty responses as deleted videos.
- **Solution**: The snapshot worker strictly keeps records in `pending` on transient errors. Only verified `200 OK` API responses with missing video IDs transition records to `deleted_or_privatized`.

### 🔧 Fix 3: 85% Circuit Breaker with Baseline Immunity
- **Problem**: Hitting API limits should not corrupt historical time-series analytics.
- **Solution**: At $\ge 8,500$ quota units, non-essential background channel backfills are throttled, but T+24h and T+168h baseline snapshots and all frontend UI routes remain 100% operational, guaranteeing **zero survivorship bias**.

### 🔧 Fix 4: Strict FastEmbed Embedding Isolation
- **Problem**: Silent fallbacks from 384-d dense embeddings to n-gram heuristics corrupt vector databases.
- **Solution**: FastEmbed is strictly enforced. If unavailable, vector endpoints return a clean `503 Service Unavailable` rather than polluting Supabase pgvector collections with invalid embeddings.

### 🔧 Fix 5: Decoupled Non-Blocking Materialized View Refresh
- **Problem**: Heavyweight `REFRESH MATERIALIZED VIEW CONCURRENTLY` in 5-minute snapshot workers caused database lock contention and query timeouts.
- **Solution**: Materialized view refreshes are decoupled into a dedicated `/api/cron/refresh-baselines` cron route and backed by a `UNIQUE INDEX` on `channel_id` for zero-downtime concurrent execution.

### 🔧 Fix 6: Memory-Safe Deep Reactive Store
- **Problem**: Nested object proxies in frontend state engines can lose object identity or trigger unbatched DOM redraw thrashing.
- **Solution**: [`static/js/state.js`](file:///g:/Important%20Projects/Youtube%20Data%20Manager/static/js/state.js) uses a `WeakMap` identity cache with `requestAnimationFrame` 60fps batching and `appstate:${key}` CustomEvents broadcasting both `value` and `oldValue`.

### 🔧 Fix 7: Windows Console Charset Guard
- **Problem**: Non-ASCII Unicode emoji in terminal logging caused `charmap`/`cp1252` `UnicodeEncodeError` crashes on Windows hosts.
- **Solution**: Standardized on clean ASCII logging tags (`[CRITICAL]`, `[WARNING]`, `[INFO]`) throughout the backend.

---

## 🎨 Linear / Raycast-Grade Design System

- **4-Tier Progressive Disclosure**:
  - **L0 (Numbers)**: Tabular figures (`1.2K`, `4.5%`, `↑ 4%`) with no visual clutter.
  - **L1 (Tooltips)**: Fast 120ms hover & focus tooltips on all `[data-tip]` metrics with `"Learn more →"` triggers.
  - **L2 (Detail Sheets)**: Slide-out drawer displaying exact mathematical formulas, interpretation guides, and tactical next steps.
  - **L3 (Deep Dive)**: Dedicated full-screen forensics view with 90-day upload pulse, split-pane right-rail inspection (`.dd-split-layout`), and topic moats.
- **Data Honesty**: Renders clean em-dashes (`—`) or `< 1%` when data is insufficient; never emits false zeros.
- **Disciplined Tone**: Zero exclamation marks in copy, tooltips, or toast notifications.

---

## 🏗️ Architecture & Codebase Structure

```text
Youtube-Data-Manager/
├── server.py                   # Flask backend, WebSub listener, FastEmbed & Outlier Radar
├── requirements.txt            # Python dependencies (flask, supabase, fastembed, redis, etc.)
├── Procfile                    # Production deployment configuration (Gunicorn)
├── settings.json               # Outlier Radar webhook configuration
├── test_phase1_6.py            # Automated test suite (13/13 backend tests passing)
│
├── scripts/
│   ├── migration_v4_schema.sql # PostgreSQL schema (HNSW vector index, partitions, 168h view, RPC)
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
- **Database & Vector Search**: Supabase (Cloud PostgreSQL) + `pgvector` HNSW Cosine Similarity Indexing
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