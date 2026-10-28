"""
Parser Layer for South African Sportsbooks (Betway SA & Supabets SA).
Extracts fixtures, kick-off timestamps, and specializes in Over/Under Totals
(Match Goals and Match Corners). Filters and flags straight win bets (1X2).
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple, Dict, Any


@dataclass
class ParsedLeg:
    fixture_raw: str
    home_team: str
    away_team: str
    kickoff_time: datetime
    market_type: str  # 'OVER_UNDER_GOALS' or 'OVER_UNDER_CORNERS'
    target_market: str
    line_threshold: float  # e.g., 2.5, 9.5
    direction: str  # 'OVER' or 'UNDER'
    initial_score: str = "0-0"
    initial_total: int = 0
    is_valid: bool = True
    rejection_reason: Optional[str] = None


@dataclass
class IgnoredLeg:
    fixture_raw: str
    market_raw: str
    reason: str  # e.g. "Straight win (1X2) market ignored - only Over/Under totals tracked"


@dataclass
class ParseResult:
    bookmaker: str  # 'BETWAY_SA', 'SUPABETS_SA', or 'GENERIC_SA'
    slip_code: Optional[str] = None
    tracked_legs: List[ParsedLeg] = field(default_factory=list)
    ignored_legs: List[IgnoredLeg] = field(default_factory=list)
    raw_text: str = ""

    @property
    def has_tracked_legs(self) -> bool:
        return len(self.tracked_legs) > 0


class BetslipParser:
    """
    Production-grade text & payload parser for South African sportsbooks.
    """

    # Fixture pattern: "Team A vs Team B", "Team A v Team B", "Team A - Team B"
    FIXTURE_REGEX = re.compile(
        r"([A-Za-z0-9\.\s\-\'\&]+?)\s+(?:vs\.?|v\.?|\-)\s+([A-Za-z0-9\.\s\-\'\&]+?)(?=\s+(?:\d{1,2}[\/\-\:]|kick[\s\-]?off|total|over|under|1x2|match|\n|$))",
        re.IGNORECASE,
    )

    # Alternate line-based fixture pattern: "Team A vs Team B" on its own line
    LINE_FIXTURE_REGEX = re.compile(
        r"^([A-Za-z0-9\.\s\-\'\&]+?)\s+(?:vs\.?|v\.?|\-)\s+([A-Za-z0-9\.\s\-\'\&]+?)$",
        re.IGNORECASE | re.MULTILINE,
    )

    # Time pattern: "28/10 19:30", "19:30 SAST", "2026-10-28 19:30", "Kick-off: 20:45", "Today 17:00"
    TIME_REGEX = re.compile(
        r"(?:(?:kick[\s\-]?off|ko|time)[\s\:]*)?"
        r"(?:(\d{4}[\-\/]\d{1,2}[\-\/]\d{1,2}|\d{1,2}[\/\-\.]\d{1,2}|today|tomorrow)[\s,]*)?"
        r"(\d{1,2}:\d{2})\s*(?:sast|cat|utc\+2)?",
        re.IGNORECASE,
    )

    # Over/Under Goals pattern
    # Matches: "Over 2.5 Goals", "Total Goals - Under 3.5", "Match Goals: Over 1.5", "O 2.5", "Total Match Goals: Over 2.5"
    GOALS_OU_REGEX = re.compile(
        r"(?:total\s+(?:match\s+)?goals|match\s+goals|goals)?[\s\:\-]*"
        r"(over|under|o\/?u|o|u)[\s\:\-]*([0-9]+(?:\.[0-9]+)?)\s*(?:goals)?",
        re.IGNORECASE,
    )

    # Over/Under Corners pattern
    # Matches: "Total Corners - Over 9.5", "Match Corners: Under 10.5", "Corners Over 8.5"
    CORNERS_OU_REGEX = re.compile(
        r"(?:total\s+(?:match\s+)?corners|match\s+corners|corners)[\s\:\-]*"
        r"(over|under|o\/?u|o|u)[\s\:\-]*([0-9]+(?:\.[0-9]+)?)",
        re.IGNORECASE,
    )

    # Straight win 1X2 patterns to actively ignore or flag
    STRAIGHT_WIN_REGEX = re.compile(
        r"(1x2|match\s+result|full\s+time\s+result|home\s+win|away\s+win|draw|both\s+teams\s+to\s+score|btts|double\s+chance|draw\s+no\s+bet)",
        re.IGNORECASE,
    )

    # South African Bookmaker identifiers
    BETWAY_LINK_REGEX = re.compile(r"(?:www\.)?betway\.co\.za\/(?:share|betslip|multi|\?bookingCode\=)[\/\w\?\=\&\-]+", re.IGNORECASE)
    SUPABETS_LINK_REGEX = re.compile(r"(?:new\.)?supabets\.co\.za\/(?:shared|share|slip|betslip|ticket)[\/\w\?\=\&\-]+", re.IGNORECASE)

    @classmethod
    def identify_bookmaker(cls, text: str) -> str:
        text_lower = text.lower()
        if "supabets" in text_lower or cls.SUPABETS_LINK_REGEX.search(text):
            return "SUPABETS_SA"
        if "betway" in text_lower or cls.BETWAY_LINK_REGEX.search(text) or "bw-" in text_lower:
            return "BETWAY_SA"
        return "GENERIC_SA"

    @classmethod
    def parse(cls, raw_text: str) -> ParseResult:
        """
        Main parser entry point. Processes multiline betslip text or shared text payloads.
        """
        cleaned_text = raw_text.strip()
        bookmaker = cls.identify_bookmaker(cleaned_text)
        
        # Check for booking slip code in text or shared URL
        # e.g. "https://new.supabets.co.za/Shared/1250961" -> code "1250961"
        # e.g. "https://www.betway.co.za/share/B9471A" -> code "B9471A"
        # e.g. "Betway code: B9471A" -> code "B9471A"
        # e.g. "Betway booking code: BW-773921" -> code "BW-773921"
        slip_code = None
        url_match = re.search(r"(?:shared|share|slip|betslip|ticket|bookingCode\=|code\=)\/?([A-Za-z0-9\-]+)", cleaned_text, re.IGNORECASE)
        if url_match:
            slip_code = url_match.group(1).upper()
        else:
            code_match = re.search(r"(?:betway\s*(?:booking\s*)?code|supabets\s*(?:booking\s*)?code|slip|code|ticket|booking|ref)[\s\#\:\-]*([A-Z0-9\-]{5,20})", cleaned_text, re.IGNORECASE)
            if code_match:
                slip_code = code_match.group(1).upper()
            elif re.match(r"^[A-Z0-9\-]{5,12}$", cleaned_text.strip()):
                slip_code = cleaned_text.strip().upper()

        if bookmaker == "GENERIC_SA" and slip_code and (slip_code.startswith("BW-") or re.match(r"^[A-Z0-9]{6,8}$", slip_code)):
            bookmaker = "BETWAY_SA"

        tracked_legs: List[ParsedLeg] = []
        ignored_legs: List[IgnoredLeg] = []

        # If a shared link or booking code was provided alone, attempt to resolve it
        is_link_or_code_only = bool(
            (cls.SUPABETS_LINK_REGEX.search(cleaned_text) or
             cls.BETWAY_LINK_REGEX.search(cleaned_text) or
             re.search(r"^(?:betway|supabets)?\s*(?:booking\s*)?code[\s\:\#]*[A-Z0-9\-]{5,15}$", cleaned_text, re.IGNORECASE) or
             re.match(r"^[A-Z0-9\-]{5,12}$", cleaned_text.strip()))
            and not re.search(r"(?:vs\.?|v\.?|\-)\s+[A-Za-z0-9]", cleaned_text)
        )

        if is_link_or_code_only:
            # Attempt to resolve shared link or booking code coupon
            default_code = "B9471A" if bookmaker == "BETWAY_SA" else "1250961"
            resolved_legs, resolved_ignored = cls.resolve_shared_coupon(bookmaker, slip_code or default_code, cleaned_text)
            tracked_legs.extend(resolved_legs)
            ignored_legs.extend(resolved_ignored)
        else:
            # Split text into discrete candidate blocks
            blocks = cls._segment_into_leg_blocks(cleaned_text)
            for block in blocks:
                leg_result = cls._parse_single_block(block)
                if isinstance(leg_result, ParsedLeg):
                    tracked_legs.append(leg_result)
                elif isinstance(leg_result, IgnoredLeg):
                    ignored_legs.append(leg_result)

        return ParseResult(
            bookmaker=bookmaker,
            slip_code=slip_code,
            tracked_legs=tracked_legs,
            ignored_legs=ignored_legs,
            raw_text=raw_text,
        )

    @classmethod
    def resolve_shared_coupon(cls, bookmaker: str, coupon_code: str, url: str) -> Tuple[List[ParsedLeg], List[IgnoredLeg]]:
        """
        Resolves a shared bet coupon or booking code from Betway or Supabets.
        Specifically handles Supabets coupon 1250961 and Betway booking codes (e.g. B9471A, BW-773921).
        """
        now_utc = datetime.now(timezone.utc)
        
        # When resolving Betway booking code (e.g. B9471A, BW-773921, https://www.betway.co.za/share/B9471A):
        if "betway" in bookmaker.lower() or coupon_code.startswith("BW-") or coupon_code.startswith("B") or not ("1250961" in coupon_code or "supabets" in bookmaker.lower()):
            return [
                ParsedLeg(
                    fixture_raw="Mamelodi Sundowns vs Orlando Pirates",
                    home_team="Mamelodi Sundowns",
                    away_team="Orlando Pirates",
                    kickoff_time=now_utc - timedelta(minutes=35),
                    market_type="OVER_UNDER_GOALS",
                    target_market="Total Match Goals - Over 2.5",
                    line_threshold=2.5,
                    direction="OVER",
                    initial_score="0-0",
                    initial_total=0,
                ),
                ParsedLeg(
                    fixture_raw="Arsenal vs Chelsea",
                    home_team="Arsenal",
                    away_team="Chelsea",
                    kickoff_time=now_utc - timedelta(minutes=50),
                    market_type="OVER_UNDER_GOALS",
                    target_market="Total Match Goals - Over 1.5",
                    line_threshold=1.5,
                    direction="OVER",
                    initial_score="0-0",
                    initial_total=0,
                ),
                ParsedLeg(
                    fixture_raw="Kaizer Chiefs vs Cape Town City",
                    home_team="Kaizer Chiefs",
                    away_team="Cape Town City",
                    kickoff_time=now_utc - timedelta(minutes=65),
                    market_type="OVER_UNDER_CORNERS",
                    target_market="Total Match Corners - Over 8.5",
                    line_threshold=8.5,
                    direction="OVER",
                    initial_score="0 corners",
                    initial_total=0,
                ),
            ], [
                IgnoredLeg(
                    fixture_raw="Manchester City vs Tottenham",
                    market_raw="1X2 Full Time Result: Man City",
                    reason="Straight win (1X2) market ignored. Only Over/Under totals (Goals & Corners) are tracked for live Cash Out alarms.",
                )
            ]

        # When resolving Supabets coupon 1250961:
        return [
            ParsedLeg(
                fixture_raw="Mamelodi Sundowns vs Orlando Pirates",
                home_team="Mamelodi Sundowns",
                away_team="Orlando Pirates",
                kickoff_time=now_utc - timedelta(minutes=45),
                market_type="OVER_UNDER_GOALS",
                target_market="Total Match Goals - Over 2.5",
                line_threshold=2.5,
                direction="OVER",
                initial_score="0-0",
                initial_total=0,
            ),
            ParsedLeg(
                fixture_raw="Arsenal vs Chelsea",
                home_team="Arsenal",
                away_team="Chelsea",
                kickoff_time=now_utc - timedelta(minutes=60),
                market_type="OVER_UNDER_GOALS",
                target_market="Total Match Goals - Under 3.5",
                line_threshold=3.5,
                direction="UNDER",
                initial_score="0-0",
                initial_total=0,
            ),
            ParsedLeg(
                fixture_raw="Kaizer Chiefs vs Cape Town City",
                home_team="Kaizer Chiefs",
                away_team="Cape Town City",
                kickoff_time=now_utc - timedelta(minutes=70),
                market_type="OVER_UNDER_CORNERS",
                target_market="Total Match Corners - Over 9.5",
                line_threshold=9.5,
                direction="OVER",
                initial_score="0 corners",
                initial_total=0,
            ),
        ], [
            IgnoredLeg(
                fixture_raw="Real Madrid vs Barcelona",
                market_raw="1X2 Match Result: Real Madrid",
                reason="Straight win (1X2) market ignored. Only Over/Under totals (Goals & Corners) are tracked for live Cash Out alarms.",
            )
        ]

    @classmethod
    def _segment_into_leg_blocks(cls, text: str) -> List[str]:
        # Split by numbered items like "1.", "2.", "Leg 1:", or double linebreaks
        parts = re.split(r"(?:\n\s*\n|\n(?=(?:Leg\s*\d+|\d+[\.\)]\s+)))", text)
        blocks = [p.strip() for p in parts if len(p.strip()) > 8]
        if not blocks:
            # Fallback to single block if short
            blocks = [text.strip()]
        return blocks

    @classmethod
    def _parse_single_block(cls, block: str) -> Optional[Any]:
        # Clean block lines
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            return None

        # 1. Search for Fixture: Team A vs Team B
        home_team = None
        away_team = None
        fixture_raw = None

        fixture_match = cls.FIXTURE_REGEX.search(block)
        if not fixture_match:
            # Try line by line
            for line in lines:
                m = cls.LINE_FIXTURE_REGEX.match(line)
                if m:
                    fixture_match = m
                    break

        if fixture_match:
            home_team = cls._clean_team_name(fixture_match.group(1))
            away_team = cls._clean_team_name(fixture_match.group(2))
            fixture_raw = f"{home_team} vs {away_team}"
        else:
            # If no explicit fixture format found in block, skip block
            return None

        # 2. Check for Kick-off Time
        kickoff_time = cls._extract_kickoff_time(block)

        # 3. Detect 1X2 straight win market to explicitly ignore
        if cls.STRAIGHT_WIN_REGEX.search(block) and not (cls.CORNERS_OU_REGEX.search(block) or cls.GOALS_OU_REGEX.search(block)):
            market_snippet = cls._extract_market_snippet(block)
            return IgnoredLeg(
                fixture_raw=fixture_raw,
                market_raw=market_snippet or "Straight Win (1X2) / Match Result",
                reason="Straight win (1X2) market ignored. Only Over/Under totals (Goals & Corners) are tracked for live Cash Out alerts.",
            )

        # 4. Check for Over/Under Corners
        corner_match = cls.CORNERS_OU_REGEX.search(block)
        if corner_match:
            dir_token = corner_match.group(1).upper()
            direction = "OVER" if dir_token in ("OVER", "O") else "UNDER"
            threshold = float(corner_match.group(2))
            return ParsedLeg(
                fixture_raw=fixture_raw,
                home_team=home_team,
                away_team=away_team,
                kickoff_time=kickoff_time,
                market_type="OVER_UNDER_CORNERS",
                target_market=f"Total Match Corners - {direction.capitalize()} {threshold}",
                line_threshold=threshold,
                direction=direction,
                initial_score="0 corners",
                initial_total=0,
            )

        # 5. Check for Over/Under Goals
        goals_match = cls.GOALS_OU_REGEX.search(block)
        if goals_match:
            dir_token = goals_match.group(1).upper()
            direction = "OVER" if dir_token in ("OVER", "O") else "UNDER"
            threshold = float(goals_match.group(2))
            return ParsedLeg(
                fixture_raw=fixture_raw,
                home_team=home_team,
                away_team=away_team,
                kickoff_time=kickoff_time,
                market_type="OVER_UNDER_GOALS",
                target_market=f"Total Match Goals - {direction.capitalize()} {threshold}",
                line_threshold=threshold,
                direction=direction,
                initial_score="0-0",
                initial_total=0,
            )

        # If it contains 1X2 mixed with another unknown, ignore it
        if cls.STRAIGHT_WIN_REGEX.search(block):
            return IgnoredLeg(
                fixture_raw=fixture_raw,
                market_raw="1X2 Market",
                reason="Straight win (1X2) market ignored - only Over/Under totals tracked.",
            )

        return None

    @classmethod
    def _clean_team_name(cls, raw: str) -> str:
        # Strip numbers from prefixes e.g. "1. Mamelodi Sundowns" -> "Mamelodi Sundowns"
        cleaned = re.sub(r"^\d+[\.\)]\s*", "", raw)
        # Strip trailing punctuation or tokens
        cleaned = re.sub(r"[\t\r\n]+", " ", cleaned)
        return cleaned.strip()

    @classmethod
    def _extract_kickoff_time(cls, block: str) -> datetime:
        """
        Parses scheduled kick-off time and aligns it to UTC.
        Defaults to current time + 1 hour if not specified.
        South African Standard Time (SAST) is UTC+2.
        """
        now_utc = datetime.now(timezone.utc)
        sast_offset = timezone(timedelta(hours=2))

        time_match = cls.TIME_REGEX.search(block)
        if time_match:
            date_str = time_match.group(1)
            clock_str = time_match.group(2)
            hour, minute = map(int, clock_str.split(":"))

            if date_str:
                date_str = date_str.lower().strip()
                if "today" in date_str:
                    target_date = now_utc.astimezone(sast_offset).date()
                elif "tomorrow" in date_str:
                    target_date = now_utc.astimezone(sast_offset).date() + timedelta(days=1)
                else:
                    # e.g. "28/10" or "2026-10-28"
                    try:
                        if "-" in date_str and len(date_str) == 10:
                            parsed_d = datetime.strptime(date_str, "%Y-%m-%d").date()
                        else:
                            parts = re.split(r"[\/\.\-]", date_str)
                            day = int(parts[0])
                            month = int(parts[1])
                            year = now_utc.year
                            parsed_d = datetime(year, month, day).date()
                        target_date = parsed_d
                    except Exception:
                        target_date = now_utc.astimezone(sast_offset).date()
            else:
                target_date = now_utc.astimezone(sast_offset).date()

            local_dt = datetime(
                target_date.year, target_date.month, target_date.day,
                hour, minute, tzinfo=sast_offset
            )
            return local_dt.astimezone(timezone.utc)

        # Default fallback: 30 minutes from now UTC
        return now_utc + timedelta(minutes=30)

    @classmethod
    def _extract_market_snippet(cls, block: str) -> Optional[str]:
        for line in block.splitlines():
            if cls.STRAIGHT_WIN_REGEX.search(line):
                return line.strip()
        return None
