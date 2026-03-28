import type { Match, Team, TournamentFormat } from '../../types';
import { BYE_SENTINEL } from './advance';

function isRealWinner(id: string | null | undefined): id is string {
  return Boolean(id && id !== BYE_SENTINEL);
}

/** Resolve tournament champion team id when `isFinished` is true. */
export function resolveChampionTeamId(matches: Match[]): string | null {
  const gf2 = matches.find(m => m.id === 'gf-2');
  if (isRealWinner(gf2?.winnerId)) return gf2!.winnerId!;

  const gf1 = matches.find(m => m.id === 'gf-1');
  if (isRealWinner(gf1?.winnerId)) return gf1!.winnerId!;

  const terminal = matches.find(m => !m.nextMatchId && isRealWinner(m.winnerId));
  if (terminal?.winnerId) return terminal.winnerId;

  const ranked = [...matches]
    .filter(m => isRealWinner(m.winnerId))
    .sort((a, b) => b.round - a.round);
  return ranked[0]?.winnerId ?? null;
}

/** Champion team for UI when tournament is finished (all formats). */
export function resolveDisplayChampion(
  format: TournamentFormat,
  matches: Match[],
  teams: Team[]
): Team | null {
  const byId = (id: string | null | undefined) =>
    id ? teams.find(t => t.id === id) ?? null : null;

  if (format === 'pool') {
    let best: Team | null = null;
    let wBest = -1;
    for (const t of teams) {
      const w = matches.filter(m => m.winnerId === t.id).length;
      if (w > wBest) {
        wBest = w;
        best = t;
      }
    }
    return wBest > 0 ? best : null;
  }

  if (format === 'casual') {
    return null;
  }

  if (format === 'winners-list') {
    const done = matches.filter(m => m.winnerId);
    if (done.length === 0) return null;
    const sorted = [...done].sort(
      (a, b) => b.round - a.round || b.id.localeCompare(a.id)
    );
    return byId(sorted[0]!.winnerId);
  }

  return byId(resolveChampionTeamId(matches));
}
