import React, { useState } from 'react';
import { BetslipParserTS } from '../lib/parser';
import { ParlaySlip, SlipLeg } from '../types';
import { AlertTriangle, CheckCircle, Copy, CornerDownRight, Send, Terminal } from 'lucide-react';

interface IngestionSimulatorProps {
  onInsertSlip: (slip: ParlaySlip, legs: SlipLeg[]) => void;
}

const PRESET_SAMPLES = [
  {
    title: 'Betway Booking Code (#B9471A)',
    text: `Betway code: B9471A`,
  },
  {
    title: 'Betway Share Link (betway.co.za)',
    text: `https://www.betway.co.za/share/BW-773921`,
  },
  {
    title: 'Supabets Shared Link (#1250961)',
    text: `supabets link: https://new.supabets.co.za/Shared/1250961`,
  },
  {
    title: 'Betway SA · PSL Multi-Bet (Over/Under & 1X2)',
    text: `BETWAY MULTI BET SLIP #BW-773921

1. Mamelodi Sundowns vs Orlando Pirates
Kick-off: 19:30 SAST
Total Match Goals - Over 2.5
Odds: 1.85

2. Kaizer Chiefs v Cape Town City
28/10 21:00 SAST
Total Match Corners - Over 9.5
Odds: 1.90

3. Golden Arrows vs SuperSport United
Today 17:00
Match Result: Golden Arrows (1X2)
Odds: 2.10`,
  },
  {
    title: 'Supabets SA · EPL Totals Parlay',
    text: `SUPABETS SA TICKET #SB-449102

Arsenal vs Chelsea
Time: 20:00
Match Goals: Under 3.5

Liverpool v Manchester City
Kick-off: 21:45
Match Corners: Over 10.5`,
  },
  {
    title: 'Rejected Sample · 1X2 Straight Win Only',
    text: `Real Madrid vs Barcelona
1X2: Real Madrid
Kick-off: 22:00

Bayern Munich vs Dortmund
Full Time Result: Bayern Munich`,
  },
];

