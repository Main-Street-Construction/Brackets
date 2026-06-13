import React, { useMemo } from 'react';
import { Match, Team, TournamentRules, SetScore } from '../types';
import { cn } from '../lib/utils';
import { Trophy, Layout, Clock, Users } from 'lucide-react';
import { MatchCard } from './MatchCard';
import { matchIsOnNet, matchIsWaitingForCourt, isAutoAdvancePlaceholder } from '../lib/matchSchedule';
import { matchCountsTowardEliminationRecord } from '../lib/tournament/records';

export interface CourtScheduleViewProps {
  matches: Match[];
  teams: Team[];
  numNets: number;
  onUpdateScore: (matchId: string, sets: SetScore[]) => void;
  isFinished?: boolean;
  rules: TournamentRules;
  highlightTeamId?: string | null;
  queueHelpText?: string;
  /** Round robin: standings sorted by record. Casual: alphabetical “activity” only (no ranking). */
  scheduleKind?: 'round-robin' | 'casual';
  /** Shown in queue hint when scheduleKind is casual. */
  targetGamesPerTeam?: number;
}

export const CourtScheduleView: React.FC<CourtScheduleViewProps> = ({
  matches,
  teams,
  numNets,
  onUpdateScore,
  isFinished,
  rules,
  highlightTeamId,
  queueHelpText = 'Matches fill nets in order as games finish. Enter scores on active courts below.',
  scheduleKind = 'round-robin',
  targetGamesPerTeam
}) => {
  const getTeam = (id: string | null | undefined) =>
    id ? teams.find(t => t.id === id) ?? null : null;

  const { queuedMatches, activeMatches, completedMatches, standings } = useMemo(() => {
    const active = matches
      .filter(m => matchIsOnNet(m) && !m.winnerId)
      .sort((a, b) => (a.netIndex ?? 0) - (b.netIndex ?? 0));
    const queued = matches
      .filter(m => matchIsWaitingForCourt(m))
      .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || a.id.localeCompare(b.id));
    const done = matches
      .filter(m => m.winnerId && !isAutoAdvancePlaceholder(m))
      .sort((a, b) => (b.round ?? 0) - (a.round ?? 0));

    const st = teams.map(team => {
      const teamMatches = matches.filter(m => m.team1Id === team.id || m.team2Id === team.id);
      const recordMs = teamMatches.filter(m => matchCountsTowardEliminationRecord(m));
      const wins = recordMs.filter(m => m.winnerId === team.id).length;
      const losses = recordMs.filter(m => m.winnerId && m.winnerId !== team.id).length;
      const pointsFor = recordMs.reduce(
        (acc, m) => acc + (m.team1Id === team.id ? (m.score1 || 0) : (m.score2 || 0)),
        0
      );
      const pointsAgainst = recordMs.reduce(
        (acc, m) => acc + (m.team1Id === team.id ? (m.score2 || 0) : (m.score1 || 0)),
        0
      );
      return { ...team, wins, losses, diff: pointsFor - pointsAgainst, gp: recordMs.length };
    });
    const sorted =
      scheduleKind === 'casual'
        ? [...st].sort((a, b) => a.name.localeCompare(b.name))
        : [...st].sort((a, b) => b.wins - a.wins || b.diff - a.diff);

    return {
      queuedMatches: queued,
      activeMatches: active,
      completedMatches: done,
      standings: sorted
    };
  }, [matches, teams, scheduleKind]);

  const casualHint =
    scheduleKind === 'casual' && targetGamesPerTeam != null && targetGamesPerTeam > 0
      ? targetGamesPerTeam
      : null;

  return (
    <div className="space-y-10">
      {!isFinished && queuedMatches.length > 0 && (
        <div className="w95-panel space-y-4">
          <div className="w95-list-header -mx-3 -mt-3 sm:-mx-4 sm:-mt-4 mb-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Waiting for a court
              <span className="rounded border border-accent/30 bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">
                {queuedMatches.length}
              </span>
            </span>
          </div>
          <p className="text-xs font-bold text-ink-secondary">{queueHelpText}</p>
          {casualHint != null && (
            <p className="text-[10px] font-semibold text-ink-muted">
              {casualHint} wave{casualHint === 1 ? '' : 's'} planned — complete each wave before the next queue opens.
              Not a formal standings format.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {queuedMatches.map((match, i) => (
              <div
                key={match.id}
                className="flex flex-col gap-2 rounded-card border border-dashed border-white/15 bg-surface p-3 w95-panel"
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase text-ink-muted">
                  <span>Up next</span>
                  <span>#{i + 1}</span>
                </div>
                {match.poolGroup && (
                  <div className="text-[9px] font-extrabold text-win">Group {match.poolGroup}</div>
                )}
                {(scheduleKind === 'casual' || (scheduleKind === 'round-robin' && match.round > 1)) && (
                  <div className="text-[9px] font-bold text-ink-muted">Round {match.round}</div>
                )}
                <div className="flex items-center justify-between gap-2 text-sm font-bold text-ink">
                  <span className="min-w-0 truncate">{getTeam(match.team1Id)?.name ?? '—'}</span>
                  <span className="shrink-0 text-[10px] text-ink-muted">vs</span>
                  <span className="min-w-0 truncate text-right">
                    {getTeam(match.team2Id)?.name ?? '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-0 border-t border-white/8" />

      <div className="space-y-4">
        <div className="w95-list-header flex items-center gap-2">
          <Layout className="h-4 w-4" />
          Active courts — enter scores here
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: numNets }).map((_, i) => {
            const match = activeMatches.find(m => m.netIndex === i);
            return (
              <div key={i} className="flex flex-col overflow-hidden w95-panel p-0">
                <div className="flex items-center justify-between border-b border-white/8 bg-surface-raised px-3 py-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink">
                    Net {i + 1}
                  </span>
                  {match ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-live">
                      <Clock className="h-3 w-3" /> Live
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-ink-muted">Open</span>
                  )}
                </div>
                <div className="flex-1 bg-surface p-3">
                  {match ? (
                    <MatchCard
                      match={match}
                      teams={teams}
                      onUpdateScore={onUpdateScore}
                      disabled={isFinished}
                      rules={rules}
                      showNetBadge={false}
                    />
                  ) : (
                    <div className="flex h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-white/15 text-ink-muted w95-inset">
                      <Layout className="mb-2 h-8 w-8 opacity-40" />
                      <span className="text-xs font-bold">No match yet</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w95-panel overflow-x-auto p-0">
        <div className="w95-list-header">
          {scheduleKind === 'casual' ? 'Activity (not ranked)' : 'Standings'}
        </div>
        {scheduleKind === 'casual' && (
          <p className="border-b border-white/8 bg-surface px-3 py-2 text-[10px] font-semibold text-ink-muted">
            Rows are alphabetical. Wins and losses are FYI only — this format has no official winner.
          </p>
        )}
        <table className="min-w-[400px] w-full border-collapse text-left text-ink">
          <thead>
            <tr className="border-b border-white/8">
              <th className="w95-inset px-3 py-2 text-[10px] font-bold uppercase">Team</th>
              {scheduleKind === 'casual' && (
                <th className="w95-inset px-3 py-2 text-center text-[10px] font-bold uppercase">GP</th>
              )}
              <th className="w95-inset px-3 py-2 text-center text-[10px] font-bold uppercase">W</th>
              <th className="w95-inset px-3 py-2 text-center text-[10px] font-bold uppercase">L</th>
              <th className="w95-inset px-3 py-2 text-center text-[10px] font-bold uppercase">Diff</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(team => (
              <tr
                key={team.id}
                className={cn(
                  'border-t border-white/8',
                  scheduleKind === 'round-robin' && isFinished && highlightTeamId === team.id && 'bg-win/10'
                )}
              >
                <td
                  className={cn(
                    'px-3 py-2 text-sm font-bold',
                    scheduleKind === 'round-robin' && isFinished && highlightTeamId === team.id
                      ? 'bg-win/10 text-win'
                      : 'bg-surface-raised'
                  )}
                >
                  {team.name}
                  {scheduleKind === 'round-robin' && isFinished && highlightTeamId === team.id && (
                    <span className="ml-2 text-xs font-semibold text-win">Leader</span>
                  )}
                </td>
                {scheduleKind === 'casual' && (
                  <td className="bg-surface-raised px-3 py-2 text-center text-sm">{team.gp}</td>
                )}
                <td className="bg-surface-raised px-3 py-2 text-center text-sm">{team.wins}</td>
                <td className="bg-surface-raised px-3 py-2 text-center text-sm">{team.losses}</td>
                <td className="bg-surface-raised px-3 py-2 text-center font-mono text-sm font-bold">
                  {team.diff > 0 ? `+${team.diff}` : team.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4">
        <div className="w95-list-header flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Recent results
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {completedMatches.slice(0, 12).map(m => (
            <div key={m.id} className="flex items-center justify-between py-3 w95-panel">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'truncate text-xs font-bold',
                      m.winnerId === m.team1Id ? 'text-ink underline' : 'text-ink-muted'
                    )}
                  >
                    {getTeam(m.team1Id)?.name}
                  </span>
                  <span className="text-[10px] text-ink-muted">vs</span>
                  <span
                    className={cn(
                      'truncate text-xs font-bold',
                      m.winnerId === m.team2Id ? 'text-ink underline' : 'text-ink-muted'
                    )}
                  >
                    {getTeam(m.team2Id)?.name}
                  </span>
                </div>
                <div className="text-[10px] font-bold uppercase text-ink-muted">
                  {m.sets && m.sets.length > 0
                    ? m.sets.map(s => `${s.team1}-${s.team2}`).join(', ')
                    : `${m.score1 ?? 0}-${m.score2 ?? 0} sets`}
                </div>
                {m.winnerId && (
                  <div className="mt-1 text-[10px] font-extrabold uppercase text-win">
                    Winner: {getTeam(m.winnerId)?.name ?? m.winnerId}
                  </div>
                )}
              </div>
              <Trophy className="ml-2 h-4 w-4 shrink-0 opacity-20" />
            </div>
          ))}
          {completedMatches.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-white/15 p-8 text-center text-xs font-bold text-ink-muted w95-inset">
              No finished matches yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
