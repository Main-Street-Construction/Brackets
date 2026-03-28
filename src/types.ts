export type TournamentFormat = 'single' | 'double' | 'pool' | 'play-twice' | 'winners-list';

export interface TournamentRules {
  pointsToWin: 15 | 21 | 25 | 0; // 0 for traditional
  bestOf: 1 | 3;
  thirdSetTo: 15;
  serveToWin: boolean;
  winByTwo: boolean;
  winnerStays?: boolean;
  maxConsecutiveWins?: number;
  onMaxWins?: 'other-stays' | 'both-off';
}

export interface Team {
  id: string;
  name: string;
  players?: number;
  consecutiveWins?: number;
}

/** Per-set rally scores (team1 = match.team1Id side). */
export interface SetScore {
  team1: number;
  team2: number;
}

export interface Match {
  id: string;
  team1Id: string | null;
  team2Id: string | null;
  score1?: number;
  score2?: number;
  /** Completed sets in order; when present, winner follows best-of rules. */
  sets?: SetScore[];
  winnerId?: string | null;
  nextMatchId?: string | null;
  loserMatchId?: string | null;
  round: number;
  bracketType?: 'winners' | 'losers';
  netIndex?: number;
}

export interface TournamentState {
  id?: string;
  name: string;
  teams: Team[];
  format: TournamentFormat;
  matches: Match[];
  isStarted: boolean;
  isFinished?: boolean;
  inviteCode: string;
  creatorId: string;
  rules: TournamentRules;
  numNets?: number;
  queue?: string[]; // Team IDs in order
  activeNets?: { [netIndex: number]: string | null }; // Match ID or similar
}
