import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  Sun,
  Moon,
  X,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/aos-logo.png";

function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("aos-theme") === "light";
    setLight(saved);
    document.documentElement.classList.toggle("light", saved);
  }, []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem("aos-theme", next ? "light" : "dark");
  };
  return (
    <button
      onClick={toggle}
      aria-label={light ? "Switch to night theme" : "Switch to day theme"}
      className="flex h-9 w-9 items-center justify-center rounded-full border bg-card text-foreground transition hover:bg-muted"
    >
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}

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
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          AUTHORISED <span className="text-brand">OPTICAL SERVICE</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Drop a photo, video, PDF or ZIP — up to 5 GB. Share the code. Open it on any device.
        </p>

        <div className="mx-auto mt-10 grid max-w-xl grid-cols-2 gap-1 rounded-full border bg-card p-1">
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

        <div className="mx-auto mt-4 max-w-xl rounded-3xl border bg-card p-8 shadow-glow">
          {tab === "send" ? <SendPanel /> : <ReceivePanel />}
        </div>

        <div className="mx-auto mt-8 grid max-w-xl grid-cols-3 text-xs text-muted-foreground">
          <Feature icon={<ShieldCheck className="h-5 w-5" />} label="Private storage" />
          <Feature icon={<Zap className="h-5 w-5" />} label="Direct upload" />
          <Feature icon={<InfinityIcon className="h-5 w-5" />} label="Auto-expiry" />
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

const EXPIRY = [
  { label: "5 min", minutes: 5 },
  { label: "10 min", minutes: 10 },
  { label: "15 min", minutes: 15 },
  { label: "Never", minutes: 0 },
];

function SendPanel() {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [expiry, setExpiry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ code: string; count: number; expiresAt: Date | null } | null>(null);
  const [copied, setCopied] = useState(false);

  function add(list: FileList | null) {
    if (!list) return;
    setError("");
    const incoming = Array.from(list);
    if (incoming.some((f) => f.size > MAX)) setError("Files larger than 5 GB were skipped.");
    setFiles((prev) => [...prev, ...incoming.filter((f) => f.size <= MAX)]);
  }

  async function send() {
    if (!files.length) return;
    setError("");
    setBusy(true);
    setProgress(0);
    try {
      const code = makeCode();
      const expiresAt = expiry ? new Date(Date.now() + expiry * 60_000) : null;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `${code}/${i}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("shares").upload(path, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase.from("shares").insert({
          code,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          expires_at: expiresAt?.toISOString() ?? null,
        });
        if (dbErr) throw dbErr;
        setProgress(i + 1);
      }
      setResult({ code, count: files.length, expiresAt });
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <div>
        <p className="text-sm text-muted-foreground">
          Your code for {result.count} file{result.count > 1 ? "s" : ""}
        </p>
        <div className="mt-4 font-mono text-5xl font-bold tracking-[0.3em] text-brand">{result.code}</div>
        <p className="mt-3 text-xs text-muted-foreground">
          {result.expiresAt
            ? `Expires at ${result.expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Never expires"}
        </p>
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
          <button onClick={() => setResult(null)} className="rounded-full border px-5 py-2 text-sm font-semibold">
            Send more
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
          add(e.dataTransfer.files);
        }}
        disabled={busy}
        className={`flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 transition ${
          files.length ? "py-8" : "py-14"
        } ${drag ? "border-primary bg-muted" : "border-input bg-background/40"}`}
      >
        <CloudUpload className="h-9 w-9 text-primary" />
        <span className="mt-4 font-semibold">
          {files.length ? "Add more files" : "Drop files or tap to choose"}
        </span>
        <span className="mt-2 text-sm text-muted-foreground">Photos, videos, PDF, ZIP — up to 5 GB each</span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/*,video/*,application/pdf,.zip,application/zip"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />

      {files.length > 0 && (
        <>
          <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto text-left">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border bg-background/40 px-3 py-2">
                <FileIcon className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
                {!busy && (
                  <button
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-5 text-left">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" /> Code expires in
            </div>
            <div className="grid grid-cols-4 gap-2">
              {EXPIRY.map((o) => (
                <button
                  key={o.minutes}
                  onClick={() => setExpiry(o.minutes)}
                  disabled={busy}
                  className={`rounded-full border py-2 text-sm font-semibold transition ${
                    expiry === o.minutes
                      ? "border-transparent bg-brand text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={send}
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Uploading {progress}/{files.length}…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Send {files.length} file{files.length > 1 ? "s" : ""}
              </>
            )}
          </button>
        </>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}

type FoundFile = { name: string; size: number; url: string };

function ReceivePanel() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<{ files: FoundFile[]; expiresAt: string | null } | null>(null);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFound(null);
    setBusy(true);
    const { data, error: err } = await supabase
      .from("shares")
      .select("file_path, file_name, file_size, expires_at")
      .eq("code", code.toUpperCase())
      .order("created_at");
    if (err || !data?.length) {
      setBusy(false);
      return setError("No files found — the code is wrong or has expired.");
    }
    const files: FoundFile[] = [];
    for (const row of data) {
      const { data: signed } = await supabase.storage
        .from("shares")
        .createSignedUrl(row.file_path, 3600, { download: row.file_name });
      if (signed) files.push({ name: row.file_name, size: row.file_size, url: signed.signedUrl });
    }
    setBusy(false);
    if (!files.length) return setError("Could not open these files.");
    setFound({ files, expiresAt: data[0].expires_at });
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
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Find files
      </button>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {found && (
        <div className="mt-6 space-y-2 text-left">
          <p className="text-xs text-muted-foreground">
            {found.files.length} file{found.files.length > 1 ? "s" : ""} ·{" "}
            {found.expiresAt
              ? `expires at ${new Date(found.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "never expires"}
          </p>
          {found.files.map((f) => (
            <div key={f.url} className="flex items-center gap-3 rounded-2xl border bg-background/40 p-3">
              <FileIcon className="h-7 w-7 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{f.name}</div>
                <div className="text-xs text-muted-foreground">{formatSize(f.size)}</div>
              </div>
              <a href={f.url} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground">
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
