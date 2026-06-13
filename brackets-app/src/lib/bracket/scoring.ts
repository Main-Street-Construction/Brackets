import type { Match } from "../../types/tournament";

export const MAX_SCORE = 9999;

export function parseScoreInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > MAX_SCORE) {
    return null;
  }
  return parsed;
}

export function clampScore(value: number): number {
  return Math.min(MAX_SCORE, Math.max(0, Math.floor(value)));
}

export function hasBothPlayers(match: Match): boolean {
  return Boolean(match.player1Id && match.player2Id);
}

export function hasBye(match: Match): boolean {
  return Boolean(match.player1Id !== match.player2Id && (match.player1Id || match.player2Id));
}

export function computeWinnerId(match: Match, player1Score: number, player2Score: number): string | null {
  if (!hasBothPlayers(match)) {
    return match.player1Id ?? match.player2Id;
  }
  if (player1Score === player2Score) return null;
  return player1Score > player2Score ? match.player1Id : match.player2Id;
}

export function computeLoserId(match: Match, winnerId: string | null): string | null {
  if (!winnerId || !hasBothPlayers(match)) return null;
  return winnerId === match.player1Id ? match.player2Id : match.player1Id;
}

export function isMatchScorable(match: Match): boolean {
  return hasBothPlayers(match) || hasBye(match);
}
