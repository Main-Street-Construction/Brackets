export type TournamentType = "single-elim" | "double-elim" | "round-robin";

export interface Tournament {
  id: string;
  name: string;
  type: TournamentType;
  description: string;
  participantsCount: number;
  ownerUid: string;
  createdAt: number;
  updatedAt: number;
}

export interface Participant {
  id: string;
  name: string;
  seed: number;
  createdAt: number;
}

export interface Match {
  id: string;
  round: number;
  order: number;
  bracket: "main" | "winners" | "losers";
  player1Id: string | null;
  player2Id: string | null;
  player1Score: number;
  player2Score: number;
  winnerId: string | null;
  nextMatchId: string | null;
  nextSlot: 1 | 2 | null;
  loserNextMatchId: string | null;
  loserNextSlot: 1 | 2 | null;
}

export interface StandingsRow {
  participantId: string;
  name: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface TournamentSnapshot {
  tournament: Tournament;
  participants: Participant[];
  matches: Match[];
}
