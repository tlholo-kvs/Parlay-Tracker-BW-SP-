"""NBA data adapter using the nba_api Python library.

This is a lightweight bridge for the Parlay Tracker app. It uses the public
NBA stats endpoints exposed by the `swar/nba_api` project and normalizes the
current live scoreboard into the same low-risk fixture structure the app uses
for NBA alternatives.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

try:
    from nba_api.live.nba.endpoints import scoreboard
except Exception as exc:  # pragma: no cover - dependency may not be installed yet.
    scoreboard = None
    logger.warning("nba_api is not installed yet: %s", exc)


class NbaApiClient:
    """Fetch current NBA scoreboard and normalize matches for the tracker."""

    def __init__(self, timeout: float = 15.0):
        self.timeout = timeout

    def get_live_games(self) -> List[Dict[str, Any]]:
        """Return the active live NBA scoreboard in a normalized format."""
        if scoreboard is None:
            logger.warning("NBA API client unavailable: nba_api not installed.")
            return []

        try:
            board = scoreboard.ScoreBoard()
            payload = board.get_dict()
            games = payload.get("scoreboard", {}).get("games", [])
        except Exception as exc:  # pragma: no cover - network failure path.
            logger.warning("Failed to fetch NBA live games: %s", exc)
            return []

        normalized: List[Dict[str, Any]] = []
        for game in games:
            home = game.get("homeTeam") or {}
            away = game.get("awayTeam") or {}
            status = game.get("gameStatusText") or "LIVE"
            home_score = int(home.get("score", 0) or 0)
            away_score = int(away.get("score", 0) or 0)

            normalized.append(
                {
                    "game_id": str(game.get("gameId") or ""),
                    "league": "NBA Basketball",
                    "sport": "Basketball (NBA)",
                    "home_team": home.get("teamName") or "Home Team",
                    "away_team": away.get("teamName") or "Away Team",
                    "status": status,
                    "home_score": home_score,
                    "away_score": away_score,
                    "market": "Team Total - Over 210.5",
                    "odds": 1.45,
                    "strategy_note": "Live NBA feed from the nba_api library. Use for low-risk alternative totals.",
                }
            )

        return normalized

    def get_strategy_candidates(self) -> List[Dict[str, Any]]:
        """Map live games into the tracker strategy-candidate shape."""
        games = self.get_live_games()
        candidates: List[Dict[str, Any]] = []

        for game in games:
            fixture = f"{game['home_team']} vs {game['away_team']}"
            candidates.append(
                {
                    "id": f"nba-live-{game['game_id']}",
                    "fixture": fixture,
                    "sport": game["sport"],
                    "league": game["league"],
                    "market": game["market"],
                    "odds": float(game["odds"]),
                    "strategyNote": game["strategy_note"],
                    "isCompliant": True,
                    "status": game["status"],
                    "homeScore": game["home_score"],
                    "awayScore": game["away_score"],
                }
            )

        return candidates


if __name__ == "__main__":
    client = NbaApiClient()
    print(client.get_live_games())
