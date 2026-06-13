import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import type { Tournament, TournamentType } from "../../types/tournament";

const tournamentsCollection = collection(db, "tournaments");

export async function createTournament(input: {
  name: string;
  description: string;
  type: TournamentType;
  participantsCount: number;
  ownerUid: string;
}): Promise<string> {
  const ref = await addDoc(tournamentsCollection, {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export function subscribeToTournaments(onData: (tournaments: Tournament[]) => void): () => void {
  const q = query(tournamentsCollection, orderBy("updatedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "Untitled",
            type: data.type ?? "single-elim",
            description: data.description ?? "",
            participantsCount: data.participantsCount ?? 0,
            ownerUid: data.ownerUid ?? "",
            createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
            updatedAt: data.updatedAt?.toMillis?.() ?? Date.now()
          } as Tournament;
        })
      );
    },
    () => onData([])
  );
}

export async function getTournamentById(id: string): Promise<Tournament | null> {
  const snap = await getDoc(doc(db, "tournaments", id));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    name: data.name ?? "Untitled",
    type: data.type ?? "single-elim",
    description: data.description ?? "",
    participantsCount: data.participantsCount ?? 0,
    ownerUid: data.ownerUid ?? "",
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    updatedAt: data.updatedAt?.toMillis?.() ?? Date.now()
  };
}

export async function touchTournament(id: string): Promise<void> {
  await updateDoc(doc(db, "tournaments", id), {
    updatedAt: serverTimestamp()
  });
}
