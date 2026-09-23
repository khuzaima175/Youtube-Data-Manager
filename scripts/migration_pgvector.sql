-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Supabase pgvector Extension & Semantic Video Embeddings
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add 384-dimensional embedding column for sentence-transformers / FastEmbed
ALTER TABLE videos ADD COLUMN IF NOT EXISTS embedding vector(384);

-- 3. Create IVFFlat cosine similarity index for sub-millisecond nearest-neighbor search
CREATE INDEX IF NOT EXISTS idx_videos_embedding 
  ON videos 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- 4. Cosine similarity search RPC function for vector matching
CREATE OR REPLACE FUNCTION match_videos(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.60,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id text,
  channel_id text,
  title text,
  view_count bigint,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    videos.id,
    videos.channel_id,
    videos.title,
    videos.view_count,
    1 - (videos.embedding <=> query_embedding) AS similarity
  FROM videos
  WHERE videos.embedding IS NOT NULL
    AND 1 - (videos.embedding <=> query_embedding) > match_threshold
  ORDER BY videos.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
