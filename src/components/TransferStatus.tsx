import { formatTransferBytes, type TransferProgress } from "@/lib/transfers";

export function TransferStatus({ progress, label }: { progress: TransferProgress; label: string }) {
  const percent = progress.total > 0 ? Math.min(100, Math.floor(progress.loaded / progress.total * 100)) : 0;
  return (
    <div className="mt-2 min-w-0 text-xs text-muted-foreground" role="status" aria-label={label}>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 tabular-nums">
        <span>{label} · {percent}%</span>
        <span>{formatTransferBytes(progress.speed)}/s</span>
      </div>
      <progress value={progress.loaded} max={progress.total || 1} className="mt-1 h-1.5 w-full accent-primary" />
      <div className="mt-1 tabular-nums">{formatTransferBytes(progress.loaded)} / {formatTransferBytes(progress.total)}</div>
    </div>
  );
}