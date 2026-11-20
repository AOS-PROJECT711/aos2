export type TransferProgress = { loaded: number; total: number; speed: number };

export function transferProgress(loaded: number, total: number, elapsedMs: number): TransferProgress {
  return { loaded, total, speed: elapsedMs > 0 ? loaded * 1000 / elapsedMs : 0 };
}

export function formatTransferBytes(bytes: number) {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Bounded parallelism avoids serial network waits without flooding the connection. */
export async function parallelTransfers<T>(items: T[], task: (item: T, index: number) => Promise<void>) {
  let next = 0;
  let failure: unknown;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      const item = items[index];
      if (item === undefined) continue;
      try { await task(item, index); }
      catch (error) { failed = true; failure = error; }
    }
  }));
  if (failed) throw failure;
}

export function uploadFile(url: string, file: File, headers: Record<string, string>, onProgress: (loaded: number) => void, method = "POST") {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => onProgress(Math.min(file.size, event.loaded));
    xhr.onerror = () => reject(new Error("Upload interrupted. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(file.size); resolve(); }
      else {
        let message = "Upload failed. Please try again.";
        try { const body = JSON.parse(xhr.responseText); message = body.message || body.error || message; } catch { /* non-JSON error */ }
        reject(new Error(message));
      }
    };
    // Send raw bytes: no multipart overhead and accurate byte progress.
    xhr.send(file);
  });
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
