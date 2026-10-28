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
    { id: 'home', label: 'Home' },
    { id: 'ledger', label: 'Predictions' },
    { id: 'webhook', label: 'Telegram' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onSelectTab('home')}
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2.5"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-300 to-amber-500/70 border border-amber-400/40 flex items-center justify-center text-slate-950 shadow-[0_0_20px_rgba(245,185,66,0.35)]">
              <Activity className="w-4 h-4" />
            </div>
            <span>ParlayPulse SA</span>
          </button>
          <span className="hidden sm:inline-block text-xs text-slate-400">
            {totalPendingLegs} live legs
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-amber-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onTriggerCron}
            disabled={isCronRunning}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-gradient-to-r from-amber-300 to-yellow-400 hover:brightness-110 disabled:opacity-60 rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-[0_12px_20px_rgba(245,185,66,0.18)]"
          >
            {isCronRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Refresh alerts</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="md:hidden flex items-center overflow-x-auto gap-4 px-4 py-2 bg-slate-900/70 border-t border-slate-800 text-xs">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`whitespace-nowrap shrink-0 py-1 ${
              activeTab === item.id ? 'text-amber-300 font-semibold' : 'text-slate-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
};
