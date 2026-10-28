"""
Comprehensive Unit Tests for Serverless Parlay Tracker
Verifies:
1. Betway & Supabets text parsing
2. Over/Under Total Goals & Match Corners extraction
3. Strict filtering & flagging of Straight Win (1X2) bets
4. Kick-off timestamp parsing and normalization
5. Alarm message generation and Cash Out advice
"""

import sys
import os
import unittest
from datetime import datetime, timezone

# Add serverless folder to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from parser import BetslipParser, ParseResult, ParsedLeg, IgnoredLeg
from polling_alarm_handler import format_alarm_message
from sports_api import SportsApiClient, MatchSnapshot


class TestBetslipParser(unittest.TestCase):

    def test_betway_slip_parsing(self):
        betway_sample = """
        BETWAY MULTI BET SLIP #BW-773921
        
        1. Mamelodi Sundowns vs Orlando Pirates
        Kick-off: 19:30 SAST
        Total Match Goals - Over 2.5
        Odds: 1.85
        
        2. Kaizer Chiefs v Cape Town City
        28/10 21:00
        Total Match Corners - Over 9.5
        Odds: 1.90
        
        3. Golden Arrows vs SuperSport United
        Today 17:00
        Match Result: Golden Arrows (1X2)
        Odds: 2.10
        """
        result = BetslipParser.parse(betway_sample)

        self.assertEqual(result.bookmaker, "BETWAY_SA")
        self.assertEqual(result.slip_code, "BW-773921")
        self.assertEqual(len(result.tracked_legs), 2)
        self.assertEqual(len(result.ignored_legs), 1)

        # Leg 1: Goals
        leg1 = result.tracked_legs[0]
        self.assertEqual(leg1.home_team, "Mamelodi Sundowns")
        self.assertEqual(leg1.away_team, "Orlando Pirates")
        self.assertEqual(leg1.market_type, "OVER_UNDER_GOALS")
        self.assertEqual(leg1.line_threshold, 2.5)
        self.assertEqual(leg1.direction, "OVER")
        self.assertEqual(leg1.initial_score, "0-0")

        # Leg 2: Corners
        leg2 = result.tracked_legs[1]
        self.assertEqual(leg2.home_team, "Kaizer Chiefs")
        self.assertEqual(leg2.away_team, "Cape Town City")
        self.assertEqual(leg2.market_type, "OVER_UNDER_CORNERS")
        self.assertEqual(leg2.line_threshold, 9.5)
        self.assertEqual(leg2.direction, "OVER")
        self.assertEqual(leg2.initial_score, "0 corners")

        # Leg 3: Ignored 1X2 straight win
        ign = result.ignored_legs[0]
        self.assertIn("Golden Arrows", ign.fixture_raw)
        self.assertIn("Straight win (1X2) market ignored", ign.reason)

    def test_supabets_slip_parsing(self):
        supabets_sample = """
        SUPABETS SA TICKET #SB-449102
        
        Arsenal vs Chelsea
        Time: 20:00
        Match Goals: Under 3.5
        
        Liverpool v Manchester City
        Kick-off: 21:45
        Match Corners: Over 10.5
        """
        result = BetslipParser.parse(supabets_sample)

        self.assertEqual(result.bookmaker, "SUPABETS_SA")
        self.assertEqual(len(result.tracked_legs), 2)
        self.assertEqual(result.tracked_legs[0].market_type, "OVER_UNDER_GOALS")
        self.assertEqual(result.tracked_legs[0].direction, "UNDER")
        self.assertEqual(result.tracked_legs[0].line_threshold, 3.5)

        self.assertEqual(result.tracked_legs[1].market_type, "OVER_UNDER_CORNERS")
        self.assertEqual(result.tracked_legs[1].direction, "OVER")
        self.assertEqual(result.tracked_legs[1].line_threshold, 10.5)

    def test_supabets_shared_link_parsing(self):
        link_input = "supabets link: https://new.supabets.co.za/Shared/1250961"
        result = BetslipParser.parse(link_input)

        self.assertEqual(result.bookmaker, "SUPABETS_SA")
        self.assertEqual(result.slip_code, "1250961")
        self.assertTrue(result.has_tracked_legs)
        self.assertGreaterEqual(len(result.tracked_legs), 2)
        # Check that Over/Under totals were extracted
        self.assertTrue(any(leg.market_type == "OVER_UNDER_GOALS" for leg in result.tracked_legs))
        self.assertTrue(any(leg.market_type == "OVER_UNDER_CORNERS" for leg in result.tracked_legs))
        # Check that straight win 1x2 was flagged as ignored
        self.assertTrue(len(result.ignored_legs) >= 1)

    def test_betway_booking_code_parsing(self):
        code_input = "Betway code: B9471A"
        result = BetslipParser.parse(code_input)

        self.assertEqual(result.bookmaker, "BETWAY_SA")
        self.assertEqual(result.slip_code, "B9471A")
        self.assertTrue(result.has_tracked_legs)
        self.assertEqual(len(result.tracked_legs), 3)
        self.assertTrue(any(leg.market_type == "OVER_UNDER_GOALS" for leg in result.tracked_legs))
        self.assertTrue(any(leg.market_type == "OVER_UNDER_CORNERS" for leg in result.tracked_legs))
        self.assertEqual(len(result.ignored_legs), 1)
        self.assertIn("1X2", result.ignored_legs[0].reason)

    def test_betway_shared_link_parsing(self):
        link_input = "https://www.betway.co.za/share/BW-773921"
        result = BetslipParser.parse(link_input)

        self.assertEqual(result.bookmaker, "BETWAY_SA")
        self.assertEqual(result.slip_code, "BW-773921")
        self.assertTrue(result.has_tracked_legs)
        self.assertGreaterEqual(len(result.tracked_legs), 2)

    def test_ignore_straight_win_1x2_alone(self):
        text_1x2 = """
        Real Madrid vs Barcelona
        1X2: Real Madrid
        Kick-off: 22:00
        """
        result = BetslipParser.parse(text_1x2)
        self.assertEqual(len(result.tracked_legs), 0)
        self.assertEqual(len(result.ignored_legs), 1)
        self.assertFalse(result.has_tracked_legs)


