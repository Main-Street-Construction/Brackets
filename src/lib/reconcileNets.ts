import type { Match, TournamentFormat } from '../types';
import { autoAdvanceByes } from './tournament/advance';
import { assignNets, assignRoundRobinNets } from './tournament/nets';
import { matchIsOnNet } from './matchSchedule';

/** Re-run bye advancement and net assignment when matches loaded without court slots. */
export function reconcileMatchNets(
  matches: Match[],
  numNets: number,
  format: TournamentFormat
): Match[] {
  if (!matches.length || numNets < 1) return matches;

  const playable = matches.filter(m => m.team1Id && m.team2Id && !m.winnerId);
  const onNet = playable.filter(m => matchIsOnNet(m));
  if (playable.length === 0 || onNet.length > 0) return matches;

  let working = matches;
  if (format === 'single' || format === 'double') {
    working = autoAdvanceByes(working);
    return assignNets(working, numNets, format);
  }
  if (format === 'pool' || format === 'casual') {
    return assignRoundRobinNets(working, numNets);
  }
  return working;
}

export function matchesNeedNetReconcile(matches: Match[]): boolean {
  const playable = matches.filter(m => m.team1Id && m.team2Id && !m.winnerId);
  if (playable.length === 0) return false;
  return playable.every(m => !matchIsOnNet(m));
}
