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

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('webhook');
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
    setActiveTab('cron');
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
      {/* Top Bar adhering to Top Bar Contract */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onTriggerCron={handleTriggerCron}
        isCronRunning={isCronRunning}
        totalPendingLegs={pendingLegsCount}
      />

      {/* Main Workspace Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

      {/* Clean Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-6 text-center text-xs text-zinc-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>ParlayPulse SA · Low-Risk Strategy &amp; Parlay Tracker</span>
          <div className="flex items-center gap-4 text-zinc-400">
            <span>Betway SA &amp; Supabets SA</span>
            <span aria-hidden="true">·</span>
            <span>AWS Lambda / Supabase pg_cron</span>
            <span aria-hidden="true">·</span>
            <span>Python 3.11</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
