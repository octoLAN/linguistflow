-- Migration: Add visual_opts and ghost_data columns to posts table
-- Run once against your production/staging PostgreSQL database.
-- These columns store the Editor's design settings and ghost field content per draft.

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS visual_opts JSONB,
    ADD COLUMN IF NOT EXISTS ghost_data  JSONB;

-- Optional indexes for future filtering queries:
-- CREATE INDEX IF NOT EXISTS idx_posts_visual_opts ON posts USING GIN (visual_opts);
-- CREATE INDEX IF NOT EXISTS idx_posts_ghost_data  ON posts USING GIN (ghost_data);
