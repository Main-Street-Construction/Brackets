import React, { useState, useMemo } from 'react';
import { Users, AlertCircle } from 'lucide-react';

interface TeamCalculation {
  teamCount: number;
  distribution: { size: number; count: number }[];
  totalPlayers: number;
}

export const TeamCalculator: React.FC = () => {
  const [playerCount, setPlayerCount] = useState<number>(24);

  const calculation = useMemo((): TeamCalculation | null => {
    if (playerCount < 5) return null;

    // We want to find a teamCount 'n' such that playerCount / n is mostly 5 or 6.
    // If it results in 4, we favor 7.
    
    let bestResult: TeamCalculation | null = null;

    // Try different team counts
    for (let n = Math.floor(playerCount / 7); n <= Math.ceil(playerCount / 5); n++) {
      if (n <= 0) continue;

      const baseSize = Math.floor(playerCount / n);
      const remainder = playerCount % n;

      // distribution: 'remainder' teams have baseSize + 1, 'n - remainder' teams have baseSize
      const sizes = [
        { size: baseSize + 1, count: remainder },
        { size: baseSize, count: n - remainder }
      ].filter(d => d.count > 0);

      // Check if any team has 4 players. If so, this distribution is discouraged.
      const hasFour = sizes.some(d => d.size === 4);
      
      // We prefer sizes 5 and 6. 7 is okay if it avoids 4.
      const isValid = sizes.every(d => d.size >= 5 && d.size <= 7);

      if (isValid) {
        // Scoring: 6s are best (100 pts), 5s are second best (50 pts), 7s are third (10 pts)
        const numSixes = sizes.find(d => d.size === 6)?.count || 0;
        const numFives = sizes.find(d => d.size === 5)?.count || 0;
        const numSevens = sizes.find(d => d.size === 7)?.count || 0;
        
        const score = (numSixes * 100) + (numFives * 50) + (numSevens * 10);

        if (!bestResult || score > (bestResult as any).score) {
          bestResult = { teamCount: n, distribution: sizes, totalPlayers: playerCount };
          (bestResult as any).score = score;
        }
      }
    }

    return bestResult;
  }, [playerCount]);

  return (
    <div className="w95-panel">
      <div className="w95-list-header -mx-3 -mt-3 sm:-mx-4 sm:-mt-4 mb-3 flex items-center gap-2">
        <Users className="w-4 h-4" />
        Team size calculator
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-black mb-1 uppercase tracking-wide">
            Total players
          </label>
          <input
            type="number"
            value={playerCount}
            onChange={(e) => setPlayerCount(Math.max(0, parseInt(e.target.value) || 0))}
            className="w95-input min-h-10 text-sm"
          />
        </div>

        {calculation ? (
          <div className="p-3 w95-inset border border-black">
            <div className="text-xs text-black font-bold mb-2">
              Recommended: {calculation.teamCount} Teams
            </div>
            <div className="space-y-1">
              {calculation.distribution.map((d, i) => (
                <div key={i} className="text-sm text-black flex justify-between font-bold">
                  <span>{d.count} teams of</span>
                  <span className="font-bold">{d.size} players</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          playerCount > 0 && (
            <div className="p-3 w95-inset border-2 border-red-700 flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-black">
                Not enough players to form standard 5-7 person teams.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
};
