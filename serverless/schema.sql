-- ==============================================================================
-- Serverless Parlay (Multi-Bet) Tracker - Supabase PostgreSQL Schema
-- Designed for South African Sportsbooks: Betway SA & Supabets SA
-- ==============================================================================

-- Enable UUID generation extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Enum Types
DO $$ BEGIN
    CREATE TYPE parlay_status AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CASHED_OUT', 'VOID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE leg_status AS ENUM ('PENDING', 'LIVE', 'TRIGGERED', 'CASH_OUT_RECOMMENDED', 'WON', 'LOST', 'VOID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE market_category AS ENUM ('OVER_UNDER_GOALS', 'OVER_UNDER_CORNERS', 'UNSUPPORTED_1X2');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Parlay Slips Table
-- Represents a multi-bet betslip submitted by a user via Telegram
CREATE TABLE IF NOT EXISTS parlay_slips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_chat_id BIGINT NOT NULL,
    bookmaker VARCHAR(50) NOT NULL DEFAULT 'BETWAY_SA', -- 'BETWAY_SA' or 'SUPABETS_SA'
    slip_reference VARCHAR(100),
    raw_input TEXT NOT NULL,
    total_legs INT NOT NULL DEFAULT 0,
    active_legs_count INT NOT NULL DEFAULT 0,
    status parlay_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- Index for user slip retrieval
CREATE INDEX IF NOT EXISTS idx_parlay_slips_chat_id ON parlay_slips(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_parlay_slips_status ON parlay_slips(status);

-- 2. Slip Legs Table
-- Individual bets within the multi-bet slip (strictly Over/Under focus)
CREATE TABLE IF NOT EXISTS slip_legs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slip_id UUID NOT NULL REFERENCES parlay_slips(id) ON DELETE CASCADE,
    telegram_chat_id BIGINT NOT NULL, -- Denormalized for high-speed indexing in cron
    bookmaker VARCHAR(50) NOT NULL DEFAULT 'BETWAY_SA',
    fixture_raw VARCHAR(255) NOT NULL,
    home_team VARCHAR(120) NOT NULL,
    away_team VARCHAR(120) NOT NULL,
    kickoff_time TIMESTAMPTZ NOT NULL,
    market_type market_category NOT NULL DEFAULT 'OVER_UNDER_GOALS',
    target_market VARCHAR(120) NOT NULL, -- e.g., 'Total Match Goals - Over 2.5'
    line_threshold NUMERIC(4, 1) NOT NULL, -- e.g., 2.5, 9.5
    direction VARCHAR(10) NOT NULL DEFAULT 'OVER', -- 'OVER' or 'UNDER'
    last_known_score VARCHAR(50) NOT NULL DEFAULT '0-0', -- e.g. '0-0' or '0 corners'
    last_known_total INT NOT NULL DEFAULT 0,
    current_match_minute VARCHAR(20) DEFAULT '0''',
    status leg_status NOT NULL DEFAULT 'PENDING',
    api_fixture_id VARCHAR(100),
    last_polled_at TIMESTAMPTZ,
    last_alarm_dispatched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- CRITICAL HIGH-PERFORMANCE CRON INDEX:
-- Queries fetch only PENDING legs where the current system time is past the scheduled kick-off time
CREATE INDEX IF NOT EXISTS idx_slip_legs_cron_poller 
ON slip_legs(status, kickoff_time) 
WHERE status IN ('PENDING', 'LIVE');

CREATE INDEX IF NOT EXISTS idx_slip_legs_slip_id ON slip_legs(slip_id);

-- 3. Alarm Logs Table
-- Audit trail of every notification dispatched to Telegram
CREATE TABLE IF NOT EXISTS alarm_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leg_id UUID NOT NULL REFERENCES slip_legs(id) ON DELETE CASCADE,
    slip_id UUID NOT NULL REFERENCES parlay_slips(id) ON DELETE CASCADE,
    telegram_chat_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'GOAL_ALERT', 'CORNER_ALERT', 'THRESHOLD_REACHED'
    previous_score VARCHAR(50) NOT NULL,
    new_score VARCHAR(50) NOT NULL,
    current_minute VARCHAR(20),
    dispatched_message TEXT NOT NULL,
    telegram_message_id BIGINT,
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_alarm_logs_leg ON alarm_logs(leg_id);
CREATE INDEX IF NOT EXISTS idx_alarm_logs_chat ON alarm_logs(telegram_chat_id);

-- Trigger to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parlay_slips_updated_at ON parlay_slips;
CREATE TRIGGER trg_parlay_slips_updated_at
BEFORE UPDATE ON parlay_slips
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_slip_legs_updated_at ON slip_legs;
CREATE TRIGGER trg_slip_legs_updated_at
BEFORE UPDATE ON slip_legs
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- Row Level Security (RLS) Setup
ALTER TABLE parlay_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE slip_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarm_logs ENABLE ROW LEVEL SECURITY;

-- Service role full access policy (for backend Lambda / Supabase Edge Functions)
CREATE POLICY "Service Role Full Access on parlay_slips" 
ON parlay_slips FOR ALL 
USING (auth.role() = 'service_role' OR current_user = 'postgres');

CREATE POLICY "Service Role Full Access on slip_legs" 
ON slip_legs FOR ALL 
USING (auth.role() = 'service_role' OR current_user = 'postgres');

CREATE POLICY "Service Role Full Access on alarm_logs" 
ON alarm_logs FOR ALL 
USING (auth.role() = 'service_role' OR current_user = 'postgres');

-- 4. Low-Risk Strategy Ledger Bets Table
-- Logs every Single Straight (strictly R2 unit stake) and Conservative Parlay (2-3 legs)
CREATE TABLE IF NOT EXISTS ledger_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slip_type VARCHAR(30) NOT NULL, -- 'SINGLE_STRAIGHT', 'CONSERVATIVE_PARLAY'
    sport VARCHAR(60) NOT NULL,
    league VARCHAR(100) NOT NULL,
    fixtures_summary TEXT NOT NULL,
    legs_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    combined_odds NUMERIC(6, 2) NOT NULL,
    stake_zar NUMERIC(8, 2) NOT NULL DEFAULT 2.00,
    potential_return_zar NUMERIC(8, 2) NOT NULL,
    actual_return_zar NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'WON', 'LOST', 'CASHED_OUT', 'VOID'
    is_rule_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    compliance_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ledger_bets_status ON ledger_bets(status);
CREATE INDEX IF NOT EXISTS idx_ledger_bets_sport ON ledger_bets(sport);

-- 5. Daily Ledger Summaries Table
-- Snapshot performance at the conclusion of each daily fixture cycle
CREATE TABLE IF NOT EXISTS daily_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_date DATE NOT NULL UNIQUE,
    initial_bankroll_zar NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
    closing_balance_zar NUMERIC(10, 2) NOT NULL,
    total_staked_zar NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_returns_zar NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    net_profit_loss_zar NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    roi_percentage NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    settled_count INT NOT NULL DEFAULT 0,
    won_count INT NOT NULL DEFAULT 0,
    lost_count INT NOT NULL DEFAULT 0,
    discipline_score VARCHAR(100) DEFAULT '100% (Strict R2 Unit Stake Maintained, Max 3 Legs Enforced)',
    breakdown_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE ledger_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access on ledger_bets" 
ON ledger_bets FOR ALL USING (auth.role() = 'service_role' OR current_user = 'postgres');

CREATE POLICY "Service Role Full Access on daily_summaries" 
ON daily_summaries FOR ALL USING (auth.role() = 'service_role' OR current_user = 'postgres');

-- ==============================================================================
-- Optional: Supabase pg_cron trigger definition (runs every 60 seconds)
-- ==============================================================================
/*
SELECT cron.schedule(
    'parlay-tracker-60s-poller',
    '* * * * *', -- Every 1 minute
    $$
    SELECT
      net.http_post(
          url := 'https://<your-project-ref>.supabase.co/functions/v1/polling_alarm_cron',
          headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
          body := '{"trigger": "pg_cron"}'::jsonb
      ) as request_id;
    $$
);
*/
