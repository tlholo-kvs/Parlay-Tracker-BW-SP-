import React from 'react';
import { ArrowRight, Bot, Clock, Database, Globe, Layers, ShieldCheck, Zap } from 'lucide-react';

interface ArchitectureViewProps {
  onGoToIngestion: () => void;
  onGoToCron: () => void;
}

export const ArchitectureView: React.FC<ArchitectureViewProps> = ({
  onGoToIngestion,
  onGoToCron,
}) => {
  return (
    <div className="space-y-8">
      {/* Hero Overview */}
      <div className="border border-zinc-800 bg-zinc-900/60 rounded-xl p-6 sm:p-8">
        <div className="max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-xs text-amber-400 font-mono">
            <span>Serverless Architecture</span>
            <span aria-hidden="true">·</span>
            <span>South Africa af-south-1</span>
            <span aria-hidden="true">·</span>
            <span>Python 3.11</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance">
            Stateless Multi-Bet Tracker for Betway &amp; Supabets
          </h1>

          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
            Engineered as two decoupled, stateless Python serverless functions coordinated through
            a shared Supabase PostgreSQL database. Specifically tailored for South African sportsbooks,
            filtering out flat 1X2 straight win bets to focus exclusively on dynamic Over/Under goals and match corners.
          </p>
        </div>

        {/* 3 Key Metric Specs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-zinc-800 text-xs">
          <div>
            <div className="text-zinc-500 font-mono">CRON CADENCE</div>
            <div className="text-lg font-bold text-white font-mono mt-0.5">60 Seconds</div>
            <div className="text-zinc-400 mt-1">pg_cron / AWS EventBridge trigger</div>
          </div>
          <div>
            <div className="text-zinc-500 font-mono">MARKET SPECIALIZATION</div>
            <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">Over / Under Totals</div>
            <div className="text-zinc-400 mt-1">Match Goals &amp; Match Corners</div>
          </div>
          <div>
            <div className="text-zinc-500 font-mono">STATE PERSISTENCE</div>
            <div className="text-lg font-bold text-white font-mono mt-0.5">Supabase PostgreSQL</div>
            <div className="text-zinc-400 mt-1">Compound indexed for 0ms cold filter</div>
          </div>
        </div>
      </div>

      {/* Two Components Architecture Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Component A */}
        <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2.5 py-1 rounded">
                COMPONENT A
              </span>
              <span className="text-xs text-zinc-500 font-mono">HTTP POST Webhook</span>
            </div>

            <h2 className="text-lg font-semibold text-white">
              Ingestion Function (Webhook Listener)
            </h2>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Acts as the Telegram Bot API Webhook receiver. Ingests raw text payloads or shared links from
              Betway SA and Supabets SA. Applies robust regex parsing to extract fixtures, scheduled kick-off times,
              and isolates Over/Under markets while rejecting 1X2 straight win bets.
            </p>

            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold text-zinc-300">Execution Steps:</div>
              <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
                <li>Receive Telegram update with betslip string or share link</li>
                <li>Regex extraction: Team A vs Team B, kick-off timestamp, markets</li>
                <li>Filter rule: Flag &amp; ignore straight 1X2 win bets</li>
                <li>Insert slip into <code className="text-amber-300 font-mono">parlay_slips</code></li>
                <li>Decompose legs into <code className="text-amber-300 font-mono">slip_legs</code> with initial '0-0' / '0 corners'</li>
                <li>Post formatted Markdown confirmation back to Telegram</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-mono">Target: AWS Lambda / Edge Function</span>
            <button
              onClick={onGoToIngestion}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Test Ingestion</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Component B */}
        <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-sky-400 bg-sky-950/60 border border-sky-800/40 px-2.5 py-1 rounded">
                COMPONENT B
              </span>
              <span className="text-xs text-zinc-500 font-mono">Scheduled 60s Cron</span>
            </div>

            <h2 className="text-lg font-semibold text-white">
              Polling &amp; Alarm Function (Cron Worker)
            </h2>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Fires every 60 seconds via pg_cron or AWS EventBridge. Fetches only PENDING legs whose scheduled
              kick-off time has passed. Searches live sports feed with fuzzy matching, detects score/corner changes,
              updates PostgreSQL, and dispatches rich Markdown alerts with Cash Out guidance.
            </p>

            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold text-zinc-300">Execution Steps:</div>
              <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
                <li>Query: <code className="text-sky-300 font-mono">status = 'PENDING' AND kickoff_time &lt;= NOW()</code></li>
                <li>HTTP GET to Live Sports API (<code className="text-sky-300 font-mono">/fixtures?live=all</code>)</li>
                <li>Fuzzy team name normalization (e.g., Mamelodi Sundowns FC <span className="text-zinc-600">⇄</span> Sundowns)</li>
                <li>Compare live score/corner tally against <code className="text-sky-300 font-mono">last_known_score</code></li>
                <li>On change: Atomic PATCH to Supabase database</li>
                <li>Dispatch <code className="text-amber-300 font-mono">🚨 GOAL ALERT 🚨</code> to Telegram with Cash Out prompt</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-mono">Trigger: pg_cron / EventBridge</span>
            <button
              onClick={onGoToCron}
              className="text-xs font-medium text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Test 60s Cron</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Visual Data Flow Diagram */}
      <div className="border border-zinc-800 bg-zinc-900/30 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-6">Stateless End-to-End Pipeline</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
          <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-zinc-500 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-amber-400" />
              <span>STEP 1: INGESTION</span>
            </div>
            <div className="font-semibold text-white">Telegram User</div>
            <div className="text-zinc-400 text-[11px] leading-relaxed">
              User shares Betway or Supabets slip. Webhook triggers Component A.
            </div>
          </div>

          <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-zinc-500 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span>STEP 2: PERSISTENCE</span>
            </div>
            <div className="font-semibold text-white">Supabase PostgreSQL</div>
            <div className="text-zinc-400 text-[11px] leading-relaxed">
              Stores parlay slip and individual Over/Under legs. Status: PENDING.
            </div>
          </div>

          <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-zinc-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>STEP 3: 60s POLLER</span>
            </div>
            <div className="font-semibold text-white">Cron Worker</div>
            <div className="text-zinc-400 text-[11px] leading-relaxed">
              Fires every 60s, pulls live fixtures via Sports API, compares scores.
            </div>
          </div>

          <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-zinc-500 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-rose-400" />
              <span>STEP 4: DISPATCH</span>
            </div>
            <div className="font-semibold text-white">Cash Out Alarm</div>
            <div className="text-zinc-400 text-[11px] leading-relaxed">
              Alerts user immediately on goal/corner with tailored Betway/Supabets Cash Out advice.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
