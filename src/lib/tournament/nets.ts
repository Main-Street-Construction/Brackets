import type { Match } from '../../types';

function assignNetsWithOrder(
  matches: Match[],
  numNets: number,
  orderIndices: readonly number[]
): Match[] {
  const updated = matches.map(m => ({ ...m }));

  let changed = true;
  while (changed) {
    changed = false;
    const busy = new Set<string>();
    for (const m of updated) {
      if (m.winnerId || m.netIndex === undefined) continue;
      if (m.team1Id) busy.add(m.team1Id);
      if (m.team2Id) busy.add(m.team2Id);
    }
    const occupied = new Set(
      updated
        .filter(m => m.netIndex !== undefined && !m.winnerId)
        .map(m => m.netIndex as number)
    );

    for (const i of orderIndices) {
      const m = updated[i];
      if (!m || !m.team1Id || !m.team2Id || m.winnerId || m.netIndex !== undefined) continue;
      if (busy.has(m.team1Id) || busy.has(m.team2Id)) continue;

      for (let n = 0; n < numNets; n++) {
        if (!occupied.has(n)) {
          updated[i] = { ...m, netIndex: n };
          busy.add(m.team1Id);
          busy.add(m.team2Id);
          occupied.add(n);
          changed = true;
          break;
        }
      }
    }
  }

  return updated;
}

/**
 * Assign net indices to matches that are ready to play (both teams, no winner).
 * A team may only appear on one active net at a time. Re-runs until no more
 * assignments are possible so we maximize concurrent nets without conflicts.
 */
export function assignNets(matches: Match[], numNets: number): Match[] {
  return assignNetsWithOrder(
    matches,
    numNets,
    matches.map((_, i) => i)
  );
}

/**
 * Same as assignNets but unassigned matches are considered in round → id order
 * so the waiting queue is predictable for play-twice.
 */
export function assignPlayTwiceNets(matches: Match[], numNets: number): Match[] {
  const order = matches
    .map((_, i) => i)
    .sort((ia, ib) => {
      const ma = matches[ia]!;
      const mb = matches[ib]!;
      const ra = ma.round ?? 0;
      const rb = mb.round ?? 0;
      if (ra !== rb) return ra - rb;
      return ma.id.localeCompare(mb.id);
    });
  return assignNetsWithOrder(matches, numNets, order);
}