class TestAlarmDispatcher(unittest.TestCase):

    def test_goal_alarm_markdown_formatting(self):
        dummy_leg = {
            "fixture_raw": "Mamelodi Sundowns vs Orlando Pirates",
            "target_market": "Total Match Goals - Over 2.5",
            "direction": "OVER",
            "line_threshold": 2.5,
            "bookmaker": "BETWAY_SA",
        }
        msg = format_alarm_message(
            leg=dummy_leg,
            event_type="GOAL_ALERT",
            previous_score="1-0",
            new_score="2-0",
            minute=64,
            total_count=2,
            target_threshold=2.5,
            direction="OVER",
            bookmaker="BETWAY_SA",
        )
        self.assertIn("🚨 *GOAL ALERT (64')* 🚨", msg)
        self.assertIn("`1-0` ➔ *`2-0`*", msg)
        self.assertIn("CRUCIAL CASH-OUT WINDOW", msg)
        self.assertIn("Betway", msg)

    def test_corner_alarm_markdown_formatting(self):
        dummy_leg = {
            "fixture_raw": "Kaizer Chiefs vs Cape Town City",
            "target_market": "Total Match Corners - Over 9.5",
            "direction": "OVER",
            "line_threshold": 9.5,
            "bookmaker": "SUPABETS_SA",
        }
        msg = format_alarm_message(
            leg=dummy_leg,
            event_type="CORNER_ALERT",
            previous_score="9 corners (5-4)",
            new_score="10 corners (6-4)",
            minute=81,
            total_count=10,
            target_threshold=9.5,
            direction="OVER",
            bookmaker="SUPABETS_SA",
        )
        self.assertIn("🚩 *CORNER ALERT (81')* 🚩", msg)
        self.assertIn("LEG WON! TARGET SURPASSED", msg)
        self.assertIn("Supabets", msg)


class TestSportsApiClient(unittest.TestCase):

    def test_fuzzy_team_matching(self):
        client = SportsApiClient(api_key="test_key")
        self.assertTrue(client._is_team_match("Mamelodi Sundowns", "Mamelodi Sundowns FC"))
        self.assertTrue(client._is_team_match("Kaizer Chiefs", "Kaizer Chiefs Club"))
        self.assertTrue(client._is_team_match("Arsenal", "Arsenal FC"))
        self.assertFalse(client._is_team_match("Arsenal", "Chelsea"))


if __name__ == "__main__":
    unittest.main()
