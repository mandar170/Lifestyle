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
