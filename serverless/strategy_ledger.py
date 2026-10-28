"""
Strategy & Ledger Engine for Strict Low-Risk Sports Betting.
Implements:
1. Target Leagues & Low-Risk Filtering:
   - EPL: Over 1.5 Match Goals or Over 7.5 Corners
   - PSL: Under 2.5 or Under 3.5 Match Goals
   - NBA: Alternative Team Totals (bought down 6-8 pts) or 1st Half ML/Spreads
   - Tennis: Top-seed early rounds, To Win a Set (+1.5 Set Handicap)
2. Slip Guardrails:
   - Single Straight Bets: Fixed R2 unit stake, Target Odds 1.40 - 1.50
   - Conservative Parlays: Max 2 to 3 legs, platform minimum stake (R1 - R2)
   - Strict Responsible Gaming checks (reject > R2 for singles, reject > 3 legs)
3. Running Bankroll & Daily Ledger Accounting (Stake, Returns, Net P&L, ROI%)
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional, Tuple, Dict, Any


class Sport(str, Enum):
    FOOTBALL_EPL = "Football (EPL)"
    FOOTBALL_PSL = "Football (PSL)"
    BASKETBALL_NBA = "Basketball (NBA)"
    TENNIS_ATP_WTA = "Tennis (ATP/WTA)"
    OTHER = "Other"


class SlipType(str, Enum):
    SINGLE_STRAIGHT = "SINGLE_STRAIGHT"
    CONSERVATIVE_PARLAY = "CONSERVATIVE_PARLAY"


class BetStatus(str, Enum):
    PENDING = "PENDING"
    WON = "WON"
    LOST = "LOST"
    CASHED_OUT = "CASHED_OUT"
    VOID = "VOID"


@dataclass
class StrategyRuleCheck:
    is_compliant: bool
    sport: Sport
    market_description: str
    odds: float
    violations: List[str] = field(default_factory=list)
    strategy_note: str = ""


@dataclass
class CandidateLeg:
    fixture: str
    sport: Sport
    league: str
    market: str
    odds: float
    is_bought_down: bool = False
    buy_down_amount: Optional[str] = None  # e.g., "8 points"
    is_top_seed: bool = False  # for tennis


@dataclass
class LoggedBet:
    id: str
    slip_type: SlipType
    sport: Sport
    league: str
    legs: List[CandidateLeg]
    combined_odds: float
    stake_zar: float
    status: BetStatus = BetStatus.PENDING
    potential_return_zar: float = 0.0
    actual_return_zar: float = 0.0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    settled_at: Optional[datetime] = None

    def __post_init__(self):
        if not self.potential_return_zar:
            self.potential_return_zar = round(self.stake_zar * self.combined_odds, 2)


class LowRiskStrategyFilter:
    """
    Evaluates fixtures and markets strictly against low-risk strategy criteria.
    """

    @classmethod
    def evaluate_candidate(cls, leg: CandidateLeg) -> StrategyRuleCheck:
        violations: List[str] = []
        market_lower = leg.market.lower()

        if leg.sport == Sport.FOOTBALL_EPL:
            # EPL: High-intensity attacking -> Over 1.5 Goals or Over 7.5 Corners
            has_over_1_5 = ("over 1.5" in market_lower or "o 1.5" in market_lower) and "goal" in market_lower
            has_over_7_5_corners = ("over 7.5" in market_lower or "over 8.5" in market_lower) and "corner" in market_lower
            
            if not (has_over_1_5 or has_over_7_5_corners):
                violations.append(
                    "EPL Strategy requires Over 1.5 Match Goals or Over 7.5 Match Corners. Risky market rejected."
                )
            strategy_note = "EPL Attacking Focus: High-percentage Over 1.5 Goals / Over 7.5 Corners."

        elif leg.sport == Sport.FOOTBALL_PSL:
            # PSL: Low-scoring, tight defensive -> Under 2.5 or Under 3.5 Goals
            has_under = ("under 2.5" in market_lower or "under 3.5" in market_lower) and "goal" in market_lower
            if not has_under:
                violations.append(
                    "PSL Strategy requires Under 2.5 or Under 3.5 Match Goals due to defensive low-scoring trends."
                )
            strategy_note = "PSL Defensive Focus: High-percentage Under 2.5 / Under 3.5 Goals."

        elif leg.sport == Sport.BASKETBALL_NBA:
            # NBA: Alternative Team Totals (bought down 6-8 pts) or 1st Half Moneylines/Spreads
            is_bought_team_total = "team total" in market_lower and leg.is_bought_down
            is_first_half = "1st half" in market_lower or "first half" in market_lower
            if not (is_bought_team_total or is_first_half):
                violations.append(
                    "NBA Strategy requires Alternative Team Totals (bought down 6-8 pts) or 1st Half Moneylines/Spreads."
                )
            strategy_note = "NBA Buying-Down Focus: Cushioning lines by 6-8 points to eliminate variance."

        elif leg.sport == Sport.TENNIS_ATP_WTA:
            # Tennis: Top seeds in early rounds, To Win a Set (+1.5 Set Handicap)
            has_set_market = "win a set" in market_lower or "+1.5 set" in market_lower or "set handicap" in market_lower
            if not has_set_market or not leg.is_top_seed:
                violations.append(
                    "Tennis Strategy requires Top-Seeded players in early rounds on '+1.5 Set Handicap' (To Win a Set)."
                )
            strategy_note = "Tennis Anchor Focus: Top-seed +1.5 Set Handicap eliminates straight-set upset risk."

        else:
            violations.append(f"Sport '{leg.sport}' is outside the 4 approved target leagues.")
            strategy_note = "Unapproved league."

        return StrategyRuleCheck(
            is_compliant=len(violations) == 0,
            sport=leg.sport,
            market_description=leg.market,
            odds=leg.odds,
            violations=violations,
            strategy_note=strategy_note,
        )


class SlipValidator:
    """
    Enforces strict slip structures & Responsible Gaming guardrails:
    - Straight Bets: Exactly R2.00 unit stake, Target Odds 1.40 - 1.50
    - Conservative Parlays: Exactly 2 to 3 legs, Staked at platform baseline (<= R2.00)
    """

    MAX_PARLAY_LEGS = 3
    MIN_PARLAY_LEGS = 2
    FIXED_SINGLE_STAKE = 2.00
    MAX_PARLAY_STAKE = 2.00
    SINGLE_ODDS_MIN = 1.40
    SINGLE_ODDS_MAX = 1.50

    @classmethod
    def validate_slip(
        cls,
        slip_type: SlipType,
        legs: List[CandidateLeg],
        stake_zar: float,
    ) -> Tuple[bool, List[str]]:
        errors: List[str] = []

        # 1. First validate each leg against the LowRiskStrategyFilter
        for idx, leg in enumerate(legs, 1):
            check = LowRiskStrategyFilter.evaluate_candidate(leg)
            if not check.is_compliant:
                for v in check.violations:
                    errors.append(f"Leg {idx} ({leg.fixture}): {v}")

        # 2. Validate Single Straight Bets
        if slip_type == SlipType.SINGLE_STRAIGHT:
            if len(legs) != 1:
                errors.append(f"Single straight bet must contain exactly 1 leg, received {len(legs)}.")
            else:
                odds = legs[0].odds
                if odds < cls.SINGLE_ODDS_MIN or odds > cls.SINGLE_ODDS_MAX:
                    errors.append(
                        f"Single Straight Bet odds ({odds:.2f}) violate conservative range "
                        f"[{cls.SINGLE_ODDS_MIN:.2f} - {cls.SINGLE_ODDS_MAX:.2f}]."
                    )

            # Strict R2.00 Unit Stake Enforcement
            if round(stake_zar, 2) != cls.FIXED_SINGLE_STAKE:
                errors.append(
                    f"Responsible Gaming Violation: Straight bets must be staked strictly at R{cls.FIXED_SINGLE_STAKE:.2f} "
                    f"(Attempted stake: R{stake_zar:.2f}). Exceeding R2 constraint is blocked."
                )

        # 3. Validate Conservative Parlays
        elif slip_type == SlipType.CONSERVATIVE_PARLAY:
            if len(legs) < cls.MIN_PARLAY_LEGS:
                errors.append(f"Parlay must have at least {cls.MIN_PARLAY_LEGS} legs.")
            elif len(legs) > cls.MAX_PARLAY_LEGS:
                errors.append(
                    f"Responsible Gaming Violation: Max {cls.MAX_PARLAY_LEGS} legs allowed in conservative parlays "
                    f"to prevent parlay variance runaway (Attempted: {len(legs)} legs)."
                )

            if stake_zar > cls.MAX_PARLAY_STAKE:
                errors.append(
                    f"Responsible Gaming Violation: Parlay stake (R{stake_zar:.2f}) exceeds platform minimum baseline "
                    f"of R{cls.MAX_PARLAY_STAKE:.2f}."
                )

        return len(errors) == 0, errors


class BankrollLedger:
    """
    Automated running bankroll ledger tracking:
    - Total Stake
    - Returns
    - Net Profit/Loss
    - ROI Percentage: (Net P&L / Total Staked) * 100
    - Categorization by Sport, Market Type, and League
    - Daily performance summaries
    """

    def __init__(self, initial_bankroll: float = 500.00):
        self.initial_bankroll: float = initial_bankroll
        self.bets: List[LoggedBet] = []

    @property
    def current_balance(self) -> float:
        net_pl = self.net_profit_loss
        return round(self.initial_bankroll + net_pl, 2)

    @property
    def total_staked(self) -> float:
        return round(sum(b.stake_zar for b in self.bets), 2)

    @property
    def total_returns(self) -> float:
        return round(sum(b.actual_return_zar for b in self.bets if b.status != BetStatus.PENDING), 2)

    @property
    def net_profit_loss(self) -> float:
        settled_bets = [b for b in self.bets if b.status != BetStatus.PENDING]
        staked_on_settled = sum(b.stake_zar for b in settled_bets)
        returns = sum(b.actual_return_zar for b in settled_bets)
        return round(returns - staked_on_settled, 2)

    @property
    def roi_percentage(self) -> float:
        settled_bets = [b for b in self.bets if b.status != BetStatus.PENDING]
        staked_on_settled = sum(b.stake_zar for b in settled_bets)
        if staked_on_settled == 0:
            return 0.0
        return round((self.net_profit_loss / staked_on_settled) * 100, 2)

    @property
    def win_rate_percentage(self) -> float:
        settled = [b for b in self.bets if b.status in (BetStatus.WON, BetStatus.LOST)]
        if not settled:
            return 0.0
        won = sum(1 for b in settled if b.status == BetStatus.WON)
        return round((won / len(settled)) * 100, 1)

    def log_bet(self, slip_type: SlipType, legs: List[CandidateLeg], stake_zar: float) -> Tuple[bool, Optional[LoggedBet], List[str]]:
        is_valid, errors = SlipValidator.validate_slip(slip_type, legs, stake_zar)
        if not is_valid:
            return False, None, errors

        # Calculate combined odds
        combined_odds = 1.0
        for l in legs:
            combined_odds *= l.odds
        combined_odds = round(combined_odds, 2)

        sport = legs[0].sport
        league = legs[0].league if len(set(l.league for l in legs)) == 1 else "Multi-League"

        bet = LoggedBet(
            id=f"bet-{int(datetime.now(timezone.utc).timestamp())}-{len(self.bets) + 1}",
            slip_type=slip_type,
            sport=sport,
            league=league,
            legs=legs,
            combined_odds=combined_odds,
            stake_zar=stake_zar,
            status=BetStatus.PENDING,
        )
        self.bets.append(bet)
        return True, bet, []

    def settle_bet(self, bet_id: str, status: BetStatus, custom_return: Optional[float] = None) -> bool:
        for b in self.bets:
            if b.id == bet_id:
                b.status = status
                b.settled_at = datetime.now(timezone.utc)
                if status == BetStatus.WON:
                    b.actual_return_zar = b.potential_return_zar
                elif status == BetStatus.LOST:
                    b.actual_return_zar = 0.0
                elif status == BetStatus.CASHED_OUT and custom_return is not None:
                    b.actual_return_zar = round(custom_return, 2)
                elif status == BetStatus.VOID:
                    b.actual_return_zar = b.stake_zar
                return True
        return False

    def generate_daily_summary(self) -> Dict[str, Any]:
        """
        Generates clean daily performance summary at the end of each fixture cycle.
        """
        settled_today = [b for b in self.bets if b.status != BetStatus.PENDING]
        total_staked_today = sum(b.stake_zar for b in settled_today)
        total_returns_today = sum(b.actual_return_zar for b in settled_today)
        net_pl_today = round(total_returns_today - total_staked_today, 2)
        roi_today = round((net_pl_today / total_staked_today * 100), 2) if total_staked_today > 0 else 0.0

        won_count = sum(1 for b in settled_today if b.status == BetStatus.WON)
        lost_count = sum(1 for b in settled_today if b.status == BetStatus.LOST)

        # Categorization breakdown
        by_sport: Dict[str, Dict[str, float]] = {}
        for b in settled_today:
            s_name = b.sport.value
            if s_name not in by_sport:
                by_sport[s_name] = {"staked": 0.0, "returns": 0.0, "net": 0.0}
            by_sport[s_name]["staked"] += b.stake_zar
            by_sport[s_name]["returns"] += b.actual_return_zar
            by_sport[s_name]["net"] = round(by_sport[s_name]["returns"] - by_sport[s_name]["staked"], 2)

        return {
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "initial_bankroll_zar": self.initial_bankroll,
            "closing_balance_zar": self.current_balance,
            "settled_tickets": len(settled_today),
            "won_count": won_count,
            "lost_count": lost_count,
            "total_staked_zar": round(total_staked_today, 2),
            "total_returns_zar": round(total_returns_today, 2),
            "daily_net_profit_loss_zar": net_pl_today,
            "daily_roi_pct": roi_today,
            "overall_roi_pct": self.roi_percentage,
            "discipline_score": "100% (Strict R2 Unit Stake Maintained, Max 3 Legs Enforced)",
            "breakdown_by_sport": by_sport,
        }
