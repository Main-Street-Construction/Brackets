import React from 'react';
import { Match, Team } from '../types';
import { cn } from '../lib/utils';
import { LayoutGrid, Clock } from 'lucide-react';

interface NetQueueProps {
  matches: Match[];
  teams: Team[];
}

export const NetQueue: React.FC<NetQueueProps> = ({ matches, teams }) => {
  const activeMatches = matches.filter(m => m.netIndex !== undefined && !m.winnerId).sort((a, b) => (a.netIndex || 0) - (b.netIndex || 0));
  const queuedMatches = matches.filter(m => m.team1Id && m.team2Id && !m.winnerId && m.netIndex === undefined);

  if (activeMatches.length === 0 && queuedMatches.length === 0) return null;

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="w95-list-header flex-1 flex items-center gap-2 mb-0 py-2">
          <LayoutGrid className="w-4 h-4" /> Net Assignments
        </div>
        {queuedMatches.length > 0 && (
          <span className="text-[10px] font-bold w95-inset px-2 py-1 flex items-center gap-1 border border-black">
            <Clock className="w-3 h-3" /> {queuedMatches.length} queued
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {activeMatches.map(match => {
          const t1 = teams.find(t => t.id === match.team1Id);
          const t2 = teams.find(t => t.id === match.team2Id);
          return (
            <div key={match.id} className="w95-panel relative pt-6">
              <div className="absolute top-0 right-0 bg-[#000080] text-white text-[10px] font-bold px-2 py-1 border border-black">
                NET {match.netIndex! + 1}
              </div>
              <div className="flex items-center justify-between gap-2 text-sm font-bold text-black">
                <span className="truncate">{t1?.name || 'TBD'}</span>
                <span className="text-[10px] shrink-0">VS</span>
                <span className="truncate text-right">{t2?.name || 'TBD'}</span>
              </div>
            </div>
          );
        })}

        {queuedMatches.map((match, i) => {
          const t1 = teams.find(t => t.id === match.team1Id);
          const t2 = teams.find(t => t.id === match.team2Id);
          return (
            <div key={match.id} className="w95-panel border-dashed opacity-90 py-3">
              <div className="flex items-center justify-between mb-1 text-[10px] font-bold uppercase">
                <span>Queue</span>
                <span>#{i + 1}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-black">
                <span className="truncate">{t1?.name}</span>
                <span>VS</span>
                <span className="truncate text-right">{t2?.name}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
