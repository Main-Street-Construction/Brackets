import React from 'react';
import { Match, Team, TournamentRules, SetScore } from '../types';
import { AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { isValidCompletedSet, validateMatchSets } from '../lib/tournament/scoring';

interface MatchCardProps {
  match: Match;
  teams: Team[];
  onUpdateScore: (matchId: string, sets: SetScore[]) => void;
  disabled?: boolean;
  rules?: TournamentRules;
}

function countSetWins(sets: SetScore[], rules: TournamentRules): { w1: number; w2: number } {
  let w1 = 0;
  let w2 = 0;
  for (let i = 0; i < sets.length; i++) {
    const r = isValidCompletedSet(sets[i]!, i, rules);
    if (!r.ok) continue;
    if (r.side1Wins) w1++;
    else w2++;
  }
  return { w1, w2 };
}

export const MatchCard: React.FC<MatchCardProps> = ({ match, teams, onUpdateScore, disabled, rules }) => {
  const r = rules ?? {
    pointsToWin: 25,
    bestOf: 1,
    thirdSetTo: 15,
    serveToWin: false,
    winByTwo: true
  };

  const [completedSets, setCompletedSets] = React.useState<SetScore[]>(() => match.sets ?? []);
  const [cur1, setCur1] = React.useState<number | string>('');
  const [cur2, setCur2] = React.useState<number | string>('');
  const [draftError, setDraftError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCompletedSets(match.sets ?? []);
  }, [match.sets, match.id]);

  const team1 = teams.find(t => t.id === match.team1Id);
  const team2 = teams.find(t => t.id === match.team2Id);

  const bestOf = r.bestOf === 3 ? 3 : 1;
  const need = bestOf === 3 ? 2 : 1;
  const { w1, w2 } = countSetWins(completedSets, r);
  const matchDecided = w1 >= need || w2 >= need;
  const nextSetIndex = completedSets.length;

  const n1 = parseInt(cur1.toString(), 10) || 0;
  const n2 = parseInt(cur2.toString(), 10) || 0;

  const submitSingleSet = () => {
    setDraftError(null);
    const set: SetScore = { team1: n1, team2: n2 };
    const v = isValidCompletedSet(set, 0, r);
    if (v.ok === false) {
      setDraftError(v.reason);
      return;
    }
    onUpdateScore(match.id, [set]);
  };

  const recordSetInBo3 = () => {
    setDraftError(null);
    const set: SetScore = { team1: n1, team2: n2 };
    const v = isValidCompletedSet(set, nextSetIndex, r);
    if (v.ok === false) {
      setDraftError(v.reason);
      return;
    }
    const next = [...completedSets, set];
    const cw = countSetWins(next, r);
    setCur1('');
    setCur2('');
    if (cw.w1 >= need || cw.w2 >= need) {
      const full = validateMatchSets(next, r);
      if (full.ok === false) {
        setDraftError(full.reason);
        return;
      }
      onUpdateScore(match.id, next);
    } else {
      setCompletedSets(next);
    }
  };

  const handleSubmitBo1 = () => {
    if (cur1 === '' || cur2 === '') return;
    submitSingleSet();
  };

  const handleSubmitBo3Record = () => {
    if (cur1 === '' || cur2 === '') return;
    recordSetInBo3();
  };

  const setLabel =
    bestOf === 3
      ? nextSetIndex === 2
        ? `Set 3 (to ${r.thirdSetTo})`
        : `Set ${nextSetIndex + 1}${r.pointsToWin ? ` (to ${r.pointsToWin})` : ' (traditional)'}`
      : r.pointsToWin
        ? `Set (to ${r.pointsToWin})`
        : 'Set (traditional)';

  return (
    <div className="match-card w-full">
      {match.netIndex !== undefined && !match.winnerId && (
        <div className="flex justify-end mb-2">
          <div className="w95-inset text-[10px] font-bold px-2 py-0.5 text-black border border-black">
            NET {match.netIndex + 1}
          </div>
        </div>
      )}

      {bestOf === 3 && completedSets.length > 0 && !match.winnerId && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {completedSets.map((s, i) => (
            <span key={i} className="text-[10px] font-bold px-2 py-1 w95-inset text-black">
              S{i + 1}: {s.team1}-{s.team2}
            </span>
          ))}
          <span className="text-[10px] font-bold text-black self-center">
            ({w1}-{w2} sets)
          </span>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[10px] font-bold text-black uppercase tracking-wide px-1">{setLabel}</div>

        <div
          className={cn(
            'flex items-center justify-between p-2 w95-inset min-h-[52px] border border-black',
            match.winnerId === team1?.id && team1 ? 'w95-row-winner' : 'bg-white'
          )}
        >
          <span className="text-sm font-bold truncate flex-1 pr-2">
            {team1?.name || <span className="text-black/50 italic font-normal">TBD</span>}
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={cur1}
            onChange={e => setCur1(e.target.value)}
            disabled={disabled || !team1 || !team2 || !!match.winnerId || matchDecided}
            className="w95-input-num text-xl disabled:opacity-50"
          />
        </div>
        <div
          className={cn(
            'flex items-center justify-between p-2 w95-inset min-h-[52px] border border-black',
            match.winnerId === team2?.id && team2 ? 'w95-row-winner' : 'bg-white'
          )}
        >
          <span className="text-sm font-bold truncate flex-1 pr-2">
            {team2?.name || <span className="text-black/50 italic font-normal">TBD</span>}
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={cur2}
            onChange={e => setCur2(e.target.value)}
            disabled={disabled || !team1 || !team2 || !!match.winnerId || matchDecided}
            className="w95-input-num text-xl disabled:opacity-50"
          />
        </div>

        {draftError && (
          <div className="flex items-center gap-2 text-[10px] font-bold text-black bg-white p-2 border-2 border-red-700">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {draftError}
          </div>
        )}

        {r.winByTwo && !match.winnerId && team1 && team2 && (
          <div className="text-[9px] font-bold text-black uppercase tracking-wider text-center pt-1">
            {r.pointsToWin === 0 ? 'Win by 2 (traditional)' : 'Win-by-2 per set'}
          </div>
        )}

        {r.serveToWin && (
          <p className="text-[9px] text-black px-1 w95-inset py-1">
            Serve-to-win needs rally tracking; using rally set totals only.
          </p>
        )}

        {!match.winnerId && team1 && team2 && !disabled && !matchDecided && (
          <button
            type="button"
            onClick={bestOf === 3 ? handleSubmitBo3Record : handleSubmitBo1}
            disabled={cur1 === '' || cur2 === '' || n1 === n2}
            className="w95-btn-default w-full mt-2 min-h-11 py-2.5 text-sm"
          >
            {bestOf === 3 ? (completedSets.length > 0 ? 'Record set' : 'Record set 1') : 'Submit match'}
          </button>
        )}

        {match.winnerId && match.sets && match.sets.length > 0 && (
          <div className="text-[10px] text-black font-mono pt-1">
            Final: {match.sets.map(s => `${s.team1}-${s.team2}`).join(', ')} ({match.score1}-{match.score2} sets)
          </div>
        )}
      </div>
    </div>
  );
};
