import React, { useMemo, useState } from 'react';
import {
  DailySummary,
  LedgerBet,
  LedgerBetStatus,
  SlipCategory,
  SportType,
  StrategyCandidateLeg,
} from '../types';
import { buildTelegramSlipText, calculateModelOdds, decimalOdds } from '../lib/modelOdds';
import {
  AlertOctagon,
  AlertTriangle,
  Award,
  CheckCircle,
  Clock,
  DollarSign,
  Filter,
  Flame,
  HelpCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';

// Pre-seeded strategy candidates matching the 4 Target Leagues & Low-Risk Criteria
const CANDIDATE_FIXTURES: StrategyCandidateLeg[] = [
  // 1. English Premier League (EPL)
  {
    id: 'epl-1',
    fixture: 'Arsenal vs Manchester City',
    sport: 'Football (EPL)',
    league: 'English Premier League',
    market: 'Total Match Goals - Over 1.5',
    odds: 1.44,
    strategyNote: 'EPL Attacking Focus: High-percentage Over 1.5 Goals for intense attacking clash.',
    isCompliant: true,
  },
  {
    id: 'epl-2',
    fixture: 'Liverpool vs Chelsea',
    sport: 'Football (EPL)',
    league: 'English Premier League',
    market: 'Total Match Corners - Over 7.5',
    odds: 1.42,
    strategyNote: 'EPL Intensity Focus: Over 7.5 Corners supported by wide-channel pressing statistics.',
    isCompliant: true,
  },

  // 2. SA Premier Soccer League (PSL)
  {
    id: 'psl-1',
    fixture: 'Mamelodi Sundowns vs Orlando Pirates',
    sport: 'Football (PSL)',
    league: 'SA Premier Soccer League',
    market: 'Total Match Goals - Under 2.5',
    odds: 1.48,
    strategyNote: 'PSL Defensive Focus: Tight derby structure, low xG conceded trend.',
    isCompliant: true,
  },
  {
    id: 'psl-2',
    fixture: 'Kaizer Chiefs vs Cape Town City',
    sport: 'Football (PSL)',
    league: 'SA Premier Soccer League',
    market: 'Total Match Goals - Under 3.5',
    odds: 1.40,
    strategyNote: 'PSL Safety Buffer: Under 3.5 cushions against tactical deadlock.',
    isCompliant: true,
  },

  // 3. NBA Basketball
  {
    id: 'nba-1',
    fixture: 'Boston Celtics vs Miami Heat',
    sport: 'Basketball (NBA)',
    league: 'NBA Basketball',
    market: 'Boston Celtics Team Total - Over 106.5',
    odds: 1.45,
    isBoughtDown: true,
    buyDownAmount: '8 points (bought down from 114.5)',
    strategyNote: 'NBA Buying-Down Focus: Bought down by 8 points to eliminate variance.',
    isCompliant: true,
  },
  {
    id: 'nba-2',
    fixture: 'Denver Nuggets vs LA Lakers',
    sport: 'Basketball (NBA)',
    league: 'NBA Basketball',
    market: 'Denver Nuggets 1st Half Spread (+3.5)',
    odds: 1.46,
    strategyNote: 'NBA 1st Half Focus: Predictable starter rotation cushion in opening half.',
    isCompliant: true,
  },

  // 4. Tennis (Grand Slams / ATP & WTA 1000s)
  {
    id: 'ten-1',
    fixture: 'Carlos Alcaraz vs Tallon Griekspoor',
    sport: 'Tennis (ATP/WTA)',
    league: 'ATP Grand Slam',
    market: 'Carlos Alcaraz +1.5 Set Handicap (To Win a Set)',
    odds: 1.42,
    isTopSeed: true,
    strategyNote: 'Tennis Anchor Focus: Top-seed early round set security eliminates straight-set upset.',
    isCompliant: true,
  },
  {
    id: 'ten-2',
    fixture: 'Iga Swiatek vs Jelena Ostapenko',
    sport: 'Tennis (ATP/WTA)',
    league: 'WTA 1000',
    market: 'Iga Swiatek +1.5 Set Handicap (To Win a Set)',
    odds: 1.45,
    isTopSeed: true,
    strategyNote: 'Tennis Anchor Focus: Elite world seed +1.5 set cushion in round of 16.',
    isCompliant: true,
  },

  // Rejected / Non-Compliant Examples (to showcase active automated filtering)
  {
    id: 'rej-1',
    fixture: 'Manchester United vs Everton',
    sport: 'Football (EPL)',
    league: 'English Premier League',
    market: 'Full Time Result: Manchester United (1X2)',
    odds: 2.15,
    strategyNote: 'Rejected: Straight win (1X2) market violates low-risk criteria.',
    isCompliant: false,
    violationReason: 'High-variance straight win (1X2) market rejected by EPL filter.',
  },
  {
    id: 'rej-2',
    fixture: 'Golden State vs Phoenix Suns',
    sport: 'Basketball (NBA)',
    league: 'NBA Basketball',
    market: 'Game Total Points - Over 235.5',
    odds: 1.91,
    isBoughtDown: false,
    strategyNote: 'Rejected: Standard market not bought down by 6-8 points.',
    isCompliant: false,
    violationReason: 'Violates NBA rule: Alternative team totals must buy down lines by 6-8 points.',
  },
];

// Initial seeded ledger bets
const INITIAL_LEDGER_BETS: LedgerBet[] = [
  {
    id: 'bet-101',
    slipType: 'SINGLE_STRAIGHT',
    sport: 'Football (EPL)',
    league: 'English Premier League',
    legs: [CANDIDATE_FIXTURES[0]],
    combinedOdds: 1.44,
    stakeZar: 2.0,
    potentialReturnZar: 2.88,
    actualReturnZar: 2.88,
    status: 'WON',
    isRuleCompliant: true,
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    settledAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 'bet-102',
    slipType: 'SINGLE_STRAIGHT',
    sport: 'Football (PSL)',
    league: 'SA Premier Soccer League',
    legs: [CANDIDATE_FIXTURES[2]],
    combinedOdds: 1.48,
    stakeZar: 2.0,
    potentialReturnZar: 2.96,
    actualReturnZar: 2.96,
    status: 'WON',
    isRuleCompliant: true,
    createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    settledAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: 'bet-103',
    slipType: 'CONSERVATIVE_PARLAY',
    sport: 'Basketball (NBA)',
    league: 'Multi-League',
    legs: [CANDIDATE_FIXTURES[4], CANDIDATE_FIXTURES[6]], // NBA + Tennis
    combinedOdds: 2.06,
    stakeZar: 2.0,
    potentialReturnZar: 4.12,
    actualReturnZar: 4.12,
    status: 'WON',
    isRuleCompliant: true,
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    settledAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
  },
  {
    id: 'bet-104',
    slipType: 'SINGLE_STRAIGHT',
    sport: 'Tennis (ATP/WTA)',
    league: 'ATP Grand Slam',
    legs: [CANDIDATE_FIXTURES[6]],
    combinedOdds: 1.42,
    stakeZar: 2.0,
    potentialReturnZar: 2.84,
    actualReturnZar: 0.0,
    status: 'PENDING',
    isRuleCompliant: true,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
];

export const LowRiskLedgerView: React.FC = () => {
  const [initialBankroll, setInitialBankroll] = useState<number>(500.0);
  const [bets, setBets] = useState<LedgerBet[]>(INITIAL_LEDGER_BETS);
  const [selectedSportFilter, setSelectedSportFilter] = useState<string>('ALL');

  // Slip Builder State
  const [slipType, setSlipType] = useState<SlipCategory>('SINGLE_STRAIGHT');
  const [stagedLegs, setStagedLegs] = useState<StrategyCandidateLeg[]>([CANDIDATE_FIXTURES[1]]);
  const [inputStake, setInputStake] = useState<number>(2.0);
  const [stakeWarning, setStakeWarning] = useState<string | null>(null);
  const [legWarning, setLegWarning] = useState<string | null>(null);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);

  // Model-driven odds builder for custom bookmaker-style fair prices
  const [modelFixture, setModelFixture] = useState<string>('Arsenal vs Chelsea');
  const [modelLeague, setModelLeague] = useState<'Football (EPL)' | 'Football (PSL)' | 'Basketball (NBA)' | 'Tennis (ATP/WTA)'>('Football (EPL)');
  const [modelMarket, setModelMarket] = useState<'HOME_WIN' | 'DRAW' | 'AWAY_WIN' | 'OVER_2_5' | 'UNDER_2_5'>('OVER_2_5');
  const [homeStrength, setHomeStrength] = useState<number>(72);
  const [awayStrength, setAwayStrength] = useState<number>(64);
  const [homeForm, setHomeForm] = useState<number>(71);
  const [awayForm, setAwayForm] = useState<number>(58);
  const [homeAttack, setHomeAttack] = useState<number>(79);
  const [awayAttack, setAwayAttack] = useState<number>(63);
  const [homeDefense, setHomeDefense] = useState<number>(68);
  const [awayDefense, setAwayDefense] = useState<number>(72);
  const [homeAdvantage, setHomeAdvantage] = useState<number>(12);

  const modelProjection = useMemo(
    () =>
      calculateModelOdds({
        homeStrength,
        awayStrength,
        homeForm,
        awayForm,
        homeAttack,
        awayAttack,
        homeDefense,
        awayDefense,
        homeAdvantage,
      }),
    [awayAttack, awayDefense, awayForm, awayStrength, homeAdvantage, homeAttack, homeDefense, homeForm, homeStrength]
  );

  const modelOdds =
    modelMarket === 'HOME_WIN'
      ? modelProjection.bookmakerOdds.home
      : modelMarket === 'DRAW'
      ? modelProjection.bookmakerOdds.draw
      : modelMarket === 'AWAY_WIN'
      ? modelProjection.bookmakerOdds.away
      : modelMarket === 'UNDER_2_5'
      ? modelProjection.bookmakerOdds.under2_5
      : modelProjection.bookmakerOdds.over2_5;

  const modelMarketLabel =
    modelMarket === 'HOME_WIN'
      ? 'Home Win'
      : modelMarket === 'DRAW'
      ? 'Draw'
      : modelMarket === 'AWAY_WIN'
      ? 'Away Win'
      : modelMarket === 'UNDER_2_5'
      ? 'Under 2.5 Goals'
      : 'Over 2.5 Goals';

  // Derived Running Bankroll Metrics
  const settledBets = bets.filter((b) => b.status !== 'PENDING');
  const totalStakedOnSettled = settledBets.reduce((acc, b) => acc + b.stakeZar, 0);
  const totalReturns = settledBets.reduce((acc, b) => acc + b.actualReturnZar, 0);
  const netProfitLoss = Math.round((totalReturns - totalStakedOnSettled) * 100) / 100;
  const currentBalance = Math.round((initialBankroll + netProfitLoss) * 100) / 100;
  const roiPercentage =
    totalStakedOnSettled > 0
      ? Math.round((netProfitLoss / totalStakedOnSettled) * 1000) / 10
      : 0.0;
  const wonCount = settledBets.filter((b) => b.status === 'WON').length;
  const winRate =
    settledBets.length > 0 ? Math.round((wonCount / settledBets.length) * 1000) / 10 : 0.0;

  // Validate Stake against Strict R2 Constraint
  const handleStakeChange = (val: number) => {
    setInputStake(val);
    if (slipType === 'SINGLE_STRAIGHT') {
      if (val !== 2.0) {
        setStakeWarning(
          `Responsible Gaming Violation: Single straight bets must be staked strictly at R2.00 (Attempted: R${val.toFixed(
            2
          )}). Over-staking is blocked.`
        );
      } else {
        setStakeWarning(null);
      }
    } else {
      if (val > 2.0) {
        setStakeWarning(
          `Responsible Gaming Violation: Conservative parlay stake exceeds minimum platform baseline of R2.00.`
        );
      } else {
        setStakeWarning(null);
      }
    }
  };

  // Switch slip type
  const handleSelectSlipType = (type: SlipCategory) => {
    setSlipType(type);
    if (type === 'SINGLE_STRAIGHT') {
      setInputStake(2.0);
      setStakeWarning(null);
      if (stagedLegs.length > 1) {
        setStagedLegs([stagedLegs[0]]);
      }
    } else {
      setInputStake(2.0);
      setStakeWarning(null);
    }
  };

  // Add fixture to staged legs
  const handleAddLeg = (candidate: StrategyCandidateLeg) => {
    if (!candidate.isCompliant) return;

    if (slipType === 'SINGLE_STRAIGHT') {
      setStagedLegs([candidate]);
      setLegWarning(null);
    } else {
      if (stagedLegs.some((l) => l.id === candidate.id)) return;
      if (stagedLegs.length >= 3) {
        setLegWarning(
          'Responsible Gaming Violation: Conservative Parlays are capped at a maximum of 3 legs to prevent variance runaway.'
        );
        setTimeout(() => setLegWarning(null), 4000);
        return;
      }
      setStagedLegs([...stagedLegs, candidate]);
      setLegWarning(null);
    }
  };

  const handleGenerateModelLeg = () => {
    const candidate: StrategyCandidateLeg = {
      id: `model-${Date.now()}`,
      fixture: modelFixture,
      sport: modelLeague,
      league: modelLeague === 'Football (EPL)' ? 'English Premier League' : modelLeague === 'Football (PSL)' ? 'SA Premier Soccer League' : modelLeague === 'Basketball (NBA)' ? 'NBA Basketball' : 'ATP/WTA',
      market: modelMarket === 'OVER_2_5' ? 'Total Match Goals - Over 2.5' : modelMarket === 'UNDER_2_5' ? 'Total Match Goals - Under 2.5' : modelMarket === 'HOME_WIN' ? 'Match Result - Home Win' : modelMarket === 'DRAW' ? 'Match Result - Draw' : 'Match Result - Away Win',
      odds: Number(modelOdds.toFixed(2)),
      strategyNote: `Model-driven fair odds from expected goals engine: ${modelProjection.expectedGoals.home} xG home / ${modelProjection.expectedGoals.away} xG away (${modelMarketLabel})`,
      isCompliant: true,
    };

    handleAddLeg(candidate);
    setStakeWarning(null);
    setLegWarning(null);
  };

  const handleRemoveLeg = (legId: string) => {
    setStagedLegs(stagedLegs.filter((l) => l.id !== legId));
  };

  // Submit bet to ledger
  const handleLogBetToLedger = () => {
    if (stagedLegs.length === 0) return;

    // Check single bet constraints
    if (slipType === 'SINGLE_STRAIGHT') {
      if (stagedLegs.length !== 1) {
        setLegWarning('Single straight bet must contain exactly 1 leg.');
        return;
      }
      if (inputStake !== 2.0) {
        setStakeWarning('Strict Strategy Violation: Single straight bets must be staked at R2.00.');
        return;
      }
      const odds = stagedLegs[0].odds;
      if (odds < 1.4 || odds > 1.5) {
        setLegWarning(
          `Odds (${odds.toFixed(2)}) fall outside target conservative odds range [1.40 - 1.50].`
        );
        return;
      }
    } else {
      // Parlay checks
      if (stagedLegs.length < 2 || stagedLegs.length > 3) {
        setLegWarning('Conservative parlays must contain exactly 2 or 3 legs.');
        return;
      }
      if (inputStake > 2.0) {
        setStakeWarning('Parlay stake cannot exceed platform baseline of R2.00.');
        return;
      }
    }

    let combinedOdds = 1.0;
    stagedLegs.forEach((l) => (combinedOdds *= l.odds));
    combinedOdds = Math.round(combinedOdds * 100) / 100;

    const newBet: LedgerBet = {
      id: `bet-${Date.now().toString().slice(-4)}`,
      slipType,
      sport: stagedLegs[0].sport,
      league: stagedLegs.length === 1 ? stagedLegs[0].league : 'Multi-League',
      legs: [...stagedLegs],
      combinedOdds,
      stakeZar: inputStake,
      potentialReturnZar: Math.round(inputStake * combinedOdds * 100) / 100,
      actualReturnZar: 0.0,
      status: 'PENDING',
      isRuleCompliant: true,
      createdAt: new Date().toISOString(),
    };

    setBets([newBet, ...bets]);
    setStagedLegs([]);
    setStakeWarning(null);
    setLegWarning(null);
  };

  // Quick Bet Settlement
  const handleSettle = (betId: string, status: LedgerBetStatus, customCashout?: number) => {
    setBets(
      bets.map((b) => {
        if (b.id !== betId) return b;
        let actual = 0.0;
        if (status === 'WON') actual = b.potentialReturnZar;
        else if (status === 'LOST') actual = 0.0;
        else if (status === 'CASHED_OUT') actual = customCashout || b.stakeZar * 1.25;
        else if (status === 'VOID') actual = b.stakeZar;

        return {
          ...b,
          status,
          actualReturnZar: Math.round(actual * 100) / 100,
          settledAt: new Date().toISOString(),
        };
      })
    );
  };

  // Generate Daily Performance Summary
  const handleGenerateDailySummary = () => {
    const todaySettled = bets.filter((b) => b.status !== 'PENDING');
    const staked = todaySettled.reduce((acc, b) => acc + b.stakeZar, 0);
    const rets = todaySettled.reduce((acc, b) => acc + b.actualReturnZar, 0);
    const net = Math.round((rets - staked) * 100) / 100;
    const roi = staked > 0 ? Math.round((net / staked) * 1000) / 10 : 0.0;

    setDailySummary({
      summaryDate: new Date().toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      initialBankrollZar: initialBankroll,
      closingBalanceZar: currentBalance,
      totalStakedZar: Math.round(staked * 100) / 100,
      totalReturnsZar: Math.round(rets * 100) / 100,
      netProfitLossZar: net,
      roiPercentage: roi,
      settledCount: todaySettled.length,
      wonCount: todaySettled.filter((b) => b.status === 'WON').length,
      lostCount: todaySettled.filter((b) => b.status === 'LOST').length,
      disciplineScore: '100% (Strict R2 Unit Stake Maintained, Max 3 Legs Enforced)',
    });
  };

  const filteredCandidates =
    selectedSportFilter === 'ALL'
      ? CANDIDATE_FIXTURES
      : CANDIDATE_FIXTURES.filter((c) => c.sport === selectedSportFilter);

  return (
    <div className="space-y-8">
      {/* 1. Strategy Directive & Compliance Banner */}
      <div className="border border-zinc-800 bg-zinc-900/60 rounded-xl p-6 sm:p-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-amber-400 font-mono">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>LOW-RISK HYBRID STRATEGY LEDGER</span>
              <span aria-hidden="true">·</span>
              <span>FIXED R2 UNIT STAKE</span>
              <span aria-hidden="true">·</span>
              <span>RESPONSIBLE GAMING GUARDRAILS</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Data-Driven Bankroll Ledger &amp; Low-Risk Filter
            </h1>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-800/40 text-amber-400 text-xs font-mono">
            <Award className="w-3.5 h-3.5" />
            <span>Discipline Score: 100% · Guardrails Active</span>
          </div>
        </div>

        {/* 4 League Rules Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-zinc-800 text-xs">
          <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/80">
            <div className="text-amber-400 font-semibold flex items-center justify-between">
              <span>EPL (Premier League)</span>
              <span className="text-[10px] text-zinc-500 font-mono">Attacking</span>
            </div>
            <div className="text-zinc-300 mt-1">Over 1.5 Goals · Over 7.5 Corners</div>
            <div className="text-zinc-500 text-[11px] mt-0.5">High-intensity attacking focus</div>
          </div>

          <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/80">
            <div className="text-amber-400 font-semibold flex items-center justify-between">
              <span>SA PSL</span>
              <span className="text-[10px] text-zinc-500 font-mono">Defensive</span>
            </div>
            <div className="text-zinc-300 mt-1">Under 2.5 · Under 3.5 Goals</div>
            <div className="text-zinc-500 text-[11px] mt-0.5">Tight, low-scoring tactical trends</div>
          </div>

          <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/80">
            <div className="text-amber-400 font-semibold flex items-center justify-between">
              <span>NBA Basketball</span>
              <span className="text-[10px] text-zinc-500 font-mono">Team Totals</span>
            </div>
            <div className="text-zinc-300 mt-1">Buy Down 6-8 Pts · 1st Half Spreads</div>
            <div className="text-zinc-500 text-[11px] mt-0.5">Alternative team total lines</div>
          </div>

          <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/80">
            <div className="text-amber-400 font-semibold flex items-center justify-between">
              <span>Tennis (ATP/WTA)</span>
              <span className="text-[10px] text-zinc-500 font-mono">Top Seed</span>
            </div>
            <div className="text-zinc-300 mt-1">To Win a Set (+1.5 Set Handicap)</div>
            <div className="text-zinc-500 text-[11px] mt-0.5">Early rounds seed protection</div>
          </div>
        </div>
      </div>

      {/* 2. Running Bankroll Ledger KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-4">
          <div className="text-zinc-500 text-xs font-mono">CURRENT BANKROLL</div>
          <div className="text-lg font-bold text-white font-mono mt-1 tabular-nums">
            R{currentBalance.toFixed(2)}
          </div>
          <div className="text-zinc-400 text-[11px] mt-0.5">Base: R{initialBankroll.toFixed(2)}</div>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-4">
          <div className="text-zinc-500 text-xs font-mono">TOTAL STAKED</div>
          <div className="text-lg font-bold text-zinc-200 font-mono mt-1 tabular-nums">
            R{totalStakedOnSettled.toFixed(2)}
          </div>
          <div className="text-zinc-400 text-[11px] mt-0.5">{settledBets.length} settled tickets</div>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-4">
          <div className="text-zinc-500 text-xs font-mono">TOTAL RETURNS</div>
          <div className="text-lg font-bold text-amber-400 font-mono mt-1 tabular-nums">
            R{totalReturns.toFixed(2)}
          </div>
          <div className="text-zinc-400 text-[11px] mt-0.5">Gross cash returns</div>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-4">
          <div className="text-zinc-500 text-xs font-mono">NET PROFIT / LOSS</div>
          <div
            className={`text-lg font-bold font-mono mt-1 tabular-nums ${
              netProfitLoss >= 0 ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {netProfitLoss >= 0 ? `+R${netProfitLoss.toFixed(2)}` : `-R${Math.abs(netProfitLoss).toFixed(2)}`}
          </div>
          <div className="text-zinc-400 text-[11px] mt-0.5">Net realized cash</div>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-4">
          <div className="text-zinc-500 text-xs font-mono">REALIZED ROI</div>
          <div
            className={`text-lg font-bold font-mono mt-1 tabular-nums ${
              roiPercentage >= 0 ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {roiPercentage >= 0 ? `+${roiPercentage.toFixed(1)}%` : `${roiPercentage.toFixed(1)}%`}
          </div>
          <div className="text-zinc-400 text-[11px] mt-0.5">Net P&amp;L / Staked</div>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-4">
          <div className="text-zinc-500 text-xs font-mono">WIN RATE</div>
          <div className="text-lg font-bold text-white font-mono mt-1 tabular-nums">
            {winRate.toFixed(1)}%
          </div>
          <div className="text-zinc-400 text-[11px] mt-0.5">
            {wonCount} won / {settledBets.length} settled
          </div>
        </div>
      </div>

      {/* 3. Own Odds Model Engine */}
      <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
            <Target className="w-4 h-4" />
            <span>MODEL-DRIVEN FAIR ODDS ENGINE</span>
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            Expected goals: {modelProjection.expectedGoals.home} xG / {modelProjection.expectedGoals.away} xG
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[11px] font-mono text-zinc-400">Fixture</label>
              <input
                value={modelFixture}
                onChange={(e) => setModelFixture(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-zinc-400">League</label>
              <select
                value={modelLeague}
                onChange={(e) => setModelLeague(e.target.value as 'Football (EPL)' | 'Football (PSL)' | 'Basketball (NBA)' | 'Tennis (ATP/WTA)')}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="Football (EPL)">Football (EPL)</option>
                <option value="Football (PSL)">Football (PSL)</option>
                <option value="Basketball (NBA)">Basketball (NBA)</option>
                <option value="Tennis (ATP/WTA)">Tennis (ATP/WTA)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-zinc-400">Home strength</label>
              <input type="range" min="40" max="95" value={homeStrength} onChange={(e) => setHomeStrength(Number(e.target.value))} className="w-full accent-amber-400" />
              <div className="text-[11px] text-zinc-500 font-mono">{homeStrength}</div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-zinc-400">Away strength</label>
              <input type="range" min="40" max="95" value={awayStrength} onChange={(e) => setAwayStrength(Number(e.target.value))} className="w-full accent-amber-400" />
              <div className="text-[11px] text-zinc-500 font-mono">{awayStrength}</div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-zinc-400">Home form</label>
              <input type="range" min="40" max="95" value={homeForm} onChange={(e) => setHomeForm(Number(e.target.value))} className="w-full accent-amber-400" />
              <div className="text-[11px] text-zinc-500 font-mono">{homeForm}</div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-zinc-400">Away form</label>
              <input type="range" min="40" max="95" value={awayForm} onChange={(e) => setAwayForm(Number(e.target.value))} className="w-full accent-amber-400" />
              <div className="text-[11px] text-zinc-500 font-mono">{awayForm}</div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-zinc-400">Home attack</label>
              <input type="range" min="40" max="95" value={homeAttack} onChange={(e) => setHomeAttack(Number(e.target.value))} className="w-full accent-amber-400" />
              <div className="text-[11px] text-zinc-500 font-mono">{homeAttack}</div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-zinc-400">Away attack</label>
              <input type="range" min="40" max="95" value={awayAttack} onChange={(e) => setAwayAttack(Number(e.target.value))} className="w-full accent-amber-400" />
              <div className="text-[11px] text-zinc-500 font-mono">{awayAttack}</div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-zinc-400">Home defence</label>
              <input type="range" min="40" max="95" value={homeDefense} onChange={(e) => setHomeDefense(Number(e.target.value))} className="w-full accent-amber-400" />
              <div className="text-[11px] text-zinc-500 font-mono">{homeDefense}</div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-zinc-400">Away defence</label>
              <input type="range" min="40" max="95" value={awayDefense} onChange={(e) => setAwayDefense(Number(e.target.value))} className="w-full accent-amber-400" />
              <div className="text-[11px] text-zinc-500 font-mono">{awayDefense}</div>
            </div>
          </div>

          <div className="border border-zinc-800 bg-zinc-950/70 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>Market</span>
              <span>Fair Odds</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                ['HOME_WIN', 'Home Win', modelProjection.bookmakerOdds.home],
                ['DRAW', 'Draw', modelProjection.bookmakerOdds.draw],
                ['AWAY_WIN', 'Away Win', modelProjection.bookmakerOdds.away],
                ['OVER_2_5', 'Over 2.5', modelProjection.bookmakerOdds.over2_5],
                ['UNDER_2_5', 'Under 2.5', modelProjection.bookmakerOdds.under2_5],
              ].map(([key, label, odds]) => (
                <button
                  key={key}
                  onClick={() => setModelMarket(key as 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' | 'OVER_2_5' | 'UNDER_2_5')}
                  className={`p-2 rounded-lg border text-left transition-colors ${
                    modelMarket === key
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-[10px] font-mono text-zinc-500">{label}</div>
                  <div className="mt-1 text-sm font-bold font-mono">{Number(odds).toFixed(2)}</div>
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-300">
              <div className="font-mono text-[10px] uppercase text-amber-400">Selected market</div>
              <div className="mt-1 font-semibold">{modelMarketLabel}</div>
              <div className="mt-1 text-zinc-300 font-mono">Fair price: {modelOdds.toFixed(2)}</div>
              <div className="mt-1 text-zinc-400">Probability: {(modelMarket === 'HOME_WIN' ? modelProjection.probabilities.home : modelMarket === 'DRAW' ? modelProjection.probabilities.draw : modelMarket === 'AWAY_WIN' ? modelProjection.probabilities.away : modelMarket === 'UNDER_2_5' ? modelProjection.probabilities.under2_5 : modelProjection.probabilities.over2_5).toFixed(3)}</div>
            </div>

            <button
              onClick={handleGenerateModelLeg}
              className="w-full bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold py-2.5 rounded-lg text-xs cursor-pointer transition-colors"
            >
              Add model leg to slip builder
            </button>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-[11px] text-zinc-300">
              <div className="font-mono text-zinc-500 uppercase">Telegram-ready summary</div>
              <div className="mt-2 whitespace-pre-line text-zinc-300">
                {buildTelegramSlipText(modelFixture, modelMarketLabel, modelOdds, inputStake)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Middle Section: Incoming Strategy Filter & Slip Builder with Guardrails */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Incoming Candidate Fixtures with Low-Risk Filter */}
        <div className="lg:col-span-7 space-y-4">
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-mono text-zinc-400">
                INCOMING MATCH FIXTURES &amp; STRATEGY FILTER
              </span>

              {/* Sport Filter Controls */}
              <div className="flex flex-wrap gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg text-xs">
                {['ALL', 'Football (EPL)', 'Football (PSL)', 'Basketball (NBA)', 'Tennis (ATP/WTA)'].map(
                  (sp) => (
                    <button
                      key={sp}
                      onClick={() => setSelectedSportFilter(sp)}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        selectedSportFilter === sp
                          ? 'bg-amber-400 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {sp === 'ALL' ? 'All Leagues' : sp.replace('Football ', '').replace('Basketball ', '')}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="space-y-3">
              {filteredCandidates.map((cand) => (
                <div
                  key={cand.id}
                  className={`p-3.5 rounded-lg border transition-all ${
                    cand.isCompliant
                      ? 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                      : 'bg-rose-950/20 border-rose-900/40 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 font-mono">{cand.sport}</span>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="text-xs font-semibold text-white">{cand.fixture}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-white font-mono tabular-nums">
                        @{cand.odds.toFixed(2)}
                      </span>

                      {cand.isCompliant ? (
                        <button
                          onClick={() => handleAddLeg(cand)}
                          className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-400/10 hover:bg-amber-400/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Leg</span>
                        </button>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] font-mono text-rose-400 bg-rose-950 border border-rose-800/40 rounded flex items-center gap-1">
                          <AlertOctagon className="w-3 h-3" />
                          <span>Filtered Out</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-zinc-300 font-mono">{cand.market}</span>
                    {cand.buyDownAmount && (
                      <span className="text-[11px] text-amber-400 font-mono">
                        {cand.buyDownAmount}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-[11px] text-zinc-500">
                    {cand.isCompliant ? cand.strategyNote : cand.violationReason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Slip Builder & Responsible Gaming Guardrails */}
        <div className="lg:col-span-5 space-y-4">
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400">SLIP BUILDER &amp; GUARDRAILS</span>
              <span className="text-xs text-amber-400 font-mono">
                {slipType === 'SINGLE_STRAIGHT' ? 'Fixed R2 Straight' : 'Conservative Parlay (2-3)'}
              </span>
            </div>

            {/* Slip Type Selector */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 border border-zinc-800 rounded-lg text-xs">
              <button
                onClick={() => handleSelectSlipType('SINGLE_STRAIGHT')}
                className={`py-1.5 font-semibold rounded transition-colors cursor-pointer ${
                  slipType === 'SINGLE_STRAIGHT'
                    ? 'bg-amber-400 text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Single Straight (R2)
              </button>
              <button
                onClick={() => handleSelectSlipType('CONSERVATIVE_PARLAY')}
                className={`py-1.5 font-semibold rounded transition-colors cursor-pointer ${
                  slipType === 'CONSERVATIVE_PARLAY'
                    ? 'bg-amber-400 text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Conservative Parlay (2-3)
              </button>
            </div>

            {/* Staged Legs Container */}
            <div className="space-y-2">
              <div className="text-xs text-zinc-400 font-mono flex items-center justify-between">
                <span>Selected Leg(s) ({stagedLegs.length})</span>
                {slipType === 'SINGLE_STRAIGHT' ? (
                  <span className="text-[11px] text-zinc-500">Target Odds: 1.40 - 1.50</span>
                ) : (
                  <span className="text-[11px] text-zinc-500">Max 3 Legs Allowed</span>
                )}
              </div>

              {stagedLegs.length === 0 ? (
                <div className="p-6 rounded-lg bg-zinc-950 border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
                  Select a compliant fixture from the left to stage.
                </div>
              ) : (
                stagedLegs.map((leg, idx) => (
                  <div
                    key={leg.id}
                    className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {idx + 1}. {leg.fixture}
                      </div>
                      <div className="text-zinc-400 text-[11px] font-mono">{leg.market}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-400 font-mono">
                        @{leg.odds.toFixed(2)}
                      </span>
                      <button
                        onClick={() => handleRemoveLeg(leg.id)}
                        className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Stake Input with Strict R2 Guardrail */}
            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-400">UNIT STAKE (ZAR):</span>
                <span className="text-amber-400 font-semibold">
                  {slipType === 'SINGLE_STRAIGHT' ? 'Fixed R2.00 Rule' : 'Baseline <= R2.00'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2 text-zinc-500 font-mono text-xs">R</span>
                  <input
                    type="number"
                    step="0.5"
                    value={inputStake}
                    onChange={(e) => handleStakeChange(parseFloat(e.target.value) || 0)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  onClick={() => handleStakeChange(2.0)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 rounded-lg cursor-pointer"
                >
                  Set R2.00
                </button>
              </div>

              {/* Responsible Gaming Warnings */}
              {stakeWarning && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-start gap-2 font-mono">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{stakeWarning}</span>
                </div>
              )}

              {legWarning && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-start gap-2 font-mono">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{legWarning}</span>
                </div>
              )}

              {/* Slip Payout Calculation */}
              {stagedLegs.length > 0 && (
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs font-mono space-y-1">
                  <div className="flex justify-between text-zinc-400">
                    <span>Combined Odds:</span>
                    <span className="text-white font-bold">
                      @
                      {stagedLegs
                        .reduce((acc, l) => acc * l.odds, 1)
                        .toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Potential Return:</span>
                    <span className="text-amber-400 font-bold">
                      R
                      {(
                        inputStake *
                        stagedLegs.reduce((acc, l) => acc * l.odds, 1)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={handleLogBetToLedger}
                disabled={Boolean(stakeWarning) || Boolean(legWarning) || stagedLegs.length === 0}
                className="w-full mt-2 py-2 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer shadow-sm shadow-amber-500/20"
              >
                Log Ticket to Running Bankroll Ledger
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Structured Ledger Table */}
      <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl overflow-hidden space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-white font-mono">
              STRUCTURED BETTING LEDGER
            </h2>
            <div className="text-xs text-zinc-500">
              Categorized by Sport, League, and Slip Type · Instant P&amp;L accounting
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateDailySummary}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer flex items-center gap-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Generate Daily Cycle Summary</span>
            </button>
          </div>
        </div>

        {/* Daily Summary Box (if generated) */}
        {dailySummary && (
          <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800/40 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-amber-400 font-bold">
              <span>DAILY PERFORMANCE SUMMARY ({dailySummary.summaryDate})</span>
              <span>{dailySummary.disciplineScore}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-zinc-300">
              <div>Settled: <strong className="text-white">{dailySummary.settledCount} tickets</strong></div>
              <div>Won / Lost: <strong className="text-emerald-400">{dailySummary.wonCount}W</strong> / <strong className="text-rose-400">{dailySummary.lostCount}L</strong></div>
              <div>Daily Net P&amp;L: <strong className="text-amber-400">+R{dailySummary.netProfitLossZar.toFixed(2)}</strong></div>
              <div>Daily ROI: <strong className="text-amber-400">+{dailySummary.roiPercentage.toFixed(1)}%</strong></div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="py-3 px-3">Ticket ID</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Sport &amp; League</th>
                <th className="py-3 px-3">Selections / Market</th>
                <th className="py-3 px-3 text-right">Odds</th>
                <th className="py-3 px-3 text-right">Stake</th>
                <th className="py-3 px-3 text-right">Return</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">Settlement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {bets.map((bet) => {
                let statusBadge = 'text-zinc-400';
                if (bet.status === 'WON') statusBadge = 'text-emerald-400 font-bold';
                else if (bet.status === 'LOST') statusBadge = 'text-rose-400 font-bold';
                else if (bet.status === 'CASHED_OUT') statusBadge = 'text-amber-400 font-bold';
                else if (bet.status === 'PENDING') statusBadge = 'text-sky-400';

                return (
                  <tr key={bet.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-3 text-zinc-400">{bet.id}</td>
                    <td className="py-3 px-3 text-zinc-200">
                      {bet.slipType === 'SINGLE_STRAIGHT' ? 'Straight (R2)' : `Parlay (${bet.legs.length}L)`}
                    </td>
                    <td className="py-3 px-3 text-zinc-400">
                      {bet.sport} · {bet.league}
                    </td>
                    <td className="py-3 px-3 text-zinc-200 max-w-xs">
                      {bet.legs.map((l, i) => (
                        <div key={i} className="truncate">
                          {l.fixture}: <span className="text-amber-300">{l.market}</span>
                        </div>
                      ))}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-white tabular-nums">
                      @{bet.combinedOdds.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right text-zinc-300 tabular-nums">
                      R{bet.stakeZar.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold tabular-nums text-zinc-100">
                      {bet.status === 'WON'
                        ? `R${bet.actualReturnZar.toFixed(2)}`
                        : bet.status === 'LOST'
                        ? 'R0.00'
                        : `(R${bet.potentialReturnZar.toFixed(2)})`}
                    </td>
                    <td className={`py-3 px-3 text-center ${statusBadge}`}>
                      {bet.status}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {bet.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSettle(bet.id, 'WON')}
                            className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 hover:bg-emerald-900 cursor-pointer"
                          >
                            Won
                          </button>
                          <button
                            onClick={() => handleSettle(bet.id, 'LOST')}
                            className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800/40 hover:bg-rose-900 cursor-pointer"
                          >
                            Lost
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">Settled</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
