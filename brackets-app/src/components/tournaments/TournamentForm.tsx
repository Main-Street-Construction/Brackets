import { useState } from "react";
import type { TournamentType } from "../../types/tournament";

interface Props {
  onCreate: (input: {
    name: string;
    type: TournamentType;
    description: string;
    participantsCount: number;
  }) => Promise<void>;
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted transition-colors focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20";

export function TournamentForm({ onCreate }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TournamentType>("single-elim");
  const [participantsCount, setParticipantsCount] = useState(8);

  return (
    <form
      className="space-y-3 rounded-card border border-white/8 bg-surface p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        await onCreate({ name: name.trim(), description: description.trim(), type, participantsCount });
        setName("");
        setDescription("");
      }}
    >
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">New Tournament</h2>
      <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tournament name" />
      <textarea
        className={`${inputClass} min-h-20 resize-none`}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
      />
      <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as TournamentType)}>
        <option value="single-elim">Single Elimination</option>
        <option value="double-elim">Double Elimination</option>
        <option value="round-robin">Round Robin</option>
      </select>
      <input
        className={inputClass}
        type="number"
        min={2}
        value={participantsCount}
        onChange={(e) => setParticipantsCount(Number(e.target.value))}
      />
      <button
        type="submit"
        className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Create Tournament
      </button>
    </form>
  );
}
