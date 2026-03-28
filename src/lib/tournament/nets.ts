import type { Match } from '../../types';

export function assignNets(matches: Match[], numNets: number): Match[] {
  const updated = [...matches];
  const activeNets = new Set(
    updated.filter(m => m.netIndex !== undefined && !m.winnerId).map(m => m.netIndex as number)
  );

  for (let i = 0; i < updated.length; i++) {
    const m = updated[i];
    if (m.team1Id && m.team2Id && !m.winnerId && m.netIndex === undefined) {
      for (let n = 0; n < numNets; n++) {
        if (!activeNets.has(n)) {
          updated[i] = { ...m, netIndex: n };
          activeNets.add(n);
          break;
        }
      }
    }
  }
  return updated;
}
