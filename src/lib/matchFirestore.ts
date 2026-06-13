import type { Match } from '../types';

/**
 * Shape accepted by firestore.rules `validMatchDoc`.
 * Omits `undefined` only; keeps explicit `null` for empty bracket slots.
 */
export function matchToFirestore(match: Match): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    id: match.id,
    round: match.round,
    team1Id: match.team1Id ?? null,
    team2Id: match.team2Id ?? null
  };

  if (match.score1 !== undefined) doc.score1 = match.score1;
  if (match.score2 !== undefined) doc.score2 = match.score2;
  if (match.sets !== undefined) doc.sets = match.sets;
  if (match.winnerId !== undefined) doc.winnerId = match.winnerId ?? null;
  if (match.byeWalkover !== undefined) doc.byeWalkover = match.byeWalkover;
  if (match.nextMatchId !== undefined) doc.nextMatchId = match.nextMatchId ?? null;
  if (match.nextMatchSlot !== undefined) doc.nextMatchSlot = match.nextMatchSlot;
  if (match.loserMatchId !== undefined) doc.loserMatchId = match.loserMatchId ?? null;
  if (match.loserMatchSlot !== undefined) doc.loserMatchSlot = match.loserMatchSlot;
  if (match.bracketType !== undefined) doc.bracketType = match.bracketType;
  if (match.netIndex !== undefined) doc.netIndex = match.netIndex;
  if (match.poolGroup !== undefined) doc.poolGroup = match.poolGroup;

  return doc;
}
