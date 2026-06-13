import type { Match, TournamentRules } from '../../types';
import { matchIsOnNet } from '../matchSchedule';

export interface WinnersListState {
  matches: Match[];
  queue: string[];
  activeNets: Record<number, string | null>;
}

export interface WinnersListTeamUpdate {
  teamId: string;
  consecutiveWins: number;
}

/** Live (incomplete) match on a specific net. */
export function getLiveMatchOnNet(matches: Match[], netIndex: number): Match | undefined {
  return matches.find(m => m.netIndex === netIndex && matchIsOnNet(m) && !m.winnerId);
}

/** Team ids currently on a live winners-list court (incomplete match on a net). */
export function winnersListActiveTeamIds(matches: Match[]): Set<string> {
  const ids = new Set<string>();
  for (const m of matches) {
    if (matchIsOnNet(m) && !m.winnerId) {
      if (m.team1Id) ids.add(m.team1Id);
      if (m.team2Id) ids.add(m.team2Id);
    }
  }
  return ids;
}

/** Drop queue entries for teams already assigned to an active court. */
export function sanitizeWinnersQueue(queue: string[], matches: Match[]): string[] {
  const active = winnersListActiveTeamIds(matches);
  return queue.filter(id => !active.has(id));
}

/**
 * Pull up to `count` teams from the queue in order, skipping anyone on a live court
 * or listed in `reservedIds`.
 */
export function pullTeamsFromWinnersQueue(
  queue: string[],
  matches: Match[],
  count: number,
  reservedIds: Iterable<string> = []
): { teamIds: string[]; remainingQueue: string[] } {
  if (count <= 0) {
    return { teamIds: [], remainingQueue: [...queue] };
  }

  const active = winnersListActiveTeamIds(matches);
  for (const id of reservedIds) active.add(id);
  const picked: string[] = [];
  const remainingQueue: string[] = [];

  for (const id of queue) {
    if (picked.length < count && !active.has(id) && !picked.includes(id)) {
      picked.push(id);
      active.add(id);
    } else {
      remainingQueue.push(id);
    }
  }

  return { teamIds: picked, remainingQueue };
}

function rebuildActiveNets(matches: Match[], numNets: number): Record<number, string | null> {
  const out: Record<number, string | null> = {};
  for (let i = 0; i < numNets; i++) {
    out[i] = getLiveMatchOnNet(matches, i)?.id ?? null;
  }
  return out;
}

/** Start or join: add team to queue and fill any open net slots from the queue only. */
export function applyWinnersListJoinQueue(
  state: WinnersListState,
  teamId: string,
  numNets: number
): { state: WinnersListState; newMatches: Match[]; updatedMatches: Match[] } {
  let queue = sanitizeWinnersQueue([...state.queue, teamId], state.matches);
  let matches = [...state.matches];
  const newMatches: Match[] = [];
  const updatedMatches: Match[] = [];

  for (let i = 0; i < numNets; i++) {
    const live = getLiveMatchOnNet(matches, i);

    if (!live) {
      const pulled = pullTeamsFromWinnersQueue(queue, matches, 2);
      queue = pulled.remainingQueue;
      if (pulled.teamIds.length >= 2) {
        const match: Match = {
          id: `net-${i}-${Date.now()}-${newMatches.length}`,
          team1Id: pulled.teamIds[0]!,
          team2Id: pulled.teamIds[1]!,
          round: 1,
          netIndex: i
        };
        matches.push(match);
        newMatches.push(match);
      }
      continue;
    }

    if (live.team1Id && !live.team2Id) {
      const pulled = pullTeamsFromWinnersQueue(queue, matches, 1, live.team1Id ? [live.team1Id] : []);
      queue = pulled.remainingQueue;
      if (pulled.teamIds.length >= 1) {
        const updated: Match = { ...live, team2Id: pulled.teamIds[0]! };
        matches = matches.map(m => (m.id === live.id ? updated : m));
        updatedMatches.push(updated);
      }
    }
  }

  queue = sanitizeWinnersQueue(queue, matches);
  return {
    state: {
      matches,
      queue,
      activeNets: rebuildActiveNets(matches, numNets)
    },
    newMatches,
    updatedMatches
  };
}

