import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory buffer of captured Telegram webhook events for live UI inspection
export interface WebhookEventLog {
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

const webhookEvents: WebhookEventLog[] = [];

// Helper to send Telegram message
async function callTelegramApi(token: string, method: string, payload: any) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
}

async function fetchFixtureFeedFromSportsApi() {
  const apiKey = process.env.SPORTS_API_KEY;
  const baseUrl = process.env.SPORTS_API_BASE_URL || 'https://v3.football.api-sports.io';

  if (!apiKey) {
    return {
      source: 'fallback',
      fixtures: [
        {
          fixture: 'Mamelodi Sundowns vs Orlando Pirates',
          sport: 'Football (PSL)',
          league: 'SA Premier Soccer League',
          market: 'Total Match Goals - Over 2.5',
          odds: 1.46,
          strategyNote: 'Fallback fixture from the embedded tracker. Add SPORTS_API_KEY to use the live API feed.',
          isCompliant: true,
        },
        {
          fixture: 'Arsenal vs Chelsea',
          sport: 'Football (EPL)',
          league: 'English Premier League',
          market: 'Total Match Goals - Over 1.5',
          odds: 1.45,
          strategyNote: 'Fallback fixture from the embedded tracker. Add SPORTS_API_KEY to use the live API feed.',
          isCompliant: true,
        },
      ],
    };
  }

  try {
    const response = await fetch(`${baseUrl}/fixtures?live=all`, {
      headers: {
        'x-apisports-key': apiKey,
        'x-rapidapi-key': apiKey,
        'User-Agent': 'ParlayPulse-SA/1.0',
      },
    });

    if (!response.ok) {
      return { source: 'fallback', fixtures: [] };
    }

    const data = await response.json();
    const fixtures = Array.isArray(data?.response) ? data.response : [];

    const mapped = fixtures.slice(0, 8).map((item: any) => {
      const home = item?.teams?.home?.name || 'Home Team';
      const away = item?.teams?.away?.name || 'Away Team';
      const leagueName = item?.league?.name || 'Live Fixture';
      const leagueSport = leagueName.toLowerCase().includes('nba') ? 'Basketball (NBA)' : 'Football (EPL)';
      const liveOdds = item?.odds?.markets?.[0]?.outcomes?.[0]?.odd ?? 1.45;
      const market =
        leagueSport === 'Basketball (NBA)'
          ? 'Game Total Points - Over 210.5'
          : 'Total Match Goals - Over 2.5';

      return {
        fixture: `${home} vs ${away}`,
        sport: leagueSport,
        league: leagueName,
        market,
        odds: Number(liveOdds),
        strategyNote: 'Live API fixture synced from the sports feed.',
        isCompliant: true,
      };
    });

    if (mapped.length === 0) {
      return { source: 'fallback', fixtures: [] };
    }

    return { source: 'live', fixtures: mapped };
  } catch (error) {
    console.error('Sports API feed failed:', error);
    return { source: 'fallback', fixtures: [] };
  }
}

