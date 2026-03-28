import React from 'react';
import { Match, Team, TournamentRules, SetScore } from '../types';
import { cn } from '../lib/utils';
import { Trophy, LayoutGrid, Clock } from 'lucide-react';
import { MatchCard } from './MatchCard';
import { NetQueue } from './NetQueue';

interface PoolPlayViewProps {
  matches: Match[];
  teams: Team[];
  onUpdateScore: (matchId: string, sets: SetScore[]) => void;
  isFinished?: boolean;
  rules: TournamentRules;
}

export const PoolPlayView: React.FC<PoolPlayViewProps> = ({ matches, teams, onUpdateScore, isFinished, rules }) => {
  const standings = teams.map(team => {
    const teamMatches = matches.filter(m => m.team1Id === team.id || m.team2Id === team.id);
    const wins = teamMatches.filter(m => m.winnerId === team.id).length;
    const losses = teamMatches.filter(m => m.winnerId && m.winnerId !== team.id).length;
    const pointsFor = teamMatches.reduce((acc, m) => acc + (m.team1Id === team.id ? (m.score1 || 0) : (m.score2 || 0)), 0);
    const pointsAgainst = teamMatches.reduce((acc, m) => acc + (m.team1Id === team.id ? (m.score2 || 0) : (m.score1 || 0)), 0);
    
    return {
      ...team,
      wins,
      losses,
      diff: pointsFor - pointsAgainst
    };
  }).sort((a, b) => b.wins - a.wins || b.diff - a.diff);

  const winner = standings[0];

  return (
    <div className="space-y-8">
      {isFinished && winner && (
        <div className="w95-panel text-center py-6 w95-row-winner border-2 border-black">
          <div className="inline-flex p-2 bg-[#000080] text-white mb-3 border-2 border-white outline outline-1 outline-black">
            <Trophy className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-black">Congratulations {winner.name}!</h2>
          <p className="text-xs font-bold mt-1">Champion</p>
        </div>
      )}

      {!isFinished && <NetQueue matches={matches} teams={teams} />}

      <div className="w95-panel overflow-x-auto p-0">
        <div className="w95-list-header">Standings</div>
        <table className="w-full text-left border-collapse min-w-[400px] text-black">
          <thead>
            <tr className="border-b-2 border-[#808080]">
              <th className="px-3 py-2 text-[10px] font-bold uppercase w95-inset">Team</th>
              <th className="px-3 py-2 text-[10px] font-bold uppercase text-center w95-inset">W</th>
              <th className="px-3 py-2 text-[10px] font-bold uppercase text-center w95-inset">L</th>
              <th className="px-3 py-2 text-[10px] font-bold uppercase text-center w95-inset">Diff</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team) => (
              <tr key={team.id} className="border-t border-[#808080]">
                <td className="px-3 py-2 font-bold text-sm bg-white">{team.name}</td>
                <td className="px-3 py-2 text-center text-sm bg-white">{team.wins}</td>
                <td className="px-3 py-2 text-center text-sm bg-white">{team.losses}</td>
                <td className="px-3 py-2 text-center font-mono text-sm font-bold bg-white">
                  {team.diff > 0 ? `+${team.diff}` : team.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {matches.map(match => (
          <div key={match.id} className="w95-panel p-0 flex flex-col">
            <div className="w95-list-header flex justify-between items-center mb-0">
              <span>Match {match.id.split('-').pop()}</span>
              {match.winnerId && (
                <span className="flex items-center gap-1 normal-case">
                  <Trophy className="w-3 h-3" /> Done
                </span>
              )}
            </div>
            <div className="p-2 flex-1">
              <MatchCard
                match={match}
                teams={teams}
                onUpdateScore={onUpdateScore}
                disabled={isFinished}
                rules={rules}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
