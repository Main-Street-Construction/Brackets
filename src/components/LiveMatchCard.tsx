import type { Match, Team } from '../types';
import { Badge } from './ui/Badge';
import { getMatchStatus, getMatchStatusLabel } from '../lib/matchStatus';
import { matchIsOnNet } from '../lib/matchSchedule';

function statusTone(status: ReturnType<typeof getMatchStatus>) {
  switch (status) {
    case 'live':
      return 'live' as const;
    case 'final':
      return 'final' as const;
    case 'upcoming':
      return 'upcoming' as const;
    default:
      return 'muted' as const;
  }
}

function scoreLine(match: Match): string {
  if (match.sets?.length) {
    return match.sets.map((s) => `${s.team1}-${s.team2}`).join(', ');
  }
  if (match.score1 != null && match.score2 != null) {
    return `${match.score1}-${match.score2}`;
  }
  return '—';
}

interface Props {
  match: Match;
  teams: Team[];
}

export function LiveMatchCard({ match, teams }: Props) {
  const status = getMatchStatus(match);
  const t1 = match.team1Id ? teams.find((t) => t.id === match.team1Id)?.name ?? 'Unknown' : 'TBD';
  const t2 = match.team2Id ? teams.find((t) => t.id === match.team2Id)?.name ?? 'Unknown' : 'TBD';
  const onNet = matchIsOnNet(match);

  return (
    <article
      className={`relative min-w-[17rem] shrink-0 rounded-card border border-white/8 bg-surface-raised p-4 shadow-feed ${
        status === 'live' ? 'ring-1 ring-live/30' : status === 'final' ? 'ring-1 ring-win/25' : ''
      }`}
    >
      {status === 'live' && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-live/80 to-transparent" />
      )}
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {onNet ? `Net ${(match.netIndex ?? 0) + 1}` : `Round ${match.round}`}
          {match.bracketType ? ` · ${match.bracketType}` : ''}
        </p>
        <Badge tone={statusTone(status)} pulse={status === 'live'}>
          {getMatchStatusLabel(status)}
        </Badge>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${match.winnerId === match.team1Id ? 'font-semibold text-win' : 'text-ink-secondary'}`}>
            {t1}
          </span>
          {match.winnerId === match.team1Id && <span className="text-xs text-win">W</span>}
        </div>
        <div className="border-t border-white/6" />
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${match.winnerId === match.team2Id ? 'font-semibold text-win' : 'text-ink-secondary'}`}>
            {t2}
          </span>
          {match.winnerId === match.team2Id && <span className="text-xs text-win">W</span>}
        </div>
      </div>
      {(match.winnerId || match.sets?.length) && (
        <p className="mt-3 text-center font-score text-lg tabular-nums text-ink">{scoreLine(match)}</p>
      )}
    </article>
  );
}
