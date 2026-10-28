export type Bookmaker = 'BETWAY_SA' | 'SUPABETS_SA' | 'GENERIC_SA';
export type MarketCategory = 'OVER_UNDER_GOALS' | 'OVER_UNDER_CORNERS' | 'UNSUPPORTED_1X2';
export type LegStatus = 'PENDING' | 'LIVE' | 'CASH_OUT_RECOMMENDED' | 'WON' | 'LOST' | 'VOID';
export type ParlayStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CASHED_OUT';

export interface ParsedLeg {
  id: string;
  fixtureRaw: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  marketType: MarketCategory;
  targetMarket: string;
  lineThreshold: number;
  direction: 'OVER' | 'UNDER';
  initialScore: string;
  initialTotal: number;
  odds?: number;
}

export interface IgnoredLeg {
  fixtureRaw: string;
  marketRaw: string;
  reason: string;
}

export interface ParseResult {
  bookmaker: Bookmaker;
  slipCode?: string;
  trackedLegs: ParsedLeg[];
  ignoredLegs: IgnoredLeg[];
  rawText: string;
}

export interface ParlaySlip {
  id: string;
  telegramChatId: number;
  bookmaker: Bookmaker;
  slipReference?: string;
  rawInput: string;
  totalLegs: number;
  activeLegsCount: number;
  status: ParlayStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SlipLeg {
  id: string;
  slipId: string;
  telegramChatId: number;
  bookmaker: Bookmaker;
  fixtureRaw: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  marketType: MarketCategory;
  targetMarket: string;
  lineThreshold: number;
  direction: 'OVER' | 'UNDER';
  lastKnownScore: string;
  lastKnownTotal: number;
  currentMatchMinute: string;
  status: LegStatus;
  apiFixtureId?: string;
  lastPolledAt?: string;
  lastAlarmDispatchedAt?: string;
}

export interface AlarmLog {
  id: string;
  legId: string;
  slipId: string;
  telegramChatId: number;
  eventType: 'GOAL_ALERT' | 'CORNER_ALERT';
  previousScore: string;
  newScore: string;
  currentMinute: string;
  dispatchedMessage: string;
  telegramMessageId?: number;
  dispatchedAt: string;
}

export interface LiveMatchSimulation {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  homeCorners: number;
  awayCorners: number;
  elapsedMinute: number;
  status: '1H' | '2H' | 'HT' | 'FT';
  isLive: boolean;
}

export type SportType =
  | 'Football (EPL)'
  | 'Football (PSL)'
  | 'Basketball (NBA)'
  | 'Tennis (ATP/WTA)'
  | 'Other';

export type SlipCategory = 'SINGLE_STRAIGHT' | 'CONSERVATIVE_PARLAY';

export type LedgerBetStatus = 'PENDING' | 'WON' | 'LOST' | 'CASHED_OUT' | 'VOID';

export interface StrategyCandidateLeg {
  id: string;
  fixture: string;
  sport: SportType;
  league: string;
  market: string;
  odds: number;
  isBoughtDown?: boolean;
  buyDownAmount?: string;
  isTopSeed?: boolean;
  strategyNote: string;
  isCompliant: boolean;
  violationReason?: string;
}

export interface LedgerBet {
  id: string;
  slipType: SlipCategory;
  sport: SportType;
  league: string;
  legs: StrategyCandidateLeg[];
  combinedOdds: number;
  stakeZar: number;
  potentialReturnZar: number;
  actualReturnZar: number;
  status: LedgerBetStatus;
  isRuleCompliant: boolean;
  complianceNotes?: string;
  createdAt: string;
  settledAt?: string;
}

export interface DailySummary {
  summaryDate: string;
  initialBankrollZar: number;
  closingBalanceZar: number;
  totalStakedZar: number;
  totalReturnsZar: number;
  netProfitLossZar: number;
  roiPercentage: number;
  settledCount: number;
  wonCount: number;
  lostCount: number;
  disciplineScore: string;
}

