import type { Match } from "../../types/tournament";

export function createMatch(overrides: Partial<Match> & Pick<Match, "id">): Match {
  return {
    round: 1,
    order: 0,
    bracket: "main",
    player1Id: null,
    player2Id: null,
    player1Score: 0,
    player2Score: 0,
    winnerId: null,
    nextMatchId: null,
    nextSlot: null,
    loserNextMatchId: null,
    loserNextSlot: null,
    ...overrides
  };
}
