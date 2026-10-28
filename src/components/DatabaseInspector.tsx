import React, { useState } from 'react';
import { AlarmLog, ParlaySlip, SlipLeg } from '../types';
import { CODE_SNIPPETS } from '../data/codeSnippets';
import { Activity, Check, Copy, Database, ExternalLink, Eye, EyeOff, Key, Radio, RefreshCw, Server, ShieldCheck, Terminal, Trash2 } from 'lucide-react';

interface DatabaseInspectorProps {
  slips: ParlaySlip[];
  legs: SlipLeg[];
  alarmLogs: AlarmLog[];
  onResetDatabase: () => void;
}

export const DatabaseInspector: React.FC<DatabaseInspectorProps> = ({
  slips,
  legs,
  alarmLogs,
  onResetDatabase,
}) => {
  const [activeTable, setActiveTable] = useState<'slip_legs' | 'parlay_slips' | 'alarm_logs'>('slip_legs');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [copiedConn, setCopiedConn] = useState(false);
  const [copiedDdl, setCopiedDdl] = useState(false);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [pingStatus, setPingStatus] = useState<{
    state: 'idle' | 'pinging' | 'success' | 'error';
    latencyMs?: number;
    details?: string;
  }>({ state: 'idle' });

  const supabaseUrl = "https://rmawoakhlrxeqhdqcpur.supabase.co";
  const publishableKey = "sb_publishable_U5wfxTkNIS8H3JbdspnG1g_5CPw0S5n";
  const secretKey = "sb_secret_WGQy61zA6eoMXuNV8nGd0g_yC67bthS";
  const jwksUrl = "https://rmawoakhlrxeqhdqcpur.supabase.co/auth/v1/.well-known/jwks.json";
  const connectionUri = "postgresql://postgres:[YOUR-PASSWORD]@db.rmawoakhlrxeqhdqcpur.supabase.co:5432/postgres";

  const permissionsSql = `-- Grant access to public tables for PostgREST service role & clients
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;`;

  const handleCopyKey = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCopyConnection = () => {
    navigator.clipboard.writeText(connectionUri);
    setCopiedConn(true);
    setTimeout(() => setCopiedConn(false), 2000);
  };

  const handleCopyDdl = () => {
    navigator.clipboard.writeText(CODE_SNIPPETS.schemaSql);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2000);
  };

  const handlePingEndpoint = async () => {
    setPingStatus({ state: 'pinging' });
    const startTime = performance.now();
    try {
      const resp = await fetch(jwksUrl);
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      if (resp.ok) {
        const data = await resp.json();
        const kid = data.keys?.[0]?.kid || 'valid';
        setPingStatus({
          state: 'success',
          latencyMs: latency,
          details: `HTTP 200 OK · ES256 JWKS active (kid: ${kid.slice(0, 8)}...)`,
        });
      } else {
        setPingStatus({
          state: 'error',
          latencyMs: latency,
          details: `HTTP ${resp.status} ${resp.statusText}`,
        });
      }
    } catch (err: any) {
      setPingStatus({
        state: 'error',
        details: err.message || 'Network request failed',
      });
    }
  };

  const filteredLegs = legs.filter(
    (l) =>
      l.fixtureRaw.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.targetMarket.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSlips = slips.filter(
    (s) =>
      s.bookmaker.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.slipReference && s.slipReference.toLowerCase().includes(searchQuery.toLowerCase())) ||
      s.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAlarms = alarmLogs.filter(
    (a) =>
      a.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.newScore.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Live Supabase Connection Banner */}
      <div className="border border-zinc-800 bg-zinc-900/70 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-amber-400">
                  CONNECTED SUPABASE POSTGRESQL INSTANCE
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Ready
                </span>
              </div>
              <div className="text-xs text-zinc-400 font-mono mt-0.5">
                Project ID: <strong className="text-zinc-200">rmawoakhlrxeqhdqcpur</strong> · Region: <span className="text-zinc-300">AWS / Cape Town (af-south-1) / Frankfurt</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyDdl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
            >
              {copiedDdl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400">schema.sql Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Copy schema.sql</span>
                </>
              )}
            </button>

            <a
              href="https://supabase.com/dashboard/project/rmawoakhlrxeqhdqcpur/sql/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 transition-colors cursor-pointer"
            >
              <span>Supabase SQL Editor</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Connection Parameters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono bg-zinc-950/80 p-3.5 rounded-lg border border-zinc-800/80">
          <div>
            <span className="text-zinc-500 block text-[10px]">HOST</span>
            <span className="text-zinc-200 truncate block font-medium">db.rmawoakhlrxeqhdqcpur.supabase.co</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">PORT</span>
            <span className="text-zinc-200 font-medium">5432</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">DATABASE</span>
            <span className="text-zinc-200 font-medium">postgres</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">USER</span>
            <span className="text-zinc-200 font-medium">postgres</span>
          </div>
        </div>

        {/* Connection URI Box with Copy */}
        <div className="flex items-center justify-between gap-3 bg-zinc-950 px-3.5 py-2.5 rounded-lg border border-zinc-800/80 text-xs font-mono">
          <div className="truncate text-zinc-300">
            <span className="text-zinc-500 select-none">URI: </span>
            <span className="text-amber-300/90">{connectionUri}</span>
          </div>
          <button
            onClick={handleCopyConnection}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer text-[11px]"
          >
            {copiedConn ? (
              <>
                <Check className="w-3 h-3 text-amber-400" />
                <span className="text-amber-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-zinc-400" />
                <span>Copy URI</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Supabase REST API & Security Credentials */}
      <div className="border border-zinc-800 bg-zinc-900/60 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-mono font-semibold text-zinc-200">
                SUPABASE REST API &amp; AUTH CREDENTIALS
              </h3>
              <p className="text-[11px] text-zinc-400 font-mono">
                PostgREST REST endpoints, JWT verification keys, and service authentication
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePingEndpoint}
              disabled={pingStatus.state === 'pinging'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {pingStatus.state === 'pinging' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span>Pinging Supabase...</span>
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ping Live Endpoint</span>
                </>
              )}
            </button>
          </div>
        </div>

        {pingStatus.state !== 'idle' && (
          <div
            className={`p-3 rounded-lg border text-xs font-mono flex items-center justify-between ${
              pingStatus.state === 'success'
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : pingStatus.state === 'error'
                ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                : 'bg-zinc-950 border-zinc-800 text-zinc-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${pingStatus.state === 'success' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
              <span>{pingStatus.details}</span>
            </div>
            {pingStatus.latencyMs !== undefined && (
              <span className="text-[11px] font-semibold text-zinc-400 tabular-nums">
                {pingStatus.latencyMs}ms latency
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          {/* Supabase URL */}
          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-center justify-between gap-2">
            <div className="truncate">
              <span className="text-zinc-500 block text-[10px]">SUPABASE_URL</span>
              <span className="text-zinc-200 truncate block">{supabaseUrl}</span>
            </div>
            <button
              onClick={() => handleCopyKey(supabaseUrl, 'url')}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer shrink-0"
              title="Copy URL"
            >
              {copiedKey === 'url' ? <Check className="w-3.5 h-3.5 text-amber-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* JWKS URL */}
          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-center justify-between gap-2">
            <div className="truncate">
              <span className="text-zinc-500 block text-[10px]">SUPABASE_JWKS_URL</span>
              <span className="text-zinc-200 truncate block">{jwksUrl}</span>
            </div>
            <button
              onClick={() => handleCopyKey(jwksUrl, 'jwks')}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer shrink-0"
              title="Copy JWKS URL"
            >
              {copiedKey === 'jwks' ? <Check className="w-3.5 h-3.5 text-amber-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Publishable Key */}
          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-center justify-between gap-2">
            <div className="truncate">
              <span className="text-zinc-500 block text-[10px]">SUPABASE_PUBLISHABLE_KEY</span>
              <span className="text-amber-400 truncate block font-medium">{publishableKey}</span>
            </div>
            <button
              onClick={() => handleCopyKey(publishableKey, 'pub')}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer shrink-0"
              title="Copy Publishable Key"
            >
              {copiedKey === 'pub' ? <Check className="w-3.5 h-3.5 text-amber-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Secret Key */}
          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-center justify-between gap-2">
            <div className="truncate">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 block text-[10px]">SUPABASE_SECRET_KEY</span>
                <span className="text-[10px] text-rose-400 font-mono">(Serverless / Edge only)</span>
              </div>
              <span className="text-zinc-200 truncate block font-mono">
                {showSecretKey ? secretKey : `${secretKey.slice(0, 10)}•••••••••••••••••••••••••`}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                title={showSecretKey ? 'Hide Secret Key' : 'Show Secret Key'}
              >
                {showSecretKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => handleCopyKey(secretKey, 'secret')}
                className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                title="Copy Secret Key"
              >
                {copiedKey === 'secret' ? <Check className="w-3.5 h-3.5 text-amber-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* PostgREST Privileges Helper */}
        <div className="bg-zinc-950/70 p-3.5 rounded-lg border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              <span>PostgreSQL / PostgREST Schema Grants</span>
            </div>
            <button
              onClick={() => handleCopyKey(permissionsSql, 'grants')}
              className="text-[11px] font-mono text-amber-400 hover:text-amber-300 inline-flex items-center gap-1 cursor-pointer"
            >
              {copiedKey === 'grants' ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Copied Grants!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy SQL Grants</span>
                </>
              )}
            </button>
          </div>
          <pre className="text-[11px] font-mono text-zinc-400 bg-zinc-950 p-2.5 rounded border border-zinc-900 overflow-x-auto whitespace-pre-wrap">
            {permissionsSql}
          </pre>
        </div>
      </div>

      {/* Table Selection & Controls */}
      <div className="border border-zinc-800 bg-zinc-900/60 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
            <button
              onClick={() => setActiveTable('slip_legs')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTable === 'slip_legs'
                  ? 'bg-amber-400 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              slip_legs ({legs.length})
            </button>
            <button
              onClick={() => setActiveTable('parlay_slips')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTable === 'parlay_slips'
                  ? 'bg-amber-400 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              parlay_slips ({slips.length})
            </button>
            <button
              onClick={() => setActiveTable('alarm_logs')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTable === 'alarm_logs'
                  ? 'bg-amber-400 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              alarm_logs ({alarmLogs.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Filter table rows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono w-48 sm:w-64 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            onClick={onResetDatabase}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-300 hover:text-rose-200 border border-rose-900/50 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset Demo DB</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl overflow-hidden">
        {activeTable === 'slip_legs' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Fixture</th>
                  <th className="py-3 px-4">Market / Target</th>
                  <th className="py-3 px-4 text-right">Line</th>
                  <th className="py-3 px-4 text-center">Last Known Score</th>
                  <th className="py-3 px-4">Minute</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Bookmaker</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredLegs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-500">
                      No legs found matching query.
                    </td>
                  </tr>
                ) : (
                  filteredLegs.map((leg) => {
                    let statusColor = 'text-zinc-400';
                    if (leg.status === 'WON') statusColor = 'text-emerald-400 font-bold';
                    else if (leg.status === 'LOST') statusColor = 'text-rose-400 font-bold';
                    else if (leg.status === 'CASH_OUT_RECOMMENDED')
                      statusColor = 'text-amber-400 font-bold animate-pulse';
                    else if (leg.status === 'LIVE') statusColor = 'text-amber-300';

                    return (
                      <tr key={leg.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-4 font-semibold text-white">
                          {leg.fixtureRaw}
                        </td>
                        <td className="py-3 px-4 text-zinc-300">
                          {leg.targetMarket}
                        </td>
                        <td className="py-3 px-4 text-right text-zinc-200 tabular-nums">
                          {leg.lineThreshold}
                        </td>
                        <td className="py-3 px-4 text-center text-amber-400 font-semibold tabular-nums">
                          {leg.lastKnownScore}
                        </td>
                        <td className="py-3 px-4 text-amber-300/90 tabular-nums">
                          {leg.currentMatchMinute}
                        </td>
                        <td className={`py-3 px-4 ${statusColor}`}>
                          {leg.status}
                        </td>
                        <td className="py-3 px-4 text-zinc-400">
                          {leg.bookmaker}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedRow(leg)}
                            className="text-xs text-amber-400 hover:text-amber-300 underline cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTable === 'parlay_slips' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Slip ID</th>
                  <th className="py-3 px-4">Chat ID</th>
                  <th className="py-3 px-4">Bookmaker</th>
                  <th className="py-3 px-4">Booking Ref</th>
                  <th className="py-3 px-4 text-right">Total Legs</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredSlips.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-500">
                      No slips recorded.
                    </td>
                  </tr>
                ) : (
                  filteredSlips.map((slip) => (
                    <tr key={slip.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4 text-zinc-400 truncate max-w-xs">{slip.id}</td>
                      <td className="py-3 px-4 text-zinc-200 tabular-nums">{slip.telegramChatId}</td>
                      <td className="py-3 px-4 font-semibold text-white">{slip.bookmaker}</td>
                      <td className="py-3 px-4 text-amber-400 font-medium">{slip.slipReference || 'N/A'}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{slip.totalLegs}</td>
                      <td className="py-3 px-4 text-amber-400/90">{slip.status}</td>
                      <td className="py-3 px-4 text-zinc-500 text-[11px]">
                        {new Date(slip.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedRow(slip)}
                          className="text-xs text-amber-400 hover:text-amber-300 underline cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTable === 'alarm_logs' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Alarm ID</th>
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">Score Shift</th>
                  <th className="py-3 px-4">Minute</th>
                  <th className="py-3 px-4">Chat ID</th>
                  <th className="py-3 px-4">Dispatched At</th>
                  <th className="py-3 px-4 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredAlarms.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500">
                      No alarm dispatches logged.
                    </td>
                  </tr>
                ) : (
                  filteredAlarms.map((alarm) => (
                    <tr key={alarm.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4 text-zinc-400 truncate max-w-xs">{alarm.id}</td>
                      <td className="py-3 px-4 font-bold text-amber-400">{alarm.eventType}</td>
                      <td className="py-3 px-4 text-white font-semibold">
                        {alarm.previousScore} ➔ {alarm.newScore}
                      </td>
                      <td className="py-3 px-4 text-amber-300">{alarm.currentMinute}</td>
                      <td className="py-3 px-4 text-zinc-200 tabular-nums">{alarm.telegramChatId}</td>
                      <td className="py-3 px-4 text-zinc-500 text-[11px]">
                        {new Date(alarm.dispatchedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedRow(alarm)}
                          className="text-xs text-amber-400 hover:text-amber-300 underline cursor-pointer"
                        >
                          View Markdown
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row Inspection Modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white font-mono">
                ROW INSPECTION: {selectedRow.id}
              </h3>
              <button
                onClick={() => setSelectedRow(null)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded bg-zinc-800 cursor-pointer"
              >
                Close
              </button>
            </div>

            <pre className="p-4 bg-zinc-950 rounded-lg text-xs font-mono text-amber-300 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(selectedRow, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
