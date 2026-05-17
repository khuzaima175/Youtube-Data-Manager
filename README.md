# YT Tracker — YouTube Channel Analytics Dashboard

A professional, visually sophisticated web application for tracking YouTube channel performance and monitoring competitors. Built with Flask and vanilla JavaScript.

## 🚀 Features

- 🍱 **Bento Box UI** — A minimalist, interactive dashboard design utilizing hover states and visual cues (sparklines, progress bars) for an intuitive analytics experience.
- 📊 **Dashboard** — Hero card for your primary channel with competitor leaderboards and detailed video comparisons.
- 📌 **Smart Channel Sorting** — Dynamic sorting logic that automatically pins your primary channel to the top of your list for immediate access.
- 🎛️ **Advanced Analytics & Filtering**:
  - View engagement trends and subscriber growth via Supabase snapshots.
  - Toggle between regular videos and Shorts for specialized performance analysis.
  - Filter popular video rankings by time range.
- 📋 **Channel Tracking** — Track multiple channels with real-time stats, dynamic leaderboards, and automated data enrichment.
- 🔍 **Search & Add** — Find any YouTube channel instantly with highly optimized search autocomplete.
- ⚡ **Performance & Stability**:
  - **Cold Start Protection**: Includes a `/ping` route for UptimeRobot monitoring.
  - **Optimized API Calls**: Reuses the YouTube API client to eliminate discovery doc lag.
  - **Supabase Persistence**: Scalable cloud database for your channel list and snapshots.
- 📥 **Data Export** — Export all your tracked channel data as a CSV for external analysis.
- 📱 **Responsive Design** — Fully responsive grid layouts optimized for desktop, tablet, and mobile viewing.

## 🛠️ Technology Stack

- **Backend**: Python 3.8+ / Flask
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Vanilla HTML5, CSS3 (Custom Properties & Glassmorphism), and JavaScript
- **API**: YouTube Data API v3
- **Typography**: Syne, DM Sans, and JetBrains Mono

## 📦 Setup Instructions

### Prerequisites

- Python 3.8+
- A YouTube Data API Key
- A Supabase Project (URL and Service Key)

### Installation & Run

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
   - Copy `.env.example` to `.env`.
   - Add your `YOUTUBE_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_KEY`.

4. **Run the application**:
   ```bash
   python server.py
   ```

## ☁️ Deployment (Railway)

1. Connect your GitHub repository to [Railway.app](https://railway.app).
2. Add your environment variables in the Railway dashboard.
3. **Fix Cold Starts**: Set up [UptimeRobot](https://uptimerobot.com) to ping `https://your-app-url.up.railway.app/ping` every 5 minutes.

## ⚖️ License

MIT License. This project is for educational/personal use. Ensure compliance with YouTube API Terms of Service.