export const IngestionSimulator: React.FC<IngestionSimulatorProps> = ({ onInsertSlip }) => {
  const [inputText, setInputText] = useState(PRESET_SAMPLES[0].text);
  const [telegramChatId, setTelegramChatId] = useState('981726450');
  const [lastDispatchedReply, setLastDispatchedReply] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live parse as user types or selects presets
  const parseResult = BetslipParserTS.parse(inputText);

  const handleLoadSample = (sampleText: string) => {
    setInputText(sampleText);
    setLastDispatchedReply(null);
  };

  const handleSimulateWebhook = () => {
    const chatIdNum = parseInt(telegramChatId, 10) || 981726450;

    if (!parseResult.trackedLegs.length) {
      setLastDispatchedReply(
        `⚠️ *No Over/Under Totals Detected*\n\n` +
          `We could not find any *Over/Under Total Goals* or *Over/Under Corners* legs in your message.\n` +
          `If your betslip contains straight win bets (1X2), those are not eligible for live total tracking.\n\n` +
          `Please paste fixtures containing: \`Over 2.5 Goals\`, \`Under 1.5 Goals\`, or \`Over 9.5 Corners\`.`
      );
      setToastMessage('Webhook processed: No Over/Under totals eligible');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    const slipId = `slip-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const newSlip: ParlaySlip = {
      id: slipId,
      telegramChatId: chatIdNum,
      bookmaker: parseResult.bookmaker,
      slipReference: parseResult.slipCode,
      rawInput: inputText,
      totalLegs: parseResult.trackedLegs.length,
      activeLegsCount: parseResult.trackedLegs.length,
      status: 'PENDING',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const newLegs: SlipLeg[] = parseResult.trackedLegs.map((leg, i) => ({
      id: `leg-${Date.now()}-${i}`,
      slipId,
      telegramChatId: chatIdNum,
      bookmaker: parseResult.bookmaker,
      fixtureRaw: leg.fixtureRaw,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      kickoffTime: leg.kickoffTime,
      marketType: leg.marketType,
      targetMarket: leg.targetMarket,
      lineThreshold: leg.lineThreshold,
      direction: leg.direction,
      lastKnownScore: leg.initialScore,
      lastKnownTotal: leg.initialTotal,
      currentMatchMinute: "0'",
      status: 'PENDING',
    }));

    onInsertSlip(newSlip, newLegs);

    // Build Telegram Bot Reply Message
    const bookmakerName =
      parseResult.bookmaker === 'BETWAY_SA'
        ? 'Betway SA'
        : parseResult.bookmaker === 'SUPABETS_SA'
        ? 'Supabets SA'
        : 'South African Sportsbook';

    const replyLines = [
      `📋 *PARLAY REGISTERED* (${bookmakerName})`,
      `Tracked Over/Under Legs: *${parseResult.trackedLegs.length}*`,
    ];
    if (parseResult.slipCode) {
      replyLines.push(`Booking Code: \`${parseResult.slipCode}\``);
    }
    replyLines.push('');
    replyLines.push('🎯 *Active Over/Under Legs Monitored:*');
    parseResult.trackedLegs.forEach((leg, idx) => {
      const icon = leg.marketType === 'OVER_UNDER_GOALS' ? '⚽' : '🚩';
      replyLines.push(`${idx + 1}. ${icon} *${leg.fixtureRaw}*`);
      replyLines.push(`   Target: \`${leg.targetMarket}\``);
      replyLines.push(`   Init Score: \`${leg.initialScore}\``);
    });

    if (parseResult.ignoredLegs.length > 0) {
      replyLines.push('');
      replyLines.push('⚠️ *Ignored Straight Win (1X2) / Non-Totals Legs:*');
      parseResult.ignoredLegs.forEach((ign) => {
        replyLines.push(`• *${ign.fixtureRaw}*`);
        replyLines.push(`  Reason: _${ign.reason}_`);
      });
    }

    replyLines.push('');
    replyLines.push('⏱️ *Auto-Alarm Trigger:*');
    replyLines.push(
      'Our 60-second cron scheduler will alert you the instant a goal or corner is registered during live match play so you can optimize your *Cash Out*!'
    );

    setLastDispatchedReply(replyLines.join('\n'));
    setToastMessage(`Slip ingested with ${parseResult.trackedLegs.length} Over/Under legs!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3 bg-amber-950/80 border border-amber-700/50 rounded-lg text-amber-300 text-xs flex items-center justify-between">
          <span>{toastMessage}</span>
          <span className="font-mono text-[11px] text-amber-500">200 OK</span>
        </div>
      )}

      {/* Preset selector */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400 font-mono">
          PRE-LOAD BETSLIP PAYLOADS (BETWAY / SUPABETS)
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESET_SAMPLES.map((sample, idx) => (
            <button
              key={idx}
              onClick={() => handleLoadSample(sample.text)}
              className="px-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              {sample.title}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Textarea */}
        <div className="lg:col-span-6 space-y-4">
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400">
                TELEGRAM WEBHOOK PAYLOAD (TEXT / LINK)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 font-mono">chat_id:</span>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-xs text-amber-400 font-mono w-28 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={11}
              placeholder="Paste Betway or Supabets betslip text..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-200 font-mono focus:outline-none focus:border-amber-500 leading-relaxed"
            />

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <div className="text-xs text-zinc-500 font-mono">
                Detected: <span className="text-white font-semibold">{parseResult.bookmaker}</span>
              </div>
              <button
                onClick={handleSimulateWebhook}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer shadow-sm shadow-amber-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Simulate Webhook Ingestion</span>
              </button>
            </div>
          </div>

          {/* Telegram Response Preview */}
          {lastDispatchedReply && (
            <div className="border border-zinc-800 bg-zinc-900/60 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-amber-400" />
                  <span>TELEGRAM BOT API /sendMessage PREVIEW</span>
                </div>
                <span className="text-xs text-amber-400 font-mono">parse_mode: Markdown</span>
              </div>

              <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-4 font-mono text-xs text-zinc-300 whitespace-pre-line leading-relaxed border-l-2 border-amber-500">
                {lastDispatchedReply}
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Extraction & Parsing Analysis */}
        <div className="lg:col-span-6 space-y-4">
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400">
                PARSER EXTRACTION ANALYSIS
              </span>
              <span className="text-xs text-amber-400 font-mono">
                {parseResult.trackedLegs.length} Tracked · {parseResult.ignoredLegs.length} Ignored
              </span>
            </div>

            {/* Tracked Over/Under Legs */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Tracked Over/Under Legs (Saved to slip_legs)</span>
              </div>

              {parseResult.trackedLegs.length === 0 ? (
                <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-500 text-center">
                  No Over/Under Goals or Corners detected in input text.
                </div>
              ) : (
                <div className="space-y-2">
                  {parseResult.trackedLegs.map((leg, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1.5 text-xs font-mono"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white font-semibold">
                          {idx + 1}. {leg.fixtureRaw}
                        </span>
                        <span className="text-amber-400 text-[11px]">
                          {leg.marketType === 'OVER_UNDER_GOALS' ? 'GOALS TOTAL' : 'CORNERS TOTAL'}
                        </span>
                      </div>
                      <div className="text-zinc-400 text-[11px] flex flex-wrap gap-x-3">
                        <span>Target: <strong className="text-zinc-200">{leg.targetMarket}</strong></span>
                        <span>Threshold: <strong className="text-zinc-200">{leg.lineThreshold}</strong></span>
                        <span>Init Score: <strong className="text-zinc-200">{leg.initialScore}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ignored 1X2 Straight Win Legs */}
            {parseResult.ignoredLegs.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Flagged Straight Win (1X2) Markets (Ignored by Specification)</span>
                </div>

                <div className="space-y-2">
                  {parseResult.ignoredLegs.map((ign, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg space-y-1 text-xs font-mono"
                    >
                      <div className="text-amber-200 font-semibold">{ign.fixtureRaw}</div>
                      <div className="text-zinc-400 text-[11px]">{ign.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
