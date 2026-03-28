import React, { useMemo } from 'react';
import { Match, Team, TournamentRules, SetScore } from '../types';
import { cn } from '../lib/utils';
import { Trophy, Layout, Clock, Users } from 'lucide-react';
import { MatchCard } from './MatchCard';

interface PlayTwiceViewProps {
  matches: Match[];
  teams: Team[];
  numNets: number;
  onUpdateScore: (matchId: string, sets: SetScore[]) => void;
  isFinished?: boolean;
  rules: TournamentRules;
  highlightTeamId?: string | null;
}

export const PlayTwiceView: React.FC<PlayTwiceViewProps> = ({
  matches,
  teams,
  numNets,
  onUpdateScore,
  isFinished,
  rules,
  highlightTeamId
}) => {
  const getTeam = (id: string | null | undefined) =>
    id ? teams.find(t => t.id === id) ?? null : null;

  const { queuedMatches, activeMatches, completedMatches, standings } = useMemo(() => {
    const active = matches
      .filter(m => m.netIndex !== undefined && !m.winnerId)
      .sort((a, b) => (a.netIndex ?? 0) - (b.netIndex ?? 0));
    const queued = matches
      .filter(m => m.team1Id && m.team2Id && !m.winnerId && m.netIndex === undefined)
      .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || a.id.localeCompare(b.id));
    const done = matches.filter(m => m.winnerId).sort((a, b) => (b.round ?? 0) - (a.round ?? 0));

    const st = teams.map(team => {
      const teamMatches = matches.filter(m => m.team1Id === team.id || m.team2Id === team.id);
      const wins = teamMatches.filter(m => m.winnerId === team.id).length;
      const losses = teamMatches.filter(m => m.winnerId && m.winnerId !== team.id).length;
      const pointsFor = teamMatches.reduce(
        (acc, m) => acc + (m.team1Id === team.id ? (m.score1 || 0) : (m.score2 || 0)),
        0
      );
      const pointsAgainst = teamMatches.reduce(
        (acc, m) => acc + (m.team1Id === team.id ? (m.score2 || 0) : (m.score1 || 0)),
        0
      );
      return { ...team, wins, losses, diff: pointsFor - pointsAgainst };
    }).sort((a, b) => b.wins - a.wins || b.diff - a.diff);

    return {
      queuedMatches: queued,
      activeMatches: active,
      completedMatches: done,
      standings: st
    };
  }, [matches, teams]);

  return (
    <div className="space-y-10">
      {!isFinished && queuedMatches.length > 0 && (
        <div className="w95-panel space-y-4">
          <div className="w95-list-header -mx-3 -mt-3 sm:-mx-4 sm:-mt-4 mb-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Waiting for a court
              <span className="border border-black bg-[#000080] px-2 py-0.5 text-xs font-bold text-white">
                {queuedMatches.length}
              </span>
            </span>
          </div>
          <p className="text-xs font-bold text-black">
            Matches fill nets in order as games finish. Score only on active courts below.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {queuedMatches.map((match, i) => (
              <div
                key={match.id}
                className="flex flex-col gap-2 border-2 border-dashed border-[#808080] bg-white/80 p-3 w95-panel"
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase text-black/70">
                  <span>Up next</span>
                  <span>#{i + 1}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm font-bold text-black">
                  <span className="min-w-0 truncate">{getTeam(match.team1Id)?.name}</span>
                  <span className="shrink-0 text-[10px] text-black/50">vs</span>
                  <span className="min-w-0 truncate text-right">{getTeam(match.team2Id)?.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-0 border-t-2 border-[#808080]" />

      <div className="space-y-4">
        <div className="w95-list-header flex items-center gap-2">
          <Layout className="h-4 w-4" />
          Active courts
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: numNets }).map((_, i) => {
            const match = activeMatches.find(m => m.netIndex === i);
            return (
              <div key={i} className="flex flex-col overflow-hidden w95-panel p-0">
                <div className="flex items-center justify-between border-b-2 border-[#808080] bg-zinc-100 px-3 py-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-black">
                    Net {i + 1}
                  </span>
                  {match ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-black">
                      <Clock className="h-3 w-3" /> Live
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-black/50">Open</span>
                  )}
                </div>
                <div className="flex-1 bg-[#c0c0c0] p-3">
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
                    <div className="flex h-[120px] flex-col items-center justify-center border-2 border-dashed border-[#808080] text-black/50 w95-inset">
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
        <div className="w95-list-header">Standings</div>
        <table className="min-w-[400px] w-full border-collapse text-left text-black">
          <thead>
            <tr className="border-b-2 border-[#808080]">
              <th className="w95-inset px-3 py-2 text-[10px] font-bold uppercase">Team</th>
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
                  'border-t border-zinc-200',
                  isFinished && highlightTeamId === team.id && 'bg-emerald-50'
                )}
              >
                <td
                  className={cn(
                    'px-3 py-2 text-sm font-bold',
                    isFinished && highlightTeamId === team.id
                      ? 'bg-emerald-50 text-emerald-950'
                      : 'bg-white'
                  )}
                >
                  {team.name}
                  {isFinished && highlightTeamId === team.id && (
                    <span className="ml-2 text-xs font-semibold text-emerald-800">Leader</span>
                  )}
                </td>
                <td className="bg-white px-3 py-2 text-center text-sm">{team.wins}</td>
                <td className="bg-white px-3 py-2 text-center text-sm">{team.losses}</td>
                <td className="bg-white px-3 py-2 text-center font-mono text-sm font-bold">
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
                      m.winnerId === m.team1Id ? 'text-black underline' : 'text-black/50'
                    )}
                  >
                    {getTeam(m.team1Id)?.name}
                  </span>
                  <span className="text-[10px] text-black/40">vs</span>
                  <span
                    className={cn(
                      'truncate text-xs font-bold',
                      m.winnerId === m.team2Id ? 'text-black underline' : 'text-black/50'
                    )}
                  >
                    {getTeam(m.team2Id)?.name}
                  </span>
                </div>
                <div className="text-[10px] font-bold uppercase text-black/70">
                  {m.sets && m.sets.length > 0
                    ? m.sets.map(s => `${s.team1}-${s.team2}`).join(', ')
                    : `${m.score1 ?? 0}-${m.score2 ?? 0} sets`}
                </div>
              </div>
              <Trophy className="ml-2 h-4 w-4 shrink-0 opacity-20" />
            </div>
          ))}
          {completedMatches.length === 0 && (
            <div className="col-span-full border-2 border-dashed border-[#808080] p-8 text-center text-xs font-bold text-black/60 w95-inset">
              No finished matches yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
