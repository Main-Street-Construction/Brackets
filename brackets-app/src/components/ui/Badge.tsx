import type { ReactNode } from "react";

type BadgeTone = "live" | "final" | "upcoming" | "tie" | "muted";

const toneStyles: Record<BadgeTone, string> = {
  live: "bg-live/15 text-live",
  final: "bg-win/15 text-win",
  upcoming: "bg-accent/15 text-accent",
  tie: "bg-tie/15 text-tie",
  muted: "bg-white/8 text-ink-secondary"
};

interface Props {
  tone: BadgeTone;
  children: ReactNode;
  pulse?: boolean;
}

export function Badge({ tone, children, pulse }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${toneStyles[tone]}`}
    >
      {pulse && <span className="h-1.5 w-1.5 rounded-full bg-live animate-live-pulse" />}
      {children}
    </span>
  );
}
