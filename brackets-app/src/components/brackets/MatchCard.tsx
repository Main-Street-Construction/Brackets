import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Badge } from "../ui/Badge";
import type { Match, Participant } from "../../types/tournament";
import { getBracketLabel, getMatchStatus, getMatchStatusLabel } from "../../lib/bracket/matchStatus";
import { clampScore, hasBye, hasBothPlayers, isMatchScorable, parseScoreInput } from "../../lib/bracket/scoring";

interface Props {
  match: Match;
  participantsById: Record<string, Participant>;
  onSaveScore: (match: Match, player1Score: number, player2Score: number) => Promise<void>;
  variant?: "feed" | "bracket";
}

type SaveState = "idle" | "saving" | "saved" | "error";

function statusTone(status: ReturnType<typeof getMatchStatus>) {
  switch (status) {
    case "live":
      return "live" as const;
    case "final":
      return "final" as const;
    case "tied":
      return "tie" as const;
    case "upcoming":
      return "upcoming" as const;
    default:
      return "muted" as const;
  }
}

export function MatchCard({ match, participantsById, onSaveScore, variant = "bracket" }: Props) {
  const [draft1, setDraft1] = useState(String(match.player1Score));
  const [draft2, setDraft2] = useState(String(match.player2Score));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef({ p1: match.player1Score, p2: match.player2Score });

  useEffect(() => {
    if (match.player1Score !== lastSaved.current.p1 || match.player2Score !== lastSaved.current.p2) {
      setDraft1(String(match.player1Score));
      setDraft2(String(match.player2Score));
      lastSaved.current = { p1: match.player1Score, p2: match.player2Score };
    }
  }, [match.player1Score, match.player2Score]);

  const p1 = match.player1Id ? (participantsById[match.player1Id]?.name ?? "Unknown") : "TBD";
  const p2 = match.player2Id ? (participantsById[match.player2Id]?.name ?? "Unknown") : "TBD";
  const scorable = isMatchScorable(match);
  const isBye = hasBye(match) && !hasBothPlayers(match);
  const status = getMatchStatus(match);
  const isFeed = variant === "feed";

  async function commitScores() {
    if (!scorable || isBye) return;

    const parsed1 = parseScoreInput(draft1);
    const parsed2 = parseScoreInput(draft2);
    if (parsed1 === null || parsed2 === null) {
      setError("Scores must be whole numbers from 0 to 9999.");
      setDraft1(String(lastSaved.current.p1));
      setDraft2(String(lastSaved.current.p2));
      return;
    }

    if (parsed1 === lastSaved.current.p1 && parsed2 === lastSaved.current.p2) {
      setError(null);
      return;
    }

    setSaveState("saving");
    setError(null);
    try {
      await onSaveScore(match, clampScore(parsed1), clampScore(parsed2));
      lastSaved.current = { p1: parsed1, p2: parsed2 };
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1200);
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Could not save score.");
      setDraft1(String(lastSaved.current.p1));
      setDraft2(String(lastSaved.current.p2));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
  }

  const scoreSize = isFeed ? "w-14 text-3xl font-semibold" : "w-12 text-xl font-semibold";
  const rowPadding = isFeed ? "py-2.5" : "py-1.5";

  return (
    <article
      className={`relative overflow-hidden transition-all duration-200 ${
        isFeed
          ? "min-w-[19rem] shrink-0 rounded-card border border-white/8 bg-surface-raised p-4 shadow-feed"
          : "rounded-xl border border-white/8 bg-surface-raised/80 p-3"
      } ${status === "final" ? "ring-1 ring-win/25" : status === "live" ? "ring-1 ring-live/30" : ""}`}
    >
      {status === "live" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-live/80 to-transparent" />
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {getBracketLabel(match.bracket)} · R{match.round}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={statusTone(status)} pulse={status === "live"}>
            {getMatchStatusLabel(status)}
          </Badge>
          {saveState === "saving" && <span className="text-[0.65rem] text-ink-muted">Saving</span>}
          {saveState === "saved" && <span className="text-[0.65rem] text-win">Saved</span>}
        </div>
      </div>

      <div className="space-y-0.5">
        <ScoreRow
          name={p1}
          score={draft1}
          isWinner={match.winnerId === match.player1Id}
          isLoser={Boolean(match.winnerId && match.winnerId !== match.player1Id && match.player1Id)}
          disabled={!scorable || isBye || saveState === "saving"}
          scoreSize={scoreSize}
          rowPadding={rowPadding}
          onChange={setDraft1}
          onBlur={() => void commitScores()}
          onKeyDown={handleKeyDown}
        />
        <div className="mx-1 border-t border-white/6" />
        <ScoreRow
          name={p2}
          score={draft2}
          isWinner={match.winnerId === match.player2Id}
          isLoser={Boolean(match.winnerId && match.winnerId !== match.player2Id && match.player2Id)}
          disabled={!scorable || isBye || saveState === "saving"}
          scoreSize={scoreSize}
          rowPadding={rowPadding}
          onChange={setDraft2}
          onBlur={() => void commitScores()}
          onKeyDown={handleKeyDown}
        />
      </div>

      {!scorable && !isBye && <p className="mt-3 text-xs text-ink-muted">Waiting for both players.</p>}
      {error && <p className="mt-2 text-xs text-live">{error}</p>}
    </article>
  );
}

function ScoreRow({
  name,
  score,
  isWinner,
  isLoser,
  disabled,
  scoreSize,
  rowPadding,
  onChange,
  onBlur,
  onKeyDown
}: {
  name: string;
  score: string;
  isWinner: boolean;
  isLoser: boolean;
  disabled: boolean;
  scoreSize: string;
  rowPadding: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={`flex items-center gap-3 ${rowPadding}`}>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${
            isWinner ? "font-semibold text-ink" : isLoser ? "text-ink-muted" : "text-ink-secondary"
          }`}
        >
          {name}
        </p>
      </div>
      <input
        className={`score-input text-right font-score tabular-nums ${scoreSize} ${isWinner ? "text-win" : ""}`}
        type="number"
        min={0}
        max={9999}
        step={1}
        disabled={disabled}
        value={score}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        aria-label={`${name} score`}
      />
    </div>
  );
}
