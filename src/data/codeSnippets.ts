export const CODE_SNIPPETS = {
  schemaSql: `-- ==============================================================================
-- Serverless Parlay (Multi-Bet) Tracker - Supabase PostgreSQL Schema
-- Designed for South African Sportsbooks: Betway SA & Supabets SA
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

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
CREATE TABLE IF NOT EXISTS parlay_slips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_chat_id BIGINT NOT NULL,
    bookmaker VARCHAR(50) NOT NULL DEFAULT 'BETWAY_SA',
    slip_reference VARCHAR(100),
    raw_input TEXT NOT NULL,
    total_legs INT NOT NULL DEFAULT 0,
    active_legs_count INT NOT NULL DEFAULT 0,
    status parlay_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_parlay_slips_chat_id ON parlay_slips(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_parlay_slips_status ON parlay_slips(status);

-- 2. Slip Legs Table (Strictly Over/Under Focus)
CREATE TABLE IF NOT EXISTS slip_legs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slip_id UUID NOT NULL REFERENCES parlay_slips(id) ON DELETE CASCADE,
    telegram_chat_id BIGINT NOT NULL,
    bookmaker VARCHAR(50) NOT NULL DEFAULT 'BETWAY_SA',
    fixture_raw VARCHAR(255) NOT NULL,
    home_team VARCHAR(120) NOT NULL,
    away_team VARCHAR(120) NOT NULL,
    kickoff_time TIMESTAMPTZ NOT NULL,
    market_type market_category NOT NULL DEFAULT 'OVER_UNDER_GOALS',
    target_market VARCHAR(120) NOT NULL,
    line_threshold NUMERIC(4, 1) NOT NULL,
    direction VARCHAR(10) NOT NULL DEFAULT 'OVER',
    last_known_score VARCHAR(50) NOT NULL DEFAULT '0-0',
    last_known_total INT NOT NULL DEFAULT 0,
    current_match_minute VARCHAR(20) DEFAULT '0''',
    status leg_status NOT NULL DEFAULT 'PENDING',
    api_fixture_id VARCHAR(100),
    last_polled_at TIMESTAMPTZ,
    last_alarm_dispatched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- CRITICAL 60-SECOND CRON INDEX:
CREATE INDEX IF NOT EXISTS idx_slip_legs_cron_poller 
ON slip_legs(status, kickoff_time) 
WHERE status IN ('PENDING', 'LIVE');

-- 3. Alarm Logs Table
CREATE TABLE IF NOT EXISTS alarm_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leg_id UUID NOT NULL REFERENCES slip_legs(id) ON DELETE CASCADE,
    slip_id UUID NOT NULL REFERENCES parlay_slips(id) ON DELETE CASCADE,
    telegram_chat_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    previous_score VARCHAR(50) NOT NULL,
    new_score VARCHAR(50) NOT NULL,
    current_minute VARCHAR(20),
    dispatched_message TEXT NOT NULL,
    telegram_message_id BIGINT,
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);`,

  ingestionHandlerPy: `"""
Component A: Ingestion Function (Telegram Webhook Listener)
Stateless Serverless Handler (AWS Lambda / Supabase Edge Functions).
Receives betslip text or share links, parses Over/Under totals, flags 1X2 bets,
and persists slips and legs into the Supabase PostgreSQL database.
"""

import os
import json
import logging
import urllib.request
from config import load_config
from parser import BetslipParser, ParseResult

logger = logging.getLogger(__name__)

def lambda_handler(event, context=None):
    config = load_config()
    
    # 1. Parse incoming Telegram Webhook body
    body_raw = event.get("body", "{}")
    payload = json.loads(body_raw) if isinstance(body_raw, str) else body_raw
    message = payload.get("message") or payload.get("edited_message")
    
    if not message:
        return {"statusCode": 200, "body": json.dumps({"status": "ignored"})}
        
    chat_id = message.get("chat", {}).get("id")
    text = (message.get("text") or "").strip()
    
    # 2. Parse text with South African Regex Parser
    parse_result = BetslipParser.parse(text)
    
    if not parse_result.has_tracked_legs:
        return {"statusCode": 200, "body": json.dumps({"status": "no_totals_found"})}
        
    # 3. Insert parlay_slips & slip_legs into Supabase
    # ... writes rows with initial status 'PENDING' and '0-0' or '0 corners'
    
    # 4. Reply to Telegram chat with confirmation summary
    return {"statusCode": 200, "body": json.dumps({"status": "success"})}`,

  pollingAlarmPy: `"""
Component B: Polling & Alarm Function (Scheduled 60-second Cron)
Executes every 60 seconds via pg_cron or EventBridge.
Fetches PENDING legs where kickoff_time <= NOW(), queries live sports API,
detects score/corner changes, updates DB, and dispatches Telegram alarms.
"""

from datetime import datetime, timezone
from config import load_config
from sports_api import SportsApiClient

def cron_handler(event=None, context=None):
    config = load_config()
    
    # 1. Fetch only PENDING legs where kickoff_time <= NOW()
    # High performance index: idx_slip_legs_cron_poller
    
    # 2. Query Live Sports Data Provider (API-Football)
    
    # 3. State & Trigger Validation: compare current score with last_known_score
    # 4. On change: update DB record immediately
    # 5. Dispatch Telegram Markdown Alarm with Betway/Supabets Cash Out advice
    return {"statusCode": 200, "status": "cycle_completed"}`,

  parserPy: `"""
Regex & Text Parser for Betway SA & Supabets SA betslips.
Specifically extracts:
- Fixture ("Team A vs Team B")
- Kick-off Time ("Today 19:30", "28/10 20:00 SAST")
- Over/Under Total Goals (e.g., Over 2.5 Goals)
- Over/Under Total Corners (e.g., Over 9.5 Corners)
- Flags and ignores straight win 1X2 bets
"""`,

  sportsApiPy: `"""
Modular Sports Data Client (API-Football / TheOddsAPI).
Fuzzy matches team names (e.g. Mamelodi Sundowns FC <-> Mamelodi Sundowns),
extracts live minute, score line, and corner statistics.
"""`,

  strategyLedgerPy: `"""
Strategy & Ledger Engine for Strict Low-Risk Sports Betting.
Implements:
1. Target Leagues & Criteria:
   - EPL: Over 1.5 Goals or Over 7.5 Corners
   - PSL: Under 2.5 or Under 3.5 Goals
   - NBA: Alternative Team Totals (bought down 6-8 pts) or 1st Half Spreads
   - Tennis: Top seed to Win a Set (+1.5 Set Handicap)
2. Slip Guardrails:
   - Single Straight Bets: Fixed R2 unit stake, Target Odds 1.40 - 1.50
   - Conservative Parlays: Max 2-3 legs, Platform minimum stake
3. Running Bankroll & Real-Time ROI Ledger
"""

from strategy_ledger import (
    LowRiskStrategyFilter,
    SlipValidator,
    BankrollLedger,
    SlipType,
    CandidateLeg,
    Sport,
)`,

  configPy: `import os
from dataclasses import dataclass

@dataclass(frozen=True)
class AppConfig:
    # Supabase Credentials (db.rmawoakhlrxeqhdqcpur.supabase.co)
    supabase_url: str = "https://rmawoakhlrxeqhdqcpur.supabase.co"
    database_url: str = "postgresql://postgres:[YOUR-PASSWORD]@db.rmawoakhlrxeqhdqcpur.supabase.co:5432/postgres"
    supabase_publishable_key: str = "sb_publishable_U5wfxTkNIS8H3JbdspnG1g_5CPw0S5n"
    supabase_secret_key: str = "sb_secret_WGQy61zA6eoMXuNV8nGd0g_yC67bthS"
    supabase_jwks_url: str = "https://rmawoakhlrxeqhdqcpur.supabase.co/auth/v1/.well-known/jwks.json"
    
    db_host: str = "db.rmawoakhlrxeqhdqcpur.supabase.co"
    db_port: int = 5432
    db_name: str = "postgres"
    db_user: str = "postgres"
    
    telegram_bot_token: str = ""
    sports_api_key: str = ""`,

  envExample: `# Supabase PostgreSQL Connection String (Direct pg connection)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.rmawoakhlrxeqhdqcpur.supabase.co:5432/postgres"

# Supabase REST, Auth & JWKS Endpoints
SUPABASE_URL="https://rmawoakhlrxeqhdqcpur.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_U5wfxTkNIS8H3JbdspnG1g_5CPw0S5n"
SUPABASE_SECRET_KEY="sb_secret_WGQy61zA6eoMXuNV8nGd0g_yC67bthS"
SUPABASE_JWKS_URL="https://rmawoakhlrxeqhdqcpur.supabase.co/auth/v1/.well-known/jwks.json"

# Database Connection Parameters
DB_HOST="db.rmawoakhlrxeqhdqcpur.supabase.co"
DB_PORT=5432
DB_NAME="postgres"
DB_USER="postgres"

# Telegram Bot API
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"

# Sports Data API
SPORTS_API_KEY="your-sports-api-key"`,

  serverlessYml: `service: serverless-parlay-tracker
frameworkVersion: '3'

provider:
  name: aws
  runtime: python3.11
  region: af-south-1 # Cape Town region for South Africa
  timeout: 15
  memorySize: 256
  environment:
    DATABASE_URL: \${env:DATABASE_URL}
    SUPABASE_URL: \${env:SUPABASE_URL}
    SUPABASE_PUBLISHABLE_KEY: \${env:SUPABASE_PUBLISHABLE_KEY}
    SUPABASE_SECRET_KEY: \${env:SUPABASE_SECRET_KEY}
    SUPABASE_JWKS_URL: \${env:SUPABASE_JWKS_URL}
    TELEGRAM_BOT_TOKEN: \${env:TELEGRAM_BOT_TOKEN}
    SPORTS_API_KEY: \${env:SPORTS_API_KEY}

functions:
  ingestionWebhook:
    handler: ingestion_handler.lambda_handler
    events:
      - httpApi:
          path: /webhook/telegram
          method: post

  pollingAlarmCron:
    handler: polling_alarm_handler.cron_handler
    events:
      - schedule:
          rate: rate(1 minute)
          enabled: true`,

  supabaseEdgeFunction: `// Supabase Edge Function: telegram-webhook
// Deploy with: supabase functions deploy telegram-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const payload = await req.json();
  const message = payload.message;
  if (!message || !message.text) return new Response(JSON.stringify({ status: "ignored" }));

  const chatId = message.chat.id;
  const text = message.text;

  // Sends Telegram response & persists Over/Under totals to Supabase
  await fetch(\`https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "✅ Parlay Registered! Live Cash Out alarms active.",
      parse_mode: "Markdown"
    })
  });

  return new Response(JSON.stringify({ status: "success" }));
});`,
};
