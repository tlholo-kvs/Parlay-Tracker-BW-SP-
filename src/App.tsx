import React, { useState } from 'react';
import { TopBar } from './components/TopBar';
import { LowRiskLedgerView } from './components/LowRiskLedgerView';
import { ArchitectureView } from './components/ArchitectureView';
import { IngestionSimulator } from './components/IngestionSimulator';
import { CronSimulator } from './components/CronSimulator';
import { DatabaseInspector } from './components/DatabaseInspector';
import { TelegramWebhookManager } from './components/TelegramWebhookManager';
import { CodeViewer } from './components/CodeViewer';
import { AlarmLog, ParlaySlip, SlipLeg } from './types';

// Default initial state mimicking active Betway and Supabets slips
const INITIAL_SLIPS: ParlaySlip[] = [
  {
    id: 'slip-bw-773921',
    telegramChatId: 981726450,
    bookmaker: 'BETWAY_SA',
    slipReference: 'BW-773921',
    rawInput: 'Betway SA PSL Multi-Bet (Over/Under Focus)',
    totalLegs: 2,
    activeLegsCount: 2,
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'slip-sb-449102',
    telegramChatId: 981726450,
    bookmaker: 'SUPABETS_SA',
    slipReference: 'SB-449102',
    rawInput: 'Supabets SA EPL Totals Parlay',
    totalLegs: 1,
    activeLegsCount: 1,
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const INITIAL_LEGS: SlipLeg[] = [
  {
    id: 'leg-sundowns-pirates',
    slipId: 'slip-bw-773921',
    telegramChatId: 981726450,
    bookmaker: 'BETWAY_SA',
    fixtureRaw: 'Mamelodi Sundowns vs Orlando Pirates',
    homeTeam: 'Mamelodi Sundowns',
    awayTeam: 'Orlando Pirates',
    kickoffTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    marketType: 'OVER_UNDER_GOALS',
    targetMarket: 'Total Match Goals - Over 2.5',
    lineThreshold: 2.5,
    direction: 'OVER',
    lastKnownScore: '1-0',
    lastKnownTotal: 1,
    currentMatchMinute: "58'",
    status: 'LIVE',
  },
  {
    id: 'leg-chiefs-capetown',
    slipId: 'slip-bw-773921',
    telegramChatId: 981726450,
    bookmaker: 'BETWAY_SA',
    fixtureRaw: 'Kaizer Chiefs vs Cape Town City',
    homeTeam: 'Kaizer Chiefs',
    awayTeam: 'Cape Town City',
    kickoffTime: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    marketType: 'OVER_UNDER_CORNERS',
    targetMarket: 'Total Match Corners - Over 9.5',
    lineThreshold: 9.5,
    direction: 'OVER',
    lastKnownScore: '9 corners (5-4)',
    lastKnownTotal: 9,
    currentMatchMinute: "73'",
    status: 'CASH_OUT_RECOMMENDED',
  },
  {
    id: 'leg-arsenal-chelsea',
    slipId: 'slip-sb-449102',
    telegramChatId: 981726450,
    bookmaker: 'SUPABETS_SA',
    fixtureRaw: 'Arsenal vs Chelsea',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    kickoffTime: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    marketType: 'OVER_UNDER_GOALS',
    targetMarket: 'Total Match Goals - Under 3.5',
    lineThreshold: 3.5,
    direction: 'UNDER',
    lastKnownScore: '1-1',
    lastKnownTotal: 2,
    currentMatchMinute: "62'",
    status: 'LIVE',
  },
];

const INITIAL_ALARMS: AlarmLog[] = [
  {
    id: 'alarm-init-1',
    legId: 'leg-chiefs-capetown',
    slipId: 'slip-bw-773921',
    telegramChatId: 981726450,
    eventType: 'CORNER_ALERT',
    previousScore: '8 corners (4-4)',
    newScore: '9 corners (5-4)',
    currentMinute: "71'",
    dispatchedMessage: '🚩 CORNER ALERT [71\'] 🚩 Kaizer Chiefs vs Cape Town City. 9 corners taken.',
    telegramMessageId: 884920,
    dispatchedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
];

function HomeDashboard({ slips, legs, alarmLogs }: { slips: ParlaySlip[]; legs: SlipLeg[]; alarmLogs: AlarmLog[] }) {
  const predictionCards = [
    {
      sport: 'Football',
      fixture: 'Mamelodi Sundowns vs Orlando Pirates',
      market: 'Total Match Goals - Over 2.5',
      odds: 1.46,
      confidence: '81%',
      risk: 'Low',
    },
    {
      sport: 'Football',
      fixture: 'Arsenal vs Chelsea',
      market: 'Total Match Goals - Under 3.5',
      odds: 1.41,
      confidence: '78%',
      risk: 'Low',
    },
    {
      sport: 'Basketball',
      fixture: 'Boston Celtics vs Miami Heat',
      market: 'Team Total - Over 110.5',
      odds: 1.45,
      confidence: '74%',
      risk: 'Medium',
    },
    {
      sport: 'Tennis',
      fixture: 'Carlos Alcaraz vs Tallon Griekspoor',
      market: 'Alcaraz +1.5 Sets',
      odds: 1.42,
      confidence: '80%',
      risk: 'Low',
    },
  ];

  const acceptedSlips = slips.slice(0, 3).map((slip) => ({
    id: slip.id,
    reference: slip.slipReference || slip.id,
    bookmaker: slip.bookmaker.replace('_SA', '').replace('_', ' '),
    status: slip.status,
    legs: slip.totalLegs,
  }));

  const notifications = alarmLogs.slice(0, 3).map((alert) => ({
    id: alert.id,
    fixture: legs.find((leg) => leg.id === alert.legId)?.fixtureRaw || 'Match update',
    text: alert.dispatchedMessage,
    minute: alert.currentMinute,
  }));

  return (
    <div className="space-y-6">
      <section className="premium-surface gold-ring rounded-[30px] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Home</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
              Premium picks built for low-risk slips.
            </h1>
            <p className="mt-4 text-sm text-slate-300 md:text-base">
              Simple, premium-grade match ideas across football, basketball, and tennis — backed by the model, accepted slips, and Telegram notifications.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-[240px]">
            <div className="premium-card rounded-2xl p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Live picks</div>
              <div className="mt-2 text-2xl font-semibold text-white">{predictionCards.length}</div>
            </div>
            <div className="premium-card rounded-2xl p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Accepted slips</div>
              <div className="mt-2 text-2xl font-semibold text-white">{slips.length}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {['Football', 'Basketball', 'Tennis', 'Model health'].map((label, index) => {
          const values = ['Low risk', 'Alternative totals', 'Set cushions', 'Strong'];

          return (
            <div key={label} className="premium-card rounded-2xl p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div>
              <div className="mt-3 text-xl font-semibold text-white">{values[index]}</div>
              <div className="mt-3 h-2 rounded-full bg-slate-800/90">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-200"
                  style={{ width: `${70 + index * 7}%` }}
                />
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr_0.9fr]">
        <div className="premium-card rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Predictions</h2>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-300">
              Model
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {predictionCards.map((pick) => (
              <div key={`${pick.fixture}-${pick.market}`} className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{pick.sport}</div>
                    <div className="mt-1 font-medium text-white">{pick.fixture}</div>
                  </div>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                    {pick.risk}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-sm text-slate-300">
                  <span>{pick.market}</span>
                  <span className="font-semibold text-amber-300">{pick.odds.toFixed(2)}</span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>Confidence</span>
                  <span>{pick.confidence}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="premium-card rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Accepted slips</h2>
            <span className="text-xs text-slate-400">{slips.length} total</span>
          </div>

          <div className="mt-4 space-y-3">
            {acceptedSlips.map((slip) => (
              <div key={slip.id} className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-white">{slip.reference}</div>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-300">
                    {slip.status}
                  </span>
                </div>
                <div className="mt-2 text-sm text-slate-300">{slip.bookmaker}</div>
                <div className="mt-2 text-xs text-slate-400">{slip.legs} legs</div>
              </div>
            ))}
          </div>
        </div>

        <div className="premium-card rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Telegram alerts</h2>
            <span className="text-xs text-slate-400">Live</span>
          </div>

          <div className="mt-4 space-y-3">
            {notifications.map((alert) => (
              <div key={alert.id} className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
                <div className="text-sm font-medium text-white">{alert.fixture}</div>
                <div className="mt-2 text-xs text-slate-400">{alert.minute}</div>
                <div className="mt-2 text-sm text-slate-300">{alert.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [slips, setSlips] = useState<ParlaySlip[]>(INITIAL_SLIPS);
  const [legs, setLegs] = useState<SlipLeg[]>(INITIAL_LEGS);
  const [alarmLogs, setAlarmLogs] = useState<AlarmLog[]>(INITIAL_ALARMS);
  const [isCronRunning, setIsCronRunning] = useState<boolean>(false);
  const [isAutoCronEnabled, setIsAutoCronEnabled] = useState<boolean>(true);

  // Ingestion handler: appends new slip & legs
  const handleInsertSlip = (newSlip: ParlaySlip, newLegs: SlipLeg[]) => {
    setSlips((prev) => [newSlip, ...prev]);
    setLegs((prev) => [...newLegs, ...prev]);
  };

  // Cron score update handler
  const handleUpdateLegScore = (
    legId: string,
    newScore: string,
    newTotal: number,
    minute: string,
    newStatus: any
  ) => {
    setLegs((prev) =>
      prev.map((l) =>
        l.id === legId
          ? {
              ...l,
              lastKnownScore: newScore,
              lastKnownTotal: newTotal,
              currentMatchMinute: minute,
              status: newStatus,
              lastPolledAt: new Date().toISOString(),
              lastAlarmDispatchedAt: new Date().toISOString(),
            }
          : l
      )
    );
  };

  // Alarm logger
  const handleLogAlarm = (log: AlarmLog) => {
    setAlarmLogs((prev) => [log, ...prev]);
  };

  // Trigger manual cron cycle from TopBar
  const handleTriggerCron = () => {
    setIsCronRunning(true);
    setActiveTab('ledger');
    setTimeout(() => {
      setIsCronRunning(false);
    }, 600);
  };

  // Database reset
  const handleResetDatabase = () => {
    setSlips(INITIAL_SLIPS);
    setLegs(INITIAL_LEGS);
    setAlarmLogs(INITIAL_ALARMS);
  };

  const pendingLegsCount = legs.filter((l) => l.status === 'PENDING' || l.status === 'LIVE').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-amber-500/20 selection:text-amber-300">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onTriggerCron={handleTriggerCron}
        isCronRunning={isCronRunning}
        totalPendingLegs={pendingLegsCount}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'home' && <HomeDashboard slips={slips} legs={legs} alarmLogs={alarmLogs} />}

        {activeTab === 'webhook' && <TelegramWebhookManager />}

        {activeTab === 'ledger' && <LowRiskLedgerView />}

        {activeTab === 'architecture' && (
          <ArchitectureView
            onGoToIngestion={() => setActiveTab('ingestion')}
            onGoToCron={() => setActiveTab('cron')}
          />
        )}

        {activeTab === 'ingestion' && (
          <IngestionSimulator onInsertSlip={handleInsertSlip} />
        )}

        {activeTab === 'cron' && (
          <CronSimulator
            legs={legs}
            alarmLogs={alarmLogs}
            onUpdateLegScore={handleUpdateLegScore}
            onLogAlarm={handleLogAlarm}
            isAutoCronEnabled={isAutoCronEnabled}
            onToggleAutoCron={() => setIsAutoCronEnabled((prev) => !prev)}
          />
        )}

        {activeTab === 'database' && (
          <DatabaseInspector
            slips={slips}
            legs={legs}
            alarmLogs={alarmLogs}
            onResetDatabase={handleResetDatabase}
          />
        )}

        {activeTab === 'code' && <CodeViewer />}
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950 py-6 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>ParlayPulse SA</span>
          <div className="flex items-center gap-4 text-zinc-400">
            <span>Betway &amp; Supabets</span>
            <span aria-hidden="true">•</span>
            <span>Telegram alerts</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
