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
import { matchIsOnNet, matchIsWaitingForCourt } from '../matchSchedule';
import {
  parseBracketMatchIndex,
  propagateWinnerToNext,
  propagateLoserToBracket,
  autoAdvanceByes,
  BYE_SENTINEL
} from './advance';
import { matchOutcomeFromSets, isValidCompletedSet } from './scoring';
import { resolveChampionTeamId, isTournamentDecided } from './champion';
import { countBracketLosses, teamPowerStat, matchPowerMarginForTeam } from './records';
import {
  advanceWinnersListAfterScore,
  getLiveMatchOnNet,
  pullTeamsFromWinnersQueue,
  sanitizeWinnersQueue,
  winnersListActiveTeamIds,
  type WinnersListState
} from './winnersList';
import { DEFAULT_RULES } from './rules';
import type { Match, Team, TournamentRules } from '../../types';

const teams4 = (n: number): Team[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `T${i}` }));

/** Mirror App score flow for elimination brackets in tests. */
function applyMatchResult(matches: Match[], matchId: string, winnerId: string): Match[] {
  const copy = matches.map(m => ({ ...m }));
  const idx = copy.findIndex(m => m.id === matchId);
  if (idx === -1) throw new Error(`missing match ${matchId}`);
  const prev = copy[idx]!;
  const loserId =
    prev.team1Id === winnerId ? prev.team2Id : prev.team2Id === winnerId ? prev.team1Id : null;
  const scored: Match = {
    ...prev,
    winnerId,
    score1: prev.team1Id === winnerId ? 1 : 0,
    score2: prev.team2Id === winnerId ? 1 : 0
  };
  copy[idx] = scored;

  propagateWinnerToNext(copy, scored, matchId, winnerId);
  if (prev.loserMatchId && loserId) {
    propagateLoserToBracket(copy, prev, matchId, loserId);
  }
  return autoAdvanceByes(copy);
}

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

  it('repairs gf-2 stuck with bye sentinel once teams are known', () => {
    const m: Match[] = [
      {
        id: 'gf-1',
        team1Id: 'wb',
        team2Id: 'lb',
        round: 3,
        winnerId: 'lb',
        nextMatchId: 'gf-2'
      },
      {
        id: 'gf-2',
        team1Id: 'wb',
        team2Id: 'lb',
        round: 4,
        winnerId: BYE_SENTINEL,
        score1: 0,
        score2: 0
      }
    ];
    const fixed = autoAdvanceByes(m);
    const gf2 = fixed.find(x => x.id === 'gf-2');
    expect(gf2?.winnerId).toBeNull();
    expect(gf2?.team1Id).toBe('wb');
    expect(gf2?.team2Id).toBe('lb');
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
    expect(gf2?.winnerId).toBeNull();
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

  it('does not crown gf-1 when losers-bracket champ must win gf-2', () => {
    const m: Match[] = [
      { id: 'gf-1', team1Id: 'wb', team2Id: 'lb', round: 2, winnerId: 'lb', nextMatchId: 'gf-2' },
      { id: 'gf-2', team1Id: 'wb', team2Id: 'lb', round: 3, winnerId: null, nextMatchId: null }
    ];
    expect(resolveChampionTeamId(m)).toBeNull();
  });

  it('does not crown winners-bracket final before grand finals', () => {
    const m: Match[] = [
      {
        id: 'w1-0',
        team1Id: 'a',
        team2Id: 'b',
        round: 1,
        winnerId: 'a',
        bracketType: 'winners',
        nextMatchId: 'w2-0'
      },
      {
        id: 'w1-1',
        team1Id: 'c',
        team2Id: 'd',
        round: 1,
        winnerId: 'c',
        bracketType: 'winners',
        nextMatchId: 'w2-0'
      },
      {
        id: 'w2-0',
        team1Id: 'a',
        team2Id: 'c',
        round: 2,
        winnerId: 'a',
        bracketType: 'winners',
        nextMatchId: 'gf-1'
      },
      { id: 'gf-1', team1Id: null, team2Id: null, round: 3, bracketType: 'winners', nextMatchId: 'gf-2' },
      { id: 'gf-2', team1Id: null, team2Id: null, round: 4, bracketType: 'winners', nextMatchId: null }
    ];
    expect(resolveChampionTeamId(m)).toBeNull();
    expect(isTournamentDecided('double', m)).toBe(false);
  });

  it('crowns losers-bracket champ after winning gf-2', () => {
    const m: Match[] = [
      { id: 'gf-1', team1Id: 'wb', team2Id: 'lb', round: 2, winnerId: 'lb', nextMatchId: 'gf-2' },
      { id: 'gf-2', team1Id: 'wb', team2Id: 'lb', round: 3, winnerId: 'lb', nextMatchId: null }
    ];
    expect(resolveChampionTeamId(m)).toBe('lb');
    expect(isTournamentDecided('double', m)).toBe(true);
  });

  it('resolves single-elim final winner', () => {
    const m: Match[] = [
      {
        id: 'w1-0',
        team1Id: 'a',
        team2Id: 'b',
        round: 1,
        winnerId: 'a',
        bracketType: 'winners',
        nextMatchId: 'w2-0'
      },
      {
        id: 'w2-0',
        team1Id: 'a',
        team2Id: 'c',
        round: 2,
        winnerId: 'a',
        bracketType: 'winners',
        nextMatchId: null
      }
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

  it('does not auto-bye grand finals before they are played', () => {
    const m = autoAdvanceByes(generateDoubleElimination(teams4(4)));
    const gf1 = m.find(x => x.id === 'gf-1');
    const gf2 = m.find(x => x.id === 'gf-2');
    expect(gf1?.winnerId).not.toBe(BYE_SENTINEL);
    expect(gf2?.winnerId).not.toBe(BYE_SENTINEL);
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

describe('double elim end-to-end', () => {
  it('stays undecided through winners-bracket final', () => {
    let m = autoAdvanceByes(generateDoubleElimination(teams4(4)));
    m = applyMatchResult(m, 'w1-0', 't0');
    m = applyMatchResult(m, 'w1-1', 't2');
    expect(isTournamentDecided('double', m)).toBe(false);
    expect(resolveChampionTeamId(m, 'double')).toBeNull();

    m = applyMatchResult(m, 'w2-0', 't0');
    expect(isTournamentDecided('double', m)).toBe(false);
    expect(resolveChampionTeamId(m, 'double')).toBeNull();

    const gf1 = m.find(x => x.id === 'gf-1');
    expect(gf1?.team1Id).toBe('t0');
    expect(gf1?.team2Id).toBeNull();
  });

  it('lb comeback wins gf-2 after bracket reset', () => {
    let m = autoAdvanceByes(generateDoubleElimination(teams4(4)));
    m = applyMatchResult(m, 'w1-0', 't0');
    m = applyMatchResult(m, 'w1-1', 't2');
    m = applyMatchResult(m, 'w2-0', 't0');
    m = applyMatchResult(m, 'l1-0', 't1');
    m = applyMatchResult(m, 'l2-0', 't1');

    const gf1 = m.find(x => x.id === 'gf-1')!;
    expect(gf1.team1Id).toBe('t0');
    expect(gf1.team2Id).toBe('t1');

    m = applyMatchResult(m, 'gf-1', 't1');
    expect(isTournamentDecided('double', m)).toBe(false);
    expect(resolveChampionTeamId(m, 'double')).toBeNull();

    const gf2 = m.find(x => x.id === 'gf-2')!;
    expect(gf2.team1Id).toBe('t0');
    expect(gf2.team2Id).toBe('t1');
    expect(gf2.winnerId).toBeNull();

    const withNets = assignNets(m, 2, 'double');
    const gf2Net = withNets.find(x => x.id === 'gf-2')!;
    expect(matchIsOnNet(gf2Net) || matchIsWaitingForCourt(gf2Net)).toBe(true);

    m = applyMatchResult(withNets, 'gf-2', 't1');
    expect(isTournamentDecided('double', m)).toBe(true);
    expect(resolveChampionTeamId(m, 'double')).toBe('t1');
    expect(countBracketLosses('t0', m)).toBe(2);
    expect(countBracketLosses('t1', m)).toBe(1);
  });

  it('wb champ wins gf-1 outright without gf-2', () => {
    let m = autoAdvanceByes(generateDoubleElimination(teams4(4)));
    m = applyMatchResult(m, 'w1-0', 't0');
    m = applyMatchResult(m, 'w1-1', 't2');
    m = applyMatchResult(m, 'w2-0', 't0');
    m = applyMatchResult(m, 'l1-0', 't1');
    m = applyMatchResult(m, 'l2-0', 't1');
    m = applyMatchResult(m, 'gf-1', 't0');

    expect(isTournamentDecided('double', m)).toBe(true);
    expect(resolveChampionTeamId(m, 'double')).toBe('t0');
    expect(m.find(x => x.id === 'gf-2')?.team1Id).toBeNull();
  });

  it('8-team bracket never crowns after wb final alone', () => {
    let m = autoAdvanceByes(generateDoubleElimination(teams4(8)));
    for (const match of m.filter(x => x.id.startsWith('w1-'))) {
      m = applyMatchResult(m, match.id, match.team1Id!);
    }
    for (const match of m.filter(x => x.id.startsWith('w2-'))) {
      if (match.team1Id && match.team2Id) {
        m = applyMatchResult(m, match.id, match.team1Id);
      }
    }
    const wbFinal = m.find(x => x.id === 'w3-0');
    if (wbFinal?.team1Id && wbFinal.team2Id) {
      m = applyMatchResult(m, 'w3-0', wbFinal.team1Id);
    }
    expect(isTournamentDecided('double', m)).toBe(false);
    expect(resolveChampionTeamId(m, 'double')).toBeNull();
  });

  it('format double guard blocks single-elim fallback without gf-1', () => {
    const m: Match[] = [
      {
        id: 'w2-0',
        team1Id: 'a',
        team2Id: 'b',
        round: 2,
        winnerId: 'a',
        bracketType: 'winners',
        nextMatchId: null
      }
    ];
    expect(resolveChampionTeamId(m, 'double')).toBeNull();
    expect(resolveChampionTeamId(m, 'single')).toBe('a');
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


describe('isTournamentDecided', () => {
  it('true when single-elim final has a winner', () => {
    const m: Match[] = [
      { id: 'w1-0', team1Id: 'a', team2Id: 'b', round: 1, winnerId: 'a', nextMatchId: 'w2-0' },
      { id: 'w2-0', team1Id: 'a', team2Id: 'c', round: 2, winnerId: 'c', nextMatchId: null }
    ];
    expect(isTournamentDecided('single', m)).toBe(true);
  });

  it('false while double-elim gf-2 is undecided after lb wins gf-1', () => {
    const m: Match[] = [
      { id: 'gf-1', team1Id: 'wb', team2Id: 'lb', round: 2, winnerId: 'lb', nextMatchId: 'gf-2' },
      { id: 'gf-2', team1Id: 'wb', team2Id: 'lb', round: 3, winnerId: null, nextMatchId: null }
    ];
    expect(isTournamentDecided('double', m)).toBe(false);
  });
});

describe('countBracketLosses', () => {
  it('counts grand-finals losses so wb runner-up has two after bracket reset', () => {
    const m: Match[] = [
      { id: 'gf-1', team1Id: 'wb', team2Id: 'lb', round: 2, winnerId: 'lb' },
      { id: 'gf-2', team1Id: 'wb', team2Id: 'lb', round: 3, winnerId: 'lb' }
    ];
    expect(countBracketLosses('wb', m)).toBe(2);
    expect(countBracketLosses('lb', m)).toBe(0);
  });

  it('counts prior bracket losses for losers-bracket champion', () => {
    const m: Match[] = [
      { id: 'w1-0', team1Id: 'lb', team2Id: 'x', round: 1, winnerId: 'x' },
      { id: 'gf-1', team1Id: 'wb', team2Id: 'lb', round: 2, winnerId: 'lb' },
      { id: 'gf-2', team1Id: 'wb', team2Id: 'lb', round: 3, winnerId: 'lb' }
    ];
    expect(countBracketLosses('lb', m)).toBe(1);
    expect(resolveChampionTeamId(m)).toBe('lb');
  });
});

describe('teamPowerStat', () => {
  it('sums rally-point margins from completed sets', () => {
    const m: Match = {
      id: 'm1',
      team1Id: 't0',
      team2Id: 't1',
      round: 1,
      winnerId: 't0',
      sets: [
        { team1: 21, team2: 15 },
        { team1: 18, team2: 21 },
        { team1: 21, team2: 19 }
      ]
    };
    expect(matchPowerMarginForTeam(m, 't0')).toBe(6 + -3 + 2);
    expect(matchPowerMarginForTeam(m, 't1')).toBe(-5);
    expect(teamPowerStat('t0', [m])).toBe(5);
  });

  it('ignores matches without per-set scores', () => {
    const m: Match = {
      id: 'm1',
      team1Id: 't0',
      team2Id: 't1',
      round: 1,
      winnerId: 't0',
      score1: 2,
      score2: 0
    };
    expect(teamPowerStat('t0', [m])).toBe(0);
  });
});

describe('winnersList queue', () => {
  const live = (net: number, t1: string, t2?: string): Match => ({
    id: `net-${net}`,
    team1Id: t1,
    team2Id: t2 ?? null,
    round: 1,
    netIndex: net
  });

  it('skips queue teams already on an active net', () => {
    const queue = ['a', 'b', 'c', 'd'];
    const matches = [live(0, 'a', 'x'), live(1, 'b', 'y')];
    expect(winnersListActiveTeamIds(matches)).toEqual(new Set(['a', 'x', 'b', 'y']));
    const pulled = pullTeamsFromWinnersQueue(queue, matches, 2);
    expect(pulled.teamIds).toEqual(['c', 'd']);
    expect(pulled.remainingQueue).toEqual(['a', 'b']);
  });

  it('does not assign the same queued team to two nets when filling both', () => {
    const queue = ['c', 'd', 'e'];
    const matches: Match[] = [];
    const first = pullTeamsFromWinnersQueue(queue, matches, 2);
    matches.push(live(0, first.teamIds[0]!, first.teamIds[1]!));
    const second = pullTeamsFromWinnersQueue(first.remainingQueue, matches, 2);
    expect(second.teamIds).toEqual(['e']);
    expect(second.teamIds).not.toContain(first.teamIds[0]);
    expect(second.teamIds).not.toContain(first.teamIds[1]);
  });

  it('sanitizeWinnersQueue removes active teams left in queue', () => {
    const queue = ['a', 'b', 'c'];
    const matches = [live(0, 'a', 'b')];
    expect(sanitizeWinnersQueue(queue, matches)).toEqual(['c']);
  });

  it('reserved ids prevent double assignment before state updates', () => {
    const queue = ['c', 'd', 'e'];
    const pulled = pullTeamsFromWinnersQueue(queue, [], 1, ['c']);
    expect(pulled.teamIds).toEqual(['d']);
    const second = pullTeamsFromWinnersQueue(pulled.remainingQueue, [], 1, ['c', 'd']);
    expect(second.teamIds).toEqual(['e']);
  });

  it('advance after score rotates only the scored net and respects queue order', () => {
    const state = {
      matches: [live(0, 'a', 'b'), live(1, 'x', 'y')],
      queue: ['c', 'd', 'e'],
      activeNets: { 0: 'net-0', 1: 'net-1' }
    };
    const done: Match = {
      id: 'net-0',
      team1Id: 'a',
      team2Id: 'b',
      round: 1,
      netIndex: 0,
      winnerId: 'a',
      score1: 2,
      score2: 0
    };
    const { state: next } = advanceWinnersListAfterScore(state, 'net-0', done, DEFAULT_RULES, 1, 2);
    expect(next.queue).toEqual(['d', 'e']);
    const net0 = getLiveMatchOnNet(next.matches, 0);
    expect(net0?.team1Id).toBe('a');
    expect(net0?.team2Id).toBe('c');
    expect(getLiveMatchOnNet(next.matches, 1)?.team1Id).toBe('x');
  });

  it('consecutive scores on one net use the updated queue', () => {
    let state: WinnersListState = {
      matches: [live(0, 'a', 'b')],
      queue: ['c', 'd'],
      activeNets: { 0: 'net-0', 1: null }
    };
    const done1: Match = {
      id: 'net-0',
      team1Id: 'a',
      team2Id: 'b',
      round: 1,
      netIndex: 0,
      winnerId: 'a',
      score1: 2,
      score2: 0
    };
    let result = advanceWinnersListAfterScore(state, 'net-0', done1, DEFAULT_RULES, 1, 2);
    state = result.state;
    const live1 = getLiveMatchOnNet(state.matches, 0)!;
    const done2: Match = {
      ...live1,
      winnerId: 'a',
      score1: 2,
      score2: 0
    };
    result = advanceWinnersListAfterScore(state, live1.id, done2, DEFAULT_RULES, 2, 2);
    expect(result.state.queue).toEqual([]);
    const live2 = getLiveMatchOnNet(result.state.matches, 0);
    expect(live2?.team1Id).toBe('a');
    expect(live2?.team2Id).toBe('d');
  });

  it('both teams off with empty queue leaves net idle', () => {
    const state = {
      matches: [live(0, 'a', 'b')],
      queue: [],
      activeNets: { 0: 'net-0' }
    };
    const done: Match = {
      id: 'net-0',
      team1Id: 'a',
      team2Id: 'b',
      round: 1,
      netIndex: 0,
      winnerId: 'a',
      score1: 2,
      score2: 0
    };
    const rules = { ...DEFAULT_RULES, winnerStays: false };
    const { state: next } = advanceWinnersListAfterScore(state, 'net-0', done, rules, 0, 2);
    expect(getLiveMatchOnNet(next.matches, 0)).toBeUndefined();
    expect(next.activeNets[0]).toBeNull();
  });

  it('winner stays with empty queue leaves solo wait, no phantom opponent', () => {
    const state = {
      matches: [live(0, 'a', 'b')],
      queue: [],
      activeNets: { 0: 'net-0' }
    };
    const done: Match = {
      id: 'net-0',
      team1Id: 'a',
      team2Id: 'b',
      round: 1,
      netIndex: 0,
      winnerId: 'a',
      score1: 2,
      score2: 0
    };
    const { state: next } = advanceWinnersListAfterScore(state, 'net-0', done, DEFAULT_RULES, 1, 2);
    const onNet = getLiveMatchOnNet(next.matches, 0);
    expect(onNet?.team1Id).toBe('a');
    expect(onNet?.team2Id).toBeNull();
    expect(next.queue).toEqual([]);
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
