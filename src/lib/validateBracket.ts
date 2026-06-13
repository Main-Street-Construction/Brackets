import type { Match, Team, TournamentFormat } from '../types';

export function validateBracketSeed(matches: Match[], teams: Team[], format: TournamentFormat): void {
  if (teams.length < 2 && format !== 'winners-list') {
    throw new Error('Add at least 2 teams before starting.');
  }

  if (!matches.length) {
    throw new Error('Bracket generation produced no matches.');
  }

  const teamIds = new Set(teams.map((t) => t.id));

  if (format === 'pool' || format === 'casual') {
    const invalid = matches.find((m) => {
      if (!m.team1Id || !m.team2Id) return true;
      return !teamIds.has(m.team1Id) || !teamIds.has(m.team2Id);
    });
    if (invalid) {
      throw new Error('Some matches are missing valid teams. Try restarting the tournament.');
    }
    return;
  }

  if (format === 'winners-list') return;

  const roundOne = matches.filter((m) => m.round === 1);
  if (!roundOne.length) {
    throw new Error('Bracket is missing round 1 matches.');
  }

  const seeded = roundOne.flatMap((m) => [m.team1Id, m.team2Id]).filter(Boolean) as string[];
  if (!seeded.length) {
    throw new Error('No teams were assigned to round 1. Add teams and restart.');
  }

  const unknown = seeded.filter((id) => !teamIds.has(id));
  if (unknown.length) {
    throw new Error('Bracket references teams that no longer exist. Restart after updating teams.');
  }
}
