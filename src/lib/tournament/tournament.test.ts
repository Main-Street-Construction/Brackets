import { describe, it, expect } from 'vitest';
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
  generateGroupStagePool,
  assignPoolGroupsInOrder,
  generateCasualFirstRound,
  buildNextCasualRound,
  casualMaxRound,
  casualRoundIsComplete,
  nextPowerOf2AtLeast,
  bracketLeafSeedOrder
} from './generate';
import { assignNets, assignRoundRobinNets } from './nets';
import {
  parseBracketMatchIndex,
  propagateWinnerToNext,
  propagateLoserToBracket,
  autoAdvanceByes,
  BYE_SENTINEL
} from './advance';
import { matchOutcomeFromSets, isValidCompletedSet } from './scoring';
import { resolveChampionTeamId } from './champion';
import { matchIsOnNet, matchIsWaitingForCourt } from '../matchSchedule';
import type { Match, Team, TournamentRules } from '../../types';

const teams4 = (n: number): Team[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `T${i}` }));

const baseRules: TournamentRules = {
  pointsToWin: 25,
  bestOf: 1,
  thirdSetTo: 15,
  serveToWin: false,
  winByTwo: true,
  winnerStays: true,
  maxConsecutiveWins: 3,
  onMaxWins: 'other-stays'
};

describe('matchSchedule', () => {
  it('treats Firestore-style null netIndex as queued, not on net', () => {
    const m = {
      id: 'x',
      team1Id: 'a',
      team2Id: 'b',
      round: 1,
      netIndex: null
    } as unknown as Match;
    expect(matchIsOnNet(m)).toBe(false);
    expect(matchIsWaitingForCourt(m)).toBe(true);
  });
});

describe('parseBracketMatchIndex', () => {
  it('parses w1-0 and l3-2', () => {
    expect(parseBracketMatchIndex('w1-0')).toBe(0);
    expect(parseBracketMatchIndex('w2-1')).toBe(1);
    expect(parseBracketMatchIndex('l3-2')).toBe(2);
  });
  it('returns null for grand finals', () => {
    expect(parseBracketMatchIndex('gf-1')).toBeNull();
  });
});

describe('autoAdvanceByes', () => {
  it('advances single-team bye in round 1', () => {
    const teams = teams4(3);
    let m = generateSingleElimination(teams);
    m = autoAdvanceByes(m);
    const r1 = m.filter(x => x.round === 1);
    const withWinner = r1.filter(x => x.winnerId && x.winnerId !== BYE_SENTINEL);
    expect(withWinner.length).toBeGreaterThan(0);
    expect(r1.some(x => x.byeWalkover && x.winnerId)).toBe(true);
  });

  it('does not chain-advance a WR1 bye winner waiting in round 2 for the other feeder', () => {
    const matches: Match[] = [
      {
        id: 'w1-0',
        team1Id: 'jace',
        team2Id: null,
        round: 1,
        bracketType: 'winners',
        nextMatchId: 'w2-0',
        winnerId: null
      },
      {
        id: 'w1-1',
        team1Id: 'jared',
        team2Id: 'william',
        round: 1,
        bracketType: 'winners',
        nextMatchId: 'w2-0',
        winnerId: null
      },
      {
        id: 'w2-0',
        team1Id: null,
        team2Id: null,
        round: 2,
        bracketType: 'winners',
        nextMatchId: 'w3-0',
        winnerId: null
      },
      {
        id: 'w3-0',
        team1Id: null,
        team2Id: null,
        round: 3,
        bracketType: 'winners',
        nextMatchId: null,
        winnerId: null
      }
    ];
    const out = autoAdvanceByes(matches.map(x => ({ ...x })));
    const w20 = out.find(x => x.id === 'w2-0');
    expect(w20?.team1Id).toBe('jace');
    expect(w20?.team2Id).toBeNull();
    expect(w20?.winnerId).toBeFalsy();
    const w30 = out.find(x => x.id === 'w3-0');
    expect(w30?.team1Id).toBeNull();
    expect(w30?.winnerId).toBeFalsy();
  });

  it('auto-advances losers bracket walkover created by seeded byes', () => {
    let m = autoAdvanceByes(generateDoubleElimination(teams4(5)).map(x => ({ ...x })));

    const w11Idx = m.findIndex(x => x.id === 'w1-1');
    expect(w11Idx).toBeGreaterThanOrEqual(0);
    const w11 = m[w11Idx]!;
    expect(w11.team1Id && w11.team2Id).toBeTruthy();

    const scored = { ...w11, winnerId: w11.team1Id, score1: 1, score2: 0 };
    m[w11Idx] = scored;
    propagateWinnerToNext(m, scored, scored.id, scored.winnerId!);
    propagateLoserToBracket(m, scored, scored.id, scored.team2Id!);

    m = autoAdvanceByes(m);

    const l10 = m.find(x => x.id === 'l1-0');
    const l20 = m.find(x => x.id === 'l2-0');
    expect(l10?.winnerId).toBe(scored.team2Id);
    expect(l20?.team1Id).toBe(scored.team2Id);
  });
});

