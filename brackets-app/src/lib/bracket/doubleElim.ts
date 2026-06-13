import type { Match, Participant } from "../../types/tournament";
import { createMatch } from "./matchFactory";
import { normalizeParticipantSlots } from "./common";

function wireLosersBracket(matches: Match[], slotCount: number, winnerRounds: number): string {
  if (winnerRounds <= 1) return "";

  const loserRounds = 2 * (winnerRounds - 1);
  let prevLoserRoundIds: string[] = [];
  let loserFinalId = "";

  for (let lr = 1; lr <= loserRounds; lr += 1) {
    const isFirst = lr === 1;
    const isDropRound = lr % 2 === 0;
    const isLast = lr === loserRounds;

    let matchCount: number;
    if (isFirst) {
      matchCount = slotCount / 4;
    } else if (isDropRound) {
      matchCount = prevLoserRoundIds.length;
    } else {
      matchCount = Math.ceil(prevLoserRoundIds.length / 2);
    }

    const currentIds: string[] = [];
    for (let m = 0; m < matchCount; m += 1) {
      const id = `l-r${lr}m${m + 1}`;
      matches.push(createMatch({ id, round: lr, order: m, bracket: "losers" }));
      currentIds.push(id);
    }

    if (isFirst) {
      const winnersRoundOne = matches.filter((m) => m.bracket === "winners" && m.round === 1);
      for (let m = 0; m < matchCount; m += 1) {
        const first = winnersRoundOne[m * 2];
        const second = winnersRoundOne[m * 2 + 1];
        if (first) {
          first.loserNextMatchId = currentIds[m];
          first.loserNextSlot = 1;
        }
        if (second) {
          second.loserNextMatchId = currentIds[m];
          second.loserNextSlot = 2;
        }
      }
    } else if (isDropRound) {
      const winnersRound = lr / 2 + 1;
      const winnersMatches = matches.filter((m) => m.bracket === "winners" && m.round === winnersRound);
      for (let m = 0; m < matchCount; m += 1) {
        const winnersMatch = winnersMatches[m];
        if (winnersMatch) {
          winnersMatch.loserNextMatchId = currentIds[m];
          winnersMatch.loserNextSlot = 2;
        }
        const prevMatch = matches.find((x) => x.id === prevLoserRoundIds[m]);
        if (prevMatch) {
          prevMatch.nextMatchId = currentIds[m];
          prevMatch.nextSlot = 1;
        }
      }
    } else {
      for (let m = 0; m < matchCount; m += 1) {
        const prevA = matches.find((x) => x.id === prevLoserRoundIds[m * 2]);
        const prevB = matches.find((x) => x.id === prevLoserRoundIds[m * 2 + 1]);
        if (prevA) {
          prevA.nextMatchId = currentIds[m];
          prevA.nextSlot = 1;
        }
        if (prevB) {
          prevB.nextMatchId = currentIds[m];
          prevB.nextSlot = 2;
        }
      }
    }

    if (isLast) {
      loserFinalId = currentIds[0] ?? "";
    }
    prevLoserRoundIds = currentIds;
  }

  return loserFinalId;
}

export function buildDoubleElimMatches(participants: Participant[]): Match[] {
  const slots = normalizeParticipantSlots(participants);
  const slotCount = slots.length;
  const winnerRounds = Math.log2(slotCount);
  const matches: Match[] = [];
  let currentWinnerIds: string[] = [];

  for (let i = 0; i < slotCount; i += 2) {
    const id = `w-r1m${i / 2 + 1}`;
    matches.push(
      createMatch({
        id,
        round: 1,
        order: i / 2,
        bracket: "winners",
        player1Id: slots[i],
        player2Id: slots[i + 1]
      })
    );
    currentWinnerIds.push(id);
  }

  for (let round = 2; round <= winnerRounds; round += 1) {
    const nextWinnerIds: string[] = [];
    for (let m = 0; m < currentWinnerIds.length; m += 2) {
      const nextId = `w-r${round}m${m / 2 + 1}`;
      const prevA = matches.find((match) => match.id === currentWinnerIds[m]);
      const prevB = matches.find((match) => match.id === currentWinnerIds[m + 1]);
      if (prevA) {
        prevA.nextMatchId = nextId;
        prevA.nextSlot = 1;
      }
      if (prevB) {
        prevB.nextMatchId = nextId;
        prevB.nextSlot = 2;
      }
      matches.push(createMatch({ id: nextId, round, order: m / 2, bracket: "winners" }));
      nextWinnerIds.push(nextId);
    }
    currentWinnerIds = nextWinnerIds;
  }

  const winnersFinalId = currentWinnerIds[0] ?? "";
  const loserFinalId = wireLosersBracket(matches, slotCount, winnerRounds);

  const grandFinal = createMatch({
    id: "grand-final",
    round: winnerRounds + 1,
    order: 0,
    bracket: "main"
  });
  matches.push(grandFinal);

  const winnersFinal = matches.find((m) => m.id === winnersFinalId);
  if (winnersFinal) {
    winnersFinal.nextMatchId = grandFinal.id;
    winnersFinal.nextSlot = 1;
  }

  if (loserFinalId) {
    const losersFinal = matches.find((m) => m.id === loserFinalId);
    if (losersFinal) {
      losersFinal.nextMatchId = grandFinal.id;
      losersFinal.nextSlot = 2;
    }
  }

  return matches;
}
