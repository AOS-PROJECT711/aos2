import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Clock, FileIcon, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TransferStatus } from "@/components/TransferStatus";
import { useAccountSession } from "@/lib/auth-context";
import {
  deleteOwnedShareCode,
  deleteOwnedShareFile,
  getAccountHistory,
  prepareOwnedShareUpload,
  completeOwnedShareUpload,
  removeReceivedShareCode,
} from "@/lib/account.functions";
import { parallelTransfers, transferProgress, uploadFile, type TransferProgress } from "@/lib/transfers";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "AOS sent and received file history" },
      { name: "description", content: "Review your AOS sent shares and received codes, and manage files you own." },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "AOS sent and received file history" },
      { property: "og:description", content: "Manage your own sent files and saved received codes in AOS." },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountHistoryPage,
});

type HistoryData = Awaited<ReturnType<typeof getAccountHistory>>;
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let index = -1;
  do {
    bytes /= 1024;
    index += 1;
  } while (bytes >= 1024 && index < units.length - 1);
  return `${bytes.toFixed(1)} ${units[index]}`;
}

function AccountHistoryPage() {
  const session = useAccountSession();
  const getHistory = useServerFn(getAccountHistory);
  const prepareUpload = useServerFn(prepareOwnedShareUpload);
  const completeUpload = useServerFn(completeOwnedShareUpload);
  const deleteFile = useServerFn(deleteOwnedShareFile);
  const deleteCode = useServerFn(deleteOwnedShareCode);
  const removeReceived = useServerFn(removeReceivedShareCode);
  const fileInput = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addingCode, setAddingCode] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TransferProgress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session.ready) return;
    if (!session.user) {
      setHistory(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void getHistory().then((data) => {
      if (active) setHistory(data);
    }).catch(() => {
      if (active) setError("Could not load your history. Please try again.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [session.ready, session.user, getHistory]);

  async function refreshHistory() {
    setHistory(await getHistory());
  }

  function chooseFiles(code: string) {
    setAddingCode(code);
    fileInput.current?.click();
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const code = addingCode;
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!code || files.length === 0) return;
    setBusy(true);
    setError("");
    if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      setError("Files larger than 5 GB cannot be added.");
      setBusy(false);
      return;
    }

    const total = files.reduce((sum, file) => sum + file.size, 0);
    const loaded = files.map(() => 0);
    const started = performance.now();
    setTransfer(transferProgress(0, total, 0));
    try {
      await parallelTransfers(files, async (file, index) => {
        const uploadData = {
          code,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
        };
        const prepared = await prepareUpload({ data: uploadData });
        await uploadFile(prepared.url, file, {
          apikey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
          "x-upsert": "false",
          "cache-control": "max-age=3600",
          "content-type": file.type || "application/octet-stream",
        }, (bytes) => {
          loaded[index] = bytes;
          setTransfer(transferProgress(loaded.reduce((sum, value) => sum + value, 0), total, performance.now() - started));
        }, "PUT");
        await completeUpload({ data: { ...uploadData, path: prepared.path } });
      });
      await refreshHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add these files. Please try again.");
    } finally {
      setBusy(false);
      setAddingCode(null);
      setTransfer(null);
    }
  }

  async function removeFile(code: string, fileId: string, fileName: string) {
    if (!window.confirm(`Delete “${fileName}” from this share?`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteFile({ data: { code, fileId } });
      await refreshHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this file.");
    } finally {
      setBusy(false);
    }
  }

  async function removeShare(code: string) {
    if (!window.confirm(`Delete share ${code} and all files in it?`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteCode({ data: { code } });
      await refreshHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this share.");
    } finally {
      setBusy(false);
    }
  }

  async function removeReceivedCode(id: string) {
    setBusy(true);
    setError("");
    try {
      await removeReceived({ data: { id } });
      await refreshHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this code from history.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background bg-grid px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
          <div>
            <Button asChild type="button" variant="ghost" size="sm" className="-ml-3">
              <Link to="/" search={{ code: undefined, room: undefined }}><ArrowLeft /> Back to sharing</Link>
            </Button>
            <h1 className="mt-3 text-3xl font-bold">Your history</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sent shares and codes you’ve opened.</p>
          </div>
          {session.user && <p className="max-w-full truncate text-sm text-muted-foreground">{session.user.email}</p>}
        </div>

        {!session.ready || loading ? (
          <p className="py-10 text-sm text-muted-foreground">Loading your history…</p>
        ) : !session.user ? (
          <section className="mt-8 border bg-card p-6">
            <h2 className="text-lg font-semibold">Sign in to see your history</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your sent files and opened codes are private to your account.</p>
            <Button asChild className="mt-5"><Link to="/auth">Sign in or sign up</Link></Button>
          </section>
        ) : (
          <div className="space-y-10 py-7">
            <section>
              <h2 className="text-xl font-semibold">Sent shares <span className="text-sm font-normal text-muted-foreground">({history?.sent.length ?? 0})</span></h2>
              {history?.sent.length ? (
                <div className="mt-4 space-y-3">
                  {history.sent.map((share) => {
                    const expired = Boolean(share.expiresAt && Date.parse(share.expiresAt) <= Date.now());
                    return (
                      <article key={share.code} className="border bg-card p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-xl font-bold tracking-[0.15em] text-primary">{share.code}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Created {new Date(share.createdAt).toLocaleString()} · {expired ? "Expired" : share.expiresAt ? `Expires ${new Date(share.expiresAt).toLocaleString()}` : "Never expires"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button asChild type="button" variant="outline" size="sm">
                              <Link to="/" search={{ code: share.code, room: undefined }}>Open</Link>
                            </Button>
                            <Button type="button" variant="destructive" size="icon" aria-label={`Delete share ${share.code}`} title="Delete share" disabled={busy} onClick={() => void removeShare(share.code)}>
                              <Trash2 />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 divide-y border-y">
                          {share.files.length ? share.files.map((file) => (
                            <div key={file.id} className="flex flex-wrap items-center gap-3 py-3">
                              <FileIcon className="h-5 w-5 shrink-0 text-primary" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{file.name}</p>
                                <p className="text-xs text-muted-foreground">{formatSize(file.size)} · {new Date(file.createdAt).toLocaleString()}</p>
                              </div>
                              <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${file.name}`} title="Delete file" disabled={busy} onClick={() => void removeFile(share.code, file.id, file.name)}>
                                <Trash2 />
                              </Button>
                            </div>
                          )) : (
                            <p className="py-3 text-sm text-muted-foreground">No files in this share.</p>
                          )}
                        </div>

                        <Button type="button" variant="outline" size="sm" className="mt-4" disabled={busy || expired} onClick={() => chooseFiles(share.code)}>
                          <Plus /> Add files
                        </Button>
                        {expired && <p className="mt-2 text-xs text-muted-foreground">Expired shares can still be removed, but new files cannot be added.</p>}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 border-y py-5 text-sm text-muted-foreground">You haven’t sent any account-owned shares yet.</p>
              )}
            </section>

            <section>
              <h2 className="text-xl font-semibold">Received codes <span className="text-sm font-normal text-muted-foreground">({history?.received.length ?? 0})</span></h2>
              {history?.received.length ? (
                <ul className="mt-4 divide-y border-y">
                  {history.received.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono font-semibold tracking-[0.12em]">{item.code}</p>
                        <p className="text-xs text-muted-foreground">Opened {new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                      <Button asChild type="button" variant="outline" size="sm">
                        <Link to="/" search={{ code: item.code, room: undefined }}>Open</Link>
                      </Button>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove received code ${item.code}`} title="Remove from history" disabled={busy} onClick={() => void removeReceivedCode(item.id)}>
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 border-y py-5 text-sm text-muted-foreground">Codes you open while signed in will appear here.</p>
              )}
            </section>
          </div>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        {transfer && <div className="mt-4"><TransferStatus progress={transfer} label="Adding files" /></div>}
        <input ref={fileInput} type="file" multiple className="hidden" onChange={addFiles} accept="image/*,video/*,audio/*,application/pdf,.zip,.ppt,.pptx,.doc,.docx,.xls,.xlsx" />
        <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-4 w-4" />Guest sharing remains available from the home page.</div>
      </div>
    </main>
  );
}