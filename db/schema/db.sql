-- JOJ GAME future PostgreSQL schema
-- Import with: psql "$DATABASE_URL" -f db.sql
-- This schema is intentionally broader than the current implementation and
-- prepares a gradual migration from JSON/files to PostgreSQL.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor text,
  source_ip text,
  match_id text,
  success boolean NOT NULL DEFAULT true,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_match_id ON admin_audit_log (match_id) WHERE match_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS storage_connection_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL UNIQUE,
  driver text NOT NULL CHECK (driver IN ('postgres', 'mysql')),
  host text NOT NULL,
  port integer NOT NULL CHECK (port > 0 AND port < 65536),
  database_name text NOT NULL,
  username text NOT NULL,
  -- Password should be stored encrypted in application layer in the future.
  password_ciphertext text,
  ssl_mode text NOT NULL DEFAULT 'disable',
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storage_connection_profiles_active ON storage_connection_profiles (is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS config_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type text NOT NULL CHECK (config_type IN ('shared_ranks', 'shared_deck_template', 'server_settings', 'ui_settings')),
  slug text NOT NULL,
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  version_no integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  checksum_sha256 text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_type, slug, version_no)
);

CREATE INDEX IF NOT EXISTS idx_config_sets_type_active ON config_sets (config_type, is_active);
CREATE INDEX IF NOT EXISTS idx_config_sets_slug ON config_sets (slug);

CREATE TABLE IF NOT EXISTS config_set_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_set_id uuid NOT NULL REFERENCES config_sets(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  payload jsonb NOT NULL,
  change_note text,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_set_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_config_set_history_config_set_id ON config_set_history (config_set_id, version_no DESC);

CREATE TABLE IF NOT EXISTS card_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id text,
  asset_kind text NOT NULL CHECK (asset_kind IN ('card_image', 'deck_back', 'rank_image', 'other')),
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  width_px integer,
  height_px integer,
  checksum_sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_assets_card_id ON card_assets (card_id) WHERE card_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS card_catalog (
  id text PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL,
  image_path text,
  flavor text,
  effects jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_catalog_category ON card_catalog (category);

CREATE TABLE IF NOT EXISTS deck_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  title text NOT NULL,
  deck_back_image_path text,
  payload jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deck_templates_active ON deck_templates (is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS deck_template_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_template_id uuid NOT NULL REFERENCES deck_templates(id) ON DELETE CASCADE,
  deck_target text NOT NULL CHECK (deck_target IN ('deck', 'legendaryDeck', 'rankTrack')),
  card_id text,
  sort_index integer NOT NULL,
  card_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deck_template_id, deck_target, sort_index)
);

CREATE INDEX IF NOT EXISTS idx_deck_template_entries_template_target ON deck_template_entries (deck_template_id, deck_target, sort_index);

CREATE TABLE IF NOT EXISTS rank_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_set_key text NOT NULL UNIQUE,
  title text NOT NULL,
  payload jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rank_sets_active ON rank_sets (is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS rank_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_set_id uuid NOT NULL REFERENCES rank_sets(id) ON DELETE CASCADE,
  rank_code text NOT NULL,
  display_name text NOT NULL,
  sort_order integer NOT NULL,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  promotion_cost jsonb NOT NULL DEFAULT '{}'::jsonb,
  bonus jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rank_set_id, rank_code),
  UNIQUE (rank_set_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_rank_definitions_rank_set_id ON rank_definitions (rank_set_id, sort_order);

CREATE TABLE IF NOT EXISTS match_records (
  id text PRIMARY KEY,
  game_name text NOT NULL DEFAULT 'joj-game',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'stopped', 'deleted')),
  player_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  winner_player_id text,
  rank_set_id uuid REFERENCES rank_sets(id) ON DELETE SET NULL,
  deck_template_id uuid REFERENCES deck_templates(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_match_records_status ON match_records (status);
CREATE INDEX IF NOT EXISTS idx_match_records_updated_at ON match_records (updated_at DESC);

CREATE TABLE IF NOT EXISTS match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES match_records(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  player_name text,
  seat_no integer,
  joined_at timestamptz,
  left_at timestamptz,
  final_rank_code text,
  final_resources jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players (match_id, seat_no);

CREATE TABLE IF NOT EXISTS match_state_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES match_records(id) ON DELETE CASCADE,
  snapshot_seq bigint NOT NULL,
  snapshot_kind text NOT NULL DEFAULT 'autosave' CHECK (snapshot_kind IN ('initial', 'autosave', 'manual', 'admin_stop', 'admin_reset', 'final')),
  state_json jsonb NOT NULL,
  ctx_json jsonb,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, snapshot_seq)
);

CREATE INDEX IF NOT EXISTS idx_match_state_snapshots_match_id ON match_state_snapshots (match_id, snapshot_seq DESC);

CREATE TABLE IF NOT EXISTS match_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES match_records(id) ON DELETE CASCADE,
  seq_no bigint NOT NULL,
  event_type text NOT NULL,
  player_id text,
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, seq_no)
);

