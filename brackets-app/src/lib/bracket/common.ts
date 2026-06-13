import type { Match, Participant, TournamentType } from "../../types/tournament";
import { buildDoubleElimMatches } from "./doubleElim";
import { buildRoundRobinMatches } from "./roundRobin";
import { buildSingleElimMatches } from "./singleElim";

export function normalizeParticipantSlots(participants: Participant[]): (string | null)[] {
  const nextPower = 2 ** Math.ceil(Math.log2(Math.max(participants.length, 2)));
  const slots: (string | null)[] = participants.map((p) => p.id);
  while (slots.length < nextPower) {
    slots.push(null);
  }
  return slots;
}

export function generateMatches(type: TournamentType, participants: Participant[]): Match[] {
  if (type === "single-elim") return buildSingleElimMatches(participants);
  if (type === "double-elim") return buildDoubleElimMatches(participants);
  return buildRoundRobinMatches(participants);
}
