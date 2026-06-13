import { MatchCard } from "./MatchCard";
import { StandingsTable } from "./StandingsTable";
import type { Match, Participant, TournamentType } from "../../types/tournament";

interface Props {
  matches: Match[];
  participants: Participant[];
  tournamentType: TournamentType;
  onSaveScore: (match: Match, player1Score: number, player2Score: number) => Promise<void>;
}

const BRACKET_LABELS: Record<Match["bracket"], string> = {
  winners: "Winners Bracket",
  losers: "Losers Bracket",
  main: "Championship"
};

const BRACKET_ORDER: Match["bracket"][] = ["winners", "losers", "main"];

function groupMatchesByBracketAndRound(matches: Match[]): Map<Match["bracket"], Map<number, Match[]>> {
  const grouped = new Map<Match["bracket"], Map<number, Match[]>>();
  for (const match of matches) {
    const rounds = grouped.get(match.bracket) ?? new Map<number, Match[]>();
    rounds.set(match.round, [...(rounds.get(match.round) ?? []), match]);
    grouped.set(match.bracket, rounds);
  }
  return grouped;
}

export function BracketBoard({ matches, participants, tournamentType, onSaveScore }: Props) {
  const participantsById = Object.fromEntries(participants.map((p) => [p.id, p] as const));
  const grouped = groupMatchesByBracketAndRound(matches);

  if (!matches.length) return null;

  const showStandings = tournamentType === "round-robin";

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink">Bracket</h2>
          <p className="mt-0.5 text-sm text-ink-secondary">Full tournament tree</p>
        </div>
      </div>

      {showStandings && <StandingsTable matches={matches} participants={participants} />}

      <div className="space-y-8">
        {BRACKET_ORDER.filter((bracket) => grouped.has(bracket)).map((bracket) => {
          const rounds = grouped.get(bracket);
          if (!rounds) return null;
          return (
            <div key={bracket}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
                {BRACKET_LABELS[bracket]}
              </h3>
              <div className="scrollbar-hide flex gap-4 overflow-x-auto pb-1">
                {Array.from(rounds.entries())
                  .sort(([a], [b]) => a - b)
                  .map(([round, roundMatches]) => (
                    <div key={`${bracket}-${round}`} className="min-w-[15.5rem] shrink-0 space-y-2.5">
                      <p className="sticky top-0 text-xs font-medium text-ink-secondary">Round {round}</p>
                      {roundMatches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          participantsById={participantsById}
                          onSaveScore={onSaveScore}
                          variant="bracket"
                        />
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
