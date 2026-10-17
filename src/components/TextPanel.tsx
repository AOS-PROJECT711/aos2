import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, Send, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendText, receiveText } from "@/lib/text.functions";
import { textContentSchema, textCodeSchema } from "@/lib/text-sharing";

export function TextPanel() {
  const send = useServerFn(sendText);
  const receive = useServerFn(receiveText);
  const [mode, setMode] = useState<"send" | "receive">("send");
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [received, setReceived] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function copy(value: string, kind: string) {
    try { await navigator.clipboard.writeText(value); setCopied(kind); setTimeout(() => setCopied(""), 1500); }
    catch { setError("Could not copy. Please select and copy the text."); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (mode === "send") {
        setSentCode((await send({ data: { text: textContentSchema.parse(text) } })).code);
      } else {
        setReceived(null);
        setReceived((await receive({ data: { code: textCodeSchema.parse(code) } })).text);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="text-left">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border p-1">
        {(["send", "receive"] as const).map((item) => (
          <Button key={item} type="button" variant="ghost" disabled={busy} aria-pressed={mode === item}
            onClick={() => { setMode(item); setError(""); setCopied(""); }}
            className={`rounded-full ${mode === item ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
            {item === "send" ? <Send /> : <Download />}{item === "send" ? "Send text" : "Receive text"}
          </Button>
        ))}
      </div>
      {mode === "send" && sentCode ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">Your text code</p>
          <div className="break-all font-mono text-3xl font-bold text-brand" data-testid="text-share-code">{sentCode}</div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => copy(sentCode, "code")} className="rounded-full bg-brand text-primary-foreground">
              {copied === "code" ? <Check /> : <Copy />}{copied === "code" ? "Copied" : "Copy code"}
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => { setSentCode(""); setText(""); }}>Send more text</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {mode === "send" ? (
            <div>
              <label htmlFor="send-text" className="text-sm text-muted-foreground">Your text</label>
              <Textarea id="send-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={50000} disabled={busy}
                placeholder="Type or paste your text…" className="mt-2 min-h-52 bg-background/40" />
              <p className="mt-2 text-right text-xs text-muted-foreground tabular-nums">{text.length.toLocaleString()} / 50,000</p>
            </div>
          ) : (
            <div>
              <label htmlFor="text-code" className="text-sm text-muted-foreground">Text code</label>
              <input id="text-code" value={code} onChange={(e) => { setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase()); setReceived(null); }}
                placeholder="10-character code" disabled={busy} autoComplete="off"
                className="mt-2 w-full rounded-lg border bg-background/40 px-3 py-4 text-center font-mono text-lg uppercase outline-none focus:border-primary" />
            </div>
          )}
          <Button type="submit" disabled={busy || (mode === "send" ? !textContentSchema.safeParse(text).success : !textCodeSchema.safeParse(code).success)}
            className="h-11 w-full rounded-full bg-brand text-primary-foreground">
            {busy ? <Loader2 className="animate-spin" /> : mode === "send" ? <Send /> : <Download />}
            {mode === "send" ? "Share text" : "Find text"}
          </Button>
        </form>
      )}
      {mode === "receive" && received !== null && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Received text</span>
            <Button type="button" variant="outline" size="sm" onClick={() => copy(received, "text")}>
              {copied === "text" ? <Check /> : <Copy />}{copied === "text" ? "Copied" : "Copy text"}
            </Button>
          </div>
          <div className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-background/40 p-4 text-sm" data-testid="received-text">{received}</div>
        </div>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}