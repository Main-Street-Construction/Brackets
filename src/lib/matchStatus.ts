import type { Match } from '../types';
import { isAutoAdvancePlaceholder, matchIsOnNet, matchIsWaitingForCourt } from './matchSchedule';

export type MatchStatus = 'live' | 'final' | 'upcoming' | 'waiting' | 'bye';

export function getMatchStatus(match: Match): MatchStatus {
  if (isAutoAdvancePlaceholder(match)) return 'bye';
  if (!match.team1Id && !match.team2Id) return 'waiting';
  if (match.team1Id && !match.team2Id) return 'bye';
  if (!match.team1Id && match.team2Id) return 'bye';
  if (match.winnerId) return 'final';
  if (matchIsOnNet(match)) return 'live';
  if (matchIsWaitingForCourt(match)) return 'upcoming';
  return 'waiting';
}

export function getMatchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'final':
      return 'Final';
    case 'upcoming':
      return 'Up next';
    case 'waiting':
      return 'Waiting';
    case 'bye':
      return 'Bye';
  }
}

export function sortMatchesForLiveFeed(matches: Match[]): Match[] {
  const priority: Record<MatchStatus, number> = {
    live: 0,
    upcoming: 1,
    final: 2,
    waiting: 3,
    bye: 4
  };

  return [...matches]
    .filter((m) => !isAutoAdvancePlaceholder(m))
    .sort((a, b) => {
      const statusDiff = priority[getMatchStatus(a)] - priority[getMatchStatus(b)];
      if (statusDiff !== 0) return statusDiff;
      if (matchIsOnNet(a) && matchIsOnNet(b)) return (a.netIndex ?? 0) - (b.netIndex ?? 0);
      return (a.round ?? 0) - (b.round ?? 0) || a.id.localeCompare(b.id);
    });
}

export function countLiveMatches(matches: Match[]): number {
  return matches.filter((m) => getMatchStatus(m) === 'live').length;
}

export function isFeedMatch(match: Match): boolean {
  const status = getMatchStatus(match);
  return status === 'live' || status === 'upcoming' || status === 'final';
}
