-- ============================================================
-- MANDAR170 — SCHÉMA SUPABASE
-- Colle ce SQL dans l'éditeur SQL de ton projet Supabase
-- ============================================================

-- Séances d'entraînement (importées depuis Hevy CSV)
CREATE TABLE IF NOT EXISTS workout_sets (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_title    TEXT NOT NULL,
  workout_date     DATE NOT NULL,
  start_time       TIMESTAMPTZ,
  end_time         TIMESTAMPTZ,
  exercise_title   TEXT NOT NULL,
  set_index        INTEGER DEFAULT 0,
  set_type         TEXT DEFAULT 'normal',
  weight_kg        FLOAT,
  reps             INTEGER,
  distance_km      FLOAT,
  duration_seconds INTEGER,
  rpe              FLOAT,
  imported_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (start_time, exercise_title, set_index)
);

CREATE INDEX IF NOT EXISTS idx_workout_exercise ON workout_sets(exercise_title);
CREATE INDEX IF NOT EXISTS idx_workout_date     ON workout_sets(workout_date);

-- Mensurations corporelles
CREATE TABLE IF NOT EXISTS measurements (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date            DATE NOT NULL UNIQUE,
  weight_kg       FLOAT,
  chest_cm        FLOAT,
  waist_cm        FLOAT,
  hips_cm         FLOAT,
  left_arm_cm     FLOAT,
  right_arm_cm    FLOAT,
  left_thigh_cm   FLOAT,
  right_thigh_cm  FLOAT,
  neck_cm         FLOAT,
  body_fat_pct    FLOAT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measurements_date ON measurements(date);

-- Nutrition journalière (calories & macros)
CREATE TABLE IF NOT EXISTS nutrition (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date       DATE NOT NULL UNIQUE,
  calories   INTEGER,
  protein_g  FLOAT,
  carbs_g    FLOAT,
  fat_g      FLOAT,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_date ON nutrition(date);

-- ============================================================
-- ROW LEVEL SECURITY (optionnel pour site perso sans auth)
-- Option A – Désactivé (lecture/écriture libre avec anon key)
ALTER TABLE workout_sets  DISABLE ROW LEVEL SECURITY;
ALTER TABLE measurements  DISABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition     DISABLE ROW LEVEL SECURITY;

-- Option B – Active uniquement la lecture publique
-- ALTER TABLE workout_sets  ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "anon_all" ON workout_sets  FOR ALL USING (true) WITH CHECK (true);
-- (idem pour les autres tables)
-- ============================================================

-- ============================================================
-- LIFESTYLE — HABITS (import HabitKit JSON)
-- ============================================================

CREATE TABLE IF NOT EXISTS habits (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT,
  icon        TEXT,
  archived    BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ,
  user_id     UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS habit_completions (
  id                    TEXT PRIMARY KEY,
  habit_id              TEXT REFERENCES habits(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  amount_of_completions INTEGER DEFAULT 0,
  note                  TEXT,
  user_id               UUID REFERENCES auth.users(id),
  UNIQUE(habit_id, date)
);

CREATE TABLE IF NOT EXISTS habit_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  order_index INTEGER DEFAULT 0,
  user_id     UUID REFERENCES auth.users(id)
);

ALTER TABLE habits             DISABLE ROW LEVEL SECURITY;
ALTER TABLE habit_completions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE habit_categories   DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_completions_date  ON habit_completions(date);
CREATE INDEX IF NOT EXISTS idx_completions_habit ON habit_completions(habit_id);

-- ============================================================
-- DONNÉES INITIALES — Habits actifs
-- Idempotent : ON CONFLICT (id) DO NOTHING
-- ============================================================

INSERT INTO habits (id, name, color, archived, order_index, created_at) VALUES
  ('habit-wake-up',       '5h30-6h wake up',          'red',   false,  1, NOW()),
  ('habit-breakfast',     'Breakfast',                  'blue',  false,  2, NOW()),
  ('habit-gym',           'Gym or run',                 'red',   false,  3, NOW()),
  ('habit-walk',          'Walk or bike',               'red',   false,  4, NOW()),
  ('habit-lunch',         'Lunch',                      'blue',  false,  5, NOW()),
  ('habit-shake',         'Protein shake',              'blue',  false,  6, NOW()),
  ('habit-water',         '2.5l of water',              'blue',  false,  7, NOW()),
  ('habit-homework',      'Homework',                   'yellow',false,  8, NOW()),
  ('habit-learning',      'Learning',                   'yellow',false,  9, NOW()),
  ('habit-dinner',        'Diner',                      'blue',  false, 10, NOW()),
  ('habit-todo',          'To-do list for tomorrow',   'slate', false, 11, NOW()),
  ('habit-bodycare',      'Body care',                  'red',   false, 12, NOW()),
  ('habit-stretching',    'Stretching',                 'red',   false, 13, NOW()),
  ('habit-cold-shower',   'Cold shower',                'green', false, 14, NOW()),
  ('habit-duolingo',      'Duolingo',                   'yellow',false, 15, NOW()),
  ('habit-reading',       'Reading',                    'yellow',false, 16, NOW()),
  ('habit-bed',           'Bed before 22h',             'red',   false, 17, NOW()),
  ('habit-no-phone',      'No phone before bed',        'green', false, 18, NOW()),
  ('habit-no-social',     'No Social Media',            'green', false, 19, NOW()),
  ('habit-no-junk',       'No junk food',               'red',   false, 20, NOW()),
  ('habit-no-alcohol',    'No alcohol',                 'red',   false, 21, NOW())
ON CONFLICT (id) DO NOTHING;
