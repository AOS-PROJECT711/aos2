import { useEffect, useRef, useState } from "react";
import { Loader2, X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

const IMG = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
const VID = ["mp4", "webm", "mov", "m4v", "ogv"];
const AUD = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
const TXT = ["txt", "csv", "md", "json", "log"];
const OFFICE = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"];
const MAX_PIXELS = 8_000_000; // keeps canvases small enough for phones (prevents black pages)

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // legacy build includes fixes for older phone browsers
      const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as typeof import("pdfjs-dist");
      const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })().catch((e) => {
      pdfjsPromise = null;
      throw e;
    });
  }
  return pdfjsPromise;
}

// ---- PPTX rendering (pptxjs from CDN, renders slides as crisp HTML) ----
const PPTX_BASE = "https://cdn.jsdelivr.net/gh/meshesha/PPTXjs@master";
let pptxPromise: Promise<void> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
function loadCss(href: string) {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

function loadPptxjs() {
  if (!pptxPromise) {
    pptxPromise = (async () => {
      loadCss(`${PPTX_BASE}/css/pptxjs.css`);
      loadCss(`${PPTX_BASE}/css/nv.d3.min.css`);
      await loadScript("https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
      await loadScript(`${PPTX_BASE}/js/d3.min.js`);
      await loadScript(`${PPTX_BASE}/js/nv.d3.min.js`);
      await loadScript(`${PPTX_BASE}/js/pptxjs.js`);
    })().catch((e) => {
      pptxPromise = null;
      throw e;
    });
  }
  return pptxPromise;
}

declare global {
  interface Window {
    jQuery?: any;
  }
}

function PptxViewer({ url, name }: { url: string; name: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState(false);
  const [progress, setProgress] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadPptxjs();
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        if (cancelled || !hostRef.current) return;
        const file = new File([blob], name, { type: blob.type });
        const $ = window.jQuery;
        $(hostRef.current).pptxToHtml(file, {
          slideMode: false,
          keyBoardShortCut: false,
          mediaProcess: true,
        });
        if (!cancelled) setProgress(false);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, name]);

  if (err) {
    // fall back to Microsoft's online viewer
    return (
      <iframe
        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
        title={name}
        className="relative h-full w-full"
      />
    );
  }

  return (
    <div className="relative h-full w-full overflow-auto bg-white">
      {progress && (
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-sm text-neutral-600">
          <Loader2 className="h-5 w-5 animate-spin" /> Opening presentation…
        </div>
      )}
      <div ref={hostRef} className="pptx-host mx-auto" />
    </div>
  );
}

function PdfPage({
  doc,
  num,
  width,
  ratio,
  root,
  onRatio,
}: {
  doc: PDFDocumentProxy;
  num: number;
  width: number;
  ratio: number;
  root: HTMLDivElement | null;
  onRatio: (n: number, r: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), {
      root,
      rootMargin: "1200px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!visible) {
      // free memory for pages far off screen
      canvas.width = 0;
      canvas.height = 0;
      setDone(false);
      return;
    }
    let task: RenderTask | null = null;
    let cancelled = false;
    (async () => {
      try {
        const page = await doc.getPage(num);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        onRatio(num, base.height / base.width);
        let scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2);
        const px = base.width * base.height * scale * scale;
        if (px > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / px);
        const vp = page.getViewport({ scale });
        const off = document.createElement("canvas");
        off.width = Math.floor(vp.width);
        off.height = Math.floor(vp.height);
        const ctx = off.getContext("2d", { alpha: false });
        if (!ctx) return;
        task = page.render({ canvasContext: ctx, viewport: vp });
        await task.promise;
        if (cancelled) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext("2d", { alpha: false })?.drawImage(off, 0, 0);
        off.width = 0;
        off.height = 0;
        setDone(true);
      } catch {
        /* cancelled or failed page — placeholder stays */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, doc, num, width, onRatio]);

  return (
    <div
      ref={wrap}
      className="relative mx-auto mb-3 overflow-hidden rounded bg-white shadow"
      style={{ width, height: Math.round(width * ratio) }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {!done && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <span className="absolute bottom-1 right-2 rounded bg-background/70 px-1.5 text-[10px] text-muted-foreground">
        {num}
      </span>
    </div>
  );
}

function PdfViewer({ url }: { url: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [ratios, setRatios] = useState<number[]>([]);
  const [boxWidth, setBoxWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const ratioCb = useRef((n: number, r: number) => {
    setRatios((prev) => {
      if (Math.abs((prev[n - 1] ?? 0) - r) < 0.001) return prev;
      const next = [...prev];
      next[n - 1] = r;
      return next;
    });
  });

  useEffect(() => {
    setRoot(scroller.current);
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setErr("");
    setDoc(null);
    setProgress(0);
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const t = pdfjs.getDocument({
          url,
          disableAutoFetch: true, // only download the pages being looked at
          rangeChunkSize: 262144,
        });
        task = t;
        t.onProgress = ({ loaded: l, total }: { loaded: number; total: number }) => {
          if (total) setProgress(Math.min(99, Math.round((l / total) * 100)));
        };
        const d = await t.promise;
        if (cancelled) return void d.destroy();
        loaded = d;
        const first = await d.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setRatios(Array(d.numPages).fill(vp.height / vp.width));
        setDoc(d);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        setErr(
          /expired|403|400|signature/i.test(msg)
            ? "This link has expired. Close and open the code again."
            : "Could not load this PDF. Check your internet and try again.",
        );
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
      void loaded?.destroy();
    };
  }, [url, attempt]);

  const pageWidth = Math.max(200, Math.round(Math.min(boxWidth - 16, 1000) * zoom));

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-auto overscroll-contain p-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {err ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <p>{err}</p>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 font-semibold text-primary-foreground"
            >
              <RotateCw className="h-4 w-4" /> Try again
            </button>
          </div>
        ) : !doc || !boxWidth ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Opening PDF{progress ? ` ${progress}%` : "…"}
          </div>
        ) : (
          ratios.map((r, i) => (
            <PdfPage key={i} doc={doc} num={i + 1} width={pageWidth} ratio={r} root={root} onRatio={ratioCb.current} />
          ))
        )}
      </div>
      {doc && !err && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full border bg-card/95 p-1 shadow">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="px-2 text-xs text-muted-foreground">{doc.numPages} pages</span>
        </div>
      )}
    </div>
  );
}

function TextViewer({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let off = false;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => !off && setText(t))
      .catch(() => !off && setErr("Could not open this file."));
    return () => {
      off = true;
    };
  }, [url]);
  if (err) return <p className="m-auto text-sm text-muted-foreground">{err}</p>;
  if (text === null) return <Loader2 className="m-auto h-6 w-6 animate-spin text-primary" />;
  return <pre className="w-full self-start whitespace-pre-wrap p-4 text-left text-sm">{text}</pre>;
}

