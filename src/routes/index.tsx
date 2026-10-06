import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Upload,
  Download,
  CloudUpload,
  ShieldCheck,
  Zap,
  Infinity as InfinityIcon,
  Copy,
  Check,
  FileIcon,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/aos-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AOS — Share any file with a 6-character code" },
      {
        name: "description",
        content:
          "Send photos, videos, PDFs and ZIPs of any size. Get a 6-character code, open it on any device.",
      },
      { property: "og:title", content: "AOS — Share any file with a code" },
      {
        property: "og:description",
        content: "Send any file, get a 6-character code, download it on any device. Fast and secure.",
      },
    ],
  }),
  component: Index,
});

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(6)), (n) => CHARS[n % CHARS.length]).join("");
const MAX = 5 * 1024 * 1024 * 1024;

function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  const u = ["KB", "MB", "GB"];
  let i = -1;
  do {
    b /= 1024;
    i++;
  } while (b >= 1024 && i < 2);
  return `${b.toFixed(1)} ${u[i]}`;
}

function Index() {
  const [tab, setTab] = useState<"send" | "receive">("send");
  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <img src={logo} alt="AOS logo" className="h-10 w-10 rounded-full" />
          <div>
            <div className="font-bold leading-none">AOS</div>
            <div className="mt-1 text-[10px] tracking-[0.25em] text-muted-foreground">
              AUTHORISED OPTICAL SERVICE
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 pb-20 pt-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          AUTHORISED <span className="text-brand">OPTICAL SERVICE</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Drop a photo, video, PDF or ZIP — up to 5 GB. Share the code. Open it on any device.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-1 rounded-full border bg-card p-1">
          {(["send", "receive"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold capitalize transition ${
                tab === t ? "bg-brand text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "send" ? <Upload className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {t}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-3xl border bg-card p-8 shadow-glow">
          {tab === "send" ? <SendPanel /> : <ReceivePanel />}
        </div>

        <div className="mt-8 grid grid-cols-3 text-xs text-muted-foreground">
          <Feature icon={<ShieldCheck className="h-5 w-5" />} label="Private storage" />
          <Feature icon={<Zap className="h-5 w-5" />} label="Direct upload" />
          <Feature icon={<InfinityIcon className="h-5 w-5" />} label="Never expires" />
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-primary">{icon}</span>
      {label}
    </div>
  );
}

function SendPanel() {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ code: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function upload(file: File) {
    setError("");
    if (file.size > MAX) return setError("File is larger than 5 GB.");
    setBusy(true);
    try {
      const code = makeCode();
      const path = `${code}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("shares").upload(path, file, {
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("shares").insert({
        code,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
      });
      if (dbErr) throw dbErr;
      setResult({ code, name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <div>
        <p className="text-sm text-muted-foreground">Your code for {result.name}</p>
        <div className="mt-4 font-mono text-5xl font-bold tracking-[0.3em] text-brand">{result.code}</div>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => {
              navigator.clipboard.writeText(result.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy code"}
          </button>
          <button
            onClick={() => setResult(null)}
            className="rounded-full border px-5 py-2 text-sm font-semibold"
          >
            Send another
          </button>
        </div>
      </div>
    );

  return (
    <div>
      <button
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) upload(f);
        }}
        disabled={busy}
        className={`flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 py-14 transition ${
          drag ? "border-primary bg-muted" : "border-input bg-background/40"
        }`}
      >
        {busy ? (
          <Loader2 className="h-9 w-9 animate-spin text-primary" />
        ) : (
          <CloudUpload className="h-9 w-9 text-primary" />
        )}
        <span className="mt-4 font-semibold">{busy ? "Uploading…" : "Drop a file or tap to choose"}</span>
        <span className="mt-2 text-sm text-muted-foreground">Photos, videos, PDF, ZIP — up to 5 GB</span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/*,video/*,application/pdf,.zip,application/zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ReceivePanel() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<{ name: string; size: number; url: string } | null>(null);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFile(null);
    setBusy(true);
    const { data, error: err } = await supabase
      .from("shares")
      .select("file_path, file_name, file_size")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (err || !data) {
      setBusy(false);
      return setError("No file found for that code.");
    }
    const { data: signed } = await supabase.storage
      .from("shares")
      .createSignedUrl(data.file_path, 3600, { download: data.file_name });
    setBusy(false);
    if (!signed) return setError("Could not open this file.");
    setFile({ name: data.file_name, size: data.file_size, url: signed.signedUrl });
  }

  return (
    <form onSubmit={find}>
      <label className="text-sm text-muted-foreground">Enter the 6-character code</label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase())}
        placeholder="ABC123"
        className="mt-3 w-full rounded-2xl border bg-background/40 py-4 text-center font-mono text-3xl font-bold tracking-[0.4em] outline-none focus:border-primary"
      />
      <button
        disabled={code.length !== 6 || busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Find file
      </button>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {file && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border bg-background/40 p-4 text-left">
          <FileIcon className="h-8 w-8 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{file.name}</div>
            <div className="text-xs text-muted-foreground">{formatSize(file.size)}</div>
          </div>
          <a href={file.url} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground">
            Download
          </a>
        </div>
      )}
    </form>
  );
}
