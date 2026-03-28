import { describe, it, expect } from 'vitest';
import {
  generateSingleElimination,
  generateDoubleElimination,
  generatePlayTwice
} from './generate';
import { assignNets, assignPlayTwiceNets } from './nets';
import {
  parseBracketMatchIndex,
  propagateWinnerToNext,
  autoAdvanceByes,
  BYE_SENTINEL
} from './advance';
import { matchOutcomeFromSets, isValidCompletedSet } from './scoring';
import { resolveChampionTeamId } from './champion';
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
  });
});

describe('propagateWinnerToNext', () => {
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
});

describe('generateDoubleElimination', () => {
  it('includes gf-1 and gf-2 for 4 teams', () => {
    const m = generateDoubleElimination(teams4(4));
    expect(m.some(x => x.id === 'gf-1')).toBe(true);
    expect(m.some(x => x.id === 'gf-2')).toBe(true);
  });
});

describe('assignNets (play-twice)', () => {
  it('never assigns the same team to two incomplete netted matches', () => {
    const teams = teams4(4);
    const matches = assignNets(generatePlayTwice(teams), 4);
    const active = matches.filter(m => m.netIndex !== undefined && !m.winnerId);
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
    const matches = assignNets(generatePlayTwice(teams), 3);
    const assigned = matches.filter(m => m.netIndex !== undefined && !m.winnerId);
    expect(assigned.length).toBe(3);
    expect(new Set(assigned.map(m => m.netIndex)).size).toBe(3);
  });

  it('assignPlayTwiceNets matches assignNets for capacity (ordered queue)', () => {
    const teams = teams4(6);
    const base = generatePlayTwice(teams);
    const a = assignNets(base, 3);
    const b = assignPlayTwiceNets(base, 3);
    const ca = a.filter(m => m.netIndex !== undefined && !m.winnerId).length;
    const cb = b.filter(m => m.netIndex !== undefined && !m.winnerId).length;
    expect(ca).toBe(cb);
  });
});