function MediaError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="m-auto flex flex-col items-center gap-3 text-sm text-muted-foreground">
      <p>Could not load this file.</p>
      <button onClick={onRetry} className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 font-semibold text-primary-foreground">
        <RotateCw className="h-4 w-4" /> Try again
      </button>
    </div>
  );
}

export function FileViewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const [mediaErr, setMediaErr] = useState(false);
  const [key, setKey] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const retry = () => {
    setMediaErr(false);
    setLoading(true);
    setKey((k) => k + 1);
  };

  let body: React.ReactNode;
  if (ext === "pdf") body = <PdfViewer url={url} />;
  else if (ext === "pptx" || ext === "ppt") body = <PptxViewer url={url} name={name} />;
  else if (OFFICE.includes(ext))
    body = (
      <div className="relative h-full w-full">
        {loading && <Loader2 className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-primary" />}
        <iframe
          key={key}
          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
          title={name}
          onLoad={() => setLoading(false)}
          className="relative h-full w-full"
        />
      </div>
    );
  else if (mediaErr) body = <MediaError onRetry={retry} />;
  else if (IMG.includes(ext))
    body = (
      <>
        {loading && <Loader2 className="m-auto h-6 w-6 animate-spin text-primary" />}
        <img
          key={key}
          src={url}
          alt={name}
          draggable={false}
          onLoad={() => setLoading(false)}
          onError={() => setMediaErr(true)}
          className={`m-auto max-h-full max-w-full object-contain ${loading ? "hidden" : ""}`}
        />
      </>
    );
  else if (VID.includes(ext))
    body = (
      <video
        key={key}
        src={url}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload"
        onError={() => setMediaErr(true)}
        className="m-auto max-h-full max-w-full"
      />
    );
  else if (AUD.includes(ext))
    body = <audio key={key} src={url} controls controlsList="nodownload" onError={() => setMediaErr(true)} className="m-auto" />;
  else if (TXT.includes(ext)) body = <TextViewer url={url} />;
  else body = <p className="m-auto text-sm text-muted-foreground">This file type can't be previewed. Use Download instead.</p>;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-3 md:p-4" onContextMenu={(e) => e.preventDefault()}>
      <div className="mb-3 flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-left font-semibold">{name}</span>
        <button aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border bg-card">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card">{body}</div>
    </div>
  );
}
