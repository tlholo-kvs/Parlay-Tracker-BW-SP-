"""
Component B: Polling & Alarm Function (Scheduled 60-second Cron)
Stateless Serverless Function (EventBridge / AWS Lambda / pg_cron / Cloud Scheduler).
1. Queries Supabase for PENDING slip legs whose kickoff_time <= NOW().
2. Fetches live sports telemetry via SportsApiClient (goals & corners).
3. Compares current score against last_known_score.
4. On change, updates database and dispatches rich Telegram Markdown alarms
   reminding the user to evaluate their live Cash Out value on Betway or Supabets.
"""

import os
import json
import logging
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from config import load_config
from sports_api import SportsApiClient, MatchSnapshot

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class TelegramNotifier:
    """Dispatches beautiful Markdown alerts to user's Telegram chat."""

    def __init__(self, bot_token: str, timeout: float = 6.0):
        self.bot_token = bot_token
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
        self.timeout = timeout

    def send_alert(self, chat_id: int, markdown_text: str) -> Optional[int]:
        """Sends message and returns telegram_message_id if available."""
        if not self.bot_token:
            logger.warning("TELEGRAM_BOT_TOKEN missing; alert logged locally.")
            return None

        url = f"{self.base_url}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": markdown_text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                if res_data.get("ok"):
                    return res_data.get("result", {}).get("message_id")
        except urllib.error.HTTPError as he:
            # If rejected due to Markdown entity parsing or formatting, retry as plain text
            logger.warning(f"Telegram Markdown send failed (HTTP {he.code}): {he.read().decode('utf-8', errors='ignore')}. Retrying without parse_mode...")
            try:
                fallback_payload = {
                    "chat_id": chat_id,
                    "text": markdown_text,
                    "disable_web_page_preview": True,
                }
                fallback_req = urllib.request.Request(
                    url,
                    data=json.dumps(fallback_payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(fallback_req, timeout=self.timeout) as fallback_resp:
                    res_data = json.loads(fallback_resp.read().decode("utf-8"))
                    if res_data.get("ok"):
                        return res_data.get("result", {}).get("message_id")
            except Exception as fe:
                logger.error(f"Fallback plain-text send also failed: {str(fe)}")
        except Exception as e:
            logger.error(f"Failed to dispatch Telegram alarm to chat {chat_id}: {str(e)}")

        return None


class SupabaseCronDb:
    """Handles database queries and atomic updates for the cron poller."""

    def __init__(self, supabase_url: str, supabase_key: str, timeout: float = 8.0):
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

    def fetch_live_pending_legs(self) -> List[Dict[str, Any]]:
        """
        Fetches only the rows from slip_legs where status in ('PENDING', 'LIVE')
        and current system time is past the scheduled kick-off time.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        # PostgREST query: status=in.(PENDING,LIVE)&kickoff_time=lte.{now_iso}&order=kickoff_time.asc
        url = (
            f"{self.base_url}/slip_legs?"
            f"status=in.(PENDING,LIVE)&kickoff_time=lte.{urllib.parse.quote(now_iso)}"
            f"&select=*&order=kickoff_time.asc"
        )
        req = urllib.request.Request(url, headers=self._headers(), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            logger.error(f"Failed to fetch live pending legs: {str(e)}")
            return []

    def update_leg_score(
        self,
        leg_id: str,
        new_score: str,
        new_total: int,
        minute: str,
        new_status: str,
        fixture_id: Optional[str] = None
    ) -> bool:
        """Updates the database record immediately upon score change."""
        now_iso = datetime.now(timezone.utc).isoformat()
        url = f"{self.base_url}/slip_legs?id=eq.{leg_id}"
        payload = {
            "last_known_score": new_score,
            "last_known_total": new_total,
            "current_match_minute": minute,
            "status": new_status,
            "last_polled_at": now_iso,
            "last_alarm_dispatched_at": now_iso,
        }
        if fixture_id:
            payload["api_fixture_id"] = fixture_id

        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=self._headers(), method="PATCH")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.status in (200, 204)
        except Exception as e:
            logger.error(f"Error updating leg {leg_id}: {str(e)}")
            return False

    def log_alarm_event(
        self,
        leg_id: str,
        slip_id: str,
        chat_id: int,
        event_type: str,
        prev_score: str,
        new_score: str,
        minute: str,
        message: str,
        msg_id: Optional[int]
    ) -> bool:
        url = f"{self.base_url}/alarm_logs"
        payload = {
            "leg_id": leg_id,
            "slip_id": slip_id,
            "telegram_chat_id": chat_id,
            "event_type": event_type,
            "previous_score": prev_score,
            "new_score": new_score,
            "current_minute": minute,
            "dispatched_message": message,
            "telegram_message_id": msg_id,
        }
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=self._headers(), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.status in (200, 201)
        except Exception as e:
            logger.error(f"Error logging alarm: {str(e)}")
            return False


def format_alarm_message(
    leg: Dict[str, Any],
    event_type: str,
    previous_score: str,
    new_score: str,
    minute: int,
    total_count: int,
    target_threshold: float,
    direction: str,
    bookmaker: str,
) -> str:
    """
    Format the alert beautifully using Markdown.
    Uses clear visual anchors, states the fixture, updated scoreline,
    the exact Over/Under leg tracked, and prompt to evaluate Cash Out on Betway or Supabets.
    """
    bookmaker_name = "Betway" if "betway" in bookmaker.lower() else ("Supabets" if "supabets" in bookmaker.lower() else "Betway / Supabets")
    market_name = leg.get("target_market", "Over/Under Totals")
    fixture = leg.get("fixture_raw", f"{leg.get('home_team')} vs {leg.get('away_team')}")

    # Determine status towards winning the leg
    diff = target_threshold - total_count
    if direction == "OVER":
        if total_count > target_threshold:
            status_badge = "✅ *LEG WON! TARGET SURPASSED*"
            cash_out_advice = f"🔥 Your Over {target_threshold} leg has hit! Open {bookmaker_name} immediately to check if your parlay cash out offer is at maximum value or let the remaining legs ride."
        elif diff <= 1.0:
            status_badge = "⚡ *CRUCIAL CASH-OUT WINDOW (1 Event Away)*"
            cash_out_advice = f"💰 You are only *{diff:.1f}* away from hitting your Over target! Your live Cash Out offer on {bookmaker_name} is surging. Check your slip now before the momentum shifts!"
        else:
            status_badge = "📈 *PROGRESS UPDATE*"
            cash_out_advice = f"📱 Evaluate your updated live slip odds and Cash Out value in the {bookmaker_name} app."
    else:  # UNDER
        if total_count > target_threshold:
            status_badge = "❌ *LEG BUSTED (EXCEEDED UNDER THRESHOLD)*"
            cash_out_advice = f"⚠️ Target exceeded. Check if partial Cash Out is still available on {bookmaker_name}."
        elif (target_threshold - total_count) <= 1.0:
            status_badge = "⚠️ *HIGH VOLATILITY RISK*"
            cash_out_advice = f"🚨 Score is nearing your Under limit. Strongly consider taking your profits with Cash Out on {bookmaker_name} now!"
        else:
            status_badge = "🛡️ *HOLDING STRONG*"
            cash_out_advice = f"📱 Favorable scoreline for your Under leg. Monitor {bookmaker_name} cash out offers as the clock winds down."

    # Visual Anchor header
    if event_type == "GOAL_ALERT":
        header = f"🚨 *GOAL ALERT ({minute}')* 🚨"
    else:
        header = f"🚩 *CORNER ALERT ({minute}')* 🚩"

    message = (
        f"{header}\n\n"
        f"⚽ *Match:* `{fixture}`\n"
        f"⏱️ *Match Minute:* `{minute}'`\n"
        f"📊 *Score:* `{previous_score}` ➔ *`{new_score}`*\n"
        f"🎯 *Tracked Leg:* `{market_name}`\n"
        f"📈 *Live Tally:* `{total_count}` / `{target_threshold}` target ({direction})\n\n"
        f"{status_badge}\n\n"
        f"💡 *Cash Out Recommendation ({bookmaker_name}):*\n"
        f"{cash_out_advice}\n\n"
        f"🔗 [Open {bookmaker_name} App](https://www.{'betway.co.za' if 'betway' in bookmaker_name.lower() else 'supabets.co.za'})"
    )

    return message


def cron_handler(event: Optional[Dict[str, Any]] = None, context: Any = None) -> Dict[str, Any]:
    """
    Cron entry point executed every 60 seconds.
    Stateless and self-contained.
    """
    config = load_config()
    db = SupabaseCronDb(config.supabase_url, config.supabase_key)
    sports_client = SportsApiClient(config.sports_api_key, base_url=config.sports_api_base_url)
    notifier = TelegramNotifier(config.telegram_bot_token)

    # 1. Fetch only pending/live legs where kickoff_time <= NOW()
    legs = db.fetch_live_pending_legs()
    if not legs:
        logger.info("No active pending/live legs found past kick-off time.")
        return {"statusCode": 200, "checked_legs": 0, "dispatched_alarms": 0}

    logger.info(f"Processing {len(legs)} live/pending legs.")

    # 2. Fetch live feed once per cron cycle to minimize API calls
    live_feed = sports_client.fetch_live_fixtures()
    dispatched_alarms = 0
    updated_records = 0

    for leg in legs:
        leg_id = leg["id"]
        slip_id = leg["slip_id"]
        chat_id = leg["telegram_chat_id"]
        home_team = leg["home_team"]
        away_team = leg["away_team"]
        market_type = leg.get("market_type", "OVER_UNDER_GOALS")
        last_score = leg.get("last_known_score", "0-0")
        last_total = leg.get("last_known_total", 0)
        threshold = float(leg.get("line_threshold", 2.5))
        direction = leg.get("direction", "OVER")
        bookmaker = leg.get("bookmaker", "BETWAY_SA")

        # 3. Match against live sports API feed
        match_snap = sports_client.find_live_match(home_team, away_team, live_feed=live_feed)
        if not match_snap:
            # Match may not have started yet or name mismatch
            continue

        # 4. Compare current score / corner count against last_known_score
        has_changed = False
        event_type = ""
        new_score = ""
        new_total = 0

        if market_type == "OVER_UNDER_GOALS":
            current_score_line = match_snap.score_line
            if current_score_line != last_score:
                has_changed = True
                event_type = "GOAL_ALERT"
                new_score = current_score_line
                new_total = match_snap.total_goals
        elif market_type == "OVER_UNDER_CORNERS":
            current_corners = match_snap.total_corners
            current_corners_display = f"{current_corners} corners ({match_snap.home_corners}-{match_snap.away_corners})"
            if current_corners != last_total:
                has_changed = True
                event_type = "CORNER_ALERT"
                new_score = current_corners_display
                new_total = current_corners

        # 5. The Alarm Dispatcher: If change detected, update DB & alert Telegram
        if has_changed:
            # Determine new status
            new_status = "LIVE"
            if direction == "OVER" and new_total > threshold:
                new_status = "WON"
            elif direction == "UNDER" and new_total > threshold:
                new_status = "LOST"
            elif (direction == "OVER" and (threshold - new_total) <= 1.0) or (direction == "UNDER" and (threshold - new_total) <= 1.0):
                new_status = "CASH_OUT_RECOMMENDED"

            # Update DB immediately
            db.update_leg_score(
                leg_id=leg_id,
                new_score=new_score,
                new_total=new_total,
                minute=f"{match_snap.elapsed_minute}'",
                new_status=new_status,
                fixture_id=match_snap.fixture_id,
            )
            updated_records += 1

            # Format rich alert
            alert_msg = format_alarm_message(
                leg=leg,
                event_type=event_type,
                previous_score=last_score,
                new_score=new_score,
                minute=match_snap.elapsed_minute,
                total_count=new_total,
                target_threshold=threshold,
                direction=direction,
                bookmaker=bookmaker,
            )

            # Dispatch to Telegram Bot API
            msg_id = notifier.send_alert(chat_id, alert_msg)
            dispatched_alarms += 1

            # Audit log
            db.log_alarm_event(
                leg_id=leg_id,
                slip_id=slip_id,
                chat_id=chat_id,
                event_type=event_type,
                prev_score=last_score,
                new_score=new_score,
                minute=f"{match_snap.elapsed_minute}'",
                message=alert_msg,
                msg_id=msg_id,
            )

    return {
        "statusCode": 200,
        "checked_legs": len(legs),
        "updated_records": updated_records,
        "dispatched_alarms": dispatched_alarms,
    }
