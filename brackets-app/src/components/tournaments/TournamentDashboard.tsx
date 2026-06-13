import type { Tournament } from "../../types/tournament";

interface Props {
  tournaments: Tournament[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const TYPE_LABELS: Record<Tournament["type"], string> = {
  "single-elim": "Single Elim",
  "double-elim": "Double Elim",
  "round-robin": "Round Robin"
};

export function TournamentDashboard({ tournaments, selectedId, onSelect }: Props) {
  return (
    <section className="overflow-hidden rounded-card border border-white/8 bg-surface">
      <div className="border-b border-white/8 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Tournaments</h2>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto p-2">
        {tournaments.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-ink-muted">No tournaments yet</p>
        )}
        {tournaments.map((t) => {
          const selected = selectedId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              className={`w-full rounded-xl px-3 py-3 text-left transition-colors ${
                selected ? "bg-accent/15 ring-1 ring-accent/35" : "hover:bg-white/5"
              }`}
            >
              <div className="truncate font-medium text-ink">{t.name}</div>
              <div className="mt-0.5 text-xs text-ink-muted">{TYPE_LABELS[t.type]}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
