-- ============================================================
--  LinguistFlow – PostgreSQL Database Schema
--  GDPR-compliant: no visitor IP storage, AI transparency tags
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Customers (SaaS accounts) ────────────────────────────────
CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) NOT NULL UNIQUE,
    hashed_password     VARCHAR(255) NOT NULL,
    full_name           VARCHAR(255),
    company             VARCHAR(255),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    gdpr_consent        BOOLEAN NOT NULL DEFAULT FALSE,
    gdpr_consent_at     TIMESTAMPTZ,
    avv_accepted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Style profiles (tone/style presets) ─────────────────────
CREATE TABLE style_profiles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,   -- e.g. 'formal', 'playful'
    description TEXT,
    prompt_hint TEXT   -- appended to the LLM system prompt
);

INSERT INTO style_profiles (name, description, prompt_hint) VALUES
    ('formal',    'Fachlich und konservativ',         'Write in a formal, authoritative, and precise tone.'),
    ('neutral',   'Ausgewogen und informativ',         'Write in a neutral, informative, and balanced tone.'),
    ('playful',   'Jung, leicht und verspielt',        'Write in a fun, light-hearted, and engaging tone.'),
    ('seo',       'SEO-optimiert, keyword-reich',      'Write in a keyword-rich, SEO-optimized tone, with clear headings.'),
    ('story',     'Narrativ und storytelling',         'Use a narrative, story-driven tone with vivid examples.');

-- ── Blogs ────────────────────────────────────────────────────
CREATE TABLE blogs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name             VARCHAR(255) NOT NULL,
    slug             VARCHAR(255) NOT NULL UNIQUE,
    style_profile    VARCHAR(50) NOT NULL DEFAULT 'neutral',
    layout_template  JSONB,   -- drag-and-drop block order
    detected_theme   JSONB,   -- CSS theme cloner output
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_blogs_customer ON blogs(customer_id);

-- ── Content sources ──────────────────────────────────────────
CREATE TABLE content_sources (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id          UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    source_type      VARCHAR(50) NOT NULL CHECK (source_type IN ('rss','url','keyword')),
    url              TEXT,
    keyword          VARCHAR(255),
    last_fetched_at  TIMESTAMPTZ,
    last_item_count  INT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sources_blog ON content_sources(blog_id);

-- ── Schedules ────────────────────────────────────────────────
CREATE TABLE schedules (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id              UUID NOT NULL UNIQUE REFERENCES blogs(id) ON DELETE CASCADE,
    posts_per_week       INT NOT NULL DEFAULT 3,
    preferred_time_slots JSONB,  -- ["09:00","15:00","20:00"]
    enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    next_run_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Posts (AI-generated articles) ────────────────────────────
CREATE TABLE posts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id          UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    title            VARCHAR(512) NOT NULL,
    slug             VARCHAR(512) NOT NULL,
    content_html     TEXT,
    excerpt          TEXT,
    author_name      VARCHAR(255),      -- human author (GDPR: customer set this)
    language         VARCHAR(10) NOT NULL DEFAULT 'de',
    status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending','live','archived')),

    -- ── COMPLIANCE: Human-in-the-Loop (EU AI Act §52, GDPR) ──────────────
    is_approved      BOOLEAN NOT NULL DEFAULT FALSE,
    approved_at      TIMESTAMPTZ,
    approved_by      UUID REFERENCES customers(id) ON DELETE SET NULL,

    -- ── AI transparency metadata ──────────────────────────────────────────
    ai_meta          JSONB,
    -- {"model":"gpt-4o","provider":"openai","prompt_version":"1.2",
    --  "sources":["https://..."],"generated_at":"2025-01-01T10:00:00Z"}

    seo_keywords     JSONB,
    meta_description TEXT,
    scheduled_at     TIMESTAMPTZ,
    published_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_posts_blog        ON posts(blog_id);
CREATE INDEX idx_posts_status      ON posts(status);
CREATE INDEX idx_posts_is_approved ON posts(is_approved);
CREATE INDEX idx_posts_scheduled   ON posts(scheduled_at) WHERE status = 'pending';

-- ── Assets (images linked to posts) ──────────────────────────
CREATE TABLE assets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id          UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    url              TEXT NOT NULL,
    alt_text         TEXT,
    mime_type        VARCHAR(100),

    -- ── COMPLIANCE: EU AI Act transparency + GDPR ────────────────────────
    is_ai_generated  BOOLEAN NOT NULL DEFAULT FALSE,
    ai_tag           VARCHAR(255),
    -- e.g. "AI-Generated via DALL-E 3" | "AI-Generated via Stable Diffusion XL"
    license          VARCHAR(100),
    -- "commercial-free" | "ai-generated" | "pexels-commercial"

    source_url       TEXT,
    width            INT,
    height           INT,
    file_size_bytes  INT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_assets_post ON assets(post_id);

-- ── Refresh timestamp trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_blogs_updated BEFORE UPDATE ON blogs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_posts_updated BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
