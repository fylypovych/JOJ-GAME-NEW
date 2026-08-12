CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS project_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  title_en text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  summary_en text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  cover_image_path text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  pinned boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_news_public
  ON project_news (status, pinned DESC, sort_order ASC, published_at DESC);
