import React from 'react';
import { Match, Team, TournamentRules, SetScore } from '../types';
import { MatchCard } from './MatchCard';
import { Users, Layout, ArrowRight, Trophy, Clock, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface WinnersListViewProps {
  matches: Match[];
  teams: Team[];
  queue: string[];
  numNets: number;
  onUpdateScore: (matchId: string, sets: SetScore[]) => void;
  onJoinQueue: (teamId: string) => void;
  onLeaveQueue: (teamId: string) => void;
  onAddTeam: (name: string) => void;
  isCreator: boolean;
  isFinished: boolean;
  rules: TournamentRules;
}

export const WinnersListView: React.FC<WinnersListViewProps> = ({
  matches,
  teams,
  queue,
  numNets,
  onUpdateScore,
  onJoinQueue,
  onLeaveQueue,
  onAddTeam,
  isCreator,
  isFinished,
  rules
}) => {
  const [newTeamName, setNewTeamName] = React.useState('');
  const activeMatches = matches.filter(m => m.netIndex !== undefined && !m.winnerId);
  const completedMatches = matches.filter(m => m.winnerId).sort((a, b) => (b.round || 0) - (a.round || 0));

  const getTeam = (id: string | null) => teams.find(t => t.id === id);

  const handleAddTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTeamName.trim()) {
      onAddTeam(newTeamName.trim());
      setNewTeamName('');
    }
  };

  return (
    <div className="space-y-10">
      {/* Main Feature: The Queue (Waiting List) */}
      <div className="w95-panel space-y-4 sm:space-y-6">
        <div className="w95-list-header -mx-3 -mt-3 sm:-mx-4 sm:-mt-4 mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Waiting List
            <span className="bg-[#000080] text-white px-2 py-0.5 text-xs font-bold border border-black">
              {queue.length}
            </span>
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs font-bold text-black">Teams waiting for a court</p>
          {!isFinished && (
            <form onSubmit={handleAddTeam} className="flex gap-2 w-full sm:w-auto w95-inset p-1">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Team name..."
                className="flex-1 sm:w-64 w95-input min-h-9 text-sm py-1"
              />
              <button
                type="submit"
                disabled={!newTeamName.trim()}
                className="w95-btn-default text-xs disabled:opacity-50 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Join
              </button>
            </form>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {queue.map((teamId, index) => {
              const team = getTeam(teamId);
              return (
                <motion.div
                  key={teamId}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  className="w95-panel py-3 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 w95-inset text-sm font-bold text-black flex items-center justify-center flex-shrink-0">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-black truncate">{team?.name}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-black/60">Waiting</div>
                    </div>
                  </div>
                  {isCreator && !isFinished && (
                    <button
                      type="button"
                      onClick={() => onLeaveQueue(teamId)}
                      className="p-2 w95-btn min-h-0 sm:opacity-90"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          
          {queue.length === 0 && (
            <div className="col-span-full py-10 text-center w95-inset border-2 border-dashed border-[#808080] text-black">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-bold uppercase">Queue empty</p>
              <p className="text-xs mt-1 font-bold text-black/70">Add teams to start</p>
            </div>
          )}
        </div>

        {!isFinished && (
          <div className="w95-panel">
            <div className="w95-list-header -mx-3 -mt-3 sm:-mx-4 sm:-mt-4 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Available to join
            </div>
            <div className="flex flex-wrap gap-2">
              {teams.filter(t => !queue.includes(t.id) && !activeMatches.some(m => m.team1Id === t.id || m.team2Id === t.id)).map(team => (
                <button
                  type="button"
                  key={team.id}
                  onClick={() => onJoinQueue(team.id)}
                  className="w95-btn text-xs flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {team.name}
                </button>
              ))}
              {teams.filter(t => !queue.includes(t.id) && !activeMatches.some(m => m.team1Id === t.id || m.team2Id === t.id)).length === 0 && (
                <span className="text-xs font-bold text-black/60">All teams active</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="h-0 border-t-2 border-[#808080]" />

      {/* Nets Section */}
      <div className="space-y-4">
        <div className="w95-list-header flex items-center gap-2">
          <Layout className="w-4 h-4" />
          Active Courts
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: numNets }).map((_, i) => {
            const match = activeMatches.find(m => m.netIndex === i);
            const nextUpId = queue[i];
            const nextUpTeam = nextUpId ? getTeam(nextUpId) : null;

            return (
              <div key={i} className="w95-panel p-0 overflow-hidden flex flex-col">
                <div className="w95-inset px-3 py-2 flex justify-between items-center border-b-2 border-[#808080]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-black">Net {i + 1}</span>
                  {match ? (
                    <div className="flex items-center gap-2">
                      {rules.winnerStays && rules.maxConsecutiveWins && (
                        <div className="flex gap-1">
                          {Array.from({ length: rules.maxConsecutiveWins }).map((_, idx) => {
                            const team1 = getTeam(match.team1Id);
                            const team2 = getTeam(match.team2Id);
                            const t1Wins = team1?.consecutiveWins || 0;
                            const t2Wins = team2?.consecutiveWins || 0;
                            return (
                              <div 
                                key={idx} 
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full transition-colors",
                                  idx < Math.max(t1Wins, t2Wins) ? "bg-[#000080]" : "bg-[#c0c0c0]"
                                )}
                              />
                            );
                          })}
                        </div>
                      )}
                      <span className="flex items-center gap-1 text-[10px] font-bold text-black uppercase">
                        <Clock className="w-3 h-3" /> Live
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-black/60 uppercase">Idle</span>
                  )}
                </div>
                <div className="p-3 flex-1 bg-[#c0c0c0]">
                  {match ? (
                    <div className="space-y-4">
                      <MatchCard
                        match={match}
                        teams={teams}
                        onUpdateScore={onUpdateScore}
                        disabled={isFinished}
                        rules={rules}
                        showNetBadge={false}
                      />
                      {!match.team2Id && (
                        <div className="flex items-center gap-2 px-2 py-1.5 w95-inset border border-black text-[10px] font-bold uppercase">
                          Waiting for opponent
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-[100px] flex flex-col items-center justify-center w95-inset border-2 border-dashed border-[#808080] text-black/50">
                      <Layout className="w-8 h-8 mb-2 opacity-40" />
                      <span className="text-xs font-bold">Empty</span>
                    </div>
                  )}
                </div>

                <div className="px-3 py-2 border-t-2 border-[#808080] flex items-center gap-2 bg-[#c0c0c0]">
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-tight">Next:</span>
                  <span
                    className={cn(
                      'text-[11px] font-bold truncate text-black',
                      !nextUpTeam && 'italic text-black/50'
                    )}
                  >
                    {nextUpTeam?.name || "No one in queue"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="w95-list-header flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          Recent Results
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {completedMatches.slice(0, 8).map(match => (
            <div key={match.id} className="w95-panel py-3 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className={cn(
                      'text-xs font-bold truncate',
                      match.winnerId === match.team1Id ? 'text-black underline' : 'text-black/50'
                    )}
                  >
                    {getTeam(match.team1Id)?.name}
                  </span>
                  <span className="text-[10px] text-black/40">vs</span>
                  <span
                    className={cn(
                      'text-xs font-bold truncate',
                      match.winnerId === match.team2Id ? 'text-black underline' : 'text-black/50'
                    )}
                  >
                    {getTeam(match.team2Id)?.name}
                  </span>
                </div>
                <div className="text-[10px] font-bold uppercase text-black/70">
                  {match.score1} - {match.score2} sets
                </div>
              </div>
              <Trophy className="w-4 h-4 opacity-20 shrink-0 ml-2" />
            </div>
          ))}
          {completedMatches.length === 0 && (
            <div className="col-span-full p-8 text-center w95-inset border-2 border-dashed border-[#808080] text-black/60 text-xs font-bold">
              No completed matches
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
