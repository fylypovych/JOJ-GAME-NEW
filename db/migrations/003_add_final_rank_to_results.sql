-- Додаємо колонку final_rank_id в persisted_match_results для зберігання найкращого звання переможця
ALTER TABLE persisted_match_results ADD COLUMN IF NOT EXISTS final_rank_id text;
