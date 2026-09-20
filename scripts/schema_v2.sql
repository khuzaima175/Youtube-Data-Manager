-- ==============================================================================
-- YT Tracker — Advanced Intelligence Engine (v2.1) Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

-- 1. Durable per-video store (Module 0)
CREATE TABLE IF NOT EXISTS videos (
  video_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  duration_seconds INT,
  views BIGINT NOT NULL DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  thumbnail_url TEXT,
  thumbnail_width INT,
  thumbnail_height INT,
  is_short BOOLEAN DEFAULT FALSE,
  first_synced_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_is_short ON videos(is_short);

-- 2. Channel Baselines View for RPI calculation (Module 1)
-- Calculates rolling 90-day median views for long-form videos per channel
CREATE OR REPLACE VIEW channel_baselines AS
SELECT
  c.id AS channel_id,
  c.handle,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.views) AS median_views,
  COUNT(v.video_id) AS video_count
FROM channels c
JOIN videos v ON v.channel_id = c.id
WHERE v.published_at > NOW() - INTERVAL '90 days'
  AND (v.is_short IS NOT TRUE)
GROUP BY c.id, c.handle;

-- 3. Topic Metrics Table for Supply/Demand Saturation (Module 2)
CREATE TABLE IF NOT EXISTS topic_metrics (
  topic_key TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  total_videos INT DEFAULT 0,
  recent_uploads_14d INT DEFAULT 0,
  shrunken_rpi DECIMAL(8,2) DEFAULT 0,
  blue_ocean_score DECIMAL(8,2) DEFAULT 0,
  saturation_label TEXT DEFAULT 'baseline',
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topic_metrics_score ON topic_metrics(blue_ocean_score DESC);

-- 4. Autocomplete Search Voids Table (Module 3)
CREATE TABLE IF NOT EXISTS search_voids (
  id BIGSERIAL PRIMARY KEY,
  seed_keyword TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  void_score DECIMAL(4,2) DEFAULT 0,
  competitor_coverage INT DEFAULT 0,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active',
  UNIQUE(seed_keyword, suggestion)
);

CREATE INDEX IF NOT EXISTS idx_search_voids_score ON search_voids(void_score DESC);

-- 5. Video Velocity Time-Series Snapshots (Module 5)
CREATE TABLE IF NOT EXISTS video_velocity (
  video_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  views BIGINT NOT NULL,
  velocity DECIMAL(12,2) DEFAULT 0,
  acceleration DECIMAL(8,3) DEFAULT 0,
  PRIMARY KEY (video_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_velocity_date ON video_velocity(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_velocity_accel ON video_velocity(acceleration DESC);
