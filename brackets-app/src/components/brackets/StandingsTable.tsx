import { computeRoundRobinStandings } from "../../lib/bracket/standings";
import type { Match, Participant } from "../../types/tournament";

interface Props {
  matches: Match[];
  participants: Participant[];
}

export function StandingsTable({ matches, participants }: Props) {
  const standings = computeRoundRobinStandings(matches, participants);
  if (!standings.length) return null;

  return (
    <section className="overflow-hidden rounded-card border border-white/8 bg-surface-raised">
      <div className="border-b border-white/8 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-secondary">Standings</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[0.65rem] uppercase tracking-[0.14em] text-ink-muted">
              <th className="px-4 py-2 font-semibold">#</th>
              <th className="px-4 py-2 font-semibold">Player</th>
              <th className="px-4 py-2 font-semibold">W</th>
              <th className="px-4 py-2 font-semibold">L</th>
              <th className="px-4 py-2 font-semibold">+/-</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => {
              const diff = row.pointsFor - row.pointsAgainst;
              return (
                <tr key={row.participantId} className="border-t border-white/6 transition-colors hover:bg-white/3">
                  <td className="px-4 py-3 text-ink-muted">{index + 1}</td>
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-win">{row.wins}</td>
                  <td className="px-4 py-3 text-live">{row.losses}</td>
                  <td className={`px-4 py-3 font-medium ${diff >= 0 ? "text-win" : "text-live"}`}>
                    {diff > 0 ? `+${diff}` : diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
