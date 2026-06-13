import type { Match, Participant } from "../../types/tournament";
import { createMatch } from "./matchFactory";
import { normalizeParticipantSlots } from "./common";

export function buildSingleElimMatches(participants: Participant[]): Match[] {
  const slots = normalizeParticipantSlots(participants);
  const totalRounds = Math.log2(slots.length);
  const matches: Match[] = [];
  let currentRoundMatchIds: string[] = [];

  for (let i = 0; i < slots.length; i += 2) {
    const id = `r1m${i / 2 + 1}`;
    matches.push(
      createMatch({
        id,
        round: 1,
        order: i / 2,
        bracket: "main",
        player1Id: slots[i],
        player2Id: slots[i + 1]
      })
    );
    currentRoundMatchIds.push(id);
  }

  for (let round = 2; round <= totalRounds; round += 1) {
    const nextRoundMatchIds: string[] = [];
    for (let m = 0; m < currentRoundMatchIds.length; m += 2) {
      const nextId = `r${round}m${m / 2 + 1}`;
      const prevA = matches.find((match) => match.id === currentRoundMatchIds[m]);
      const prevB = matches.find((match) => match.id === currentRoundMatchIds[m + 1]);
      if (prevA) {
        prevA.nextMatchId = nextId;
        prevA.nextSlot = 1;
      }
      if (prevB) {
        prevB.nextMatchId = nextId;
        prevB.nextSlot = 2;
      }
      matches.push(
        createMatch({
          id: nextId,
          round,
          order: m / 2,
          bracket: "main"
        })
      );
      nextRoundMatchIds.push(nextId);
    }
    currentRoundMatchIds = nextRoundMatchIds;
  }

  return matches;
}