CREATE INDEX IF NOT EXISTS idx_match_event_log_match_id ON match_event_log (match_id, seq_no DESC);

CREATE TABLE IF NOT EXISTS simulation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_kind text NOT NULL DEFAULT 'rank-balance',
  players integer NOT NULL,
  simulations_count integer NOT NULL,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simulation_reports_created_at ON simulation_reports (created_at DESC);

CREATE TABLE IF NOT EXISTS simulation_rank_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_report_id uuid NOT NULL REFERENCES simulation_reports(id) ON DELETE CASCADE,
  rank_code text NOT NULL,
  reach_count integer NOT NULL DEFAULT 0,
  reach_percent numeric(6,3),
  avg_turn numeric(8,3),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_simulation_rank_results_report_id ON simulation_rank_results (simulation_report_id);

CREATE TABLE IF NOT EXISTS import_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('import_deck', 'import_ranks', 'export_schema', 'export_backup', 'import_backup')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')) DEFAULT 'queued',
  requested_by text,
  input_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_export_jobs_created_at ON import_export_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_export_jobs_status ON import_export_jobs (status);

CREATE TABLE IF NOT EXISTS backup_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_kind text NOT NULL CHECK (backup_kind IN ('schema', 'full_dump', 'config_only', 'matches_only')),
  filename text NOT NULL,
  storage_path text,
  checksum_sha256 text,
  bytes_size bigint,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_backup_registry_created_at ON backup_registry (created_at DESC);

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  email text UNIQUE,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  bio text NOT NULL DEFAULT '',
  preferred_lang text NOT NULL DEFAULT 'uk' CHECK (preferred_lang IN ('uk', 'en')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  source_ip text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at);

CREATE TABLE IF NOT EXISTS user_password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_password_reset_tokens_user_id ON user_password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_user_password_reset_tokens_expires_at ON user_password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS user_match_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  match_id text NOT NULL,
  player_id text NOT NULL,
  player_name text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_user_match_links_user_id ON user_match_links (user_id, linked_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_match_links_match_id ON user_match_links (match_id);

CREATE TABLE IF NOT EXISTS persisted_match_results (
  match_id text PRIMARY KEY,
  winner_player_id text,
  end_reason text,
  turns_completed integer NOT NULL DEFAULT 0,
  persisted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persisted_match_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES persisted_match_results(match_id) ON DELETE CASCADE,
  player_id text NOT NULL,
  player_name text,
  final_rank_id text NOT NULL,
  final_resources jsonb NOT NULL DEFAULT '{}'::jsonb,
  resources_gained_total integer NOT NULL DEFAULT 0,
  resources_lost_total integer NOT NULL DEFAULT 0,
  lyaps_played_on_others integer NOT NULL DEFAULT 0,
  scandals_played_on_others integer NOT NULL DEFAULT 0,
  turns_taken integer NOT NULL DEFAULT 0,
  UNIQUE (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_persisted_match_participants_match_id ON persisted_match_participants (match_id);

INSERT INTO app_settings (key, value, updated_by)
VALUES
  ('storage_mode', '{"mode":"file"}'::jsonb, 'bootstrap'),
  ('storage_backend_capabilities', '{"file":true,"postgres":false,"mysql":false}'::jsonb, 'bootstrap')
ON CONFLICT (key) DO NOTHING;

COMMIT;
