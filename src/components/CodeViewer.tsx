import React, { useState } from 'react';
import { CODE_SNIPPETS } from '../data/codeSnippets';
import { Check, Copy, Download, FileCode, Layers, Terminal } from 'lucide-react';

export const CodeViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string>('schemaSql');
  const [copied, setCopied] = useState<boolean>(false);

  const files = [
    { id: 'schemaSql', name: 'schema.sql', lang: 'sql', label: 'Supabase PostgreSQL DDL' },
    { id: 'configPy', name: 'config.py', lang: 'python', label: 'Supabase & Environment Config' },
    { id: 'envExample', name: '.env.example', lang: 'bash', label: 'Connection Strings & Secrets' },
    { id: 'strategyLedgerPy', name: 'strategy_ledger.py', lang: 'python', label: 'Low-Risk Strategy & Ledger Engine' },
    { id: 'ingestionHandlerPy', name: 'ingestion_handler.py', lang: 'python', label: 'Component A (Webhook)' },
    { id: 'pollingAlarmPy', name: 'polling_alarm_handler.py', lang: 'python', label: 'Component B (60s Cron)' },
    { id: 'parserPy', name: 'parser.py', lang: 'python', label: 'Betway & Supabets Parser' },
    { id: 'sportsApiPy', name: 'sports_api.py', lang: 'python', label: 'Sports API Client' },
    { id: 'supabaseEdgeFunction', name: 'supabase_edge_fn.ts', lang: 'typescript', label: 'Supabase Edge Function' },
    { id: 'serverlessYml', name: 'serverless.yml', lang: 'yaml', label: 'AWS Lambda Deploy Config' },
  ];

  const currentCode = CODE_SNIPPETS[selectedFile as keyof typeof CODE_SNIPPETS] || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* File Selector Bar */}
      <div className="border border-zinc-800 bg-zinc-900/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {files.map((file) => (
            <button
              key={file.id}
              onClick={() => setSelectedFile(file.id)}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-2 border ${
                selectedFile === file.id
                  ? 'bg-amber-400 text-zinc-950 border-amber-400 font-semibold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{file.name}</span>
            </button>
          ))}
        </div>

        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer border border-zinc-700"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-400">Copied to Clipboard!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Code</span>
            </>
          )}
        </button>
      </div>

      {/* Code Viewer Box */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <span className="text-zinc-200">
              /serverless/{files.find((f) => f.id === selectedFile)?.name}
            </span>
          </div>
          <span className="text-zinc-500">
            {files.find((f) => f.id === selectedFile)?.label}
          </span>
        </div>

        <pre className="p-5 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed max-h-[600px] overflow-y-auto">
          <code>{currentCode}</code>
        </pre>
      </div>
    </div>
  );
};
