import type { Match, Team } from '../../types';

export function generateSingleElimination(
  teams: Team[],
  prefix = 'w',
  bracketType: 'winners' | 'losers' = 'winners'
): Match[] {
  const numTeams = teams.length;
  const k = Math.ceil(Math.log2(numTeams));
  const bracketSize = Math.pow(2, k);
  const matches: Match[] = [];

  const getSeedOrder = (size: number): number[] => {
    if (size === 2) return [0, 1];
    const prev = getSeedOrder(size / 2);
    const res: number[] = [];
    for (const s of prev) {
      res.push(s);
      res.push(size - 1 - s);
    }
    return res;
  };

  const seedOrder = getSeedOrder(bracketSize);

  for (let i = 0; i < bracketSize / 2; i++) {
    const t1Idx = seedOrder[i * 2];
    const t2Idx = seedOrder[i * 2 + 1];

    matches.push({
      id: `${prefix}1-${i}`,
      team1Id: t1Idx < numTeams ? teams[t1Idx].id : null,
      team2Id: t2Idx < numTeams ? teams[t2Idx].id : null,
      round: 1,
      bracketType,
      nextMatchId: k > 1 ? `${prefix}2-${Math.floor(i / 2)}` : null
    });
  }

  for (let r = 2; r <= k; r++) {
    const matchesInRound = Math.pow(2, k - r);
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({
        id: `${prefix}${r}-${i}`,
        team1Id: null,
        team2Id: null,
        round: r,
        bracketType,
        nextMatchId: r < k ? `${prefix}${r + 1}-${Math.floor(i / 2)}` : null
      });
    }
  }

  return matches;
}

export function generateDoubleElimination(teams: Team[]): Match[] {
  const numTeams = teams.length;
  const k = Math.ceil(Math.log2(numTeams));

  const winners = generateSingleElimination(teams, 'w', 'winners');

  const losers: Match[] = [];
  const numLBRounds = k > 1 ? 2 * k - 2 : 0;

  for (let r = 1; r <= numLBRounds; r++) {
    const matchesInRound = Math.pow(2, k - 1 - Math.floor((r + 1) / 2));
    for (let i = 0; i < matchesInRound; i++) {
      let nextMatchId: string | null = null;
      if (r < numLBRounds) {
        if (r % 2 !== 0) {
          nextMatchId = `l${r + 1}-${i}`;
        } else {
          nextMatchId = `l${r + 1}-${Math.floor(i / 2)}`;
        }
      } else {
        nextMatchId = 'gf-1';
      }

      losers.push({
        id: `l${r}-${i}`,
        team1Id: null,
        team2Id: null,
        round: r,
        bracketType: 'losers',
        nextMatchId
      });
    }
  }

  winners.filter(m => m.round === 1).forEach((m, i) => {
    m.loserMatchId = `l1-${Math.floor(i / 2)}`;
  });

  for (let r = 2; r <= k; r++) {
    winners.filter(m => m.round === r).forEach((m, i) => {
      const lbRound = (r - 1) * 2;
      if (lbRound <= numLBRounds) {
        m.loserMatchId = `l${lbRound}-${i}`;
      }
    });
  }

  const wbFinal = winners.find(m => m.round === k);
  const lbFinal = losers.find(m => m.round === numLBRounds);

  if (wbFinal) wbFinal.nextMatchId = 'gf-1';
  if (lbFinal) lbFinal.nextMatchId = 'gf-1';

  const grandFinal: Match = {
    id: 'gf-1',
    team1Id: null,
    team2Id: null,
    round: k + 1,
    bracketType: 'winners',
    nextMatchId: 'gf-2'
  };

  const grandFinalIfNecessary: Match = {
    id: 'gf-2',
    team1Id: null,
    team2Id: null,
    round: k + 2,
    bracketType: 'winners',
    nextMatchId: null
  };

  return [...winners, ...losers, grandFinal, grandFinalIfNecessary];
}

export function generatePoolPlay(teams: Team[]): Match[] {
  const matches: Match[] = [];
  let matchCount = 1;
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matches.push({
        id: `p-${matchCount++}`,
        team1Id: teams[i].id,
        team2Id: teams[j].id,
        round: 1
      });
    }
  }
  return matches;
}

export function generatePlayTwice(teams: Team[]): Match[] {
  const matches: Match[] = [];
  const n = teams.length;
  if (n < 2) return [];

  for (let i = 0; i < n; i++) {
    const team1 = teams[i];
    const team2 = teams[(i + 1) % n];

    let round = (i % 2) + 1;
    if (n % 2 !== 0 && i === n - 1) {
      round = 3;
    }

    matches.push({
      id: `pt-${i}`,
      team1Id: team1.id,
      team2Id: team2.id,
      round
    });
  }
  return matches;
}
