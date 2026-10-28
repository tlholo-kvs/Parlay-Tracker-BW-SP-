import React from 'react';
import { Activity, Play, RefreshCw, Terminal } from 'lucide-react';

interface TopBarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onTriggerCron: () => void;
  isCronRunning: boolean;
  totalPendingLegs: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onTriggerCron,
  isCronRunning,
  totalPendingLegs,
}) => {
  const navItems = [
    { id: 'ledger', label: 'Strategy Ledger (R2)' },
    { id: 'webhook', label: 'Telegram Webhook' },
    { id: 'ingestion', label: 'Ingestion Simulator' },
    { id: 'cron', label: '60s Cron & Alarms' },
    { id: 'database', label: 'Database Inspector' },
    { id: 'architecture', label: 'Architecture' },
    { id: 'code', label: 'Codebase & DDL' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('ledger');
            }}
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2.5"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Activity className="w-4 h-4" />
            </div>
            <span>ParlayPulse SA</span>
          </a>
          <span className="hidden sm:inline-block text-xs text-zinc-500 font-mono">
            Low-Risk Strategy Ledger
          </span>
        </div>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-amber-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onTriggerCron}
            disabled={isCronRunning}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm shadow-amber-500/20"
          >
            {isCronRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Cron...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run 60s Cron Cycle</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav bar */}
      <div className="md:hidden flex items-center overflow-x-auto gap-4 px-4 py-2 bg-zinc-900 border-t border-zinc-800 text-xs">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`whitespace-nowrap shrink-0 py-1 ${
              activeTab === item.id ? 'text-amber-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
};
