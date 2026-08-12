CREATE TABLE IF NOT EXISTS project_pages (
  page_key text PRIMARY KEY,
  title text NOT NULL,
  title_en text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  summary_en text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