describe('propagateWinnerToNext', () => {
  it('uses explicit nextMatchSlot when present', () => {
    const matches: Match[] = [
      {
        id: 'w1-10',
        team1Id: 'a',
        team2Id: 'b',
        round: 1,
        bracketType: 'winners',
        nextMatchId: 'w2-5',
        nextMatchSlot: 1
      },
      {
        id: 'w2-5',
        team1Id: null,
        team2Id: null,
        round: 2,
        bracketType: 'winners',
        nextMatchId: null
      }
    ];
    const scored = { ...matches[0], winnerId: 'a' };
    const copy = matches.map(m => ({ ...m }));
    copy[0] = scored;
    const { tournamentComplete } = propagateWinnerToNext(copy, scored, 'w1-10', 'a');
    expect(tournamentComplete).toBe(false);
    const target = copy.find(m => m.id === 'w2-5');
    expect(target?.team1Id).toBe('a');
    expect(target?.team2Id).toBeNull();
  });

  it('completes tournament on gf-2', () => {
    const matches: Match[] = [
      {
        id: 'gf-2',
        team1Id: 'a',
        team2Id: 'b',
        round: 9,
        bracketType: 'winners',
        nextMatchId: null,
        winnerId: null
      }
    ];
    const scored = { ...matches[0], winnerId: 'a' as string | null };
    const copy = [...matches];
    copy[0] = scored;
    const { tournamentComplete } = propagateWinnerToNext(copy, scored, 'gf-2', 'a');
    expect(tournamentComplete).toBe(true);
  });

  it('ends on gf-1 when WB (team1) wins', () => {
    const matches: Match[] = [
      { id: 'gf-1', team1Id: 'wb', team2Id: 'lb', round: 3, bracketType: 'winners', nextMatchId: 'gf-2' },
      { id: 'gf-2', team1Id: null, team2Id: null, round: 4, bracketType: 'winners', nextMatchId: null }
    ];
    const scored = { ...matches[0], winnerId: 'wb' };
    const copy = matches.map(m => ({ ...m }));
    copy[0] = scored;
    const { tournamentComplete } = propagateWinnerToNext(copy, scored, 'gf-1', 'wb');
    expect(tournamentComplete).toBe(true);
  });

  it('sends both teams to gf-2 when LB (team2) wins gf-1', () => {
    const matches: Match[] = [
      { id: 'gf-1', team1Id: 'wb', team2Id: 'lb', round: 3, bracketType: 'winners', nextMatchId: 'gf-2' },
      { id: 'gf-2', team1Id: null, team2Id: null, round: 4, bracketType: 'winners', nextMatchId: null }
    ];
    const scored = { ...matches[0], winnerId: 'lb' };
    const copy = matches.map(m => ({ ...m }));
    copy[0] = scored;
    const { tournamentComplete } = propagateWinnerToNext(copy, scored, 'gf-1', 'lb');
    expect(tournamentComplete).toBe(false);
    const gf2 = copy.find(m => m.id === 'gf-2');
    expect(gf2?.team1Id).toBe('wb');
    expect(gf2?.team2Id).toBe('lb');
  });
});

