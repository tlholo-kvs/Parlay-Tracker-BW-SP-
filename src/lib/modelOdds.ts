export interface ModelInputs {
  homeStrength: number;
  awayStrength: number;
  homeForm: number;
  awayForm: number;
  homeAttack: number;
  awayAttack: number;
  homeDefense: number;
  awayDefense: number;
  homeAdvantage: number;
}

export interface ModelOutput {
  expectedGoals: {
    home: number;
    away: number;
    total: number;
  };
  fairOdds: {
    home: number;
    draw: number;
    away: number;
    over2_5: number;
    under2_5: number;
  };
  bookmakerOdds: {
    home: number;
    draw: number;
    away: number;
    over2_5: number;
    under2_5: number;
  };
  probabilities: {
    home: number;
    draw: number;
    away: number;
    over2_5: number;
    under2_5: number;
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const poissonProbability = (lambda: number, k: number) => {
  if (k < 0) return 0;
  const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact(k);
};

const poissonTail = (lambda: number, minGoals: number) => {
  let total = 0;
  for (let k = 0; k <= minGoals; k += 1) {
    total += poissonProbability(lambda, k);
  }
  return total;
};

export const calculateModelOdds = (input: ModelInputs, bookmakerMargin = 0.07): ModelOutput => {
  const homeStrengthScore = clamp((input.homeStrength - input.awayStrength) / 100, -1, 1);
  const formEdge = clamp((input.homeForm - input.awayForm) / 100, -1, 1);
  const attackEdge = clamp((input.homeAttack - input.awayDefense) / 100, -1, 1);
  const awayAttackEdge = clamp((input.awayAttack - input.homeDefense) / 100, -1, 1);

  const homeWinBase = 0.42 + homeStrengthScore * 0.26 + formEdge * 0.14 + attackEdge * 0.18 + input.homeAdvantage * 0.08;
  const awayWinBase = 0.29 - homeStrengthScore * 0.24 - formEdge * 0.12 + awayAttackEdge * 0.21;
  const drawBase = 0.21 + Math.abs(homeStrengthScore) * 0.05 + Math.abs(formEdge) * 0.03;

  const homeProb = clamp(homeWinBase, 0.08, 0.72);
  const awayProb = clamp(awayWinBase, 0.08, 0.58);
  const drawProb = clamp(drawBase, 0.08, 0.38);
  const total = homeProb + drawProb + awayProb;

  const pHome = clamp(homeProb / total, 0.06, 0.85);
  const pDraw = clamp(drawProb / total, 0.04, 0.45);
  const pAway = clamp(awayProb / total, 0.06, 0.75);

  const baseHomeXg = 1.3 + (input.homeAttack / 30) * 0.7 - (input.awayDefense / 30) * 0.55 + input.homeAdvantage * 0.08;
  const baseAwayXg = 1.12 + (input.awayAttack / 30) * 0.68 - (input.homeDefense / 30) * 0.5 + (input.homeAdvantage * -0.05);

  const homeExpectedGoals = clamp(baseHomeXg, 0.45, 3.3);
  const awayExpectedGoals = clamp(baseAwayXg, 0.35, 2.9);
  const totalExpectedGoals = homeExpectedGoals + awayExpectedGoals;

  const over2_5 = clamp(1 - poissonTail(totalExpectedGoals, 2), 0.06, 0.85);
  const under2_5 = clamp(1 - over2_5, 0.06, 0.9);

  const buildBookmakerOdds = (probability: number) => {
    const fair = 1 / clamp(probability, 0.05, 0.95);
    const marginFactor = 1 + clamp(bookmakerMargin, 0.0, 0.25);
    return Number((fair * marginFactor).toFixed(2));
  };

  return {
    expectedGoals: {
      home: Number(homeExpectedGoals.toFixed(2)),
      away: Number(awayExpectedGoals.toFixed(2)),
      total: Number(totalExpectedGoals.toFixed(2)),
    },
    probabilities: {
      home: Number(pHome.toFixed(4)),
      draw: Number(pDraw.toFixed(4)),
      away: Number(pAway.toFixed(4)),
      over2_5: Number(over2_5.toFixed(4)),
      under2_5: Number(under2_5.toFixed(4)),
    },
    fairOdds: {
      home: Number((1 / pHome).toFixed(2)),
      draw: Number((1 / pDraw).toFixed(2)),
      away: Number((1 / pAway).toFixed(2)),
      over2_5: Number((1 / over2_5).toFixed(2)),
      under2_5: Number((1 / under2_5).toFixed(2)),
    },
    bookmakerOdds: {
      home: buildBookmakerOdds(pHome),
      draw: buildBookmakerOdds(pDraw),
      away: buildBookmakerOdds(pAway),
      over2_5: buildBookmakerOdds(over2_5),
      under2_5: buildBookmakerOdds(under2_5),
    },
  };
};

export const decimalOdds = (probability: number) => Number((1 / clamp(probability, 0.05, 0.95)).toFixed(2));

export const buildTelegramSlipText = (fixture: string, market: string, odds: number, stake: number) => {
  return [
    '📊 *MODEL-DRIVEN TICKET*',
    `Fixture: *${fixture}*`,
    `Market: *${market}*`,
    `Fair odds: *${odds.toFixed(2)}*`,
    `Stake: *R${stake.toFixed(2)}*`,
    `Projected return: *R${(stake * odds).toFixed(2)}*`,
    '✅ Ready for ingestion by the Telegram bot alert engine.',
  ].join('\n');
};
