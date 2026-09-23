-- ══════════════════════════════════════════════════════════════════════════════
-- YT TRACKER v4.0 — DATABASE & SCHEMA ARCHITECTURE MIGRATION
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Reliable Snapshot Schedule Queue
CREATE TABLE IF NOT EXISTS snapshot_schedule (
    id BIGSERIAL PRIMARY KEY,
    video_id TEXT NOT NULL,
    channel_id TEXT,
    target_snapshot_at TIMESTAMPTZ NOT NULL,
    hour_checkpoint INT NOT NULL, -- 2, 24, or 168
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'cancelled', 'failed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

-- Partial index for high-performance cron queue scanning
CREATE INDEX IF NOT EXISTS idx_pending_snapshots 
ON snapshot_schedule(target_snapshot_at) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_snapshot_schedule_video 
ON snapshot_schedule(video_id);

-- 3. Topic Clusters Table with HNSW Vector Indexing
CREATE TABLE IF NOT EXISTS topic_clusters (
    cluster_id INT PRIMARY KEY,
    representative_keywords TEXT[],
    centroid_vector vector(384),
    prior_variance NUMERIC DEFAULT 0.25, -- For Dynamic Empirical Bayes
    semantic_label TEXT,                -- e.g. "B2B Engineering", "Vlog Entertainment"
    matched_archetypes TEXT[],          -- Mapped Creator Studio archetypes
    video_count INT DEFAULT 0,
    avg_views BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW vector cosine similarity index (zero-shot, no pre-training data needed)
CREATE INDEX IF NOT EXISTS idx_topic_clusters_hnsw 
ON topic_clusters 
USING hnsw (centroid_vector vector_cosine_ops);

-- 4. Time-Series Video Snapshots Table with Partitioning Support
-- Native PostgreSQL Range Partitioning by recorded_at
CREATE TABLE IF NOT EXISTS video_snapshots_v4 (
    id BIGSERIAL,
    video_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    age_hours NUMERIC NOT NULL,
    view_count BIGINT NOT NULL,
    velocity_per_hour NUMERIC GENERATED ALWAYS AS (view_count / NULLIF(age_hours, 0)) STORED,
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Default and initial monthly partitions
CREATE TABLE IF NOT EXISTS video_snapshots_default PARTITION OF video_snapshots_v4 DEFAULT;
CREATE TABLE IF NOT EXISTS video_snapshots_2026_09 PARTITION OF video_snapshots_v4
    FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS video_snapshots_2026_10 PARTITION OF video_snapshots_v4
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

CREATE INDEX IF NOT EXISTS idx_v_snap_vid ON video_snapshots_v4(video_id);
CREATE INDEX IF NOT EXISTS idx_v_snap_ch_age ON video_snapshots_v4(channel_id, age_hours);

-- 5. Time-Windowed Velocity-to-Maturity (V2M) Materialized View
-- Includes 23.0h to 25.0h tolerance window to absorb cron scheduling jitter
CREATE MATERIALIZED VIEW IF NOT EXISTS channel_baselines_v2m AS
SELECT 
    channel_id,
    COUNT(DISTINCT video_id) as sample_count,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY velocity_per_hour) as median_velocity_24h,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY velocity_per_hour) as p95_velocity_24h,
    AVG(velocity_per_hour) as avg_velocity_24h,
    NOW() as refreshed_at
FROM video_snapshots_v4
WHERE age_hours BETWEEN 23.0 AND 25.0
GROUP BY channel_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cb_v2m_cid ON channel_baselines_v2m(channel_id);

-- 6. Quota Ledger Table for Circuit Breakers
CREATE TABLE IF NOT EXISTS quota_ledger (
    ledger_date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
    units_spent INT DEFAULT 0,
    circuit_breaker_active BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
