import React, { useState, useEffect } from 'react';
import { AlarmLog, LiveMatchSimulation, SlipLeg } from '../types';
import {
  AlertCircle,
  Bell,
  Clock,
  ExternalLink,
  Flame,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

interface CronSimulatorProps {
  legs: SlipLeg[];
  alarmLogs: AlarmLog[];
  onUpdateLegScore: (
    legId: string,
    newScore: string,
    newTotal: number,
    minute: string,
    newStatus: any
  ) => void;
  onLogAlarm: (log: AlarmLog) => void;
  isAutoCronEnabled: boolean;
  onToggleAutoCron: () => void;
}

export const CronSimulator: React.FC<CronSimulatorProps> = ({
  legs,
  alarmLogs,
  onUpdateLegScore,
  onLogAlarm,
  isAutoCronEnabled,
  onToggleAutoCron,
}) => {
  // Live simulated match state for the 3 South African / Premier League fixtures
  const [liveMatches, setLiveMatches] = useState<LiveMatchSimulation[]>([
    {
      id: 'match-1',
      homeTeam: 'Mamelodi Sundowns',
      awayTeam: 'Orlando Pirates',
      homeGoals: 1,
      awayGoals: 0,
      homeCorners: 3,
      awayCorners: 2,
      elapsedMinute: 58,
      status: '2H',
      isLive: true,
    },
    {
      id: 'match-2',
      homeTeam: 'Kaizer Chiefs',
      awayTeam: 'Cape Town City',
      homeGoals: 0,
      awayGoals: 0,
      homeCorners: 5,
      awayCorners: 4,
      elapsedMinute: 73,
      status: '2H',
      isLive: true,
    },
    {
      id: 'match-3',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      homeGoals: 1,
      awayGoals: 1,
      homeCorners: 4,
      awayCorners: 3,
      elapsedMinute: 62,
      status: '2H',
      isLive: true,
    },
  ]);

  const [cronCountdown, setCronCountdown] = useState(60);
  const [lastCronRunTime, setLastCronRunTime] = useState<string | null>(null);
  const [lastDispatchedAlert, setLastDispatchedAlert] = useState<{
    text: string;
    chatId: number;
    timestamp: string;
    eventType: string;
  } | null>(null);

  // Auto 60s countdown
  useEffect(() => {
    if (!isAutoCronEnabled) return;
    const interval = setInterval(() => {
      setCronCountdown((prev) => {
        if (prev <= 1) {
          executeCronCycle();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isAutoCronEnabled, liveMatches, legs]);

  // Adjust score / corners of a match
  const modifyMatch = (
    matchId: string,
    field: 'homeGoals' | 'awayGoals' | 'homeCorners' | 'awayCorners' | 'elapsedMinute',
    delta: number
  ) => {
    setLiveMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        const currentVal = m[field] as number;
        const newVal = Math.max(0, currentVal + delta);
        return { ...m, [field]: newVal };
      })
    );
  };

  // The 60-Second Polling & Alarm Function logic
  const executeCronCycle = () => {
    const nowStr = new Date().toLocaleTimeString();
    setLastCronRunTime(nowStr);

    let alarmsTriggered = 0;

    // Filter legs where status is PENDING or LIVE
    const activeLegs = legs.filter((l) => l.status === 'PENDING' || l.status === 'LIVE' || l.status === 'CASH_OUT_RECOMMENDED');

    activeLegs.forEach((leg) => {
      // Find matching live match
      const match = liveMatches.find(
        (m) =>
          m.homeTeam.toLowerCase().includes(leg.homeTeam.toLowerCase()) ||
          leg.homeTeam.toLowerCase().includes(m.homeTeam.toLowerCase())
      );

      if (!match) return;

      const isGoalsMarket = leg.marketType === 'OVER_UNDER_GOALS';
      const currentScoreLine = `${match.homeGoals}-${match.awayGoals}`;
      const currentTotalGoals = match.homeGoals + match.awayGoals;

      const currentTotalCorners = match.homeCorners + match.awayCorners;
      const currentCornersDisplay = `${currentTotalCorners} corners (${match.homeCorners}-${match.awayCorners})`;

      let hasChanged = false;
      let eventType: 'GOAL_ALERT' | 'CORNER_ALERT' = 'GOAL_ALERT';
      let newScore = '';
      let newTotal = 0;

      if (isGoalsMarket) {
        if (currentScoreLine !== leg.lastKnownScore) {
          hasChanged = true;
          eventType = 'GOAL_ALERT';
          newScore = currentScoreLine;
          newTotal = currentTotalGoals;
        }
      } else {
        if (currentTotalCorners !== leg.lastKnownTotal) {
          hasChanged = true;
          eventType = 'CORNER_ALERT';
          newScore = currentCornersDisplay;
          newTotal = currentTotalCorners;
        }
      }

      if (hasChanged) {
        // Determine status
        let newStatus: any = 'LIVE';
        if (leg.direction === 'OVER' && newTotal > leg.lineThreshold) {
          newStatus = 'WON';
        } else if (leg.direction === 'UNDER' && newTotal > leg.lineThreshold) {
          newStatus = 'LOST';
        } else if (Math.abs(leg.lineThreshold - newTotal) <= 1.0) {
          newStatus = 'CASH_OUT_RECOMMENDED';
        }

        // 1. Update database record immediately
        onUpdateLegScore(
          leg.id,
          newScore,
          newTotal,
          `${match.elapsedMinute}'`,
          newStatus
        );

        // 2. Format Beautiful Telegram Markdown Message with Cash Out advice
        const alertMsg = buildTelegramAlarmMessage(
          leg,
          eventType,
          leg.lastKnownScore,
          newScore,
          match.elapsedMinute,
          newTotal,
          leg.lineThreshold,
          leg.direction,
          leg.bookmaker
        );

        // 3. Dispatch alert
        const alarmLogEntry: AlarmLog = {
          id: `alarm-${Date.now()}-${alarmsTriggered}`,
          legId: leg.id,
          slipId: leg.slipId,
          telegramChatId: leg.telegramChatId,
          eventType,
          previousScore: leg.lastKnownScore,
          newScore,
          currentMinute: `${match.elapsedMinute}'`,
          dispatchedMessage: alertMsg,
          telegramMessageId: Math.floor(100000 + Math.random() * 900000),
          dispatchedAt: new Date().toISOString(),
        };

        onLogAlarm(alarmLogEntry);

        setLastDispatchedAlert({
          text: alertMsg,
          chatId: leg.telegramChatId,
          timestamp: new Date().toLocaleTimeString(),
          eventType,
        });

        alarmsTriggered++;
      }
    });
  };

  const buildTelegramAlarmMessage = (
    leg: SlipLeg,
    eventType: 'GOAL_ALERT' | 'CORNER_ALERT',
    previousScore: string,
    newScore: string,
    minute: number,
    totalCount: number,
    targetThreshold: number,
    direction: 'OVER' | 'UNDER',
    bookmaker: string
  ): string => {
    const bookmakerName =
      bookmaker === 'BETWAY_SA'
        ? 'Betway'
        : bookmaker === 'SUPABETS_SA'
        ? 'Supabets'
        : 'Betway / Supabets';

    const header =
      eventType === 'GOAL_ALERT'
        ? `🚨 *GOAL ALERT* [${minute}'] 🚨`
        : `🚩 *CORNER ALERT* [${minute}'] 🚩`;

    let statusBadge = '';
    let cashOutAdvice = '';
    const diff = targetThreshold - totalCount;

    if (direction === 'OVER') {
      if (totalCount > targetThreshold) {
        statusBadge = '✅ *LEG WON! TARGET SURPASSED*';
        cashOutAdvice = `🔥 Your Over ${targetThreshold} leg has hit! Open ${bookmakerName} immediately to check if your parlay cash out offer is at maximum value or let remaining legs ride.`;
      } else if (diff <= 1.0) {
        statusBadge = '⚡ *CRUCIAL CASH-OUT WINDOW (1 Event Away)*';
        cashOutAdvice = `💰 You are only *${diff.toFixed(
          1
        )}* away from hitting your Over target! Your live Cash Out offer on ${bookmakerName} is surging. Check your slip now before momentum shifts!`;
      } else {
        statusBadge = '📈 *PROGRESS UPDATE*';
        cashOutAdvice = `📱 Evaluate your updated live slip odds and Cash Out value in the ${bookmakerName} app.`;
      }
    } else {
      if (totalCount > targetThreshold) {
        statusBadge = '❌ *LEG BUSTED (EXCEEDED UNDER THRESHOLD)*';
        cashOutAdvice = `⚠️ Target exceeded. Check if partial Cash Out is still available on ${bookmakerName}.`;
      } else if (targetThreshold - totalCount <= 1.0) {
        statusBadge = '⚠️ *HIGH VOLATILITY RISK*';
        cashOutAdvice = `🚨 Score is nearing your Under limit. Strongly consider taking your profits with Cash Out on ${bookmakerName} now!`;
      } else {
        statusBadge = '🛡️ *HOLDING STRONG*';
        cashOutAdvice = `📱 Favorable scoreline for your Under leg. Monitor ${bookmakerName} cash out offers as the clock winds down.`;
      }
    }

    return (
      `${header}\n\n` +
      `⚽ *Match:* \`${leg.fixtureRaw}\`\n` +
      `⏱️ *Match Minute:* \`${minute}'\`\n` +
      `📊 *Score:* \`${previousScore}\` ➔ *\`${newScore}\`*\n` +
      `🎯 *Tracked Leg:* \`${leg.targetMarket}\`\n` +
      `📈 *Live Tally:* \`${totalCount}\` / \`${targetThreshold}\` target (${direction})\n\n` +
      `${statusBadge}\n\n` +
      `💡 *Cash Out Recommendation (${bookmakerName}):*\n` +
      `${cashOutAdvice}\n\n` +
      `🔗 [Open ${bookmakerName} App](https://www.${
        bookmaker === 'BETWAY_SA' ? 'betway.co.za' : 'supabets.co.za'
      })`
    );
  };

  return (
    <div className="space-y-6">
      {/* 60s Cron Status Banner */}
      <div className="border border-zinc-800 bg-zinc-900/60 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-amber-400 font-semibold">
                COMPONENT B: 60-SECOND POLLING CRON
              </span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="text-xs text-zinc-400 font-mono">
                {isAutoCronEnabled ? 'Auto-Ticking' : 'Manual Mode'}
              </span>
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              Queries only PENDING legs where <code className="text-zinc-300 font-mono">kickoff_time &lt;= NOW()</code>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-zinc-500 font-mono">NEXT CRON CYCLE IN</div>
            <div className="text-base font-bold text-white font-mono">
              {isAutoCronEnabled ? `${cronCountdown}s` : 'Paused'}
            </div>
          </div>

          <button
            onClick={onToggleAutoCron}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              isAutoCronEnabled
                ? 'bg-amber-950/40 border-amber-700/50 text-amber-300 hover:bg-amber-900/40'
                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            {isAutoCronEnabled ? 'Pause Auto-Tick' : 'Enable 60s Auto'}
          </button>

          <button
            onClick={executeCronCycle}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer shadow-sm shadow-amber-500/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Poll Now</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Live Match Telemetry Controllers */}
        <div className="lg:col-span-7 space-y-4">
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400">
                LIVE SPORTS API FEED SIMULATOR (API-FOOTBALL)
              </span>
              <span className="text-xs text-zinc-500 font-mono">
                Simulate goal &amp; corner events to test triggers
              </span>
            </div>

            <div className="space-y-4">
              {liveMatches.map((match) => {
                // Find tracked leg for this match
                const trackedLeg = legs.find(
                  (l) =>
                    l.homeTeam.toLowerCase().includes(match.homeTeam.toLowerCase()) ||
                    match.homeTeam.toLowerCase().includes(l.homeTeam.toLowerCase())
                );

                return (
                  <div
                    key={match.id}
                    className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-amber-400 font-semibold">
                          {match.elapsedMinute}'
                        </span>
                        <span className="text-sm font-semibold text-white">
                          {match.homeTeam} vs {match.awayTeam}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-zinc-400">
                        {match.homeGoals}-{match.awayGoals} · {match.homeCorners + match.awayCorners} corners
                      </div>
                    </div>

                    {/* Associated leg in DB */}
                    {trackedLeg && (
                      <div className="p-2 bg-zinc-900/80 rounded border border-zinc-800/80 text-[11px] font-mono flex items-center justify-between text-zinc-300">
                        <span>
                          Leg: <strong className="text-amber-400">{trackedLeg.targetMarket}</strong>
                        </span>
                        <span>
                          DB Last Score: <strong className="text-zinc-100">{trackedLeg.lastKnownScore}</strong>
                        </span>
                      </div>
                    )}

                    {/* Controls */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      <button
                        onClick={() => modifyMatch(match.id, 'homeGoals', 1)}
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 rounded text-zinc-200 cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3 text-emerald-400" />
                        <span>{match.homeTeam} Goal</span>
                      </button>

                      <button
                        onClick={() => modifyMatch(match.id, 'awayGoals', 1)}
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 rounded text-zinc-200 cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3 text-emerald-400" />
                        <span>{match.awayTeam} Goal</span>
                      </button>

                      <button
                        onClick={() => modifyMatch(match.id, 'homeCorners', 1)}
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 rounded text-zinc-200 cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3 text-amber-400" />
                        <span>+1 Corner</span>
                      </button>

                      <button
                        onClick={() => modifyMatch(match.id, 'elapsedMinute', 5)}
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 rounded text-zinc-200 cursor-pointer flex items-center gap-1"
                      >
                        <Clock className="w-3 h-3 text-zinc-400" />
                        <span>+5 Mins</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Real Telegram Alarm Preview & Cash Out Prompt */}
        <div className="lg:col-span-5 space-y-4">
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-amber-400" />
                <span>TELEGRAM ALARM DISPATCHER PREVIEW</span>
              </span>
              {lastDispatchedAlert && (
                <span className="text-xs text-zinc-500 font-mono">
                  {lastDispatchedAlert.timestamp}
                </span>
              )}
            </div>

            {lastDispatchedAlert ? (
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-200 whitespace-pre-line leading-relaxed shadow-lg">
                {lastDispatchedAlert.text}
              </div>
            ) : (
              <div className="p-8 rounded-lg bg-zinc-950 border border-dashed border-zinc-800 text-center space-y-2">
                <Bell className="w-6 h-6 text-zinc-600 mx-auto" />
                <div className="text-xs text-zinc-400 font-medium">No alarms triggered yet</div>
                <div className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                  Click "+1 Goal" or "+1 Corner" on any match, then click "Poll Now" to test the state diffing and alarm dispatcher.
                </div>
              </div>
            )}
          </div>

          {/* Quick Alarm History */}
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 space-y-3">
            <span className="text-xs font-mono text-zinc-400">RECENT DISPATCH LOGS</span>
            {alarmLogs.length === 0 ? (
              <div className="text-xs text-zinc-500 font-mono">No alarms logged in alarm_logs.</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {alarmLogs.slice(0, 5).map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono flex items-center justify-between"
                  >
                    <div>
                      <span className="text-white font-semibold">{log.eventType}</span>
                      <span className="text-zinc-500 ml-2">
                        {log.previousScore} ➔ {log.newScore}
                      </span>
                    </div>
                    <span className="text-zinc-500 text-[11px]">
                      {new Date(log.dispatchedAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
