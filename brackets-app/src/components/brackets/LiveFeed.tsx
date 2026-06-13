import { MatchCard } from "./MatchCard";
import { countLiveMatches, isFeedMatch, sortMatchesForLiveFeed } from "../../lib/bracket/matchStatus";
import type { Match, Participant } from "../../types/tournament";

interface Props {
  matches: Match[];
  participants: Participant[];
  onSaveScore: (match: Match, player1Score: number, player2Score: number) => Promise<void>;
}

export function LiveFeed({ matches, participants, onSaveScore }: Props) {
  const participantsById = Object.fromEntries(participants.map((p) => [p.id, p] as const));
  const feedMatches = sortMatchesForLiveFeed(matches).filter(isFeedMatch);
  const liveCount = countLiveMatches(matches);

  if (!matches.length) {
    return (
      <section className="rounded-card border border-dashed border-white/10 bg-surface/60 p-8 text-center">
        <p className="text-sm font-medium text-ink-secondary">No matches yet</p>
        <p className="mt-1 text-xs text-ink-muted">Generate a bracket to start the live feed.</p>
      </section>
    );
  }

  return (
    <section className="animate-fade-up">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {liveCount > 0 && <span className="h-2 w-2 rounded-full bg-live animate-live-pulse" />}
            <h2 className="text-2xl font-bold tracking-tight text-ink">Live</h2>
          </div>
          <p className="text-sm text-ink-secondary">
            {liveCount > 0
              ? `${liveCount} match${liveCount === 1 ? "" : "es"} in progress`
              : "No active matches — upcoming and recent results below"}
          </p>
        </div>
        <p className="shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
          {feedMatches.length} total
        </p>
      </div>

      <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {feedMatches.map((match, index) => (
          <div key={match.id} className="animate-fade-up" style={{ animationDelay: `${index * 40}ms` }}>
            <MatchCard
              match={match}
              participantsById={participantsById}
              onSaveScore={onSaveScore}
              variant="feed"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
