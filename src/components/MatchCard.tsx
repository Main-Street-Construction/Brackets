import React from 'react';
import { Match, Team, TournamentRules, SetScore } from '../types';
import { AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { matchIsOnNet } from '../lib/matchSchedule';
import { isValidCompletedSet, validateMatchSets } from '../lib/tournament/scoring';

interface MatchCardProps {
  match: Match;
  teams: Team[];
  onUpdateScore: (matchId: string, sets: SetScore[]) => void;
  disabled?: boolean;
  rules?: TournamentRules;
  /** When false, hide the small NET chip (parent already shows court). Default true. */
  showNetBadge?: boolean;
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

export const MatchCard: React.FC<MatchCardProps> = ({
  match,
  teams,
  onUpdateScore,
  disabled,
  rules,
  showNetBadge = true
}) => {
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

  const setsFingerprint =
    match.sets === undefined
      ? ''
      : `${match.sets.length}:${match.sets.map(s => `${s.team1}-${s.team2}`).join(';')}`;

  React.useEffect(() => {
    setCompletedSets(match.sets ?? []);
    setCur1('');
    setCur2('');
    setDraftError(null);
  }, [match.id, match.team1Id, match.team2Id, match.netIndex, setsFingerprint]);

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
        : `Set ${nextSetIndex + 1} (to ${r.pointsToWin})`
      : `Set (to ${r.pointsToWin})`;

  const showServeRuleCallout = Boolean(r.serveToWin && team1 && team2 && !match.winnerId);

  const winnerTeam = match.winnerId ? teams.find(t => t.id === match.winnerId) : null;

  return (
    <div className="match-card w-full">
      {showNetBadge && matchIsOnNet(match) && !match.winnerId && (
        <div className="mb-2 flex justify-end">
          <div className="w95-inset px-2 py-0.5 text-[10px] font-semibold text-ink-secondary">
            NET {match.netIndex + 1}
          </div>
        </div>
      )}

      {match.winnerId && (winnerTeam || match.byeWalkover) && (
        <div className="mb-3 rounded-lg border border-win/30 bg-win/10 px-3 py-2 text-center">
          {match.byeWalkover ? (
            <>
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-win">Advanced</p>
              <p className="mt-0.5 text-base font-bold text-ink">
                {teams.find(t => t.id === match.winnerId)?.name ?? 'Team'}
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-win">Match winner</p>
              <p className="mt-0.5 text-base font-bold text-ink">{winnerTeam!.name}</p>
            </>
          )}
        </div>
      )}

      {showServeRuleCallout && (
        <p
          className="mb-2 rounded border border-tie/30 bg-tie/10 px-2 py-1.5 text-center text-[10px] font-medium leading-snug text-ink-secondary"
          role="status"
        >
          Serve to win: last point of the game on serve — enter final scores when done.
        </p>
      )}

      {bestOf === 3 && completedSets.length > 0 && !match.winnerId && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {completedSets.map((s, i) => (
            <span key={i} className="w95-inset px-2 py-1 text-[10px] font-bold text-ink">
              S{i + 1}: {s.team1}-{s.team2}
            </span>
          ))}
          <span className="self-center text-[10px] font-bold text-ink-secondary">
            ({w1}-{w2} sets)
          </span>
        </div>
      )}

      <div className="space-y-2">
        <div className="px-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted">{setLabel}</div>

        <div
          className={cn(
            'flex min-h-[52px] items-center justify-between rounded-lg border border-white/8 bg-surface p-2',
            match.winnerId === team1?.id && team1 ? 'w95-row-winner' : ''
          )}
        >
          <span className="flex-1 truncate pr-2 text-sm font-bold text-ink">
            {team1?.name || <span className="font-normal italic text-ink-muted">TBD</span>}
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
            'flex min-h-[52px] items-center justify-between rounded-lg border border-white/8 bg-surface p-2',
            match.winnerId === team2?.id && team2 ? 'w95-row-winner' : ''
          )}
        >
          <span className="flex-1 truncate pr-2 text-sm font-bold text-ink">
            {team2?.name || <span className="font-normal italic text-ink-muted">TBD</span>}
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
          <div className="flex items-center gap-2 rounded-lg border border-live/30 bg-live/10 p-2 text-[10px] font-bold text-live">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {draftError}
          </div>
        )}

        {r.winByTwo && !match.winnerId && team1 && team2 && (
          <div className="pt-1 text-center text-[9px] font-semibold uppercase tracking-wider text-ink-muted">
            Win by 2 per set
          </div>
        )}

        {!match.winnerId && team1 && team2 && !disabled && !matchDecided && (
          <button
            type="button"
            onClick={bestOf === 3 ? handleSubmitBo3Record : handleSubmitBo1}
            disabled={cur1 === '' || cur2 === '' || n1 === n2}
            className="w95-btn-default mt-2 min-h-11 w-full py-2.5 text-sm"
          >
            {bestOf === 3
              ? completedSets.length > 0
                ? 'Record set'
                : 'Record set 1'
              : 'Submit match'}
          </button>
        )}

        {match.winnerId && match.sets && match.sets.length > 0 && (
          <div className="pt-1 font-mono text-[10px] text-black">
            Final: {match.sets.map(s => `${s.team1}-${s.team2}`).join(', ')} ({match.score1}-{match.score2}{' '}
            sets)
          </div>
        )}
      </div>
    </div>
  );
};
