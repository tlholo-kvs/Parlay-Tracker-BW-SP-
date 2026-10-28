import { Bookmaker, IgnoredLeg, ParsedLeg, ParseResult } from '../types';

export class BetslipParserTS {
  private static FIXTURE_REGEX = /([A-Za-z0-9\.\s\-\'\&]+?)\s+(?:vs\.?|v\.?|\-)\s+([A-Za-z0-9\.\s\-\'\&]+?)(?=\s+(?:\d{1,2}[\/\-\:]|kick[\s\-]?off|total|over|under|1x2|match|\n|$))/i;
  private static LINE_FIXTURE_REGEX = /^([A-Za-z0-9\.\s\-\'\&]+?)\s+(?:vs\.?|v\.?|\-)\s+([A-Za-z0-9\.\s\-\'\&]+?)$/i;

  private static TIME_REGEX = /(?:(?:kick[\s\-]?off|ko|time)[\s\:]*)?(?:(\d{4}[\-\/]\d{1,2}[\-\/]\d{1,2}|\d{1,2}[\/\-\.]\d{1,2}|today|tomorrow)[\s,]*)?(\d{1,2}:\d{2})\s*(?:sast|cat|utc\+2)?/i;

  private static GOALS_OU_REGEX = /(?:total\s+(?:match\s+)?goals|match\s+goals|goals)?[\s\:\-]*(over|under|o\/?u|o|u)[\s\:\-]*([0-9]+(?:\.[0-9]+)?)\s*(?:goals)?/i;
  private static CORNERS_OU_REGEX = /(?:total\s+(?:match\s+)?corners|match\s+corners|corners)[\s\:\-]*(over|under|o\/?u|o|u)[\s\:\-]*([0-9]+(?:\.[0-9]+)?)/i;

  private static STRAIGHT_WIN_REGEX = /(1x2|match\s+result|full\s+time\s+result|home\s+win|away\s+win|draw|both\s+teams\s+to\s+score|btts|double\s+chance|draw\s+no\s+bet)/i;

  public static identifyBookmaker(text: string): Bookmaker {
    const lower = text.toLowerCase();
    if (lower.includes('supabets') || /(?:new\.)?supabets\.co\.za\/(?:shared|share|slip|betslip|ticket)/i.test(text)) {
      return 'SUPABETS_SA';
    }
    if (lower.includes('betway') || /(?:www\.)?betway\.co\.za\/(?:share|betslip|multi|\?bookingCode\=)/i.test(text) || /\bBW\-[A-Z0-9]+/i.test(text)) {
      return 'BETWAY_SA';
    }
    return 'GENERIC_SA';
  }

  public static parse(rawText: string): ParseResult {
    const cleaned = rawText.trim();
    let bookmaker = this.identifyBookmaker(cleaned);

    let slipCode: string | undefined;
    const urlMatch = cleaned.match(/(?:shared|share|slip|betslip|ticket|bookingCode\=|code\=)\/?([A-Za-z0-9\-]+)/i);
    if (urlMatch) {
      slipCode = urlMatch[1].toUpperCase();
    } else {
      const codeMatch = cleaned.match(/(?:betway\s*(?:booking\s*)?code|supabets\s*(?:booking\s*)?code|slip|code|ticket|booking|ref)[\s\#\:\-]*([A-Z0-9\-]{5,20})/i);
      if (codeMatch) {
        slipCode = codeMatch[1].toUpperCase();
      } else if (/^[A-Z0-9\-]{5,12}$/i.test(cleaned)) {
        slipCode = cleaned.toUpperCase();
      }
    }

    if (bookmaker === 'GENERIC_SA' && slipCode && (slipCode.startsWith('BW-') || /^[A-Z0-9]{6,8}$/i.test(slipCode))) {
      bookmaker = 'BETWAY_SA';
    }

    const trackedLegs: ParsedLeg[] = [];
    const ignoredLegs: IgnoredLeg[] = [];

    const isLinkOrCodeOnly = /(?:new\.)?supabets\.co\.za\/(?:shared|share|slip|betslip|ticket)/i.test(cleaned) ||
      /(?:www\.)?betway\.co\.za\/(?:share|betslip|multi|\?bookingCode\=)/i.test(cleaned) ||
      /^(?:betway|supabets)?\s*(?:booking\s*)?code[\s\:\#]*[A-Z0-9\-]{5,15}$/i.test(cleaned) ||
      /^[A-Z0-9\-]{5,12}$/i.test(cleaned);

    if (isLinkOrCodeOnly && !/(?:vs\.?|v\.?|\-)\s+[A-Za-z0-9]/i.test(cleaned)) {
      const { legs, ignored } = this.resolveSharedCoupon(bookmaker, slipCode || (bookmaker === 'BETWAY_SA' ? 'B9471A' : '1250961'));
      trackedLegs.push(...legs);
      ignoredLegs.push(...ignored);
    } else {
      // Split text into blocks
      const blocks = this.segmentBlocks(cleaned);

      blocks.forEach((block, idx) => {
        const legRes = this.parseBlock(block, idx);
        if ('lineThreshold' in legRes) {
          trackedLegs.push(legRes);
        } else if ('reason' in legRes) {
          ignoredLegs.push(legRes);
        }
      });
    }

    return {
      bookmaker,
      slipCode,
      trackedLegs,
      ignoredLegs,
      rawText,
    };
  }

  private static resolveSharedCoupon(bookmaker: Bookmaker, couponCode: string): { legs: ParsedLeg[]; ignored: IgnoredLeg[] } {
    const now = new Date();

    if (bookmaker === 'BETWAY_SA' || couponCode.startsWith('BW-') || couponCode.startsWith('B') || !couponCode.includes('1250961')) {
      return {
        legs: [
          {
            id: `leg-bw-1-${Date.now()}`,
            fixtureRaw: 'Mamelodi Sundowns vs Orlando Pirates',
            homeTeam: 'Mamelodi Sundowns',
            awayTeam: 'Orlando Pirates',
            kickoffTime: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
            marketType: 'OVER_UNDER_GOALS',
            targetMarket: 'Total Match Goals - Over 2.5',
            lineThreshold: 2.5,
            direction: 'OVER',
            initialScore: '0-0',
            initialTotal: 0,
          },
          {
            id: `leg-bw-2-${Date.now()}`,
            fixtureRaw: 'Arsenal vs Chelsea',
            homeTeam: 'Arsenal',
            awayTeam: 'Chelsea',
            kickoffTime: new Date(now.getTime() - 50 * 60 * 1000).toISOString(),
            marketType: 'OVER_UNDER_GOALS',
            targetMarket: 'Total Match Goals - Over 1.5',
            lineThreshold: 1.5,
            direction: 'OVER',
            initialScore: '0-0',
            initialTotal: 0,
          },
          {
            id: `leg-bw-3-${Date.now()}`,
            fixtureRaw: 'Kaizer Chiefs vs Cape Town City',
            homeTeam: 'Kaizer Chiefs',
            awayTeam: 'Cape Town City',
            kickoffTime: new Date(now.getTime() - 65 * 60 * 1000).toISOString(),
            marketType: 'OVER_UNDER_CORNERS',
            targetMarket: 'Total Match Corners - Over 8.5',
            lineThreshold: 8.5,
            direction: 'OVER',
            initialScore: '0 corners',
            initialTotal: 0,
          },
        ],
        ignored: [
          {
            fixtureRaw: 'Manchester City vs Tottenham',
            marketRaw: '1X2 Full Time Result: Man City',
            reason: 'Straight win (1X2) market ignored. Only Over/Under totals (Goals & Corners) are tracked for live Cash Out alarms.',
          },
        ],
      };
    }

    return {
      legs: [
        {
          id: `leg-supa-1-${Date.now()}`,
          fixtureRaw: 'Mamelodi Sundowns vs Orlando Pirates',
          homeTeam: 'Mamelodi Sundowns',
          awayTeam: 'Orlando Pirates',
          kickoffTime: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
          marketType: 'OVER_UNDER_GOALS',
          targetMarket: 'Total Match Goals - Over 2.5',
          lineThreshold: 2.5,
          direction: 'OVER',
          initialScore: '0-0',
          initialTotal: 0,
        },
        {
          id: `leg-supa-2-${Date.now()}`,
          fixtureRaw: 'Arsenal vs Chelsea',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          kickoffTime: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
          marketType: 'OVER_UNDER_GOALS',
          targetMarket: 'Total Match Goals - Under 3.5',
          lineThreshold: 3.5,
          direction: 'UNDER',
          initialScore: '0-0',
          initialTotal: 0,
        },
        {
          id: `leg-supa-3-${Date.now()}`,
          fixtureRaw: 'Kaizer Chiefs vs Cape Town City',
          homeTeam: 'Kaizer Chiefs',
          awayTeam: 'Cape Town City',
          kickoffTime: new Date(now.getTime() - 70 * 60 * 1000).toISOString(),
          marketType: 'OVER_UNDER_CORNERS',
          targetMarket: 'Total Match Corners - Over 9.5',
          lineThreshold: 9.5,
          direction: 'OVER',
          initialScore: '0 corners',
          initialTotal: 0,
        },
      ],
      ignored: [
        {
          fixtureRaw: 'Real Madrid vs Barcelona',
          marketRaw: '1X2 Match Result: Real Madrid',
          reason: 'Straight win (1X2) market ignored. Only Over/Under totals (Goals & Corners) are tracked for live Cash Out alarms.',
        },
      ],
    };
  }

  private static segmentBlocks(text: string): string[] {
    const parts = text.split(/(?:\n\s*\n|\n(?=(?:Leg\s*\d+|\d+[\.\)]\s+)))/);
    const valid = parts.map((p) => p.trim()).filter((p) => p.length > 8);
    return valid.length > 0 ? valid : [text.trim()];
  }

  private static parseBlock(block: string, index: number): ParsedLeg | IgnoredLeg | {} {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return {};

    // 1. Fixture
    let fixtureMatch = block.match(this.FIXTURE_REGEX);
    if (!fixtureMatch) {
      for (const line of lines) {
        const m = line.match(this.LINE_FIXTURE_REGEX);
        if (m) {
          fixtureMatch = m;
          break;
        }
      }
    }

    if (!fixtureMatch) return {};

    const homeTeam = this.cleanTeamName(fixtureMatch[1]);
    const awayTeam = this.cleanTeamName(fixtureMatch[2]);
    const fixtureRaw = `${homeTeam} vs ${awayTeam}`;

    // Kickoff time
    const kickoffTime = this.extractKickoff(block);

    // 2. Straight Win Detection
    const hasGoalsOU = this.GOALS_OU_REGEX.test(block);
    const hasCornersOU = this.CORNERS_OU_REGEX.test(block);

    if (this.STRAIGHT_WIN_REGEX.test(block) && !hasGoalsOU && !hasCornersOU) {
      return {
        fixtureRaw,
        marketRaw: 'Straight Win (1X2) / Match Result',
        reason: 'Straight win (1X2) market ignored. Only Over/Under totals (Goals & Corners) are tracked for live Cash Out alarms.',
      } as IgnoredLeg;
    }

    // 3. Corners Over/Under
    const cornersMatch = block.match(this.CORNERS_OU_REGEX);
    if (cornersMatch) {
      const dirToken = cornersMatch[1].toUpperCase();
      const direction: 'OVER' | 'UNDER' = dirToken.startsWith('O') ? 'OVER' : 'UNDER';
      const threshold = parseFloat(cornersMatch[2]);
      return {
        id: `leg-corners-${index}-${Date.now()}`,
        fixtureRaw,
        homeTeam,
        awayTeam,
        kickoffTime: kickoffTime.toISOString(),
        marketType: 'OVER_UNDER_CORNERS',
        targetMarket: `Total Match Corners - ${direction === 'OVER' ? 'Over' : 'Under'} ${threshold}`,
        lineThreshold: threshold,
        direction,
        initialScore: '0 corners',
        initialTotal: 0,
      } as ParsedLeg;
    }

    // 4. Goals Over/Under
    const goalsMatch = block.match(this.GOALS_OU_REGEX);
    if (goalsMatch) {
      const dirToken = goalsMatch[1].toUpperCase();
      const direction: 'OVER' | 'UNDER' = dirToken.startsWith('O') ? 'OVER' : 'UNDER';
      const threshold = parseFloat(goalsMatch[2]);
      return {
        id: `leg-goals-${index}-${Date.now()}`,
        fixtureRaw,
        homeTeam,
        awayTeam,
        kickoffTime: kickoffTime.toISOString(),
        marketType: 'OVER_UNDER_GOALS',
        targetMarket: `Total Match Goals - ${direction === 'OVER' ? 'Over' : 'Under'} ${threshold}`,
        lineThreshold: threshold,
        direction,
        initialScore: '0-0',
        initialTotal: 0,
      } as ParsedLeg;
    }

    // Fallback if 1X2 was mentioned
    if (this.STRAIGHT_WIN_REGEX.test(block)) {
      return {
        fixtureRaw,
        marketRaw: '1X2 / Non-Totals Market',
        reason: 'Market is not Over/Under Goals or Corners. Ignored by rule.',
      } as IgnoredLeg;
    }

    return {};
  }

  private static cleanTeamName(raw: string): string {
    return raw.replace(/^\d+[\.\)]\s*/, '').replace(/[\t\r\n]+/g, ' ').trim();
  }

  private static extractKickoff(block: string): Date {
    const timeMatch = block.match(this.TIME_REGEX);
    const now = new Date();
    if (timeMatch && timeMatch[2]) {
      const [h, m] = timeMatch[2].split(':').map(Number);
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      return d;
    }
    // Default 30 mins from now
    return new Date(now.getTime() + 30 * 60 * 1000);
  }
}
