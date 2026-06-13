import type { Match, Participant, StandingsRow } from "../../types/tournament";
import { hasBothPlayers } from "./scoring";

export function computeRoundRobinStandings(matches: Match[], participants: Participant[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>(
    participants.map((p) => [
      p.id,
      { participantId: p.id, name: p.name, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }
    ])
  );

  for (const match of matches) {
    if (!hasBothPlayers(match) || !match.winnerId) continue;
    const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
    if (!loserId) continue;

    const winner = rows.get(match.winnerId);
    const loser = rows.get(loserId);
    if (!winner || !loser) continue;

    winner.wins += 1;
    loser.losses += 1;
    winner.pointsFor += match.winnerId === match.player1Id ? match.player1Score : match.player2Score;
    winner.pointsAgainst += match.winnerId === match.player1Id ? match.player2Score : match.player1Score;
    loser.pointsFor += match.winnerId === match.player1Id ? match.player2Score : match.player1Score;
    loser.pointsAgainst += match.winnerId === match.player1Id ? match.player1Score : match.player2Score;
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diffA = a.pointsFor - a.pointsAgainst;
    const diffB = b.pointsFor - b.pointsAgainst;
    if (diffB !== diffA) return diffB - diffA;
    return a.name.localeCompare(b.name);
  });
}
