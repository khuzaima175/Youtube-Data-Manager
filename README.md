# YT Tracker — YouTube Channel Analytics & Management Suite

A professional, visually sophisticated analytics suite for tracking YouTube channel performance, monitoring competitors, and historical growth. Features both a **Flask & Vanilla JS Web Dashboard** with a Bento Box layout and a **Tkinter & Pillow Desktop Application**.

---

## 🚀 Key Features

### 🌐 Web Dashboard (Flask + Vanilla JS)
- 🍱 **Bento Box UI** — Minimalist, glassmorphism dashboard design utilizing hover states, sparklines, progress bars, and high-density metric cards.
- 📊 **Hero Card & Leaderboards** — Hero overview for your primary channel, combined competitor leaderboards, and side-by-side video performance comparisons.
- 📈 **Monthly Upload Velocity Chart** — Interactive SVG grouped bar chart visualizing 6-month upload trends across all tracked channels (optimized with zero-quota client-side caching).
- 📌 **Smart Channel Sorting** — Dynamic sorting logic that automatically pins your primary channel to the top of your list.
- 🎛️ **Advanced Analytics & Video Filtering**:
  - Track subscriber growth and view trends via automated Supabase snapshot history.
  - Toggle between regular videos and YouTube Shorts.
  - Filter video rankings by time range (All Time, Last 30 Days, Last 90 Days).
- 🔍 **Quota-Optimized Autocomplete**:
  - Live channel search drop-down with `@handle` exact lookup support (costing only **1 API unit** instead of 100).
  - 5-minute in-memory search suggestion cache.
- 🖼️ **Built-in Image Proxy (`/api/img-proxy`)**:
  - Proxies YouTube / `ggpht.com` thumbnails to bypass browser referrer restrictions, with 1-hour in-memory caching.
- 📥 **CSV Data Export** — Export all tracked channel stats and metadata as a downloadable CSV.

---

### 🖥️ Desktop GUI Application (`yt_channel_viewer.py`)
- 🎨 **Dark Mode Native Interface** — Built with Python **Tkinter** and **Pillow (PIL)**.
- ⭕ **Dynamic Image Processing** — Renders circular channel logos, rounded thumbnail corners, and custom stat pills (`👥 Subscribers`, `👁 Views`, `🎬 Videos`, `📊 Avg Views`).
- ⚡ **Instant Search & Fetch** — Standalone desktop search tool for inspecting any YouTube channel without launching the web server.

---

### 🛠️ Database & Maintenance Utilities
- 🗄️ **Supabase Integration** — Persistent PostgreSQL storage for channel metadata and daily growth snapshots.
- 🔄 **Migration Tool (`migrate_to_supabase.py`)** — One-time utility script to safely import legacy `channels.json` and `snapshots.json` into Supabase tables using upsert.
- 🩺 **Full System Diagnostic (`verify_supabase.py`)** — Health-check tool verifying `.env` variables, Supabase connection, schema table existence (`channels`, `snapshots`, `api_cache`), and local vs. cloud data sync status.
- 🔑 **API Key & Inspection Helpers**:
  - `verify_yt_key.py`: Simple test script to validate YouTube Data API key functionality.
  - `mrbeast_info.py`: CLI payload inspection tool for target channels and latest video statistics.

---

## 🛠️ Technology Stack

- **Backend**: Python 3.8+ / Flask / Gunicorn
- **Database**: Supabase (PostgreSQL) via `supabase-py` SDK
- **Desktop App**: Tkinter / Pillow (PIL)
- **Frontend**: Vanilla HTML5, CSS3 (Custom Properties & Glassmorphism), JavaScript (ES6+)
- **API**: YouTube Data API v3 (`google-api-python-client`) with thread-local client caching
- **Typography & Icons**: Syne, DM Sans, JetBrains Mono, Material Symbols

---

## 📦 Setup & Usage Instructions

### Prerequisites

- Python 3.8+
- YouTube Data API Key
- Supabase Project (`SUPABASE_URL` and `SUPABASE_SERVICE_KEY`)

---

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/khuzaima175/Youtube-Data-Manager.git
   cd Youtube-Data-Manager
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory (or copy from `.env.example`):
   ```env
   YOUTUBE_API_KEY=your_youtube_api_key_here
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your_supabase_service_key_here
   FLASK_DEBUG=0
   PORT=5000
   ALLOWED_ORIGINS=http://localhost:5000,http://127.0.0.1:5000
   ```

---

### Running the Web Dashboard

Start the Flask server:
```bash
python server.py
```
Open your browser and navigate to `http://localhost:5000`.

---

### Running the Desktop GUI App

To launch the standalone desktop viewer:
```bash
python yt_channel_viewer.py
```

---

### Running Maintenance & Verification Scripts

- **Verify API Key**:
  ```bash
  python verify_yt_key.py
  ```
- **Check System & Supabase Sync Status**:
  ```bash
  python verify_supabase.py
  ```
- **Migrate Local JSON to Supabase**:
  ```bash
  python migrate_to_supabase.py
  ```
- **Inspect Sample Channel Payload (CLI)**:
  ```bash
  python mrbeast_info.py
  ```

---

## ☁️ Deployment (Railway)

1. Connect your GitHub repository to [Railway.app](https://railway.app).
2. Configure environment variables in the Railway dashboard (`YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).
3. Railway automatically detects `Procfile` (`gunicorn server:app`).
4. **Prevent Cold Starts**: Setup [UptimeRobot](https://uptimerobot.com) to ping `https://your-app-url.up.railway.app/ping` every 5 minutes.

---

## ⚖️ License

MIT License. Developed for educational and personal use. Ensure compliance with YouTube API Terms of Service.