import type { TournamentSnapshot } from "../../types/tournament";

export function exportTournamentSnapshot(snapshot: TournamentSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${snapshot.tournament.name.replace(/\s+/g, "-").toLowerCase()}-backup.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importTournamentSnapshot(file: File): Promise<TournamentSnapshot> {
  const raw = await file.text();
  const parsed = JSON.parse(raw) as TournamentSnapshot;
  if (!parsed?.tournament || !Array.isArray(parsed.participants) || !Array.isArray(parsed.matches)) {
    throw new Error("Invalid tournament backup format.");
  }
  return parsed;
}
