import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  type Transaction
} from "firebase/firestore";
import { db } from "../firebase";
import { touchTournament } from "./tournamentsRepo";
import { computeLoserId, computeWinnerId } from "../bracket/scoring";
import type { Match } from "../../types/tournament";

function matchesCollection(tournamentId: string) {
  return collection(db, "tournaments", tournamentId, "matches");
}

function matchRef(tournamentId: string, matchId: string) {
  return doc(db, "tournaments", tournamentId, "matches", matchId);
}

function parseMatchDoc(id: string, data: Record<string, unknown>): Match {
  return {
    id,
    round: (data.round as number) ?? 1,
    order: (data.order as number) ?? 0,
    bracket: (data.bracket as Match["bracket"]) ?? "main",
    player1Id: (data.player1Id as string | null) ?? null,
    player2Id: (data.player2Id as string | null) ?? null,
    player1Score: (data.player1Score as number) ?? 0,
    player2Score: (data.player2Score as number) ?? 0,
    winnerId: (data.winnerId as string | null) ?? null,
    nextMatchId: (data.nextMatchId as string | null) ?? null,
    nextSlot: (data.nextSlot as 1 | 2 | null) ?? null,
    loserNextMatchId: (data.loserNextMatchId as string | null) ?? null,
    loserNextSlot: (data.loserNextSlot as 1 | 2 | null) ?? null
  };
}

export function subscribeToMatches(
  tournamentId: string,
  onData: (matches: Match[]) => void
): () => void {
  const q = query(matchesCollection(tournamentId), orderBy("round", "asc"), orderBy("order", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => parseMatchDoc(d.id, d.data())));
    },
    () => onData([])
  );
}

export async function clearMatches(tournamentId: string): Promise<void> {
  const snap = await getDocs(matchesCollection(tournamentId));
  if (snap.empty) return;
  const batch = writeBatch(db);
  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
  }
  await batch.commit();
}

export async function seedMatches(tournamentId: string, matches: Match[]): Promise<void> {
  await clearMatches(tournamentId);
  const batch = writeBatch(db);
  for (const match of matches) {
    batch.set(matchRef(tournamentId, match.id), match);
  }
  await batch.commit();
  await resolveByeMatches(tournamentId);
}

async function applySlotUpdate(
  tx: Transaction,
  tournamentId: string,
  targetMatchId: string,
  slot: 1 | 2,
  oldPlayerId: string | null,
  newPlayerId: string | null
): Promise<void> {
  const ref = matchRef(tournamentId, targetMatchId);
  const snap = await tx.get(ref);
  const field = `player${slot}Id` as const;
  const current = snap.exists() ? ((snap.data()[field] as string | null) ?? null) : null;

  if (newPlayerId) {
    tx.set(ref, { [field]: newPlayerId }, { merge: true });
    return;
  }

  if (current === oldPlayerId) {
    tx.set(ref, { [field]: null }, { merge: true });
  }
}

export async function updateMatchScore(
  tournamentId: string,
  match: Match,
  player1Score: number,
  player2Score: number
): Promise<void> {
  const newWinnerId = computeWinnerId(match, player1Score, player2Score);
  const oldWinnerId = match.winnerId;
  const oldLoserId = computeLoserId(match, oldWinnerId);
  const newLoserId = computeLoserId(match, newWinnerId);

  await runTransaction(db, async (tx) => {
    tx.update(matchRef(tournamentId, match.id), { player1Score, player2Score, winnerId: newWinnerId });

    if (match.nextMatchId && match.nextSlot) {
      await applySlotUpdate(tx, tournamentId, match.nextMatchId, match.nextSlot, oldWinnerId, newWinnerId);
    }

    if (match.loserNextMatchId && match.loserNextSlot) {
      await applySlotUpdate(
        tx,
        tournamentId,
        match.loserNextMatchId,
        match.loserNextSlot,
        oldLoserId,
        newLoserId
      );
    }
  });

  await touchTournament(tournamentId);
}

export async function resolveByeMatches(tournamentId: string, knownMatches?: Match[]): Promise<void> {
  for (let pass = 0; pass < 32; pass += 1) {
    let matches = knownMatches;
    if (!matches || pass > 0) {
      const snap = await getDocs(matchesCollection(tournamentId));
      matches = snap.docs.map((d) => parseMatchDoc(d.id, d.data()));
    }

    const byeMatches = matches
      .filter(
        (match) =>
          !match.winnerId &&
          ((match.player1Id && !match.player2Id) || (!match.player1Id && match.player2Id))
      )
      .sort((a, b) => a.round - b.round || a.order - b.order);

    if (!byeMatches.length) return;

    for (const match of byeMatches) {
      const winnerId = match.player1Id ?? match.player2Id;
      if (!winnerId) continue;

      await runTransaction(db, async (tx) => {
        tx.update(matchRef(tournamentId, match.id), {
          player1Score: match.player1Id ? 1 : 0,
          player2Score: match.player2Id ? 1 : 0,
          winnerId
        });
      });

      if (match.nextMatchId && match.nextSlot) {
        await runTransaction(db, async (tx) => {
          await applySlotUpdate(tx, tournamentId, match.nextMatchId!, match.nextSlot!, null, winnerId);
        });
      }
    }

    await touchTournament(tournamentId);
    knownMatches = undefined;
  }
}
