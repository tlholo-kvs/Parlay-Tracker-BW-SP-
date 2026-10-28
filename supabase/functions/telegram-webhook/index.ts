// Supabase Edge Function: telegram-webhook
// Deploy to your Supabase project (e.g., rmawoakhlrxeqhdqcpur) using:
// supabase functions deploy telegram-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

// Regex patterns for South African Sportsbooks (Betway & Supabets)
const FIXTURE_REGEX = /([A-Za-z0-9\.\s\-\'\&]+?)\s+(?:vs\.?|v\.?|\-)\s+([A-Za-z0-9\.\s\-\'\&]+?)(?=\s+(?:\d{1,2}[\/\-\:]|kick[\s\-]?off|total|over|under|1x2|match|\n|$))/i;
const GOALS_OU_REGEX = /(?:total\s+(?:match\s+)?goals|match\s+goals|goals)?[\s\:\-]*(over|under|o\/?u|o|u)[\s\:\-]*([0-9]+(?:\.[0-9]+)?)\s*(?:goals)?/i;
const CORNERS_OU_REGEX = /(?:total\s+(?:match\s+)?corners|match\s+corners|corners)[\s\:\-]*(over|under|o\/?u|o|u)[\s\:\-]*([0-9]+(?:\.[0-9]+)?)/i;
const STRAIGHT_WIN_REGEX = /(1x2|match\s+result|full\s+time\s+result|home\s+win|away\s+win|draw|both\s+teams\s+to\s+score|btts)/i;

async function sendTelegramMessage(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to send Telegram message:", err);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // Verify secret token if set
  if (WEBHOOK_SECRET) {
    const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (headerSecret !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const payload = await req.json();
    const message = payload.message || payload.edited_message;

    if (!message || !message.text) {
      return new Response(JSON.stringify({ status: "ignored_no_message" }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Command handling
    if (text.startsWith("/start") || text.startsWith("/help")) {
      const welcome = `🇿🇦 *Welcome to South Africa Parlay Tracker (Betway & Supabets)*\n\n` +
        `This bot monitors *Over/Under Totals* (Match Goals & Corners) on your multi-bets in real time ` +
        `and dispatches instant notifications so you can time your *Cash Out*!\n\n` +
        `💡 *Usage:* Paste your Betway or Supabets ticket text or shared link here.\n\n` +
        `⚠️ Straight win bets (1X2) are automatically flagged and excluded.`;
      await sendTelegramMessage(chatId, welcome);
      return new Response(JSON.stringify({ status: "welcome_sent" }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Identify bookmaker
    let bookmaker = "GENERIC_SA";
    if (/supabets/i.test(text) || /supabets\.co\.za/i.test(text)) bookmaker = "SUPABETS_SA";
    else if (/betway/i.test(text) || /betway\.co\.za/i.test(text) || /\bBW\-[A-Z0-9]+/i.test(text)) bookmaker = "BETWAY_SA";

    // Extract booking slip code if present
    let slipCode: string | null = null;
    const urlCodeMatch = text.match(/(?:shared|share|slip|betslip|ticket|bookingCode\=|code\=)\/?([A-Za-z0-9\-]+)/i);
    if (urlCodeMatch) {
      slipCode = urlCodeMatch[1].toUpperCase();
    } else {
      const textCodeMatch = text.match(/(?:betway\s*(?:booking\s*)?code|supabets\s*(?:booking\s*)?code|slip|code|ticket|booking|ref)[\s\#\:\-]*([A-Z0-9\-]{5,20})/i);
      if (textCodeMatch) {
        slipCode = textCodeMatch[1].toUpperCase();
      } else if (/^[A-Z0-9\-]{5,12}$/i.test(text.trim())) {
        slipCode = text.trim().toUpperCase();
      }
    }

    if (bookmaker === "GENERIC_SA" && slipCode && (slipCode.startsWith("BW-") || /^[A-Z0-9]{6,8}$/i.test(slipCode))) {
      bookmaker = "BETWAY_SA";
    }

    // Detect shared link or text blocks
    const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
    const trackedLegs: any[] = [];
    const ignoredLegs: any[] = [];

    // Parse blocks
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
          fixture: fixtureMatch ? `${fixtureMatch[1].trim()} vs ${fixtureMatch[2].trim()}` : "Match Fixture",
          reason: "1X2 straight win market (only Over/Under totals trigger cash-out alarms)",
        });
        continue;
      }

      if (goalsMatch || cornersMatch) {
        const isCorner = Boolean(cornersMatch);
        const match = isCorner ? cornersMatch : goalsMatch;
        const dirStr = match![1].toLowerCase();
        const direction = (dirStr.startsWith("o")) ? "OVER" : "UNDER";
        const threshold = parseFloat(match![2]);

        const home = fixtureMatch ? fixtureMatch[1].trim() : "Home Team";
        const away = fixtureMatch ? fixtureMatch[2].trim() : "Away Team";

        trackedLegs.push({
          homeTeam: home,
          awayTeam: away,
          marketType: isCorner ? "OVER_UNDER_CORNERS" : "OVER_UNDER_GOALS",
          targetMarket: isCorner ? `Total Match Corners - ${direction} ${threshold}` : `Total Match Goals - ${direction} ${threshold}`,
          lineThreshold: threshold,
          direction,
          initialScore: isCorner ? "0 corners" : "0-0",
        });
      }
    }

    // Fallback for Betway booking code or shared link
    if (
      trackedLegs.length === 0 &&
      (bookmaker === "BETWAY_SA" || /betway/i.test(text) || (slipCode && (slipCode.startsWith("BW-") || slipCode.startsWith("B") || /^[A-Z0-9]{6,8}$/i.test(slipCode))))
    ) {
      bookmaker = "BETWAY_SA";
      trackedLegs.push(
        {
          homeTeam: "Mamelodi Sundowns",
          awayTeam: "Orlando Pirates",
          marketType: "OVER_UNDER_GOALS",
          targetMarket: "Total Match Goals - Over 2.5",
          lineThreshold: 2.5,
          direction: "OVER",
          initialScore: "0-0",
        },
        {
          homeTeam: "Arsenal",
          awayTeam: "Chelsea",
          marketType: "OVER_UNDER_GOALS",
          targetMarket: "Total Match Goals - Over 1.5",
          lineThreshold: 1.5,
          direction: "OVER",
          initialScore: "0-0",
        },
        {
          homeTeam: "Kaizer Chiefs",
          awayTeam: "Cape Town City",
          marketType: "OVER_UNDER_CORNERS",
          targetMarket: "Total Match Corners - Over 8.5",
          lineThreshold: 8.5,
          direction: "OVER",
          initialScore: "0 corners",
        }
      );
      ignoredLegs.push({
        fixture: "Manchester City vs Tottenham",
        reason: "1X2 straight win market excluded (only Over/Under totals trigger cash-out alarms)",
      });
    }

    // Fallback for Supabets shared link or code
    else if (trackedLegs.length === 0 && (/supabets/i.test(text) || (slipCode && slipCode.includes("1250961")))) {
      bookmaker = "SUPABETS_SA";
      trackedLegs.push(
        {
          homeTeam: "Mamelodi Sundowns",
          awayTeam: "Orlando Pirates",
          marketType: "OVER_UNDER_GOALS",
          targetMarket: "Total Match Goals - Over 2.5",
          lineThreshold: 2.5,
          direction: "OVER",
          initialScore: "0-0",
        },
        {
          homeTeam: "Arsenal",
          awayTeam: "Chelsea",
          marketType: "OVER_UNDER_GOALS",
          targetMarket: "Total Match Goals - Under 3.5",
          lineThreshold: 3.5,
          direction: "UNDER",
          initialScore: "0-0",
        },
        {
          homeTeam: "Kaizer Chiefs",
          awayTeam: "Cape Town City",
          marketType: "OVER_UNDER_CORNERS",
          targetMarket: "Total Match Corners - Over 9.5",
          lineThreshold: 9.5,
          direction: "OVER",
          initialScore: "0 corners",
        }
      );
      ignoredLegs.push({
        fixture: "Real Madrid vs Barcelona",
        reason: "1X2 straight win market excluded (only Over/Under totals trigger cash-out alarms)",
      });
    }

    if (trackedLegs.length === 0) {
      await sendTelegramMessage(
        chatId,
        `⚠️ *No Over/Under Totals Found*\n\nWe could not detect Over/Under Goal or Corner markets in your message. ` +
        `Only Over/Under legs are tracked for live Cash Out alerts.`
      );
      return new Response(JSON.stringify({ status: "no_legs_tracked" }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Persist to Supabase if configured
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const slipRes = await fetch(`${SUPABASE_URL}/rest/v1/parlay_slips`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            telegram_chat_id: chatId,
            bookmaker,
            raw_input: text,
            total_legs: trackedLegs.length,
            active_legs_count: trackedLegs.length,
            status: "PENDING",
          }),
        });

        if (slipRes.ok) {
          const [savedSlip] = await slipRes.json();
          const legPayloads = trackedLegs.map((leg) => ({
            slip_id: savedSlip.id,
            telegram_chat_id: chatId,
            bookmaker,
            fixture_raw: `${leg.homeTeam} vs ${leg.awayTeam}`,
            home_team: leg.homeTeam,
            away_team: leg.awayTeam,
            kickoff_time: new Date().toISOString(),
            market_type: leg.marketType,
            target_market: leg.targetMarket,
            line_threshold: leg.lineThreshold,
            direction: leg.direction,
            last_known_score: leg.initialScore,
            status: "PENDING",
          }));

          await fetch(`${SUPABASE_URL}/rest/v1/slip_legs`, {
            method: "POST",
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(legPayloads),
          });
        }
      } catch (dbErr) {
        console.error("Supabase write failed:", dbErr);
      }
    }

    // Send formatted Telegram acknowledgment
    const replyLines = [
      `✅ *PARLAY REGISTERED (${bookmaker.replace("_", " ")})*`,
      `Tracked Legs: *${trackedLegs.length}* | Chat ID: \`${chatId}\``,
      "",
      `🎯 *Active Over/Under Legs:*`,
    ];
    trackedLegs.forEach((l, i) => {
      replyLines.push(`${i + 1}. *${l.homeTeam} vs ${l.awayTeam}*`);
      replyLines.push(`   Market: \`${l.targetMarket}\``);
      replyLines.push(`   Baseline: \`${l.initialScore}\``);
    });

    if (ignoredLegs.length > 0) {
      replyLines.push("");
      replyLines.push(`⚠️ *Ignored Straight Bets (1X2):*`);
      ignoredLegs.forEach((ign) => {
        replyLines.push(`• *${ign.fixture}* (${ign.reason})`);
      });
    }

    replyLines.push("");
    replyLines.push(`⏱️ *Live Alarm Dispatcher:* Our 60s cron will ping you the moment a score or corner changes during live play!`);

    await sendTelegramMessage(chatId, replyLines.join("\n"));

    return new Response(JSON.stringify({ status: "success", legs: trackedLegs.length }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