/** After a score on one net: rotate that net only; queue is global FIFO. */
export function advanceWinnersListAfterScore(
  state: WinnersListState,
  matchId: string,
  completed: Match,
  rules: TournamentRules,
  winnerConsecutiveWins: number,
  numNets: number
): { state: WinnersListState; teamUpdates: WinnersListTeamUpdate[] } {
  const netIndex = completed.netIndex;
  if (netIndex == null || !completed.winnerId) {
    return { state, teamUpdates: [] };
  }

  const winnerId = completed.winnerId;
  const loserId =
    completed.team1Id === winnerId
      ? completed.team2Id
      : completed.team2Id === winnerId
        ? completed.team1Id
        : null;

  const matches = state.matches.map(m => (m.id === matchId ? completed : m));
  let queue = state.queue.filter(id => id !== winnerId && id !== loserId);
  queue = sanitizeWinnersQueue(queue, matches);

  const teamUpdates: WinnersListTeamUpdate[] = [];
  if (loserId) teamUpdates.push({ teamId: loserId, consecutiveWins: 0 });

  let nextTeam1: string | null = null;
  let nextTeam2: string | null = null;

  if (rules.winnerStays !== false) {
    nextTeam1 = winnerId;
    const pulled = pullTeamsFromWinnersQueue(queue, matches, 1, [winnerId]);
    queue = pulled.remainingQueue;
    nextTeam2 = pulled.teamIds[0] ?? null;
    teamUpdates.push({ teamId: winnerId, consecutiveWins: winnerConsecutiveWins });
    if (nextTeam2) teamUpdates.push({ teamId: nextTeam2, consecutiveWins: 0 });
  } else {
    teamUpdates.push({ teamId: winnerId, consecutiveWins: 0 });
    const pulled = pullTeamsFromWinnersQueue(queue, matches, 2);
    queue = pulled.remainingQueue;
    nextTeam1 = pulled.teamIds[0] ?? null;
    nextTeam2 = pulled.teamIds[1] ?? null;
    if (nextTeam1) teamUpdates.push({ teamId: nextTeam1, consecutiveWins: 0 });
    if (nextTeam2) teamUpdates.push({ teamId: nextTeam2, consecutiveWins: 0 });
  }

  let nextMatches = matches;
  if (nextTeam1) {
    const nextMatch: Match = {
      id: `net-${netIndex}-${Date.now()}`,
      team1Id: nextTeam1,
      team2Id: nextTeam2,
      round: (completed.round ?? 1) + 1,
      netIndex
    };
    nextMatches = [...matches, nextMatch];
    queue = sanitizeWinnersQueue(queue, nextMatches);
  }

  return {
    state: {
      matches: nextMatches,
      queue,
      activeNets: rebuildActiveNets(nextMatches, numNets)
    },
    teamUpdates
  };
}

/** Initial net fill at tournament start. */
export function buildWinnersListStartState(
  teamIds: string[],
  numNets: number
): WinnersListState {
  let queue = [...teamIds];
  const matches: Match[] = [];

  for (let i = 0; i < numNets; i++) {
    const pulled = pullTeamsFromWinnersQueue(queue, matches, 2);
    queue = pulled.remainingQueue;
    if (pulled.teamIds.length >= 2) {
      matches.push({
        id: `net-${i}-${Date.now()}`,
        team1Id: pulled.teamIds[0]!,
        team2Id: pulled.teamIds[1]!,
        round: 1,
        netIndex: i
      });
    }
  }

  queue = sanitizeWinnersQueue(queue, matches);
  return {
    matches,
    queue,
    activeNets: rebuildActiveNets(matches, numNets)
  };
}
