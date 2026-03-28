import type { SetScore, TournamentRules } from '../../types';

function setCapForIndex(setIndex: number, rules: TournamentRules): number {
  if (rules.bestOf === 3 && setIndex === 2) {
    return rules.thirdSetTo;
  }
  if (rules.pointsToWin === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return rules.pointsToWin;
}

/** True if side1 wins this completed set (strictly greater score, rules satisfied). */
export function isValidCompletedSet(
  set: SetScore,
  setIndex: number,
  rules: TournamentRules
): { ok: true; side1Wins: boolean } | { ok: false; reason: string } {
  const { team1: s1, team2: s2 } = set;
  if (s1 < 0 || s2 < 0) return { ok: false, reason: 'Scores cannot be negative.' };
  if (s1 === s2) return { ok: false, reason: 'Set cannot end in a tie.' };

  const cap = setCapForIndex(setIndex, rules);
  const hi = Math.max(s1, s2);
  const lo = Math.min(s1, s2);
  const leaderIs1 = s1 > s2;

  if (Number.isFinite(cap)) {
    if (rules.winByTwo) {
      const won =
        (leaderIs1 && s1 >= cap && s1 - s2 >= 2) || (!leaderIs1 && s2 >= cap && s2 - s1 >= 2);
      if (!won) {
        return {
          ok: false,
          reason: `Win the set to ${cap} by at least 2 (or extend past ${cap} with a 2-point lead).`
        };
      }
    } else {
      const won = (leaderIs1 && s1 >= cap) || (!leaderIs1 && s2 >= cap);
      if (!won) {
        return { ok: false, reason: `A side must reach ${cap} to win the set.` };
      }
    }
  } else {
    // Traditional (no rally cap): win by margin 2 when winByTwo; else use thirdSetTo as soft cap
    if (rules.winByTwo) {
      if (hi - lo < 2) {
        return { ok: false, reason: 'Win by at least 2 points (traditional / no cap).' };
      }
    } else {
      const fallback = rules.thirdSetTo;
      if (hi < fallback) {
        return { ok: false, reason: `Reach at least ${fallback} to win (traditional mode without win-by-2).` };
      }
    }
  }

  return { ok: true, side1Wins: leaderIs1 };
}

/** Validate a full list of sets for an in-progress or completed match. */
export function validateMatchSets(
  sets: SetScore[],
  rules: TournamentRules
): { ok: true } | { ok: false; reason: string } {
  const need = rules.bestOf === 3 ? 2 : 1;
  let w1 = 0;
  let w2 = 0;

  for (let i = 0; i < sets.length; i++) {
    const res = isValidCompletedSet(sets[i], i, rules);
    if (res.ok === false) return res;
    if (res.side1Wins) w1++;
    else w2++;
    if (w1 >= need || w2 >= need) {
      if (i !== sets.length - 1) {
        return { ok: false, reason: 'Extra sets after match was already decided.' };
      }
      break;
    }
  }

  if (w1 < need && w2 < need) {
    return { ok: false, reason: `Best of ${rules.bestOf}: play until a side wins ${need} set(s).` };
  }

  return { ok: true };
}

export function matchOutcomeFromSets(
  sets: SetScore[],
  rules: TournamentRules
): { ok: true; setsWon1: number; setsWon2: number; winnerIsTeam1: boolean } | { ok: false; reason: string } {
  const v = validateMatchSets(sets, rules);
  if (v.ok === false) return { ok: false, reason: v.reason };

  const need = rules.bestOf === 3 ? 2 : 1;
  let w1 = 0;
  let w2 = 0;
  for (let i = 0; i < sets.length; i++) {
    const r = isValidCompletedSet(sets[i], i, rules);
    if (r.ok === false) return { ok: false, reason: r.reason };
    if (r.side1Wins) w1++;
    else w2++;
    if (w1 >= need || w2 >= need) {
      return { ok: true, setsWon1: w1, setsWon2: w2, winnerIsTeam1: w1 > w2 };
    }
  }
  return { ok: false, reason: 'Incomplete match.' };
}

/** Single-set shorthand for best-of-1 (same rules as set index 0). */
export function validateSingleSetScore(
  s1: number,
  s2: number,
  rules: TournamentRules
): { ok: true; winnerIsTeam1: boolean } | { ok: false; reason: string } {
  const r = isValidCompletedSet({ team1: s1, team2: s2 }, 0, rules);
  if (r.ok === false) return { ok: false, reason: r.reason };
  return { ok: true, winnerIsTeam1: r.side1Wins };
}
