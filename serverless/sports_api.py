"""
Modular Sports Data Client for Live Tracking (API-Football / TheOddsAPI).
Handles live fixture search, fuzzy team name resolution, score lines, and corner totals.
"""

import logging
import json
import urllib.request
import urllib.error
import urllib.parse
from dataclasses import dataclass
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


@dataclass
class MatchSnapshot:
    fixture_id: str
    home_team: str
    away_team: str
    status: str  # '1H', '2H', 'HT', 'FT', 'NS', 'LIVE'
    elapsed_minute: int
    home_goals: int
    away_goals: int
    total_goals: int
    home_corners: int
    away_corners: int
    total_corners: int
    is_live: bool

    @property
    def score_line(self) -> str:
        return f"{self.home_goals}-{self.away_goals}"

    @property
    def corners_display(self) -> str:
        return f"{self.total_corners} corners ({self.home_corners}-{self.away_corners})"


class SportsApiClient:
    """
    Clean, modular client interacting with live sports data providers
    (e.g., API-Football v3 / RapidAPI).
    Designed to be stateless and resilient against network latency and rate limits.
    """

    def __init__(self, api_key: str, base_url: str = "https://v3.football.api-sports.io", timeout: float = 8.0):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _normalize_name(self, name: str) -> str:
        """Strip suffixes like FC, United, City, etc., for robust fuzzy matching."""
        cleaned = name.lower()
        for token in [" fc", "fc ", " united", " city", " town", " wanderers", " athletic", " club"]:
            cleaned = cleaned.replace(token, "")
        return "".join(c for c in cleaned if c.isalnum() or c.isspace()).strip()

    def _is_team_match(self, target_team: str, candidate_team: str) -> bool:
        t_norm = self._normalize_name(target_team)
        c_norm = self._normalize_name(candidate_team)
        return (t_norm in c_norm) or (c_norm in t_norm) or (t_norm == c_norm)

    def fetch_live_fixtures(self) -> List[Dict[str, Any]]:
        """
        Executes HTTP GET request to /fixtures?live=all.
        Falls back safely on timeout or missing credentials.
        """
        if not self.api_key:
            logger.warning("SPORTS_API_KEY is unset or empty. Returning empty live feed.")
            return []

        url = f"{self.base_url}/fixtures?live=all"
        headers = {
            "x-rapidapi-key": self.api_key,
            "x-apisports-key": self.api_key,
            "User-Agent": "ServerlessParlayTracker/1.0",
        }

        req = urllib.request.Request(url, headers=headers, method="GET")

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    return data.get("response", [])
                else:
                    logger.error(f"Sports API returned HTTP {response.status}")
                    return []
        except urllib.error.HTTPError as http_err:
            logger.error(f"HTTPError in Sports API fetch: {http_err.code} - {http_err.reason}")
            return []
        except urllib.error.URLError as url_err:
            logger.error(f"URLError in Sports API fetch: {url_err.reason}")
            return []
        except TimeoutError:
            logger.error(f"Sports API timed out after {self.timeout}s.")
            return []
        except Exception as e:
            logger.error(f"Unexpected error querying sports feed: {str(e)}")
            return []

    def fetch_fixture_statistics(self, fixture_id: str) -> Dict[str, int]:
        """
        Fetches match statistics (specifically Corner Kicks) for a specific fixture.
        Returns {'home_corners': X, 'away_corners': Y, 'total_corners': Z}.
        """
        if not self.api_key or not fixture_id:
            return {"home_corners": 0, "away_corners": 0, "total_corners": 0}

        url = f"{self.base_url}/fixtures/statistics?fixture={fixture_id}"
        headers = {
            "x-rapidapi-key": self.api_key,
            "x-apisports-key": self.api_key,
            "User-Agent": "ServerlessParlayTracker/1.0",
        }

        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                if response.status == 200:
                    payload = json.loads(response.read().decode("utf-8"))
                    teams_stats = payload.get("response", [])
                    home_corners = 0
                    away_corners = 0
                    if len(teams_stats) >= 1:
                        home_corners = self._extract_corner_value(teams_stats[0].get("statistics", []))
                    if len(teams_stats) >= 2:
                        away_corners = self._extract_corner_value(teams_stats[1].get("statistics", []))

                    return {
                        "home_corners": home_corners,
                        "away_corners": away_corners,
                        "total_corners": home_corners + away_corners,
                    }
        except Exception as e:
            logger.warning(f"Could not fetch corners for fixture {fixture_id}: {str(e)}")

        return {"home_corners": 0, "away_corners": 0, "total_corners": 0}

    def _extract_corner_value(self, stats_list: List[Dict[str, Any]]) -> int:
        for item in stats_list:
            if "corner" in str(item.get("type", "")).lower():
                val = item.get("value")
                if val is not None and str(val).isdigit():
                    return int(val)
        return 0

    def find_live_match(self, home_team: str, away_team: str, live_feed: Optional[List[Dict[str, Any]]] = None) -> Optional[MatchSnapshot]:
        """
        Searches the live feed for the target fixture using fuzzy team matching.
        """
        feed = live_feed if live_feed is not None else self.fetch_live_fixtures()
        if not feed:
            return None

        for match in feed:
            teams = match.get("teams", {})
            api_home = teams.get("home", {}).get("name", "")
            api_away = teams.get("away", {}).get("name", "")

            # Verify matching teams
            if self._is_team_match(home_team, api_home) and self._is_team_match(away_team, api_away):
                fixture_meta = match.get("fixture", {})
                fixture_id = str(fixture_meta.get("id", ""))
                status_short = fixture_meta.get("status", {}).get("short", "LIVE")
                elapsed = fixture_meta.get("status", {}).get("elapsed") or 0

                goals = match.get("goals", {})
                h_goals = int(goals.get("home") or 0)
                a_goals = int(goals.get("away") or 0)

                # Fetch corners if live
                corners_data = self.fetch_fixture_statistics(fixture_id)

                return MatchSnapshot(
                    fixture_id=fixture_id,
                    home_team=api_home,
                    away_team=api_away,
                    status=status_short,
                    elapsed_minute=int(elapsed),
                    home_goals=h_goals,
                    away_goals=a_goals,
                    total_goals=h_goals + a_goals,
                    home_corners=corners_data["home_corners"],
                    away_corners=corners_data["away_corners"],
                    total_corners=corners_data["total_corners"],
                    is_live=status_short in ["1H", "HT", "2H", "ET", "P", "LIVE"],
                )

        return None
