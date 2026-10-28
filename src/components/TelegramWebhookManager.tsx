import React, { useState, useEffect } from 'react';
import {
  Send,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Shield,
  Copy,
  Zap,
  Terminal,
  Trash2,
  Eye,
  EyeOff,
  Radio,
  ArrowRight,
  Sparkles,
  HelpCircle,
  Check,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  XCircle,
} from 'lucide-react';

interface BotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  ip_address?: string;
}

interface WebhookEvent {
  id: string;
  timestamp: string;
  chatId: number;
  fromName?: string;
  rawText: string;
  bookmaker: string;
  trackedLegsCount: number;
  ignoredLegsCount: number;
  status: 'SUCCESS' | 'NO_LEGS' | 'COMMAND' | 'ERROR';
  details?: string;
}

interface SendReceipt {
  timestamp: string;
  success: boolean;
  chatId: string;
  messageId?: number;
  statusMessage: string;
  rawResponse?: any;
  errorCode?: number;
  failureCause?: 'FORBIDDEN_CANT_INITIATE' | 'CHAT_NOT_FOUND' | 'INVALID_TOKEN' | 'PARSE_ERROR' | 'UNKNOWN';
}

export const TelegramWebhookManager: React.FC = () => {
  // Config & State
  const defaultAppUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhook/telegram`
      : 'https://ais-dev-wmrhmxjctxm2hqtarrxapf-976756233296.europe-west2.run.app/api/webhook/telegram';

  const [botToken, setBotToken] = useState<string>(() => {
    return localStorage.getItem('parlaypulse_tg_token') || '';
  });
  const [showToken, setShowToken] = useState<boolean>(false);
  const [webhookUrl, setWebhookUrl] = useState<string>(defaultAppUrl);
  const [secretToken, setSecretToken] = useState<string>('parlaypulse_za_secret_2026');
  const [dropPending, setDropPending] = useState<boolean>(true);

  // Status & Telemetry
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>([]);

  // Action Loading states
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Test Message Inputs & Diagnostics
  const [testChatId, setTestChatId] = useState<string>(() => {
    return localStorage.getItem('parlaypulse_test_chat_id') || '';
  });
  const [testParseMode, setTestParseMode] = useState<'Markdown' | 'Plain'>('Markdown');
  const [lastReceipt, setLastReceipt] = useState<SendReceipt | null>(null);
  const [showRawDetails, setShowRawDetails] = useState<boolean>(false);

  const [testMessageText, setTestMessageText] = useState<string>(
    '🚨 *GOAL ALERT (58\')* 🚨\n\n' +
      '⚽ *Mamelodi Sundowns 1 - 0 Orlando Pirates*\n' +
      '🎯 Tracking Leg: *Total Match Goals - Over 2.5*\n' +
      '📊 Current Total: *1 Goal* (Needs 2 more for full win)\n\n' +
      '💡 *CASH OUT ACTION:* Betway SA cash-out value surged by ~35%. Check your betslip to lock in profit!'
  );

  // Save inputs locally
  useEffect(() => {
    if (botToken) {
      localStorage.setItem('parlaypulse_tg_token', botToken);
    }
  }, [botToken]);

  useEffect(() => {
    if (testChatId) {
      localStorage.setItem('parlaypulse_test_chat_id', testChatId);
    }
  }, [testChatId]);

  // Load events on mount
  const fetchWebhookEvents = async () => {
    try {
      const res = await fetch('/api/webhook/events');
      if (res.ok) {
        const data = await res.json();
        if (data.events) {
          setEvents(data.events);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchWebhookEvents();
    const interval = setInterval(fetchWebhookEvents, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // 1. Verify Bot Token (getMe)
  const handleVerifyBotToken = async () => {
    if (!botToken.trim()) {
      setActionError('Please enter your Telegram Bot Token from @BotFather.');
      return;
    }

    setLoadingAction('verify');
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/telegram/getMe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botToken.trim() }),
      });
      const data = await res.json();

      if (data.ok && data.result) {
        setBotInfo(data.result);
        setActionSuccess(`Verified Bot: @${data.result.username} (${data.result.first_name})`);
        // Also check webhook automatically
        handleGetWebhookInfo(botToken.trim());
      } else {
        setActionError(data.description || 'Failed to authenticate with Telegram Bot API.');
      }
    } catch (err: any) {
      setActionError(`Network error: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // 2. Get Webhook Info
  const handleGetWebhookInfo = async (tokenOverride?: string) => {
    const token = tokenOverride || botToken.trim();
    if (!token) return;

    setLoadingAction('info');
    setActionError(null);

    try {
      const res = await fetch('/api/telegram/getWebhookInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (data.ok && data.result) {
        setWebhookInfo(data.result);
        if (data.result.url) {
          setActionSuccess(`Active Webhook detected: ${data.result.url}`);
        } else {
          setActionSuccess('Bot is currently in polling mode (no active webhook).');
        }
      } else {
        setActionError(data.description || 'Unable to retrieve webhook info.');
      }
    } catch (err: any) {
      setActionError(`Network error: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // 3. Set Webhook
  const handleSetWebhook = async () => {
    if (!botToken.trim()) {
      setActionError('Please provide a Bot Token first.');
      return;
    }
    if (!webhookUrl.trim() || !webhookUrl.startsWith('https://')) {
      setActionError('Telegram Webhook URL must be a valid public HTTPS URL.');
      return;
    }

    setLoadingAction('set');
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/telegram/setWebhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: botToken.trim(),
          url: webhookUrl.trim(),
          secret_token: secretToken.trim() || undefined,
          drop_pending_updates: dropPending,
          allowed_updates: ['message', 'edited_message'],
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setActionSuccess(`🎉 Webhook successfully activated! Telegram is now dispatching updates to: ${webhookUrl}`);
        handleGetWebhookInfo();
      } else {
        setActionError(`Telegram rejected webhook: ${data.description}`);
      }
    } catch (err: any) {
      setActionError(`Network error: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // 4. Delete Webhook
  const handleDeleteWebhook = async () => {
    if (!botToken.trim()) return;

    setLoadingAction('delete');
    setActionError(null);

    try {
      const res = await fetch('/api/telegram/deleteWebhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: botToken.trim(),
          drop_pending_updates: true,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setActionSuccess('Webhook removed. Bot can now use long-polling if desired.');
        setWebhookInfo(null);
        handleGetWebhookInfo();
      } else {
        setActionError(data.description || 'Failed to remove webhook.');
      }
    } catch (err: any) {
      setActionError(`Network error: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // 5. Send Live Test Alert
  const handleSendTestAlert = async () => {
    if (!botToken.trim()) {
      setActionError('Please provide a Bot Token in Step 1 first.');
      return;
    }
    const cleanChatId = testChatId.trim();
    if (!cleanChatId) {
      setActionError('Please enter your personal numeric Telegram Chat ID (or use "Auto-Detect My Chat ID" after sending /start to your bot).');
      return;
    }

    setLoadingAction('test_send');
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/telegram/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: botToken.trim(),
          chat_id: parseInt(cleanChatId, 10),
          text: testMessageText,
          parse_mode: testParseMode === 'Markdown' ? 'Markdown' : undefined,
        }),
      });
      const data = await res.json();

      if (data.ok && data.result) {
        const msgId = data.result.message_id;
        setActionSuccess(`📱 Live test alert delivered to Telegram Chat #${cleanChatId}! (Msg ID: #${msgId}) Check your Telegram app.`);
        setLastReceipt({
          timestamp: new Date().toLocaleTimeString('en-ZA'),
          success: true,
          chatId: cleanChatId,
          messageId: msgId,
          statusMessage: `Delivered successfully to chat #${cleanChatId}`,
          rawResponse: data,
        });
      } else {
        const desc = data.description || data.error || 'Failed to dispatch Telegram message';
        const errCode = data.error_code;
        let cause: SendReceipt['failureCause'] = 'UNKNOWN';

        if (/bot can\'t initiate conversation|Forbidden/i.test(desc)) {
          cause = 'FORBIDDEN_CANT_INITIATE';
          setActionError(`Telegram Error (HTTP 403 Forbidden): The bot cannot message you first. Open your bot in Telegram and tap START.`);
        } else if (/chat not found/i.test(desc)) {
          cause = 'CHAT_NOT_FOUND';
          setActionError(`Telegram Error (HTTP 400 Bad Request): Chat #${cleanChatId} not found. Ensure this is your real personal numeric Telegram User ID.`);
        } else if (/Unauthorized/i.test(desc)) {
          cause = 'INVALID_TOKEN';
          setActionError(`Telegram Error (HTTP 401 Unauthorized): Invalid Bot Token from @BotFather.`);
        } else if (/can\'t parse entities/i.test(desc)) {
          cause = 'PARSE_ERROR';
          setActionError(`Telegram Error (HTTP 400): Markdown entity parse error.`);
        } else {
          setActionError(`Telegram Error: ${desc}`);
        }

        setLastReceipt({
          timestamp: new Date().toLocaleTimeString('en-ZA'),
          success: false,
          chatId: cleanChatId,
          statusMessage: desc,
          errorCode: errCode,
          failureCause: cause,
          rawResponse: data,
        });
      }
    } catch (err: any) {
      setActionError(`Network error: ${err.message}`);
      setLastReceipt({
        timestamp: new Date().toLocaleTimeString('en-ZA'),
        success: false,
        chatId: cleanChatId,
        statusMessage: `Network error: ${err.message}`,
        failureCause: 'UNKNOWN',
        rawResponse: { error: err.message },
      });
    } finally {
      setLoadingAction(null);
    }
  };

  // 6. Test Webhook Locally via internal POST
  const handleSimulateWebhookHit = async (presetType: 'betway_code' | 'betway_multibet' | 'supabets_link' = 'betway_code') => {
    setLoadingAction('simulate_post');
    try {
      let sampleText = 'Betway code: B9471A';
      if (presetType === 'betway_multibet') {
        sampleText =
          'BETWAY SA MULTI-BET #BW-773921\n\n' +
          '1. Mamelodi Sundowns vs Orlando Pirates\n' +
          'Total Match Goals - Over 2.5\n\n' +
          '2. Arsenal vs Chelsea\n' +
          'Total Match Goals - Over 1.5\n\n' +
          '3. Manchester City vs Tottenham\n' +
          '1X2: Manchester City (1.80)';
      } else if (presetType === 'supabets_link') {
        sampleText = 'supabets link: https://new.supabets.co.za/Shared/1250961';
      }

      const mockUpdate = {
        update_id: Math.floor(Math.random() * 100000),
        message: {
          message_id: Math.floor(Math.random() * 10000),
          from: { id: parseInt(testChatId, 10) || 981726450, is_bot: false, first_name: 'Parlay', username: 'bettor_za' },
          chat: { id: parseInt(testChatId, 10) || 981726450, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: sampleText,
        },
      };

      const res = await fetch('/api/webhook/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': secretToken,
        },
        body: JSON.stringify(mockUpdate),
      });

      const data = await res.json();
      if (data.status === 'success') {
        setActionSuccess(`✅ Webhook simulation parsed: ${data.trackedLegs} Over/Under totals tracked, ${data.ignoredLegs} straight 1X2 bets flagged!`);
        fetchWebhookEvents();
      } else {
        setActionSuccess(`Webhook processed: ${data.status}`);
      }
    } catch (err: any) {
      setActionError(`Simulation failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const curlSetWebhook = `curl -X POST "https://api.telegram.org/bot${botToken || '<YOUR_BOT_TOKEN>'}/setWebhook" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "${webhookUrl}",
    "secret_token": "${secretToken}",
    "drop_pending_updates": true,
    "allowed_updates": ["message", "edited_message"]
  }'`;

  const curlGetWebhook = `curl -s "https://api.telegram.org/bot${botToken || '<YOUR_BOT_TOKEN>'}/getWebhookInfo" | jq .`;

  const supabaseDeployCmd = `# 1. Deploy the turnkey Edge Function to Supabase
supabase functions deploy telegram-webhook --no-verify-jwt

# 2. Set your Supabase secrets
supabase secrets set TELEGRAM_BOT_TOKEN="${botToken || 'your-telegram-token'}" \\
  TELEGRAM_WEBHOOK_SECRET="${secretToken}" \\
  SUPABASE_URL="https://rmawoakhlrxeqhdqcpur.supabase.co" \\
  SUPABASE_SERVICE_ROLE_KEY="sb_secret_WGQy61zA6eoMXuNV8nGd0g_yC67bthS"`;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Radio className="w-3 h-3 animate-pulse" />
              Live Ingestion Gateway
            </span>
            <span className="text-xs text-zinc-500 font-mono">Telegram Bot API 7.0+</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-2">
            Telegram Webhook Setup &amp; Dispatcher
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Configure, register, and verify the HTTP POST webhook endpoint to ingest live betslips from Betway SA and Supabets SA, filter Over/Under totals, and trigger real-time Cash Out alarms.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleGetWebhookInfo()}
            disabled={!botToken || loadingAction === 'info'}
            className="px-3.5 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAction === 'info' ? 'animate-spin' : ''}`} />
            Refresh Webhook Info
          </button>
          {botInfo && (
            <a
              href={`https://t.me/${botInfo.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg flex items-center gap-2 transition"
            >
              <Send className="w-3.5 h-3.5" />
              Open @{botInfo.username}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Notifications / Alerts */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-3">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
          <div className="flex-1 font-mono break-all">{actionSuccess}</div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1 font-mono break-all">{actionError}</div>
          <button
            onClick={() => setActionError(null)}
            className="text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Grid: Setup Steps & Verification */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Configuration Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: Telegram Bot Token */}
          <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center font-mono">
                  1
                </span>
                <h2 className="text-sm font-semibold text-white">Bot Father Token Credentials</h2>
              </div>
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
              >
                <span>Open @BotFather</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <p className="text-xs text-zinc-400">
              Message <code className="text-zinc-300">/newbot</code> to Telegram's <strong>@BotFather</strong>, choose a name and username (ending in <em>_bot</em>), then paste the HTTP API bot token below.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-mono text-zinc-400">TELEGRAM_BOT_TOKEN</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="e.g. 7819284729:AAFsK9m0ZqO... or paste token here"
                  className="w-full px-3.5 py-2.5 pr-24 text-xs font-mono bg-zinc-950 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
                />
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="p-1 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    title={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyBotToken}
                    disabled={!botToken || loadingAction === 'verify'}
                    className="px-2.5 py-1 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded cursor-pointer disabled:opacity-50"
                  >
                    {loadingAction === 'verify' ? 'Testing...' : 'Verify'}
                  </button>
                </div>
              </div>
            </div>

            {/* Verified Bot Info Banner */}
            {botInfo && (
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{botInfo.first_name}</span>
                      <span className="text-emerald-400 font-mono">@{botInfo.username}</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      Bot ID: #{botInfo.id} · Groups Allowed: {botInfo.can_join_groups ? 'Yes' : 'No'}
                    </div>
                  </div>
                </div>
                <a
                  href={`https://t.me/${botInfo.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-400/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-400/20"
                >
                  Start Chat
                </a>
              </div>
            )}
          </div>

          {/* Step 2: Webhook Endpoint Target */}
          <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center font-mono">
                2
              </span>
              <h2 className="text-sm font-semibold text-white">Webhook Endpoint URL</h2>
            </div>

            <p className="text-xs text-zinc-400">
              Telegram requires a public HTTPS URL with valid SSL/TLS. Choose one of our pre-configured endpoints or provide a custom serverless gateway.
            </p>

            {/* Endpoint presets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWebhookUrl(defaultAppUrl)}
                className={`p-2.5 rounded-lg border text-left text-xs transition cursor-pointer ${
                  webhookUrl === defaultAppUrl
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Current Applet Server</span>
                </div>
                <div className="text-[10px] text-zinc-500 truncate mt-0.5 font-mono">
                  /api/webhook/telegram
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setWebhookUrl('https://rmawoakhlrxeqhdqcpur.supabase.co/functions/v1/telegram-webhook')
                }
                className={`p-2.5 rounded-lg border text-left text-xs transition cursor-pointer ${
                  webhookUrl.includes('supabase.co')
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Supabase Edge Function</span>
                </div>
                <div className="text-[10px] text-zinc-500 truncate mt-0.5 font-mono">
                  rmawoakhlrxeqhdqcpur.supabase.co
                </div>
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-mono text-zinc-400">PUBLIC WEBHOOK URL (HTTPS ONLY)</label>
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3.5 py-2.5 text-xs font-mono bg-zinc-950 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-zinc-400">SECRET TOKEN (HMAC HEADER)</label>
                <input
                  type="text"
                  value={secretToken}
                  onChange={(e) => setSecretToken(e.target.value)}
                  placeholder="Optional secret token"
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300"
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="dropPendingCheck"
                  checked={dropPending}
                  onChange={(e) => setDropPending(e.target.checked)}
                  className="w-4 h-4 rounded accent-amber-400 cursor-pointer"
                />
                <label htmlFor="dropPendingCheck" className="text-xs text-zinc-300 cursor-pointer">
                  Drop pending backlog updates on connect
                </label>
              </div>
            </div>

            {/* Webhook Control Buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSetWebhook}
                disabled={loadingAction === 'set' || !botToken}
                className="px-4 py-2.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-zinc-950 rounded-lg flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Zap className="w-4 h-4 fill-current" />
                {loadingAction === 'set' ? 'Registering Webhook...' : 'Set Active Webhook'}
              </button>

              <button
                type="button"
                onClick={() => handleGetWebhookInfo()}
                disabled={loadingAction === 'info' || !botToken}
                className="px-4 py-2.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAction === 'info' ? 'animate-spin' : ''}`} />
                Check Status
              </button>

              <button
                type="button"
                onClick={handleDeleteWebhook}
                disabled={loadingAction === 'delete' || !botToken}
                className="px-3.5 py-2.5 text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg flex items-center gap-2 transition cursor-pointer disabled:opacity-50 ml-auto"
                title="Unregister webhook from Telegram"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Webhook
              </button>
            </div>
          </div>

          {/* Step 3: Direct Phone Test (Send Live Alert to Chat ID) */}
          <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center font-mono">
                  3
                </span>
                <h2 className="text-sm font-semibold text-white">Live Phone Alarm Dispatcher &amp; Diagnostics</h2>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">Telegram API v7</span>
            </div>

            {/* Telegram Prerequisite Banner */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>Why Telegram test alarms might not arrive:</span>
              </div>
              <ul className="text-zinc-300 space-y-1 text-[11px] list-disc list-inside">
                <li>
                  <strong className="text-white">Rule 1 (Bot Can't Initiate):</strong> Telegram strictly blocks bots from sending the first message to any user. You <strong>must</strong> open your bot in Telegram and tap <strong>START</strong> once.
                </li>
                <li>
                  <strong className="text-white">Rule 2 (Numeric Chat ID):</strong> You must enter your personal numeric user ID (e.g. <code className="text-amber-300">123456789</code>), not a dummy placeholder or channel username.
                </li>
              </ul>
              {botInfo?.username && (
                <div className="pt-1">
                  <a
                    href={`https://t.me/${botInfo.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 text-zinc-950 font-bold text-xs hover:bg-amber-300 transition shadow"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open @{botInfo.username} in Telegram &amp; Tap START</span>
                  </a>
                </div>
              )}
            </div>

            {/* Auto-detected Chat ID Banner if webhook captured a real message */}
            {events.length > 0 && events.find((ev) => ev.chatId) && (
              <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-zinc-300">
                    Detected message from <strong className="text-white">@{events[0].fromName || 'User'}</strong> (Chat ID: <code className="text-emerald-400 font-mono font-bold">{events[0].chatId}</code>)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setTestChatId(String(events[0].chatId))}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg cursor-pointer"
                >
                  Use This Chat ID
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-zinc-400">YOUR TELEGRAM CHAT ID</label>
                  <a
                    href="https://t.me/userinfobot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5"
                  >
                    <span>@userinfobot</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <input
                  type="text"
                  value={testChatId}
                  onChange={(e) => setTestChatId(e.target.value)}
                  placeholder="e.g. 123456789"
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
                />
                <span className="text-[10px] text-zinc-500 block">
                  Find via <code className="text-zinc-400">@userinfobot</code> or send <code className="text-zinc-400">/start</code> to your bot
                </span>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-zinc-400">ALERT PREVIEW MESSAGE</label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 font-mono">Format:</span>
                    <button
                      type="button"
                      onClick={() => setTestParseMode(testParseMode === 'Markdown' ? 'Plain' : 'Markdown')}
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-mono transition cursor-pointer ${
                        testParseMode === 'Markdown'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                      }`}
                    >
                      {testParseMode === 'Markdown' ? 'Markdown' : 'Plain Text'}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={testMessageText}
                  onChange={(e) => setTestMessageText(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 resize-none focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Quick preset message buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[10px] font-mono text-zinc-500">Presets:</span>
              <button
                type="button"
                onClick={() =>
                  setTestMessageText(
                    '🚨 *GOAL ALERT (58\')* 🚨\n\n' +
                      '⚽ *Mamelodi Sundowns 1 - 0 Orlando Pirates*\n' +
                      '🎯 Tracking Leg: *Total Match Goals - Over 2.5*\n' +
                      '📊 Current Total: *1 Goal* (Needs 2 more for full win)\n\n' +
                      '💡 *CASH OUT ACTION:* Betway SA cash-out value surged by ~35%. Check your betslip to lock in profit!'
                  )
                }
                className="text-[10px] px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 cursor-pointer"
              >
                Betway Goal Alert (Over 2.5)
              </button>
              <button
                type="button"
                onClick={() =>
                  setTestMessageText(
                    '🚩 *CORNER ALERT (81\')* 🚩\n\n' +
                      '⚽ *Kaizer Chiefs vs Cape Town City*\n' +
                      '⏱️ *Match Minute:* `81\'`\n' +
                      '📊 *Corners:* `8 corners` ➔ *`9 corners`*\n' +
                      '🎯 *Tracked Leg:* `Total Match Corners - Over 8.5`\n\n' +
                      '✅ *LEG WON! TARGET SURPASSED*\n' +
                      '💡 *CASH OUT ACTION:* Open Betway / Supabets to lock in max profit!'
                  )
                }
                className="text-[10px] px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 cursor-pointer"
              >
                Corner Alert (Over 8.5)
              </button>
            </div>

            {/* Simulation & Dispatch Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500 font-mono">Simulate:</span>
                <button
                  type="button"
                  onClick={() => handleSimulateWebhookHit('betway_code')}
                  disabled={loadingAction === 'simulate_post'}
                  className="px-2.5 py-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  title="Simulate receiving Betway booking code B9471A"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Betway Code (#B9471A)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateWebhookHit('supabets_link')}
                  disabled={loadingAction === 'simulate_post'}
                  className="px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-950 border border-zinc-800 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  title="Simulate receiving Supabets coupon link #1250961"
                >
                  <span>Supabets (#1250961)</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSendTestAlert}
                disabled={loadingAction === 'test_send' || !botToken}
                className="px-5 py-2.5 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-md"
              >
                <Send className="w-4 h-4" />
                {loadingAction === 'test_send' ? 'Dispatching to Telegram...' : 'Send Live Test Alarm to Phone'}
              </button>
            </div>

            {/* Live Delivery Diagnostics / Receipt Box */}
            {lastReceipt && (
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  lastReceipt.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {lastReceipt.success ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span>LIVE ALARM DELIVERED! (Telegram Msg ID #{lastReceipt.messageId})</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>TELEGRAM DISPATCH FAILED ({lastReceipt.errorCode ? `HTTP ${lastReceipt.errorCode}` : 'Error'})</span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">{lastReceipt.timestamp}</span>
                </div>

                <div className="text-xs text-zinc-200">
                  {lastReceipt.success ? (
                    <p>
                      Successfully delivered to Telegram Chat <strong>#{lastReceipt.chatId}</strong>. Check your phone's Telegram notification now!
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="font-semibold text-rose-200">{lastReceipt.statusMessage}</p>

                      {lastReceipt.failureCause === 'FORBIDDEN_CANT_INITIATE' && (
                        <div className="p-3 rounded-lg bg-zinc-950 border border-rose-500/20 text-[11px] text-zinc-300 space-y-2">
                          <p>
                            👉 <strong>Exact Fix:</strong> Telegram prohibits bots from contacting users first. Open the bot in your Telegram app and send <code>/start</code>:
                          </p>
                          {botInfo?.username && (
                            <a
                              href={`https://t.me/${botInfo.username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400 text-zinc-950 font-bold text-xs hover:bg-emerald-300 transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open @{botInfo.username} &amp; Tap START</span>
                            </a>
                          )}
                        </div>
                      )}

                      {lastReceipt.failureCause === 'CHAT_NOT_FOUND' && (
                        <div className="p-3 rounded-lg bg-zinc-950 border border-rose-500/20 text-[11px] text-zinc-300 space-y-1">
                          <p>
                            👉 <strong>Exact Fix:</strong> Chat ID <code>#{lastReceipt.chatId}</code> was not recognized by Telegram.
                          </p>
                          <p>
                            1. Open your bot in Telegram and send <code>/start</code>.
                          </p>
                          <p>
                            2. Or open <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">@userinfobot</a> to see your numeric User ID.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-1 flex items-center justify-between border-t border-zinc-800/60">
                  <button
                    type="button"
                    onClick={() => setShowRawDetails(!showRawDetails)}
                    className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer font-mono"
                  >
                    {showRawDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    <span>{showRawDetails ? 'Hide' : 'Show'} Raw Telegram API Response</span>
                  </button>
                  <span className="text-[10px] font-mono text-zinc-500">Target Chat: #{lastReceipt.chatId}</span>
                </div>

                {showRawDetails && (
                  <pre className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-300 overflow-x-auto whitespace-pre">
                    {JSON.stringify(lastReceipt.rawResponse, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Telemetry, Logs & Deployment CLI (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Telegram Webhook Status Card */}
          <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                Telegram Webhook Info
              </h2>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  webhookInfo?.url
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {webhookInfo?.url ? 'ACTIVE' : 'DISCONNECTED'}
              </span>
            </div>

            {webhookInfo ? (
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>Registered URL:</span>
                    <button
                      onClick={() => handleCopy(webhookInfo.url, 'whurl')}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px]"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedKey === 'whurl' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="text-white text-[11px] break-all select-all font-semibold">
                    {webhookInfo.url || '(none - polling mode)'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/60">
                    <span className="text-zinc-500 block">Pending Updates</span>
                    <span className={`text-base font-bold ${webhookInfo.pending_update_count > 0 ? 'text-amber-400' : 'text-zinc-200'}`}>
                      {webhookInfo.pending_update_count}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/60">
                    <span className="text-zinc-500 block">Max Connections</span>
                    <span className="text-base font-bold text-zinc-200">
                      {webhookInfo.max_connections || 40}
                    </span>
                  </div>
                </div>

                {webhookInfo.last_error_message && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] space-y-1">
                    <span className="font-semibold block flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      Last Telegram Error:
                    </span>
                    <div className="text-zinc-300">{webhookInfo.last_error_message}</div>
                    {webhookInfo.last_error_date && (
                      <div className="text-zinc-500 text-[10px]">
                        {new Date(webhookInfo.last_error_date * 1000).toLocaleString('en-ZA')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-zinc-500 font-mono rounded-xl bg-zinc-950 border border-dashed border-zinc-800">
                Click "Check Status" or "Verify" after providing your Bot Token to view live webhook telemetry.
              </div>
            )}
          </div>

          {/* Captured Webhook Updates Stream */}
          <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-400" />
                Live Ingestion Stream
              </h2>
              <span className="text-xs text-zinc-500 font-mono">{events.length} captured</span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto font-mono text-xs pr-1">
              {events.length === 0 ? (
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-zinc-500 text-xs">
                  No webhook events received yet. Send a betslip from Betway or Supabets on Telegram or click "Simulate Webhook Ingestion"!
                </div>
              ) : (
                events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-300 font-semibold">
                        @{ev.fromName || 'User'} (#{ev.chatId})
                      </span>
                      <span className="text-zinc-500 text-[10px]">
                        {new Date(ev.timestamp).toLocaleTimeString('en-ZA')}
                      </span>
                    </div>

                    <div className="text-zinc-400 text-[11px] truncate">{ev.rawText}</div>

                    <div className="flex items-center gap-2 text-[10px] pt-1">
                      <span
                        className={`px-1.5 py-0.5 rounded ${
                          ev.status === 'SUCCESS'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : ev.status === 'COMMAND'
                            ? 'bg-sky-500/20 text-sky-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {ev.status}
                      </span>
                      <span className="text-zinc-500">
                        Tracked: <strong className="text-zinc-300">{ev.trackedLegsCount}</strong> · Ignored: <strong className="text-zinc-400">{ev.ignoredLegsCount}</strong>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Terminal Snippets (curl & Supabase CLI) */}
          <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-zinc-400" />
              Terminal &amp; Supabase CLI
            </h2>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                  <span>Supabase Edge Function Deployment</span>
                  <button
                    onClick={() => handleCopy(supabaseDeployCmd, 'supacli')}
                    className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px]"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedKey === 'supacli' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-300 font-mono overflow-x-auto whitespace-pre">
                  {supabaseDeployCmd}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                  <span>cURL Command (Direct Telegram API)</span>
                  <button
                    onClick={() => handleCopy(curlSetWebhook, 'curlset')}
                    className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px]"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedKey === 'curlset' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-300 font-mono overflow-x-auto whitespace-pre">
                  {curlSetWebhook}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
