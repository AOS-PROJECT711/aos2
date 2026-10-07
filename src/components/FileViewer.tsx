import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

const EXT: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm", mov: "video/mp4",
  mp3: "audio/mpeg", wav: "audio/wav", txt: "text/plain",
};
const OFFICE = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"];

function PdfPages({ data }: { data: ArrayBuffer }) {
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
        const el = box.current;
        if (!el) return;
        el.innerHTML = "";
        const width = Math.min(el.clientWidth - 16, 1000);
        for (let i = 1; i <= doc.numPages && !cancelled; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * (window.devicePixelRatio || 1);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = `${width}px`;
          canvas.className = "mx-auto mb-3 rounded bg-white shadow";
          el.appendChild(canvas);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        }
      } catch (e) {
        console.error("pdf", e);
        setErr("Could not open this PDF. " + String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);
  return err ? <p className="m-auto text-sm text-muted-foreground">{err}</p> : <div ref={box} className="w-full self-start p-2" />;
}

export function FileViewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const isOffice = OFFICE.includes(ext);
  const [src, setSrc] = useState("");
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null);
  const [type, setType] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOffice) return;
    let obj = "";
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const raw = await res.blob();
        const t = EXT[ext] || (raw.type !== "application/octet-stream" ? raw.type : "");
        if (!t) return setError("This file type can't be previewed. Use Download instead.");
        if (t === "application/pdf") {
          setPdf(await raw.arrayBuffer());
        } else {
          obj = URL.createObjectURL(new Blob([raw], { type: t }));
          setSrc(obj);
        }
        setType(t);
      } catch {
        setError("Could not open this file.");
      }
    })();
    return () => {
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [url, ext, isOffice]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4" onContextMenu={(e) => e.preventDefault()}>
      <div className="mb-3 flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-left font-semibold">{name}</span>
        <button aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border bg-card">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-auto rounded-2xl border bg-card">
        {isOffice ? (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
            title={name}
            className="h-full w-full"
          />
        ) : error ? (
          <p className="m-auto text-sm text-muted-foreground">{error}</p>
        ) : pdf ? (
          <PdfPages data={pdf} />
        ) : !src ? (
          <Loader2 className="m-auto h-6 w-6 animate-spin text-primary" />
        ) : type.startsWith("image/") ? (
          <img src={src} alt={name} className="m-auto max-h-full max-w-full object-contain" />
        ) : type.startsWith("video/") ? (
          <video src={src} controls controlsList="nodownload" className="m-auto max-h-full max-w-full" />
        ) : type.startsWith("audio/") ? (
          <audio src={src} controls controlsList="nodownload" className="m-auto" />
        ) : (
          <iframe src={src} title={name} className="h-full w-full" />
        )}
      </div>
    </div>
  );
}
