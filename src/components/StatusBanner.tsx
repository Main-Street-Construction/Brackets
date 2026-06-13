export type BannerMessage = { type: 'error' | 'success' | 'info'; message: string } | null;

interface Props {
  banner: BannerMessage;
  onDismiss: () => void;
}

export function StatusBanner({ banner, onDismiss }: Props) {
  if (!banner) return null;
  const styles = {
    error: 'border-live/30 bg-live/10 text-live',
    success: 'border-win/30 bg-win/10 text-win',
    info: 'border-white/10 bg-white/5 text-ink-secondary'
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
