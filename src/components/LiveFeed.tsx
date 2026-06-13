import type { Match, Team } from '../types';
import { countLiveMatches, isFeedMatch, sortMatchesForLiveFeed } from '../lib/matchStatus';
import { LiveMatchCard } from './LiveMatchCard';

interface Props {
  matches: Match[];
  teams: Team[];
}

export function LiveFeed({ matches, teams }: Props) {
  const feedMatches = sortMatchesForLiveFeed(matches).filter(isFeedMatch);
  const liveCount = countLiveMatches(matches);

  if (!matches.length) return null;

  return (
    <section className="mb-8 animate-fade-up">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {liveCount > 0 && <span className="h-2 w-2 rounded-full bg-live animate-live-pulse" />}
            <h2 className="text-2xl font-bold tracking-tight text-ink">Live</h2>
          </div>
          <p className="text-sm text-ink-secondary">
            {liveCount > 0
              ? `${liveCount} on court now`
              : 'No active courts — queue and results below'}
          </p>
        </div>
        <p className="shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
          {feedMatches.length} shown
        </p>
      </div>
      <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {feedMatches.map((match, index) => (
          <div key={match.id} className="animate-fade-up" style={{ animationDelay: `${index * 40}ms` }}>
            <LiveMatchCard match={match} teams={teams} />
          </div>
        ))}
      </div>
    </section>
  );
}
