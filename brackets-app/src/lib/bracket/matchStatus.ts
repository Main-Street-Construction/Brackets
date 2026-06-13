import type { Match } from "../../types/tournament";
import { hasBothPlayers, hasBye } from "./scoring";

export type MatchStatus = "live" | "final" | "upcoming" | "waiting" | "bye" | "tied";

export function getMatchStatus(match: Match): MatchStatus {
  if (hasBye(match) && !hasBothPlayers(match)) return match.winnerId ? "bye" : "bye";
  if (!hasBothPlayers(match)) return "waiting";
  if (match.winnerId) return "final";
  if (match.player1Score === match.player2Score && match.player1Score > 0) return "tied";
  if (match.player1Score > 0 || match.player2Score > 0) return "live";
  return "upcoming";
}

export function getMatchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case "live":
      return "Live";
    case "final":
      return "Final";
    case "upcoming":
      return "Upcoming";
    case "waiting":
      return "Waiting";
    case "bye":
      return "Bye";
    case "tied":
      return "Tied";
  }
}

export function getBracketLabel(bracket: Match["bracket"]): string {
  switch (bracket) {
    case "winners":
      return "Winners";
    case "losers":
      return "Losers";
    case "main":
      return "Finals";
  }
}

export function sortMatchesForLiveFeed(matches: Match[]): Match[] {
  const priority: Record<MatchStatus, number> = {
    live: 0,
    tied: 1,
    upcoming: 2,
    final: 3,
    waiting: 4,
    bye: 5
  };

  return [...matches].sort((a, b) => {
    const statusDiff = priority[getMatchStatus(a)] - priority[getMatchStatus(b)];
    if (statusDiff !== 0) return statusDiff;
    if (a.round !== b.round) return a.round - b.round;
    return a.order - b.order;
  });
}

export function countLiveMatches(matches: Match[]): number {
  return matches.filter((match) => {
    const status = getMatchStatus(match);
    return status === "live" || status === "tied";
  }).length;
}

export function isFeedMatch(match: Match): boolean {
  const status = getMatchStatus(match);
  return status === "live" || status === "tied" || status === "upcoming" || status === "final";
}
