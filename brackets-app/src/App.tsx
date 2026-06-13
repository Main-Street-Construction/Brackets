import { useEffect, useMemo, useState } from "react";
import { BracketBoard } from "./components/brackets/BracketBoard";
import { LiveFeed } from "./components/brackets/LiveFeed";
import { ParticipantsEditor } from "./components/participants/ParticipantsEditor";
import { TournamentDashboard } from "./components/tournaments/TournamentDashboard";
import { TournamentForm } from "./components/tournaments/TournamentForm";
import { ensureAnonymousAuth } from "./lib/firebase";
import { addParticipant, removeParticipant, subscribeToParticipants, updateParticipant } from "./lib/data/participantsRepo";
import { seedMatches, subscribeToMatches, updateMatchScore } from "./lib/data/matchesRepo";
import { createTournament, subscribeToTournaments, touchTournament } from "./lib/data/tournamentsRepo";
import { generateMatches } from "./lib/bracket/common";
import { countLiveMatches } from "./lib/bracket/matchStatus";
import { exportTournamentSnapshot, importTournamentSnapshot } from "./lib/io/jsonBackup";
import type { Match, Participant, Tournament, TournamentSnapshot } from "./types/tournament";

type Banner = { type: "error" | "success" | "info"; message: string } | null;

const TYPE_LABELS: Record<Tournament["type"], string> = {
  "single-elim": "Single Elimination",
  "double-elim": "Double Elimination",
  "round-robin": "Round Robin"
};

