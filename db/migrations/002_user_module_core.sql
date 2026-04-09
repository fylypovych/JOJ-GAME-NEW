CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  email text UNIQUE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'administrator')),
  admin_access_token_hash text,
  admin_access_token_rotated_at timestamptz,
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
  profile_public boolean NOT NULL DEFAULT true,
  show_stats_public boolean NOT NULL DEFAULT true,
  show_recent_matches_public boolean NOT NULL DEFAULT false,
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
  winner_player_name text,
  end_reason text,
  game_mode text NOT NULL DEFAULT 'standard',
  player_count integer NOT NULL DEFAULT 0,
  bot_count integer NOT NULL DEFAULT 0,
  bot_difficulty text,
  turns_completed integer NOT NULL DEFAULT 0,
  persisted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE persisted_match_results ADD COLUMN IF NOT EXISTS winner_player_name text;
ALTER TABLE persisted_match_results ADD COLUMN IF NOT EXISTS game_mode text NOT NULL DEFAULT 'standard';
ALTER TABLE persisted_match_results ADD COLUMN IF NOT EXISTS player_count integer NOT NULL DEFAULT 0;
ALTER TABLE persisted_match_results ADD COLUMN IF NOT EXISTS bot_count integer NOT NULL DEFAULT 0;
ALTER TABLE persisted_match_results ADD COLUMN IF NOT EXISTS bot_difficulty text;

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

CREATE TABLE IF NOT EXISTS award_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'ranks', 'resources', 'actions')),
  metric text NOT NULL,
  threshold numeric NOT NULL DEFAULT 1,
  badge_label text NOT NULL DEFAULT '',
  badge_variant text NOT NULL DEFAULT 'bronze' CHECK (badge_variant IN ('bronze', 'silver', 'gold', 'special')),
  icon_path text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  award_id uuid NOT NULL REFERENCES award_definitions(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  progress_value numeric NOT NULL DEFAULT 0,
  UNIQUE (user_id, award_id)
);

CREATE INDEX IF NOT EXISTS idx_user_awards_user_id ON user_awards (user_id, awarded_at DESC);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS admin_access_token_hash text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS admin_access_token_rotated_at timestamptz;

UPDATE app_users
SET role = 'user'
WHERE role IS NULL OR role NOT IN ('user', 'administrator');
