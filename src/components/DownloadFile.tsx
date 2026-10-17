import { useEffect, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransferStatus } from "@/components/TransferStatus";
import { deliverBlob, saveBlob, transferProgress, type TransferProgress } from "@/lib/transfers";

type DiskWriter = { write: (chunk: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> };
type SaveWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{ createWritable: () => Promise<DiskWriter> }> };

export function DownloadFile({ url, name, size }: { url: string; name: string; size: number }) {
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [native, setNative] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function download() {
    if (ready) { await deliverBlob(ready, name); return; }
    const picker = (window as SaveWindow).showSaveFilePicker;
    // Large files stream straight to disk where supported, never into a multi-GB Blob.
    if (size > 128 * 1024 * 1024 && !picker) {
      const a = document.createElement("a"); a.href = url; document.body.appendChild(a); a.click(); a.remove();
      setNative(true); return;
    }
    setBusy(true); setError(""); setProgress(transferProgress(0, size, 0));
    const abort = new AbortController(); controller.current = abort;
    let writer: DiskWriter | undefined;
    try {
      if (size > 128 * 1024 * 1024 && picker) {
        const handle = await picker.call(window, { suggestedName: name });
        writer = await handle.createWritable();
      }
      const start = performance.now();
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error("Download failed. Find the files again to refresh the link.");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Your browser could not open the download.");
      const total = Number(response.headers.get("Content-Length")) || size;
      const chunks: BlobPart[] = [];
      let loaded = 0;
      let lastUpdate = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (writer) await writer.write(value);
        else chunks.push(value as Uint8Array<ArrayBuffer>);
        loaded += value.byteLength;
        const now = performance.now();
        if (now - lastUpdate > 100) { setProgress(transferProgress(loaded, total, now - start)); lastUpdate = now; }
      }
      setProgress(transferProgress(loaded, total || loaded, performance.now() - start));
      if (writer) await writer.close();
      else {
        const blob = new Blob(chunks, { type: response.headers.get("Content-Type") || "application/octet-stream" });
        setReady(blob);
        if (!matchMedia("(pointer: coarse)").matches) saveBlob(blob, name);
      }
    } catch (e) {
      await writer?.abort().catch(() => undefined);
      setProgress(null);
      setError(e instanceof DOMException && e.name === "AbortError" ? "Download cancelled." : e instanceof Error ? e.message : "Download failed.");
    } finally { setBusy(false); controller.current = null; }
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-end gap-1">
        <Button type="button" size="sm" disabled={busy} onClick={download} className="rounded-full bg-brand text-primary-foreground">
          {busy ? <Loader2 className="animate-spin" /> : <Download />}{busy ? "Downloading" : ready ? "Save file" : "Download"}
        </Button>
        {busy && <Button type="button" size="icon" variant="ghost" aria-label={`Cancel download of ${name}`} onClick={() => controller.current?.abort()}><X /></Button>}
      </div>
      {progress && <TransferStatus progress={progress} label={busy ? "Downloading" : "Downloaded"} />}
      {native && <p className="mt-2 text-xs text-muted-foreground">Speed and progress are in your browser’s downloads.</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}