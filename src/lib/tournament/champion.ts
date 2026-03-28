import type { Match } from '../../types';

/** Resolve tournament champion team id when `isFinished` is true. */
export function resolveChampionTeamId(matches: Match[]): string | null {
  const gf2 = matches.find(m => m.id === 'gf-2');
  if (gf2?.winnerId) return gf2.winnerId;

  const gf1 = matches.find(m => m.id === 'gf-1');
  if (gf1?.winnerId) return gf1.winnerId;

  const terminal = matches.find(m => !m.nextMatchId && m.winnerId);
  if (terminal?.winnerId) return terminal.winnerId;

  const ranked = [...matches].filter(m => m.winnerId).sort((a, b) => b.round - a.round);
  return ranked[0]?.winnerId ?? null;
}