function StatusBanner({ banner, onDismiss }: { banner: Banner; onDismiss: () => void }) {
  if (!banner) return null;
  const styles = {
    error: "border-live/30 bg-live/10 text-live",
    success: "border-win/30 bg-win/10 text-win",
    info: "border-white/10 bg-white/5 text-ink-secondary"
  };
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${styles[banner.type]}`}>
      <span>{banner.message}</span>
      <button type="button" className="shrink-0 text-xs opacity-70 hover:opacity-100" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function App() {
  const [uid, setUid] = useState<string>("");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const selectedTournament = useMemo(() => tournaments.find((t) => t.id === selectedId) ?? null, [tournaments, selectedId]);
  const canGenerateBracket = participants.length >= 2 && !busy;
  const liveCount = countLiveMatches(matches);

  useEffect(() => {
    void ensureAnonymousAuth()
      .then(setUid)
      .catch(() => setBanner({ type: "error", message: "Could not connect to Firebase. Check your environment config." }));
    return subscribeToTournaments(setTournaments);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const offParticipants = subscribeToParticipants(selectedId, setParticipants);
    const offMatches = subscribeToMatches(selectedId, setMatches);
    return () => {
      offParticipants();
      offMatches();
    };
  }, [selectedId]);

  async function runAction(action: () => Promise<void>, successMessage?: string) {
    setBusy(true);
    try {
      await action();
      if (successMessage) setBanner({ type: "success", message: successMessage });
    } catch (err) {
      setBanner({
        type: "error",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again."
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="glass-panel sticky top-0 z-20 border-b border-white/8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-sm font-bold text-accent">
              B
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Brackets</h1>
              {selectedTournament && (
                <p className="text-xs text-ink-muted">{TYPE_LABELS[selectedTournament.type]}</p>
              )}
            </div>
          </div>

          {selectedTournament && (
            <div className="hidden text-right sm:block">
              <p className="truncate text-sm font-semibold">{selectedTournament.name}</p>
              <p className="text-xs text-ink-muted">
                {participants.length} players · {matches.length} matches
                {liveCount > 0 && <span className="text-live"> · {liveCount} live</span>}
              </p>
            </div>
          )}

          {liveCount > 0 && (
            <div className="flex items-center gap-2 rounded-full bg-live/15 px-3 py-1.5 sm:hidden">
              <span className="h-2 w-2 rounded-full bg-live animate-live-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wider text-live">Live</span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:grid-cols-[18rem_1fr] md:gap-6 md:px-6 md:py-6">
        <aside className="space-y-3 md:sticky md:top-[4.5rem] md:self-start">
          <StatusBanner banner={banner} onDismiss={() => setBanner(null)} />
          <TournamentForm
            onCreate={async (input) => {
              await runAction(async () => {
                const id = await createTournament({ ...input, ownerUid: uid });
                setSelectedId(id);
              }, "Tournament created.");
            }}
          />
          <TournamentDashboard tournaments={tournaments} selectedId={selectedId} onSelect={setSelectedId} />
          {selectedId && (
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-white/5 disabled:opacity-40"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!selectedTournament) return;
                  exportTournamentSnapshot({ tournament: selectedTournament, participants, matches });
                  setBanner({ type: "success", message: "Backup downloaded." });
                }}
              >
                Export
              </button>
              <label className="cursor-pointer rounded-xl border border-white/10 px-3 py-2 text-center text-xs font-medium text-ink-secondary transition-colors hover:bg-white/5">
                Import
                <input
                  className="hidden"
                  type="file"
                  accept=".json"
                  disabled={busy}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file || !selectedId) return;
                    await runAction(async () => {
                      const data: TournamentSnapshot = await importTournamentSnapshot(file);
                      await seedMatches(selectedId, data.matches);
                      for (const participant of data.participants) {
                        await addParticipant(selectedId, participant.name, participant.seed);
                      }
                      await touchTournament(selectedId);
                    }, "Backup imported.");
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          )}
        </aside>

        <div className="space-y-6">
          {selectedId ? (
            <>
              {selectedTournament && (
                <section className="rounded-card border border-white/8 bg-gradient-to-br from-surface via-surface to-surface-raised p-5 md:hidden">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Now Viewing</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">{selectedTournament.name}</h2>
                  <p className="mt-1 text-sm text-ink-secondary">
                    {participants.length} players · {matches.length} matches
                  </p>
                </section>
              )}

              <LiveFeed
                matches={matches}
                participants={participants}
                onSaveScore={async (match, player1Score, player2Score) => {
                  await updateMatchScore(selectedId, match, player1Score, player2Score);
                }}
              />

              <ParticipantsEditor
                participants={participants}
                onAdd={async (name) => addParticipant(selectedId, name, participants.length + 1)}
                onBulkImport={async (names) => {
                  const existing = new Set(participants.map((p) => p.name.toLowerCase()));
                  const unique = names
                    .map((name) => name.trim())
                    .filter(Boolean)
                    .filter((name, index, arr) => arr.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === index)
                    .filter((name) => !existing.has(name.toLowerCase()));
                  if (!unique.length) {
                    setBanner({ type: "info", message: "No new participants to import." });
                    return;
                  }
                  for (const name of unique) {
                    await addParticipant(selectedId, name, participants.length + 1);
                  }
                  await touchTournament(selectedId);
                }}
                onUpdate={(participantId, name) => updateParticipant(selectedId, participantId, name)}
                onRemove={async (participantId) => {
                  const participant = participants.find((p) => p.id === participantId);
                  const label = participant?.name ?? "this participant";
                  if (!window.confirm(`Remove ${label}? This does not update existing matches.`)) return;
                  await removeParticipant(selectedId, participantId);
                  await touchTournament(selectedId);
                }}
              />

              <section className="rounded-card border border-white/8 bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Bracket Setup</h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {participants.length < 2
                        ? "Add at least 2 participants first."
                        : `${participants.length} participants ready to seed.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-canvas transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
                    disabled={!canGenerateBracket}
                    onClick={async () => {
                      if (!selectedTournament) return;
                      if (matches.length > 0) {
                        const confirmed = window.confirm(
                          "Regenerating will delete all current matches and scores. This cannot be undone. Continue?"
                        );
                        if (!confirmed) return;
                      }
                      await runAction(async () => {
                        const bracketMatches = generateMatches(selectedTournament.type, participants);
                        await seedMatches(selectedId, bracketMatches);
                      }, "Bracket generated.");
                    }}
                  >
                    {matches.length > 0 ? "Regenerate Bracket" : "Generate Bracket"}
                  </button>
                </div>
              </section>

              <BracketBoard
                matches={matches}
                participants={participants}
                tournamentType={selectedTournament?.type ?? "single-elim"}
                onSaveScore={async (match, player1Score, player2Score) => {
                  await updateMatchScore(selectedId, match, player1Score, player2Score);
                }}
              />
            </>
          ) : (
            <section className="flex min-h-[24rem] flex-col items-center justify-center rounded-card border border-dashed border-white/10 bg-surface/50 p-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-lg font-bold text-accent">
                B
              </div>
              <h2 className="text-xl font-bold tracking-tight">Select a tournament</h2>
              <p className="mt-2 max-w-sm text-sm text-ink-secondary">
                Create or pick a tournament from the sidebar to open the live feed and bracket.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
