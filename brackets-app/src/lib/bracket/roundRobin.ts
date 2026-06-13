import type { Match, Participant } from "../../types/tournament";
import { createMatch } from "./matchFactory";

export function buildRoundRobinMatches(participants: Participant[]): Match[] {
  const matches: Match[] = [];
  let round = 1;
  let order = 0;
  for (let i = 0; i < participants.length; i += 1) {
    for (let j = i + 1; j < participants.length; j += 1) {
      matches.push(
        createMatch({
          id: `rr-${i + 1}-${j + 1}`,
          round,
          order,
          bracket: "main",
          player1Id: participants[i].id,
          player2Id: participants[j].id
        })
      );
      order += 1;
      if (order % 4 === 0) round += 1;
    }
  }
  return matches;
}
