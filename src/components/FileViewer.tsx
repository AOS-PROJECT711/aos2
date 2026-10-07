import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

const EXT: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm", mov: "video/mp4",
  mp3: "audio/mpeg", wav: "audio/wav", txt: "text/plain",
};

export function FileViewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const [src, setSrc] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let obj = "";
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const raw = await res.blob();
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        const t = EXT[ext] || (raw.type !== "application/octet-stream" ? raw.type : "");
        if (!t) return setError("This file type can't be previewed. Use Download instead.");
        obj = URL.createObjectURL(new Blob([raw], { type: t }));
        setType(t);
        setSrc(obj);
      } catch {
        setError("Could not open this file.");
      }
    })();
    return () => {
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [url, name]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4" onContextMenu={(e) => e.preventDefault()}>
      <div className="mb-3 flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-left font-semibold">{name}</span>
        <button aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border bg-card">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-2xl border bg-card">
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : !src ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : type.startsWith("image/") ? (
          <img src={src} alt={name} className="max-h-full max-w-full object-contain" />
        ) : type.startsWith("video/") ? (
          <video src={src} controls controlsList="nodownload" className="max-h-full max-w-full" />
        ) : type.startsWith("audio/") ? (
          <audio src={src} controls controlsList="nodownload" />
        ) : (
          <iframe src={type === "application/pdf" ? `${src}#toolbar=0` : src} title={name} className="h-full w-full" />
        )}
      </div>
    </div>
  );
}
