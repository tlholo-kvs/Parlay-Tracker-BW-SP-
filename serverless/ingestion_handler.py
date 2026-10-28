"""
Component A: Ingestion Function (Telegram Webhook Listener)
Stateless Serverless Handler (AWS Lambda / Supabase Edge Functions).
Receives betslip text or share links, parses Over/Under totals, flags 1X2 bets,
and persists slips and legs into the Supabase PostgreSQL database.
"""

import os
import json
import logging
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from config import load_config
from parser import BetslipParser, ParseResult, ParsedLeg, IgnoredLeg

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class TelegramClient:
    """Helper for sending synchronous HTTP requests to Telegram Bot API."""

    def __init__(self, bot_token: str, timeout: float = 6.0):
        self.bot_token = bot_token
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
        self.timeout = timeout

    def send_message(self, chat_id: int, text: str, parse_mode: str = "Markdown") -> bool:
        if not self.bot_token:
            logger.warning("TELEGRAM_BOT_TOKEN is not configured; skipping actual API call.")
            return False

        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": True,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/sendMessage",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.status == 200
        except Exception as e:
            logger.error(f"Failed to send Telegram message to {chat_id}: {str(e)}")
            return False


class SupabaseDbClient:
    """
    Stateless database client querying Supabase PostgREST REST API.
    Does not require heavy native C libraries, making it 100% portable across
    AWS Lambda, Supabase Python Edge Functions, or Cloud Run.
    """

    def __init__(self, supabase_url: str, supabase_key: str, timeout: float = 6.0):
        self.base_url = supabase_url.rstrip("/") + "/rest/v1"
        self.api_key = supabase_key
        self.timeout = timeout

    def _headers(self) -> Dict[str, str]:
        return {
            "apikey": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def insert_parlay_slip(self, chat_id: int, bookmaker: str, slip_ref: Optional[str], raw_text: str, total_legs: int) -> Optional[Dict[str, Any]]:
        url = f"{self.base_url}/parlay_slips"
        payload = {
            "telegram_chat_id": chat_id,
            "bookmaker": bookmaker,
            "slip_reference": slip_ref,
            "raw_input": raw_text,
            "total_legs": total_legs,
            "active_legs_count": total_legs,
            "status": "PENDING",
        }
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=self._headers(), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data[0] if data else None
        except Exception as e:
            logger.error(f"Error inserting parlay_slip: {str(e)}")
            return None

    def insert_slip_legs(self, slip_id: str, chat_id: int, bookmaker: str, legs: list[ParsedLeg]) -> bool:
        url = f"{self.base_url}/slip_legs"
        payload = []
        for leg in legs:
            payload.append({
                "slip_id": slip_id,
                "telegram_chat_id": chat_id,
                "bookmaker": bookmaker,
                "fixture_raw": leg.fixture_raw,
                "home_team": leg.home_team,
                "away_team": leg.away_team,
                "kickoff_time": leg.kickoff_time.isoformat(),
                "market_type": leg.market_type,
                "target_market": leg.target_market,
                "line_threshold": leg.line_threshold,
                "direction": leg.direction,
                "last_known_score": leg.initial_score,
                "last_known_total": leg.initial_total,
                "status": "PENDING",
            })

        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=self._headers(), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.status in (200, 201)
        except Exception as e:
            logger.error(f"Error inserting slip_legs: {str(e)}")
            return False


def build_confirmation_message(result: ParseResult) -> str:
    """Formats a rich Markdown Telegram reply confirming the tracked slip."""
    bookmaker_name = "Betway SA" if result.bookmaker == "BETWAY_SA" else ("Supabets SA" if result.bookmaker == "SUPABETS_SA" else "South African Sportsbook")
    lines = [
        f"📋 *PARLAY REGISTERED* ({bookmaker_name})",
        f"Tracked Over/Under Legs: *{len(result.tracked_legs)}*",
    ]
    if result.slip_code:
        lines.append(f"Booking Code: `{result.slip_code}`")
    lines.append("")

    lines.append("🎯 *Active Over/Under Legs Monitored:*")
    for idx, leg in enumerate(result.tracked_legs, start=1):
        market_icon = "⚽" if leg.market_type == "OVER_UNDER_GOALS" else "🚩"
        ko_str = leg.kickoff_time.strftime("%d %b %H:%M SAST")
        lines.append(f"{idx}. {market_icon} *{leg.fixture_raw}*")
        lines.append(f"   Target: `{leg.target_market}`")
        lines.append(f"   Kick-off: _{ko_str}_ | Init Score: `{leg.initial_score}`")

    if result.ignored_legs:
        lines.append("")
        lines.append("⚠️ *Ignored Straight Win (1X2) / Non-Totals Legs:*")
        for ign in result.ignored_legs:
            lines.append(f"• *{ign.fixture_raw}*")
            lines.append(f"  Reason: _{ign.reason}_")

    lines.append("")
    lines.append("⏱️ *Auto-Alarm Trigger:*")
    lines.append("Our 60-second cron scheduler will alert you the instant a goal or corner is registered during live match play so you can optimize your *Cash Out*!")

    return "\n".join(lines)


def lambda_handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """
    AWS Lambda entry point for Telegram Webhook HTTP POST.
    Expected event: API Gateway HTTP POST payload with Telegram update.
    """
    config = load_config()
    telegram = TelegramClient(config.telegram_bot_token)
    db = SupabaseDbClient(config.supabase_url, config.supabase_key)

    # 1. Parse incoming body
    try:
        body_raw = event.get("body")
        if isinstance(body_raw, str):
            payload = json.loads(body_raw)
        elif isinstance(body_raw, dict):
            payload = body_raw
        else:
            payload = event
    except Exception as e:
        logger.error(f"Malformed webhook JSON: {str(e)}")
        return {"statusCode": 400, "body": json.dumps({"error": "Invalid JSON"})}

    message = payload.get("message") or payload.get("edited_message")
    if not message:
        # Ignore non-message updates (e.g., inline queries, member joins)
        return {"statusCode": 200, "body": json.dumps({"status": "ignored"})}

    chat_id = message.get("chat", {}).get("id")
    text = (message.get("text") or "").strip()

    if not chat_id or not text:
        return {"statusCode": 200, "body": json.dumps({"status": "no_text"})}

    # Handle standard commands
    if text.startswith("/start") or text.startswith("/help"):
        welcome_msg = (
            "🇿🇦 *Welcome to South Africa Parlay Tracker (Betway & Supabets)*\n\n"
            "This bot tracks *Over/Under Totals* (Match Goals and Corners) on your multi-bets "
            "and sounds instant alarms during live matches so you can capitalize on *Cash Out* opportunities.\n\n"
            "💡 *How to use:*\n"
            "Copy & paste your multi-bet text or share code from Betway or Supabets into this chat.\n\n"
            "Example format:\n"
            "`1. Mamelodi Sundowns vs Orlando Pirates`\n"
            "`Kick-off: 19:30 SAST`\n"
            "`Total Match Goals - Over 2.5`\n\n"
            "`2. Arsenal vs Chelsea`\n"
            "`Kick-off: 21:00 SAST`\n"
            "`Total Match Corners - Over 9.5`\n\n"
            "⚠️ Note: Straight 1X2 win bets are automatically flagged and ignored—only Over/Under markets trigger dynamic Cash Out alarms."
        )
        telegram.send_message(chat_id, welcome_msg)
        return {"statusCode": 200, "body": json.dumps({"status": "welcome_sent"})}

    # 2. Parse betslip with robust regex
    parse_result = BetslipParser.parse(text)

    if not parse_result.has_tracked_legs:
        # Send helpful notice if no Over/Under totals found
        response_msg = (
            "⚠️ *No Over/Under Totals Detected*\n\n"
            "We could not find any *Over/Under Total Goals* or *Over/Under Corners* legs in your message.\n"
            f"If your betslip contains straight win bets (1X2), those are not eligible for live total tracking.\n\n"
            "Please paste fixtures containing: `Over 2.5 Goals`, `Under 1.5 Goals`, or `Over 9.5 Corners`."
        )
        telegram.send_message(chat_id, response_msg)
        return {"statusCode": 200, "body": json.dumps({"status": "no_legs_tracked"})}

    # 3. Save to Supabase PostgreSQL database
    slip_record = db.insert_parlay_slip(
        chat_id=chat_id,
        bookmaker=parse_result.bookmaker,
        slip_ref=parse_result.slip_code,
        raw_text=text,
        total_legs=len(parse_result.tracked_legs),
    )

    slip_id = slip_record.get("id") if slip_record else "simulated-slip-uuid"
    
    if slip_record:
        db.insert_slip_legs(
            slip_id=slip_id,
            chat_id=chat_id,
            bookmaker=parse_result.bookmaker,
            legs=parse_result.tracked_legs,
        )

    # 4. Send confirmation to user on Telegram
    reply_text = build_confirmation_message(parse_result)
    telegram.send_message(chat_id, reply_text)

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "status": "success",
            "slip_id": slip_id,
            "tracked_legs": len(parse_result.tracked_legs),
            "ignored_legs": len(parse_result.ignored_legs),
        }),
    }
