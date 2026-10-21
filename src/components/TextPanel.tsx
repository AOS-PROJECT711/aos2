import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, Send, Users, LogOut, Paperclip, Trash2, X, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DownloadFile } from "@/components/DownloadFile";
import { FileViewer } from "@/components/FileViewer";
import { TransferStatus } from "@/components/TransferStatus";
import { groupCodeSchema, groupNameSchema, groupTokenSchema, type GroupSession } from "@/lib/text-groups";
import { createTextGroup, joinTextGroup, readTextGroup, prepareGroupUpload, postGroupMessage, endTextGroup } from "@/lib/text-groups.functions";
import { formatTransferBytes, parallelTransfers, transferProgress, uploadFile, type TransferProgress } from "@/lib/transfers";

type Message = Awaited<ReturnType<typeof readTextGroup>>["messages"][number];
const STORAGE = "aos-text-group";

export function TextPanel() {
  const create = useServerFn(createTextGroup), join = useServerFn(joinTextGroup), read = useServerFn(readTextGroup);
  const prepare = useServerFn(prepareGroupUpload), post = useServerFn(postGroupMessage), end = useServerFn(endTextGroup);
  const [mode, setMode] = useState<"create" | "join">("create");
  const [session, setSession] = useState<GroupSession | null>(null);
  const [restored, setRestored] = useState(false);
  const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [text, setText] = useState(""); const [files, setFiles] = useState<File[]>([]);
  const [messages, setMessages] = useState<Message[]>([]); const [hasOlder, setHasOlder] = useState(false);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); const [copied, setCopied] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [viewing, setViewing] = useState<Message["file"]>(null);
  const input = useRef<HTMLInputElement>(null); const history = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const saved: GroupSession | null = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
      if (saved && groupTokenSchema.safeParse(saved.token).success && groupCodeSchema.safeParse(saved.code).success && (!saved.ownerToken || groupTokenSchema.safeParse(saved.ownerToken).success)) setSession(saved);
    } catch { localStorage.removeItem(STORAGE); }
    setRestored(true);
  }, []);
  function remember(value: GroupSession | null) {
    setSession(value); setMessages([]); setHasOlder(false); setFiles([]); setText(""); setConfirmEnd(false); setProgress(null);
    try { if (value) localStorage.setItem(STORAGE, JSON.stringify(value)); else localStorage.removeItem(STORAGE); } catch { setError("Connection is active, but this browser could not remember it."); }
  }
  useEffect(() => {
    if (!session) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!session || stopped) return;
      try {
        const result = await read({ data: { token: session.token } });
        if (stopped) return;
        setMessages((previous) => [...previous.filter((message) => result.messages[0] && message.at < result.messages[0].at), ...result.messages]);
        setHasOlder(result.hasOlder);
      } catch (e) {
        if (stopped) return;
        const message = e instanceof Error ? e.message : "Could not reconnect.";
        setError(message);
        if (message.includes("ended") || message.includes("no longer valid")) { remember(null); return; }
      }
      if (!stopped) timer = setTimeout(poll, document.hidden ? 15000 : 3000);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [session, read]);
  useEffect(() => { history.current?.scrollTo({ top: history.current.scrollHeight }); }, [messages.length]);
  async function connect(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try { const data = { code: groupCodeSchema.parse(code), name: groupNameSchema.parse(name) }; remember(await (mode === "create" ? create({ data }) : join({ data }))); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not connect."); } finally { setBusy(false); }
  }
  async function copy(value: string, id: string) {
    try { await navigator.clipboard.writeText(value); setCopied(id); setTimeout(() => setCopied(""), 1500); } catch { setError("Could not copy. Please select and copy the text."); }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (!session) return;
    setBusy(true); setError(""); setProgress(null);
    const sent = new Set<File>();
    try {
      if (text.trim()) { await post({ data: { token: session.token, message: { text } } }); setText(""); }
      const total = files.reduce((sum, file) => sum + file.size, 0); const loaded = files.map(() => 0); const started = performance.now();
      await parallelTransfers(files, async (file, index) => {
        const signed = await prepare({ data: { token: session.token, file: { name: file.name, size: file.size, mime: file.type || "application/octet-stream" } } });
        await uploadFile(signed.url, file, { apikey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"], "content-type": file.type || "application/octet-stream", "x-upsert": "false" }, (bytes) => {
          loaded[index] = bytes; setProgress(transferProgress(loaded.reduce((a, b) => a + b, 0), total, performance.now() - started));
        }, "PUT");
        await post({ data: { token: session.token, message: { text: "", fileId: signed.fileId } } }); sent.add(file);
      });
      const result = await read({ data: { token: session.token } }); setMessages(result.messages); setHasOlder(result.hasOlder);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send."); }
    finally { setFiles((previous) => previous.filter((file) => !sent.has(file))); if (input.current) input.current.value = ""; setBusy(false); }
  }
  async function deleteGroup() {
    if (!session?.ownerToken) return;
    setBusy(true); setError("");
    try { await end({ data: { ownerToken: session.ownerToken } }); remember(null); setError("Group deleted. All devices have been disconnected."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete group."); } finally { setBusy(false); }
  }
  async function older() {
    if (!session || !messages[0]) return; setLoading(true);
    try { const result = await read({ data: { token: session.token, before: messages[0].at } }); setMessages((previous) => [...result.messages.filter((m) => !previous.some((p) => p.id === m.id)), ...previous]); setHasOlder(result.hasOlder); }
    catch { setError("Could not load older messages."); } finally { setLoading(false); }
  }
  if (!restored) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  return <div className="min-w-0 text-left">
    {!session ? <>
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border p-1">
        {(["create", "join"] as const).map((item) => <Button key={item} variant="ghost" disabled={busy} aria-pressed={mode === item} className={`rounded-full ${mode === item ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => { setMode(item); setError(""); }}><Users />{item === "create" ? "Create group" : "Join group"}</Button>)}
      </div>
      <form onSubmit={connect} className="space-y-4">
        <div><label htmlFor="group-name" className="text-sm text-muted-foreground">Your name</label><input id="group-name" className="mt-2 w-full rounded-lg border bg-background/40 p-3" value={name} maxLength={40} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
        <div><label htmlFor="group-code" className="text-sm text-muted-foreground">{mode === "create" ? "Choose a group code" : "Group code"}</label><input id="group-code" className="mt-2 w-full rounded-lg border bg-background/40 p-3 font-mono uppercase" value={code} maxLength={10} disabled={busy} onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())} placeholder="6–10 letters and numbers" autoComplete="off" /></div>
        <Button type="submit" className="w-full rounded-full bg-brand text-primary-foreground" disabled={busy || !groupCodeSchema.safeParse(code).success || !groupNameSchema.safeParse(name).success}>{busy ? <Loader2 className="animate-spin" /> : <Users />}{mode === "create" ? "Create & connect" : "Connect"}</Button>
      </form>
    </> : <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
        <div className="min-w-0"><h2 className="font-semibold">Text group <span className="text-xs text-muted-foreground">· {session.ownerToken ? "Admin" : "Member"}</span></h2><span className="break-all font-mono text-lg font-bold text-brand">{session.code}</span></div>
        <div className="flex gap-1"><Button variant="ghost" size="icon" title="Copy group code" aria-label="Copy group code" onClick={() => copy(session.code, "code")}>{copied === "code" ? <Check /> : <Copy />}</Button><Button variant="ghost" size="icon" title="Leave group" aria-label="Leave group" disabled={busy} onClick={() => { remember(null); setError(""); }}><LogOut /></Button>{session.ownerToken && <Button variant="ghost" size="icon" title="Delete group" aria-label="Delete group" disabled={busy} onClick={() => setConfirmEnd(true)}><Trash2 className="text-destructive" /></Button>}</div>
      </div>
      {session.ownerToken && <p className="mt-2 text-xs text-muted-foreground">Admin access stays on this browser. Leaving removes your delete access.</p>}
      {confirmEnd && <div role="alertdialog" aria-label="Delete text group" className="my-3 space-y-3 border-y py-3"><p className="text-sm">Delete this group, its messages and files for everyone?</p><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={busy} onClick={deleteGroup}>{busy && <Loader2 className="animate-spin" />}Delete for everyone</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmEnd(false)}>Cancel</Button></div></div>}
      <div ref={history} className="my-4 h-80 space-y-3 overflow-y-auto overscroll-contain" aria-label="Group messages">
        {hasOlder && <Button variant="ghost" size="sm" disabled={loading} onClick={older}><RefreshCw className={loading ? "animate-spin" : ""} />Older messages</Button>}
        {!messages.length && <p className="py-12 text-center text-sm text-muted-foreground">No messages yet</p>}
        {messages.map((message) => <article key={message.id} className="min-w-0 rounded-lg border bg-background/40 p-3"><div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="min-w-0 break-words font-semibold">{message.sender}</span><time className="shrink-0">{new Date(message.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
          {message.text && <><div className="whitespace-pre-wrap break-words text-sm" data-testid="group-message">{message.text}</div><Button variant="ghost" size="icon" aria-label="Copy message" title="Copy message" onClick={() => copy(message.text, message.id)}>{copied === message.id ? <Check /> : <Copy />}</Button></>}
          {message.file && <div className="space-y-2">{["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(message.file.mime) && <img src={message.file.viewUrl} alt={message.file.name} className="max-h-48 w-full rounded-lg object-contain" />}<p className="break-all text-sm">{message.file.name}</p><p className="text-xs text-muted-foreground">{formatTransferBytes(message.file.size)}</p><div className="flex flex-wrap items-start justify-between gap-2"><Button variant="outline" size="sm" onClick={() => setViewing(message.file)}><Eye />View</Button><DownloadFile url={message.file.url} name={message.file.name} size={message.file.size} /></div></div>}
        </article>)}
      </div>
      <form onSubmit={send} className="space-y-3 border-t pt-3">
        <Textarea aria-label="Message" placeholder="Type or paste your text…" maxLength={50000} disabled={busy} value={text} onChange={(e) => setText(e.target.value)} className="min-h-24 bg-background/40" />
        {files.map((file, index) => <div key={index} className="flex min-w-0 items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{file.name}</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => setFiles((previous) => previous.filter((_, i) => i !== index))}><X /></Button></div>)}
        <input ref={input} type="file" multiple hidden onChange={(e) => { const chosen = Array.from(e.target.files ?? []); if (chosen.some((file) => file.size > 5 * 1024 ** 3)) setError("Files larger than 5 GB were skipped."); setFiles((previous) => [...previous, ...chosen.filter((file) => file.size <= 5 * 1024 ** 3)]); e.target.value = ""; }} />
        <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={busy} aria-label="Attach photos or files" title="Attach photos or files" onClick={() => input.current?.click()}><Paperclip />Attach</Button><Button type="submit" disabled={busy || (!text.trim() && !files.length)} className="rounded-full bg-brand text-primary-foreground">{busy ? <Loader2 className="animate-spin" /> : <Send />}{busy ? "Sending" : "Send"}</Button></div>
        {progress && <TransferStatus progress={progress} label={busy ? "Uploading" : "Uploaded"} />}
      </form>
    </>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {viewing && <FileViewer url={viewing.viewUrl} name={viewing.name} onClose={() => setViewing(null)} />}
  </div>;
}