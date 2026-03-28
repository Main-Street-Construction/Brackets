import React from 'react';
import { Match, Team, TournamentRules, SetScore } from '../types';
import { MatchCard } from './MatchCard';
import { Trophy } from 'lucide-react';
import { NetQueue } from './NetQueue';
import { resolveChampionTeamId } from '../lib/tournament/champion';

interface BracketViewProps {
  matches: Match[];
  teams: Team[];
  onUpdateScore: (matchId: string, sets: SetScore[]) => void;
  isFinished?: boolean;
  rules: TournamentRules;
}

export const BracketView: React.FC<BracketViewProps> = ({ matches, teams, onUpdateScore, isFinished, rules }) => {
  const winnersMatches = matches.filter(m => m.bracketType !== 'losers');
  const losersMatches = matches.filter(m => m.bracketType === 'losers');

  const renderBracket = (bracketMatches: Match[], title: string) => {
    const bracketRounds = Array.from(new Set(bracketMatches.map(m => m.round))).sort((a: number, b: number) => a - b);
    
    return (
      <div className="mt-6">
        <div className="w95-list-header mb-3">{title}</div>
        <div className="flex gap-6 overflow-x-auto pb-4 -mx-2 px-2 snap-x touch-pan-x">
          {bracketRounds.map(round => (
            <div key={round} className="flex flex-col gap-6 min-w-[min(100%,280px)] snap-start">
              <div className="text-[10px] font-bold uppercase py-1 px-2 w95-inset sticky left-0 text-black">
                Round {round}
              </div>
              <div className="flex flex-col justify-around flex-1 gap-4">
                {bracketMatches
                  .filter(m => m.round === round)
                  .map(match => (
                    <div key={match.id} className="relative flex items-center pr-10">
                      <MatchCard
                        match={match}
                        teams={teams}
                        onUpdateScore={onUpdateScore}
                        disabled={isFinished}
                        rules={rules}
                      />
                      {match.nextMatchId && (
                        <div className="absolute right-0 w-10 h-px bg-black" />
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const championId = isFinished ? resolveChampionTeamId(matches) : null;
  const winner = championId ? teams.find(t => t.id === championId) : undefined;

  return (
    <div className="space-y-12">
      {isFinished && winner && (
        <div className="w95-panel text-center py-6 w95-row-winner border-2 border-black">
          <div className="inline-flex p-2 bg-[#000080] text-white mb-3 border-2 border-white outline outline-1 outline-black">
            <Trophy className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-black">Congratulations {winner.name}!</h2>
          <p className="text-xs font-bold text-black mt-1">Champion</p>
        </div>
      )}
      
      {!isFinished && <NetQueue matches={matches} teams={teams} />}

      {renderBracket(winnersMatches, winnersMatches.length === matches.length ? "Tournament Bracket" : "Winners Bracket")}
      {losersMatches.length > 0 && renderBracket(losersMatches, "Losers Bracket")}
    </div>
  );
};