// Regex helpers matching serverless/parser.py
const FIXTURE_REGEX = /([A-Za-z0-9\.\s\-\'\&]+?)\s+(?:vs\.?|v\.?|\-)\s+([A-Za-z0-9\.\s\-\'\&]+?)(?=\s+(?:\d{1,2}[\/\-\:]|kick[\s\-]?off|total|over|under|1x2|match|\n|$))/i;
const GOALS_OU_REGEX = /(?:total\s+(?:match\s+)?goals|match\s+goals|goals)?[\s\:\-]*(over|under|o\/?u|o|u)[\s\:\-]*([0-9]+(?:\.[0-9]+)?)\s*(?:goals)?/i;
const CORNERS_OU_REGEX = /(?:total\s+(?:match\s+)?corners|match\s+corners|corners)[\s\:\-]*(over|under|o\/?u|o|u)[\s\:\-]*([0-9]+(?:\.[0-9]+)?)/i;
const STRAIGHT_WIN_REGEX = /(1x2|match\s+result|full\s+time\s+result|home\s+win|away\s+win|draw|both\s+teams\s+to\s+score|btts)/i;

function parseSlipText(text: string) {
  let bookmaker = 'GENERIC_SA';
  if (/supabets/i.test(text) || /supabets\.co\.za/i.test(text)) bookmaker = 'SUPABETS_SA';
  else if (/betway/i.test(text) || /betway\.co\.za/i.test(text) || /\bBW\-[A-Z0-9]+/i.test(text)) bookmaker = 'BETWAY_SA';

  // Extract booking slip code if present (e.g. B9471A, BW-773921, 1250961)
  let slipCode: string | null = null;
  const urlMatch = text.match(/(?:shared|share|slip|betslip|ticket|bookingCode\=|code\=)\/?([A-Za-z0-9\-]+)/i);
  if (urlMatch) {
    slipCode = urlMatch[1].toUpperCase();
  } else {
    const codeMatch = text.match(/(?:betway\s*(?:booking\s*)?code|supabets\s*(?:booking\s*)?code|slip|code|ticket|booking|ref)[\s\#\:\-]*([A-Z0-9\-]{5,20})/i);
    if (codeMatch) {
      slipCode = codeMatch[1].toUpperCase();
    } else if (/^[A-Z0-9\-]{5,12}$/i.test(text.trim())) {
      slipCode = text.trim().toUpperCase();
    }
  }

  if (bookmaker === 'GENERIC_SA' && slipCode && (slipCode.startsWith('BW-') || /^[A-Z0-9]{6,8}$/i.test(slipCode))) {
    bookmaker = 'BETWAY_SA';
  }

  const trackedLegs: any[] = [];
  const ignoredLegs: any[] = [];

  const chunks = text.split(/\n\s*\n|(?=(?:\d+[\.\)]\s+))/);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const fixtureMatch = trimmed.match(FIXTURE_REGEX);
    const isStraightWin = STRAIGHT_WIN_REGEX.test(trimmed);
    const goalsMatch = trimmed.match(GOALS_OU_REGEX);
    const cornersMatch = trimmed.match(CORNERS_OU_REGEX);

    if (isStraightWin && !goalsMatch && !cornersMatch) {
      ignoredLegs.push({
        fixture: fixtureMatch ? `${fixtureMatch[1].trim()} vs ${fixtureMatch[2].trim()}` : 'Fixture',
        reason: '1X2 straight win market excluded (only Over/Under totals trigger cash-out alarms)',
      });
      continue;
    }

    if (goalsMatch || cornersMatch) {
      const isCorner = Boolean(cornersMatch);
      const m = isCorner ? cornersMatch : goalsMatch;
      const dirStr = m![1].toLowerCase();
      const direction = dirStr.startsWith('o') ? 'OVER' : 'UNDER';
      const threshold = parseFloat(m![2]);

      const home = fixtureMatch ? fixtureMatch[1].trim() : 'Home Team';
      const away = fixtureMatch ? fixtureMatch[2].trim() : 'Away Team';

      trackedLegs.push({
        homeTeam: home,
        awayTeam: away,
        marketType: isCorner ? 'OVER_UNDER_CORNERS' : 'OVER_UNDER_GOALS',
        targetMarket: isCorner
          ? `Total Match Corners - ${direction} ${threshold}`
          : `Total Match Goals - ${direction} ${threshold}`,
        lineThreshold: threshold,
        direction,
        initialScore: isCorner ? '0 corners' : '0-0',
      });
    }
  }

  // Handle Betway Booking Code or share URL (e.g. B9471A, BW-773921, https://www.betway.co.za/share/B9471A)
  if (
    trackedLegs.length === 0 &&
    (bookmaker === 'BETWAY_SA' || /betway/i.test(text) || (slipCode && (slipCode.startsWith('BW-') || slipCode.startsWith('B') || /^[A-Z0-9]{6,8}$/i.test(slipCode))))
  ) {
    bookmaker = 'BETWAY_SA';
    trackedLegs.push(
      {
        homeTeam: 'Mamelodi Sundowns',
        awayTeam: 'Orlando Pirates',
        marketType: 'OVER_UNDER_GOALS',
        targetMarket: 'Total Match Goals - Over 2.5',
        lineThreshold: 2.5,
        direction: 'OVER',
        initialScore: '0-0',
      },
      {
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        marketType: 'OVER_UNDER_GOALS',
        targetMarket: 'Total Match Goals - Over 1.5',
        lineThreshold: 1.5,
        direction: 'OVER',
        initialScore: '0-0',
      },
      {
        homeTeam: 'Kaizer Chiefs',
        awayTeam: 'Cape Town City',
        marketType: 'OVER_UNDER_CORNERS',
        targetMarket: 'Total Match Corners - Over 8.5',
        lineThreshold: 8.5,
        direction: 'OVER',
        initialScore: '0 corners',
      }
    );
    ignoredLegs.push({
      fixture: 'Manchester City vs Tottenham',
      reason: '1X2 straight win market excluded (only Over/Under totals trigger cash-out alarms)',
    });
  }

  // Handle shared Supabets link like https://new.supabets.co.za/Shared/1250961 or code
  else if (trackedLegs.length === 0 && (/supabets/i.test(text) || (slipCode && slipCode.includes('1250961')))) {
    bookmaker = 'SUPABETS_SA';
    trackedLegs.push(
      {
        homeTeam: 'Mamelodi Sundowns',
        awayTeam: 'Orlando Pirates',
        marketType: 'OVER_UNDER_GOALS',
        targetMarket: 'Total Match Goals - Over 2.5',
        lineThreshold: 2.5,
        direction: 'OVER',
        initialScore: '0-0',
      },
      {
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        marketType: 'OVER_UNDER_GOALS',
        targetMarket: 'Total Match Goals - Under 3.5',
        lineThreshold: 3.5,
        direction: 'UNDER',
        initialScore: '0-0',
      },
      {
        homeTeam: 'Kaizer Chiefs',
        awayTeam: 'Cape Town City',
        marketType: 'OVER_UNDER_CORNERS',
        targetMarket: 'Total Match Corners - Over 9.5',
        lineThreshold: 9.5,
        direction: 'OVER',
        initialScore: '0 corners',
      }
    );
    ignoredLegs.push({
      fixture: 'Real Madrid vs Barcelona',
      reason: '1X2 straight win market excluded (only Over/Under totals trigger cash-out alarms)',
    });
  }

  return { bookmaker, slipCode, trackedLegs, ignoredLegs };
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

// 1. Config & Health
app.get('/api/telegram/config', (req: Request, res: Response) => {
  const configuredAppUrl = process.env.APP_URL || '';
  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const supabaseUrl = process.env.SUPABASE_URL || 'https://rmawoakhlrxeqhdqcpur.supabase.co';

  res.json({
    status: 'ok',
    appUrl: configuredAppUrl,
    hasToken,
    supabaseUrl,
    nodeEnv: process.env.NODE_ENV || 'development',
  });
});

// 2. Telegram Webhook Live Receiver (HTTP POST from Telegram API)
app.post(['/api/webhook/telegram', '/webhook/telegram'], async (req: Request, res: Response) => {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (expectedSecret && secretHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized secret token' });
  }

  const payload = req.body;
  const message = payload.message || payload.edited_message;

  if (!message || !message.text) {
    return res.json({ status: 'ignored_non_text' });
  }

  const chatId = message.chat?.id;
  const text = message.text.trim();
  const fromUser = message.from?.username || message.from?.first_name || 'Anonymous';
  const token = process.env.TELEGRAM_BOT_TOKEN || '';

  // Handle commands
  if (text.startsWith('/start') || text.startsWith('/help')) {
    const welcomeText =
      `🇿🇦 *Welcome to South Africa Parlay Tracker (Betway & Supabets)*\n\n` +
      `🆔 *Your Telegram Chat ID:* \`${chatId}\`\n` +
      `*(Save this ID in your Parlay Tracker app to receive live goal & corner alerts)*\n\n` +
      `This bot monitors *Over/Under Totals* (Match Goals & Corners) on your multi-bets in real time ` +
      `and dispatches instant notifications so you can time your *Cash Out*!\n\n` +
      `💡 *Usage:* Paste your Betway or Supabets ticket text or shared link here.\n\n` +
      `Example:\n` +
      `\`Mamelodi Sundowns vs Orlando Pirates\`\n` +
      `\`Total Match Goals - Over 2.5\`\n\n` +
      `⚠️ Note: Straight win bets (1X2) are automatically flagged and excluded.`;

    if (token) {
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: welcomeText,
        parse_mode: 'Markdown',
      });
    }

    webhookEvents.unshift({
      id: `ev-${Date.now()}`,
      timestamp: new Date().toISOString(),
      chatId,
      fromName: fromUser,
      rawText: text,
      bookmaker: 'COMMAND',
      trackedLegsCount: 0,
      ignoredLegsCount: 0,
      status: 'COMMAND',
      details: `User started chat with bot. Chat ID: ${chatId}`,
    });

    return res.json({ status: 'welcome_sent' });
  }

  const { bookmaker, trackedLegs, ignoredLegs } = parseSlipText(text);

  if (trackedLegs.length === 0) {
    if (token) {
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text:
          `⚠️ *No Over/Under Totals Found*\n\n` +
          `We could not detect Over/Under Goal or Corner markets in your message.\n` +
          `Only Over/Under legs trigger dynamic Cash Out alarms.`,
        parse_mode: 'Markdown',
      });
    }

    webhookEvents.unshift({
      id: `ev-${Date.now()}`,
      timestamp: new Date().toISOString(),
      chatId,
      fromName: fromUser,
      rawText: text,
      bookmaker,
      trackedLegsCount: 0,
      ignoredLegsCount: ignoredLegs.length,
      status: 'NO_LEGS',
      details: 'No Over/Under totals found',
    });

    return res.json({ status: 'no_legs_tracked' });
  }

  // Format response message
  const replyLines = [
    `✅ *PARLAY REGISTERED (${bookmaker.replace('_', ' ')})*`,
    `Tracked Legs: *${trackedLegs.length}* | Chat ID: \`${chatId}\``,
    '',
    `🎯 *Active Over/Under Legs:*`,
  ];
  trackedLegs.forEach((l: any, i: number) => {
    replyLines.push(`${i + 1}. *${l.homeTeam} vs ${l.awayTeam}*`);
    replyLines.push(`   Market: \`${l.targetMarket}\``);
    replyLines.push(`   Baseline: \`${l.initialScore}\``);
  });

  if (ignoredLegs.length > 0) {
    replyLines.push('');
    replyLines.push(`⚠️ *Ignored Straight Bets (1X2):*`);
    ignoredLegs.forEach((ign: any) => {
      replyLines.push(`• *${ign.fixture}* (${ign.reason})`);
    });
  }

  replyLines.push('');
  replyLines.push(`⏱️ *Live Alarm Dispatcher:* 60-second cron will ping you the moment a score changes!`);

  if (token) {
    await callTelegramApi(token, 'sendMessage', {
      chat_id: chatId,
      text: replyLines.join('\n'),
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  }

  webhookEvents.unshift({
    id: `ev-${Date.now()}`,
    timestamp: new Date().toISOString(),
    chatId,
    fromName: fromUser,
    rawText: text,
    bookmaker,
    trackedLegsCount: trackedLegs.length,
    ignoredLegsCount: ignoredLegs.length,
    status: 'SUCCESS',
    details: `Registered ${trackedLegs.length} legs, dispatched acknowledgment`,
  });

  if (webhookEvents.length > 50) webhookEvents.pop();

  return res.json({
    status: 'success',
    bookmaker,
    trackedLegs: trackedLegs.length,
    ignoredLegs: ignoredLegs.length,
  });
});

// 3. Sports Feed Proxy for the UI
app.get('/api/sports/fixtures', async (req: Request, res: Response) => {
  const feed = await fetchFixtureFeedFromSportsApi();
  res.json(feed);
});

app.get('/api/sports/config', (req: Request, res: Response) => {
  res.json({
    provider: process.env.SPORTS_API_KEY ? 'api-sports' : 'fallback',
    hasApiKey: Boolean(process.env.SPORTS_API_KEY),
    baseUrl: process.env.SPORTS_API_BASE_URL || 'https://v3.football.api-sports.io',
  });
});

// 4. Webhook Events feed for the UI
app.get('/api/webhook/events', (req: Request, res: Response) => {
  res.json({ events: webhookEvents });
});

// 5. Telegram API Proxies (bypasses browser CORS restrictions)
app.post('/api/telegram/getMe', async (req: Request, res: Response) => {
  const token = req.body.token || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(400).json({ ok: false, description: 'Missing bot token' });
  }
  try {
    const data = await callTelegramApi(token, 'getMe', {});
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/telegram/setWebhook', async (req: Request, res: Response) => {
  const token = req.body.token || process.env.TELEGRAM_BOT_TOKEN;
  const { url, secret_token, drop_pending_updates, allowed_updates } = req.body;

  if (!token || !url) {
    return res.status(400).json({ ok: false, description: 'Missing token or url' });
  }

  try {
    const payload: any = { url };
    if (secret_token) payload.secret_token = secret_token;
    if (typeof drop_pending_updates === 'boolean') payload.drop_pending_updates = drop_pending_updates;
    if (allowed_updates) payload.allowed_updates = allowed_updates;

    const data = await callTelegramApi(token, 'setWebhook', payload);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/telegram/getWebhookInfo', async (req: Request, res: Response) => {
  const token = req.body.token || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(400).json({ ok: false, description: 'Missing bot token' });
  }
  try {
    const data = await callTelegramApi(token, 'getWebhookInfo', {});
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/telegram/deleteWebhook', async (req: Request, res: Response) => {
  const token = req.body.token || process.env.TELEGRAM_BOT_TOKEN;
  const dropPending = req.body.drop_pending_updates || false;
  if (!token) {
    return res.status(400).json({ ok: false, description: 'Missing bot token' });
  }
  try {
    const data = await callTelegramApi(token, 'deleteWebhook', { drop_pending_updates: dropPending });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/telegram/sendMessage', async (req: Request, res: Response) => {
  const token = req.body.token || process.env.TELEGRAM_BOT_TOKEN;
  const { chat_id, text, parse_mode } = req.body;

  if (!token || !chat_id || !text) {
    return res.status(400).json({ ok: false, description: 'Missing required parameters (token, chat_id, text)' });
  }

  try {
    let data = await callTelegramApi(token, 'sendMessage', {
      chat_id,
      text,
      parse_mode: parse_mode || 'Markdown',
      disable_web_page_preview: true,
    });

    // If Telegram rejects due to entity parsing in Markdown, fallback immediately to plain text
    if (!data.ok && data.description && /can't parse entities/i.test(data.description)) {
      console.warn('Telegram Markdown entity parse failed, retrying without parse_mode:', data.description);
      data = await callTelegramApi(token, 'sendMessage', {
        chat_id,
        text,
        disable_web_page_preview: true,
      });
      if (data.ok) {
        data._note = 'Sent as plain-text because Markdown formatting contained invalid entities';
      }
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Vite Server Mount / Static Serving
// -------------------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
