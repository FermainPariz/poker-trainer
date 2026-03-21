-- ========================================
-- Poker Pro Trainer — Supabase Database Setup
-- ========================================
-- Run this in your Supabase SQL Editor (supabase.com → project → SQL Editor)
-- after creating a new project.

-- === Profiles (auto-linked to auth.users) ===
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- === User Stats (lifetime aggregates) ===
CREATE TABLE user_stats (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_hands INT DEFAULT 0,
  total_sessions INT DEFAULT 0,
  total_pnl INT DEFAULT 0,
  bankroll INT DEFAULT 10000,
  total_deposited INT DEFAULT 10000,
  vpip REAL DEFAULT 0,
  pfr REAL DEFAULT 0,
  accuracy REAL DEFAULT 0,
  total_ev_loss REAL DEFAULT 0,
  best_session_pnl INT DEFAULT 0,
  worst_session_pnl INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- === Sessions ===
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  hands_played INT DEFAULT 0,
  pnl INT DEFAULT 0,
  pnl_bb REAL DEFAULT 0,
  buy_in INT,
  cash_out INT,
  big_blind INT,
  accuracy REAL,
  ev_loss REAL DEFAULT 0,
  peak_stack INT,
  low_stack INT
);

-- === Hand Results ===
CREATE TABLE hand_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  hand_number INT,
  position TEXT,
  hole_cards TEXT,
  result TEXT,
  pnl INT,
  pot_size INT,
  phase_reached TEXT,
  vpip BOOLEAN DEFAULT FALSE,
  pfr BOOLEAN DEFAULT FALSE,
  went_to_showdown BOOLEAN DEFAULT FALSE,
  won_at_showdown BOOLEAN DEFAULT FALSE,
  score_avg REAL,
  ev_loss REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- === Enable Row Level Security ===
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hand_results ENABLE ROW LEVEL SECURITY;

-- === RLS Policies ===

-- Profiles: public read (for leaderboard), own write
CREATE POLICY "Public profiles readable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Own profile insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Own profile update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- User stats: public read (leaderboard), own write
CREATE POLICY "Public stats readable" ON user_stats FOR SELECT USING (true);
CREATE POLICY "Own stats insert" ON user_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own stats update" ON user_stats FOR UPDATE USING (auth.uid() = user_id);

-- Sessions: own only
CREATE POLICY "Own sessions select" ON sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own sessions insert" ON sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own sessions update" ON sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Own sessions delete" ON sessions FOR DELETE USING (auth.uid() = user_id);

-- Hand results: own only
CREATE POLICY "Own hands select" ON hand_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own hands insert" ON hand_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own hands delete" ON hand_results FOR DELETE USING (auth.uid() = user_id);

-- === Auto-create profile + stats on signup ===
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', 'Player_' || LEFT(NEW.id::text, 8)));
  INSERT INTO user_stats (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- === Indexes for performance ===
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_started ON sessions(started_at DESC);
CREATE INDEX idx_hand_results_user ON hand_results(user_id);
CREATE INDEX idx_hand_results_session ON hand_results(session_id);
CREATE INDEX idx_hand_results_created ON hand_results(created_at DESC);