describe('scoring', () => {
  it('accepts 25-23 with win by two to 25', () => {
    const r = isValidCompletedSet({ team1: 25, team2: 23 }, 0, baseRules);
    expect(r.ok).toBe(true);
  });
  it('rejects 25-24', () => {
    const r = isValidCompletedSet({ team1: 25, team2: 24 }, 0, baseRules);
    expect(r.ok).toBe(false);
  });
  it('best of 3 outcome', () => {
    const rules: TournamentRules = { ...baseRules, bestOf: 3 };
    const out = matchOutcomeFromSets(
      [
        { team1: 25, team2: 20 },
        { team1: 18, team2: 25 },
        { team1: 15, team2: 13 }
      ],
      rules
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.winnerIsTeam1).toBe(true);
      expect(out.setsWon1).toBe(2);
    }
  });
});

describe('resolveChampionTeamId', () => {
  it('prefers gf-2 winner', () => {
    const m: Match[] = [
      { id: 'gf-1', team1Id: 'a', team2Id: 'b', round: 2, winnerId: 'b', nextMatchId: 'gf-2' },
      { id: 'gf-2', team1Id: 'a', team2Id: 'b', round: 3, winnerId: 'a', nextMatchId: null }
    ];
    expect(resolveChampionTeamId(m)).toBe('a');
  });

  it('does not treat bye sentinel as champion', () => {
    const m: Match[] = [
      {
        id: 'w1-0',
        team1Id: 'a',
        team2Id: null,
        round: 1,
        winnerId: BYE_SENTINEL,
        nextMatchId: null
      }
    ];
    expect(resolveChampionTeamId(m)).toBeNull();
  });
});

describe('generateDoubleElimination', () => {
  it('includes gf-1 and gf-2 for 4 teams', () => {
    const m = generateDoubleElimination(teams4(4));
    expect(m.some(x => x.id === 'gf-1')).toBe(true);
    expect(m.some(x => x.id === 'gf-2')).toBe(true);
  });

  it('only assigns loserMatchId to existing losers bracket matches (sorted WB order)', () => {
    const ids = new Set<string>();
    for (const n of [4, 8, 16]) {
      const m = generateDoubleElimination(teams4(n));
      ids.clear();
      for (const x of m) ids.add(x.id);
      const wb = m.filter(x => x.bracketType === 'winners' && /^w\d+-\d+$/.test(x.id));
      for (const x of wb) {
        if (x.loserMatchId) expect(ids.has(x.loserMatchId)).toBe(true);
      }
    }
  });

  it('drops both WB R1 losers into the same L1 match', () => {
    const m0 = generateDoubleElimination(teams4(4)).map(x => ({ ...x }));
    const w10 = m0.find(x => x.id === 'w1-0')!;
    const w11 = m0.find(x => x.id === 'w1-1')!;
    propagateLoserToBracket(m0, w10, 'w1-0', 'la');
    propagateLoserToBracket(m0, w11, 'w1-1', 'lb');
    const l10 = m0.find(x => x.id === 'l1-0');
    expect(l10?.team1Id).toBe('la');
    expect(l10?.team2Id).toBe('lb');
  });

  it('maps WB R1 loser drops by numeric index for 32 teams', () => {
    const m = generateDoubleElimination(teams4(32));
    const wbR1 = m.filter(x => x.id.startsWith('w1-'));
    for (const match of wbR1) {
      const idx = parseBracketMatchIndex(match.id);
      expect(idx).not.toBeNull();
      const i = idx!;
      expect(match.loserMatchId).toBe(`l1-${Math.floor(i / 2)}`);
      expect(match.loserMatchSlot).toBe(i % 2 === 0 ? 1 : 2);
    }
  });

  it('maps WB R2+ loser drops to deterministic LB slot 2', () => {
    const m = generateDoubleElimination(teams4(32));
    const wb = m.filter(x => x.bracketType === 'winners' && /^w\d+-\d+$/.test(x.id));
    for (const match of wb) {
      const parts = match.id.match(/^w(\d+)-(\d+)$/);
      expect(parts).toBeTruthy();
      const round = Number(parts![1]);
      const idx = Number(parts![2]);
      if (round < 2) continue;
      const lid = `l${(round - 1) * 2}-${idx}`;
      expect(match.loserMatchId).toBe(lid);
      expect(match.loserMatchSlot).toBe(2);
    }
  });

  it('routes WB R1 losers into the same L1 match for multi-digit indices', () => {
    const m0 = generateDoubleElimination(teams4(32)).map(x => ({ ...x }));
    const w110 = m0.find(x => x.id === 'w1-10')!;
    const w111 = m0.find(x => x.id === 'w1-11')!;
    propagateLoserToBracket(m0, w110, 'w1-10', 'la');
    propagateLoserToBracket(m0, w111, 'w1-11', 'lb');
    const l15 = m0.find(x => x.id === 'l1-5');
    expect(l15?.team1Id).toBe('la');
    expect(l15?.team2Id).toBe('lb');
  });
});

