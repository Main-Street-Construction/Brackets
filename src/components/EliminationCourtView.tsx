import React, { useMemo } from 'react';
import { Match, SetScore, Team, TournamentRules } from '../types';
import { cn } from '../lib/utils';
import { GitMerge, Info } from 'lucide-react';
import { CourtScheduleView } from './CourtScheduleView';
import { isAutoAdvancePlaceholder } from '../lib/matchSchedule';

interface EliminationCourtViewProps {
  matches: Match[];
  teams: Team[];
  numNets: number;
  onUpdateScore: (matchId: string, sets: SetScore[]) => void;
  isFinished?: boolean;
  rules: TournamentRules;
  highlightTeamId?: string | null;
  title?: string;
  variant: 'single' | 'double';
}

export function BracketReferenceStrip({
  matches,
  teams,
  label
}: {
  matches: Match[];
  teams: Team[];
  label: string;
}) {
  const rounds = useMemo(() => {
    const visible = matches.filter(m => !isAutoAdvancePlaceholder(m));
    const rs = Array.from(new Set(visible.map(m => m.round))).sort((a, b) => a - b);
    return rs.map(r => ({
      round: r,
      list: visible.filter(m => m.round === r)
    }));
  }, [matches]);

  const name = (id: string | null | undefined) =>
    id ? teams.find(t => t.id === id)?.name ?? '—' : '—';

  const scoreLine = (m: Match) => {
    if (m.byeWalkover) return null;
    if (m.sets && m.sets.length > 0) return m.sets.map(s => `${s.team1}-${s.team2}`).join(', ');
    if (m.score1 != null && m.score2 != null) return `${m.score1}-${m.score2}`;
    return null;
  };

  return (
    <div className="mt-2">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase text-ink-muted">
        <GitMerge className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="bracket-h-scroll pb-2">
        {rounds.map(({ round, list }) => (
          <div
            key={round}
            className="flex min-w-[min(100%,220px)] snap-start flex-col gap-2 border-r border-white/8 pr-4"
          >
            <div className="sticky left-0 w95-inset px-2 py-1 text-[9px] font-bold uppercase text-ink-muted">
              R{round}
            </div>
            <div className="flex flex-col gap-2">
              {list.map(m => {
                const w = m.winnerId;
                const t1w = w === m.team1Id;
                const t2w = w === m.team2Id;
                const sl = scoreLine(m);
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[200px] rounded-md border border-white/10 bg-surface-raised px-2 py-1.5 text-[10px]',
                      w && 'border-win/30 bg-win/10'
                    )}
                  >
                    <div className="font-mono text-[8px] text-ink-muted">{m.id}</div>
                    <div
                      className={cn(
                        'truncate font-semibold text-ink-secondary',
                        t1w && 'text-win',
                        !m.team1Id && !t1w && 'italic text-ink-muted'
                      )}
                    >
                      {name(m.team1Id)}
                    </div>
                    <div
                      className={cn(
                        'truncate font-semibold text-ink-secondary',
                        t2w && 'text-win',
                        !m.team2Id && !t2w && 'italic text-ink-muted'
                      )}
                    >
                      {name(m.team2Id)}
                    </div>
                    {sl && (
                      <div className="mt-0.5 font-mono text-[8px] font-semibold text-ink-muted">
                        {sl}
                      </div>
                    )}
                    {w && (
                      <div className="mt-1 border-t border-win/20 pt-1 text-[9px] font-extrabold uppercase text-win">
                        W: {name(w)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const EliminationCourtView: React.FC<EliminationCourtViewProps> = ({
  matches,
  teams,
  numNets,
  onUpdateScore,
  isFinished,
  rules,
  highlightTeamId,
  title = 'Bracket reference',
  variant
}) => {
  const queueHelpText =
    variant === 'double'
      ? 'Elimination matches take nets when both teams are known. In double elimination, winners bracket round 2 and later stay in the queue until every winners bracket round 1 match is finished.'
      : 'Elimination matches take nets when both teams are known. Enter scores on active courts below.';
  const winnersMatches = matches.filter(m => m.bracketType !== 'losers');
  const losersMatches = matches.filter(m => m.bracketType === 'losers');

  return (
    <div className="space-y-8">
      <div className="w95-panel">
        <div className="w95-list-header flex flex-wrap items-center gap-2">
          <Info className="h-4 w-4 shrink-0" />
          {title}
        </div>
        <p className="mt-2 px-1 text-xs font-medium text-zinc-600">
          For placement only — enter and edit scores on the nets below. Winners update here as you save.
        </p>
        <BracketReferenceStrip matches={winnersMatches} teams={teams} label="Winners" />
        {losersMatches.length > 0 && (
          <BracketReferenceStrip matches={losersMatches} teams={teams} label="Losers" />
        )}
      </div>

      <CourtScheduleView
        matches={matches}
        teams={teams}
        numNets={numNets}
        onUpdateScore={onUpdateScore}
        isFinished={isFinished}
        rules={rules}
        highlightTeamId={highlightTeamId}
        queueHelpText={queueHelpText}
      />
    </div>
  );
};
