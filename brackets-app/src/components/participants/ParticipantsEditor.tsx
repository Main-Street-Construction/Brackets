import { useMemo, useState } from "react";
import type { Participant } from "../../types/tournament";

interface Props {
  participants: Participant[];
  onAdd: (name: string) => Promise<void>;
  onBulkImport: (names: string[]) => Promise<void>;
  onUpdate: (id: string, name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-muted transition-colors focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20";

export function ParticipantsEditor({ participants, onAdd, onBulkImport, onUpdate, onRemove }: Props) {
  const [name, setName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const nameSet = useMemo(() => new Set(participants.map((p) => p.name.toLowerCase())), [participants]);

  return (
    <section className="overflow-hidden rounded-card border border-white/8 bg-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Participants</h2>
          <p className="mt-0.5 text-sm text-ink-secondary">{participants.length} entered</p>
        </div>
        <span className="text-ink-muted">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-white/8 px-4 py-4">
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Add participant"
            />
            <button
              type="button"
              className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
              onClick={async () => {
                if (!name.trim() || nameSet.has(name.toLowerCase())) return;
                await onAdd(name.trim());
                setName("");
              }}
            >
              Add
            </button>
          </div>

          <textarea
            className={`${inputClass} min-h-24 resize-none`}
            rows={4}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="Bulk import — one name per line"
          />
          <button
            type="button"
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-white/5"
            onClick={async () => {
              const names = bulkText
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
              if (!names.length) return;
              await onBulkImport(names);
              setBulkText("");
            }}
          >
            Import Lines
          </button>

          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {participants.map((p, index) => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl bg-surface-raised/70 px-2 py-1.5">
                <span className="w-5 shrink-0 text-center text-xs text-ink-muted">{index + 1}</span>
                <input
                  className="flex-1 bg-transparent text-sm text-ink outline-none"
                  value={p.name}
                  onChange={(e) => void onUpdate(p.id, e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-live/10 hover:text-live"
                  onClick={() => void onRemove(p.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
