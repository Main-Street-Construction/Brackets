import React from 'react';
import { Match, Team } from '../types';
import { LayoutGrid, Clock } from 'lucide-react';

interface NetQueueProps {
  matches: Match[];
  teams: Team[];
}

export const NetQueue: React.FC<NetQueueProps> = ({ matches, teams }) => {
  const activeMatches = matches
    .filter(m => m.netIndex !== undefined && !m.winnerId)
    .sort((a, b) => (a.netIndex || 0) - (b.netIndex || 0));
  const queuedMatches = matches.filter(
    m => m.team1Id && m.team2Id && !m.winnerId && m.netIndex === undefined
  );

  if (activeMatches.length === 0 && queuedMatches.length === 0) return null;

  return (
    <div className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="mb-0 flex flex-1 items-center gap-2 py-2 w95-list-header">
          <LayoutGrid className="h-4 w-4" /> Net assignments
        </div>
        {queuedMatches.length > 0 && (
          <span className="flex items-center gap-1 border border-black px-2 py-1 text-[10px] font-bold w95-inset">
            <Clock className="h-3 w-3" /> {queuedMatches.length} queued
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {activeMatches.map(match => {
          const t1 = teams.find(t => t.id === match.team1Id);
          const t2 = teams.find(t => t.id === match.team2Id);
          return (
            <div key={match.id} className="flex flex-col gap-2 p-3 w95-panel">
              <div className="flex items-center justify-between border-b border-zinc-300 pb-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-black">
                  Net {match.netIndex! + 1}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm font-bold text-black">
                <span className="min-w-0 flex-1 truncate">{t1?.name || 'TBD'}</span>
                <span className="shrink-0 text-[10px] text-black/60">VS</span>
                <span className="min-w-0 flex-1 truncate text-right">{t2?.name || 'TBD'}</span>
              </div>
            </div>
          );
        })}

        {queuedMatches.map((match, i) => {
          const t1 = teams.find(t => t.id === match.team1Id);
          const t2 = teams.find(t => t.id === match.team2Id);
          return (
            <div key={match.id} className="border-dashed py-3 opacity-90 w95-panel">
              <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase">
                <span>Queue</span>
                <span>#{i + 1}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-black">
                <span className="min-w-0 flex-1 truncate">{t1?.name}</span>
                <span className="shrink-0">VS</span>
                <span className="min-w-0 flex-1 truncate text-right">{t2?.name}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
