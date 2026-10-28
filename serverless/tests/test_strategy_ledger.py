"""
Unit tests for Strict Low-Risk Strategy, Responsible Gaming Guardrails, and Ledger.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from strategy_ledger import (
    Sport,
    SlipType,
    BetStatus,
    CandidateLeg,
    LowRiskStrategyFilter,
    SlipValidator,
    BankrollLedger,
)


class TestLowRiskStrategyFilter(unittest.TestCase):

    def test_epl_criteria(self):
        # Over 1.5 Goals in EPL should pass
        epl_goals = CandidateLeg(
            fixture="Arsenal vs Man City",
            sport=Sport.FOOTBALL_EPL,
            league="English Premier League",
            market="Total Match Goals - Over 1.5",
            odds=1.44,
        )
        res = LowRiskStrategyFilter.evaluate_candidate(epl_goals)
        self.assertTrue(res.is_compliant)

        # Over 7.5 Corners in EPL should pass
        epl_corners = CandidateLeg(
            fixture="Liverpool vs Chelsea",
            sport=Sport.FOOTBALL_EPL,
            league="English Premier League",
            market="Total Match Corners - Over 7.5",
            odds=1.42,
        )
        res_corners = LowRiskStrategyFilter.evaluate_candidate(epl_corners)
        self.assertTrue(res_corners.is_compliant)

        # Straight 1X2 win should fail
        epl_risky = CandidateLeg(
            fixture="Arsenal vs Man City",
            sport=Sport.FOOTBALL_EPL,
            league="English Premier League",
            market="Full Time Result: Arsenal",
            odds=2.40,
        )
        res_risky = LowRiskStrategyFilter.evaluate_candidate(epl_risky)
        self.assertFalse(res_risky.is_compliant)

    def test_psl_criteria(self):
        # Under 2.5 in PSL should pass
        psl_under = CandidateLeg(
            fixture="Mamelodi Sundowns vs Orlando Pirates",
            sport=Sport.FOOTBALL_PSL,
            league="SA Premier Soccer League",
            market="Total Match Goals - Under 2.5",
            odds=1.48,
        )
        res = LowRiskStrategyFilter.evaluate_candidate(psl_under)
        self.assertTrue(res.is_compliant)

        # High-scoring Over in PSL should fail
        psl_risky = CandidateLeg(
            fixture="Kaizer Chiefs vs SuperSport United",
            sport=Sport.FOOTBALL_PSL,
            league="SA Premier Soccer League",
            market="Total Match Goals - Over 3.5",
            odds=3.20,
        )
        res_risky = LowRiskStrategyFilter.evaluate_candidate(psl_risky)
        self.assertFalse(res_risky.is_compliant)

    def test_nba_criteria(self):
        # Alternative Team Total bought down 8 pts should pass
        nba_bought = CandidateLeg(
            fixture="Boston Celtics vs Miami Heat",
            sport=Sport.BASKETBALL_NBA,
            league="NBA Basketball",
            market="Boston Celtics Team Total - Over 106.5",
            odds=1.45,
            is_bought_down=True,
            buy_down_amount="8 points",
        )
        res = LowRiskStrategyFilter.evaluate_candidate(nba_bought)
        self.assertTrue(res.is_compliant)

        # Unbought high variance total should fail
        nba_unbought = CandidateLeg(
            fixture="Golden State vs Lakers",
            sport=Sport.BASKETBALL_NBA,
            league="NBA Basketball",
            market="Total Points - Over 234.5",
            odds=1.91,
            is_bought_down=False,
        )
        res_unbought = LowRiskStrategyFilter.evaluate_candidate(nba_unbought)
        self.assertFalse(res_unbought.is_compliant)

    def test_tennis_criteria(self):
        # Top seed To Win a Set (+1.5 Set Handicap) should pass
        tennis_safe = CandidateLeg(
            fixture="Alcaraz vs Griekspoor",
            sport=Sport.TENNIS_ATP_WTA,
            league="ATP Grand Slam",
            market="Carlos Alcaraz +1.5 Set Handicap (To Win a Set)",
            odds=1.42,
            is_top_seed=True,
        )
        res = LowRiskStrategyFilter.evaluate_candidate(tennis_safe)
        self.assertTrue(res.is_compliant)


class TestSlipValidatorAndGuardrails(unittest.TestCase):

    def setUp(self):
        self.valid_single_leg = CandidateLeg(
            fixture="Arsenal vs Man City",
            sport=Sport.FOOTBALL_EPL,
            league="English Premier League",
            market="Total Match Goals - Over 1.5",
            odds=1.45,
        )

    def test_single_bet_r2_stake_enforcement(self):
        # Staking exactly R2.00 passes
        valid, errors = SlipValidator.validate_slip(
            SlipType.SINGLE_STRAIGHT, [self.valid_single_leg], stake_zar=2.00
        )
        self.assertTrue(valid)
        self.assertEqual(len(errors), 0)

        # Staking R5.00 fails responsible gaming constraint
        valid, errors = SlipValidator.validate_slip(
            SlipType.SINGLE_STRAIGHT, [self.valid_single_leg], stake_zar=5.00
        )
        self.assertFalse(valid)
        self.assertTrue(any("Responsible Gaming Violation: Straight bets must be staked strictly at R2.00" in e for e in errors))

    def test_single_bet_odds_range(self):
        # Odds 1.30 (< 1.40) fails
        low_leg = CandidateLeg(
            fixture="Arsenal vs Man City",
            sport=Sport.FOOTBALL_EPL,
            league="English Premier League",
            market="Total Match Goals - Over 1.5",
            odds=1.30,
        )
        valid, errors = SlipValidator.validate_slip(
            SlipType.SINGLE_STRAIGHT, [low_leg], stake_zar=2.00
        )
        self.assertFalse(valid)
        self.assertTrue(any("odds (1.30) violate conservative range" in e for e in errors))

    def test_parlay_max_3_legs_cap(self):
        leg2 = CandidateLeg(
            fixture="Sundowns vs Pirates",
            sport=Sport.FOOTBALL_PSL,
            league="PSL",
            market="Total Match Goals - Under 2.5",
            odds=1.48,
        )
        leg3 = CandidateLeg(
            fixture="Boston vs Miami",
            sport=Sport.BASKETBALL_NBA,
            league="NBA",
            market="Team Total Over 106.5",
            odds=1.45,
            is_bought_down=True,
        )
        leg4 = CandidateLeg(
            fixture="Alcaraz vs Opponent",
            sport=Sport.TENNIS_ATP_WTA,
            league="ATP",
            market="To Win a Set (+1.5 Set Handicap)",
            odds=1.42,
            is_top_seed=True,
        )

        # 3 legs passes
        valid, errors = SlipValidator.validate_slip(
            SlipType.CONSERVATIVE_PARLAY, [self.valid_single_leg, leg2, leg3], stake_zar=2.00
        )
        self.assertTrue(valid)

        # 4 legs triggers violation
        valid, errors = SlipValidator.validate_slip(
            SlipType.CONSERVATIVE_PARLAY, [self.valid_single_leg, leg2, leg3, leg4], stake_zar=2.00
        )
        self.assertFalse(valid)
        self.assertTrue(any("Max 3 legs allowed in conservative parlays" in e for e in errors))


class TestBankrollLedger(unittest.TestCase):

    def test_ledger_accounting_and_roi(self):
        ledger = BankrollLedger(initial_bankroll=500.00)

        leg1 = CandidateLeg(
            fixture="Arsenal vs Man City",
            sport=Sport.FOOTBALL_EPL,
            league="EPL",
            market="Total Match Goals - Over 1.5",
            odds=1.45,
        )

        # Log Bet 1: R2.00 stake @ 1.45
        success, bet1, errors = ledger.log_bet(SlipType.SINGLE_STRAIGHT, [leg1], stake_zar=2.00)
        self.assertTrue(success)

        # Settle as WON -> Returns R2.90
        ledger.settle_bet(bet1.id, BetStatus.WON)

        self.assertEqual(ledger.total_staked, 2.00)
        self.assertEqual(ledger.total_returns, 2.90)
        self.assertEqual(ledger.net_profit_loss, 0.90)
        self.assertEqual(ledger.current_balance, 500.90)
        # ROI: (0.90 / 2.00) * 100 = 45.0%
        self.assertEqual(ledger.roi_percentage, 45.0)

        # Daily summary check
        summary = ledger.generate_daily_summary()
        self.assertEqual(summary["settled_tickets"], 1)
        self.assertEqual(summary["daily_net_profit_loss_zar"], 0.90)
        self.assertEqual(summary["daily_roi_pct"], 45.0)
        self.assertIn("100%", summary["discipline_score"])


if __name__ == "__main__":
    unittest.main()
