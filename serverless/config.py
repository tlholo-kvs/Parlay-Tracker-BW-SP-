"""
Configuration module for Serverless Parlay Tracker.
Loads and validates environment variables for Supabase, Telegram, and Sports API.
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class AppConfig:
    # Supabase Credentials (PostgreSQL persistence & REST API)
    supabase_url: str
    supabase_key: str
    
    # Direct PostgreSQL Connection String (psycopg2 / SQLAlchemy / asyncpg)
    database_url: str
    
    # Telegram Bot API Token
    telegram_bot_token: str
    
    # Sports Live Data Provider (e.g., API-Football / RapidAPI / TheOddsAPI)
    sports_api_key: str
    
    # Extended Supabase Credentials
    supabase_publishable_key: str = "sb_publishable_U5wfxTkNIS8H3JbdspnG1g_5CPw0S5n"
    supabase_secret_key: str = "sb_secret_WGQy61zA6eoMXuNV8nGd0g_yC67bthS"
    supabase_jwks_url: str = "https://rmawoakhlrxeqhdqcpur.supabase.co/auth/v1/.well-known/jwks.json"

    # Connection Parameters
    db_host: str = "db.rmawoakhlrxeqhdqcpur.supabase.co"
    db_port: int = 5432
    db_name: str = "postgres"
    db_user: str = "postgres"
    
    sports_api_host: str = "v3.football.api-sports.io"
    sports_api_base_url: str = "https://v3.football.api-sports.io"
    
    # Execution timeouts & thresholds
    http_timeout_seconds: float = 8.0
    db_pool_min_size: int = 1
    db_pool_max_size: int = 5
    
    # Default Timezone for South Africa (UTC+2)
    sast_utc_offset_hours: int = 2


def load_config() -> AppConfig:
    """
    Loads config from environment variables.
    In serverless environments, secrets are passed via Lambda Environment Variables
    or Supabase Secret Manager.
    """
    supabase_url = os.getenv("SUPABASE_URL", "https://rmawoakhlrxeqhdqcpur.supabase.co")
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:[YOUR-PASSWORD]@db.rmawoakhlrxeqhdqcpur.supabase.co:5432/postgres",
    )
    supabase_secret_key = (
        os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or "sb_secret_WGQy61zA6eoMXuNV8nGd0g_yC67bthS"
    )
    supabase_publishable_key = (
        os.getenv("SUPABASE_PUBLISHABLE_KEY")
        or "sb_publishable_U5wfxTkNIS8H3JbdspnG1g_5CPw0S5n"
    )
    supabase_jwks_url = (
        os.getenv("SUPABASE_JWKS_URL")
        or "https://rmawoakhlrxeqhdqcpur.supabase.co/auth/v1/.well-known/jwks.json"
    )
    telegram_bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    sports_api_key = os.getenv("SPORTS_API_KEY", "")
    
    return AppConfig(
        supabase_url=supabase_url,
        supabase_key=supabase_secret_key,
        database_url=database_url,
        telegram_bot_token=telegram_bot_token,
        sports_api_key=sports_api_key,
        supabase_publishable_key=supabase_publishable_key,
        supabase_secret_key=supabase_secret_key,
        supabase_jwks_url=supabase_jwks_url,
        db_host=os.getenv("DB_HOST", "db.rmawoakhlrxeqhdqcpur.supabase.co"),
        db_port=int(os.getenv("DB_PORT", "5432")),
        db_name=os.getenv("DB_NAME", "postgres"),
        db_user=os.getenv("DB_USER", "postgres"),
        sports_api_host=os.getenv("SPORTS_API_HOST", "v3.football.api-sports.io"),
        sports_api_base_url=os.getenv("SPORTS_API_BASE_URL", "https://v3.football.api-sports.io"),
        http_timeout_seconds=float(os.getenv("HTTP_TIMEOUT_SECONDS", "8.0")),
    )
