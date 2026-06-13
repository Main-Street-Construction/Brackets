import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import type { Participant } from "../../types/tournament";

function participantsCollection(tournamentId: string) {
  return collection(db, "tournaments", tournamentId, "participants");
}

export function subscribeToParticipants(
  tournamentId: string,
  onData: (participants: Participant[]) => void
): () => void {
  const q = query(participantsCollection(tournamentId), orderBy("seed", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "Unknown",
            seed: data.seed ?? 9999,
            createdAt: data.createdAt?.toMillis?.() ?? Date.now()
          } as Participant;
        })
      );
    },
    () => onData([])
  );
}

export async function addParticipant(tournamentId: string, name: string, seed: number): Promise<void> {
  await addDoc(participantsCollection(tournamentId), {
    name,
    seed,
    createdAt: serverTimestamp()
  });
}

export async function updateParticipant(
  tournamentId: string,
  participantId: string,
  name: string
): Promise<void> {
  await updateDoc(doc(db, "tournaments", tournamentId, "participants", participantId), { name });
}

export async function removeParticipant(tournamentId: string, participantId: string): Promise<void> {
  await deleteDoc(doc(db, "tournaments", tournamentId, "participants", participantId));
}