describe('nextPowerOf2AtLeast / bracketLeafSeedOrder', () => {
  it('pads N to the next power of 2', () => {
    expect(nextPowerOf2AtLeast(1)).toBe(1);
    expect(nextPowerOf2AtLeast(5)).toBe(8);
    expect(nextPowerOf2AtLeast(8)).toBe(8);
    expect(nextPowerOf2AtLeast(9)).toBe(16);
  });

  it('orders 8 seeds for classic first-round pair groups', () => {
    expect(bracketLeafSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe('generateSingleElimination', () => {
  it('uses P − N round-1 byes into a power-of-2 bracket (ghost seeds)', () => {
    const n = 5;
    const P = nextPowerOf2AtLeast(n);
    const r1 = generateSingleElimination(teams4(n)).filter(x => x.round === 1);
    expect(r1.length).toBe(P / 2);
    const singleSlot = r1.filter(
      x => (x.team1Id && !x.team2Id) || (!x.team1Id && x.team2Id)
    );
    expect(singleSlot.length).toBe(P - n);
    expect(r1.every(x => x.team1Id || x.team2Id)).toBe(true);
  });

  it('places seeds 4 vs 5 in one real game for N = 5 (teams t3 vs t4)', () => {
    const r1 = generateSingleElimination(teams4(5))
      .filter(x => x.round === 1)
      .sort((a, b) => a.id.localeCompare(b.id));
    const playIn = r1.find(x => x.team1Id && x.team2Id);
    expect(playIn?.team1Id).toBe('t3');
    expect(playIn?.team2Id).toBe('t4');
  });

  it('has every round-1 slot filled when N is a power of 2', () => {
    const r1 = generateSingleElimination(teams4(8)).filter(x => x.round === 1);
    expect(r1.length).toBe(4);
    expect(r1.every(x => x.team1Id && x.team2Id)).toBe(true);
  });

  it('returns no matches for 0 or 1 teams', () => {
    expect(generateSingleElimination([])).toEqual([]);
    expect(generateSingleElimination(teams4(1))).toEqual([]);
  });

  it('keeps numeric round-1 slot ordering for multi-digit match ids', () => {
    const r1 = generateSingleElimination(teams4(32)).filter(x => x.round === 1);
    const byId = new Map(r1.map(x => [x.id, x]));
    expect(byId.get('w1-0')?.team1Id).toBe('t0');
    expect(byId.get('w1-0')?.team2Id).toBe('t31');
    expect(byId.get('w1-10')?.team1Id).toBeTruthy();
    expect(byId.get('w1-10')?.team2Id).toBeTruthy();
  });
});

describe('assignRoundRobinNets', () => {
  it('never assigns the same team to two incomplete netted matches', () => {
    const teams = teams4(4);
    const matches = assignRoundRobinNets(generateRoundRobin(teams), 4);
    const active = matches.filter(m => matchIsOnNet(m) && !m.winnerId);
    const perTeam = new Map<string, number>();
    for (const m of active) {
      if (m.team1Id) perTeam.set(m.team1Id, (perTeam.get(m.team1Id) || 0) + 1);
      if (m.team2Id) perTeam.set(m.team2Id, (perTeam.get(m.team2Id) || 0) + 1);
    }
    for (const n of perTeam.values()) {
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('fills nets in parallel when teams do not overlap across chosen matches', () => {
    const teams = teams4(6);
    const matches = assignRoundRobinNets(generateRoundRobin(teams), 3);
    const assigned = matches.filter(m => matchIsOnNet(m) && !m.winnerId);
    expect(assigned.length).toBe(3);
    expect(new Set(assigned.map(m => m.netIndex)).size).toBe(3);
  });

  it('matches assignNets capacity for same pool graph', () => {
    const teams = teams4(6);
    const base = generateRoundRobin(teams);
    const a = assignNets(base, 3);
    const b = assignRoundRobinNets(base, 3);
    const ca = a.filter(m => matchIsOnNet(m) && !m.winnerId).length;
    const cb = b.filter(m => matchIsOnNet(m) && !m.winnerId).length;
    expect(ca).toBe(cb);
  });
});

describe('casual waves', () => {
  it('first round covers every team once', () => {
    const teams = teams4(4);
    const m = generateCasualFirstRound(teams);
    expect(m.length).toBe(2);
    expect(m.every(x => x.round === 1)).toBe(true);
    const seen = new Set<string>();
    for (const x of m) {
      if (x.team1Id) seen.add(x.team1Id);
      if (x.team2Id) seen.add(x.team2Id);
    }
    expect(seen.size).toBe(4);
  });

  it('builds next round from completed games', () => {
    const teams = teams4(4);
    const r1 = generateCasualFirstRound(teams);
    const completed = r1.map(m => ({
      ...m,
      winnerId: m.team1Id,
      score1: 2,
      score2: 0
    }));
    expect(casualRoundIsComplete(completed, 1)).toBe(true);
    const r2 = buildNextCasualRound(teams, completed, 2);
    expect(r2.length).toBe(2);
    expect(r2.every(x => x.round === 2)).toBe(true);
  });

  it('casualMaxRound reads peak wave', () => {
    expect(
      casualMaxRound([
        { id: 'a', team1Id: 't0', team2Id: 't1', round: 2 },
        { id: 'b', team1Id: 't2', team2Id: 't3', round: 1 }
      ])
    ).toBe(2);
  });
});

describe('generateRoundRobin', () => {
  it('has every pair once', () => {
    const teams = teams4(4);
    const m = generateRoundRobin(teams);
    expect(m.length).toBe(6);
    const pairs = new Set(m.map(x => [x.team1Id, x.team2Id].sort().join('|')));
    expect(pairs.size).toBe(6);
  });
});

describe('generateGroupStagePool', () => {
  it('round robins within each letter group', () => {
    const teams = assignPoolGroupsInOrder(teams4(6), 2);
    const m = generateGroupStagePool(teams);
    const gA = m.filter(x => x.poolGroup === 'A');
    const gB = m.filter(x => x.poolGroup === 'B');
    expect(gA.length).toBe(3);
    expect(gB.length).toBe(3);
    expect(m.every(x => x.poolGroup)).toBe(true);
  });
});

describe('reconcileMatchNets', () => {
  it('assigns nets when playable matches have no court', async () => {
    const { reconcileMatchNets, matchesNeedNetReconcile } = await import('../reconcileNets');
    const teams = teams4(4);
    let m = generateSingleElimination(teams);
    m = autoAdvanceByes(m);
    expect(matchesNeedNetReconcile(m)).toBe(true);
    const fixed = reconcileMatchNets(m, 2, 'single');
    expect(fixed.some(x => matchIsOnNet(x) && !x.winnerId)).toBe(true);
  });
});

describe('matchToFirestore', () => {
  it('includes bracket metadata required for cloud sync', async () => {
    const { matchToFirestore } = await import('../matchFirestore');
    const doc = matchToFirestore({
      id: 'w1-0',
      team1Id: 't1',
      team2Id: 't2',
      round: 1,
      nextMatchSlot: 1,
      nextMatchId: 'w2-0',
      netIndex: 0
    });
    expect(doc.nextMatchSlot).toBe(1);
    expect(doc.netIndex).toBe(0);
    expect(doc.team1Id).toBe('t1');
  });
});

describe('assignNets double elimination', () => {
  it('does not assign winners bracket round 2 until all WB round 1 have winners', () => {
    const matches: Match[] = [
      {
        id: 'w1-0',
        team1Id: 't0',
        team2Id: 't1',
        round: 1,
        bracketType: 'winners',
        winnerId: 't0'
      },
      { id: 'w1-1', team1Id: 't2', team2Id: 't3', round: 1, bracketType: 'winners' },
      { id: 'w2-0', team1Id: 't0', team2Id: 't2', round: 2, bracketType: 'winners' }
    ];
    const out = assignNets(matches, 2, 'double');
    expect(out.find(m => m.id === 'w2-0')?.netIndex).toBeUndefined();
    expect(out.find(m => m.id === 'w1-1')?.netIndex).toBeDefined();
  });
});
