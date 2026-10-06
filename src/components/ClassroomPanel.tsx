import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Copy,
  FileIcon,
  Loader2,
  Pencil,
  Trash2,
  CloudUpload,
  KeyRound,
  Users,
  LogOut,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  createClassroom,
  openClassroom,
  getClassroomUploadUrl,
  addClassroomFile,
  renameClassroomFile,
  deleteClassroomFile,
  renameClassroom,
  changeViewerCode,
} from "@/lib/classroom.functions";

type Room = {
  code: string;
  isAdmin: boolean;
  name: string;
  viewerCode: string | null;
  files: { id: string; name: string; size: number; createdAt: string; url: string; viewUrl: string }[];
};

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

function CopyCode({ label, code, icon }: { label: string; code: string; icon: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-background/40 p-3 text-left">
      <span className="text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-mono text-lg font-bold tracking-[0.2em]">{code}</div>
      </div>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded-full border p-2 text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function ClassroomPanel() {
  const create = useServerFn(createClassroom);
  const open = useServerFn(openClassroom);
  const [mode, setMode] = useState<"join" | "create">("join");
  const [name, setName] = useState("AOS Classroom");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<"student" | "admin">("student");
  const [loginName, setLoginName] = useState("");
  const [newAdmin, setNewAdmin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ viewerCode: string; adminCode: string } | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

  async function load(c: string, n?: string) {
    const res = await open({ data: { code: c, name: n } });
    if (!res.found) throw new Error(n !== undefined ? "Classroom name or admin code is wrong." : "No classroom found for that code.");
    setRoom({ code: c, isAdmin: res.isAdmin, name: res.name, viewerCode: res.viewerCode, files: res.files });
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setCreated(await create({ data: { name, adminCode: newAdmin } }));
    } catch (err) {
      setError(err instanceof Error && err.message.includes("code") ? err.message : "Could not create classroom.");
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await load(code.toUpperCase(), role === "admin" ? loginName.trim() : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open classroom.");
    } finally {
      setBusy(false);
    }
  }

  if (room)
    return (
      <RoomView
        room={room}
        reload={(n) => load(room.code, room.isAdmin ? (n ?? room.name) : undefined)}
        leave={() => { setRoom(null); setCreated(null); }}
      />
    );

  if (created)
    return (
      <div className="space-y-3">
        <p className="font-semibold">{name} is ready</p>
        <p className="text-sm text-muted-foreground">Save both codes. The admin code can't be recovered.</p>
        <CopyCode label="Receiver code — share with students" code={created.viewerCode} icon={<Users className="h-5 w-5" />} />
        <CopyCode label="Admin code — keep private" code={created.adminCode} icon={<KeyRound className="h-5 w-5" />} />
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await load(created.adminCode, name.trim());
            } finally {
              setBusy(false);
            }
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 font-semibold text-primary-foreground"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Open classroom as admin
        </button>
      </div>
    );

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border p-1 text-sm">
        {(["join", "create"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`rounded-full py-2 font-semibold transition ${
              mode === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "join" ? "Enter a code" : "Create classroom"}
          </button>
        ))}
      </div>

      {mode === "join" ? (
        <form onSubmit={onJoin}>
          <div className="mb-4 flex justify-center gap-4 text-sm">
            {(["student", "admin"] as const).map((r) => (
              <label key={r} className="flex items-center gap-1.5">
                <input type="radio" checked={role === r} onChange={() => setRole(r)} />
                {r === "student" ? "Student" : "Admin"}
              </label>
            ))}
          </div>
          {role === "admin" && (
            <>
              <label className="text-sm text-muted-foreground">Classroom name</label>
              <input
                value={loginName}
                onChange={(e) => setLoginName(e.target.value.slice(0, 80))}
                className="mt-2 mb-4 w-full rounded-2xl border bg-background/40 px-4 py-3 text-center text-lg font-semibold outline-none focus:border-primary"
              />
            </>
          )}
          <label className="text-sm text-muted-foreground">{role === "admin" ? "Admin code" : "Receiver code"}</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase())}
            placeholder="ABC123"
            className="mt-3 w-full rounded-2xl border bg-background/40 py-4 text-center font-mono text-2xl font-bold tracking-[0.3em] outline-none focus:border-primary"
          />
          <button
            disabled={code.length < 6 || busy || (role === "admin" && !loginName.trim())}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Open classroom
          </button>
        </form>
      ) : (
        <form onSubmit={onCreate}>
          <label className="text-sm text-muted-foreground">Classroom name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 80))}
            className="mt-3 w-full rounded-2xl border bg-background/40 px-4 py-3 text-center text-lg font-semibold outline-none focus:border-primary"
          />
          <label className="mt-4 block text-sm text-muted-foreground">Your admin code (6–10, letters + numbers)</label>
          <input
            value={newAdmin}
            onChange={(e) => setNewAdmin(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase())}
            placeholder="TEACH123"
            className="mt-3 w-full rounded-2xl border bg-background/40 py-3 text-center font-mono text-xl font-bold tracking-[0.3em] outline-none focus:border-primary"
          />
          <button
            disabled={!name.trim() || busy || !/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6,10}$/.test(newAdmin)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create classroom
          </button>
        </form>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function RoomView({ room, reload, leave }: { room: Room; reload: (name?: string) => Promise<void>; leave: () => void }) {
  const getUrl = useServerFn(getClassroomUploadUrl);
  const addFile = useServerFn(addClassroomFile);
  const renameFile = useServerFn(renameClassroomFile);
  const delFile = useServerFn(deleteClassroomFile);
  const renameRoom = useServerFn(renameClassroom);
  const setViewer = useServerFn(changeViewerCode);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(label: string, fn: () => Promise<unknown>, newName?: string) {
    setBusy(label);
    setError("");
    try {
      await fn();
      await reload(newName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    await run("upload", async () => {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        setBusy(`upload ${i + 1}/${files.length}`);
        const { path, token } = await getUrl({ data: { adminCode: room.code, fileName: f.name } });
        const { error } = await supabase.storage.from("classrooms").uploadToSignedUrl(path, token, f, {
          contentType: f.type || "application/octet-stream",
        });
        if (error) throw error;
        await addFile({ data: { adminCode: room.code, path, name: f.name, size: f.size, mime: f.type || null } });
      }
    });
  }

  return (
    <div className="text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {room.isAdmin ? "Admin" : "Receiver"}
          </div>
          <h2 className="truncate text-2xl font-bold">{room.name}</h2>
        </div>
        <div className="flex gap-2">
          {room.isAdmin && (
            <button
              aria-label="Rename classroom"
              onClick={() => {
                const n = prompt("New classroom name", room.name)?.trim();
                if (n) run("rename", () => renameRoom({ data: { adminCode: room.code, name: n } }), n);
              }}
              className="rounded-full border p-2 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button aria-label="Leave classroom" onClick={leave} className="rounded-full border p-2 text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {room.isAdmin && (
        <div className="mt-4 space-y-2">
          {room.viewerCode && (
            <CopyCode label="Receiver code — share with students" code={room.viewerCode} icon={<Users className="h-5 w-5" />} />
          )}
          <button
            onClick={() => {
              const v = prompt("New receiver code (6–10 letters + numbers)", room.viewerCode ?? "")?.trim().toUpperCase();
              if (!v) return;
              if (!/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6,10}$/.test(v)) return setError("Code must be 6–10 characters with letters and numbers.");
              run("viewer", () => setViewer({ data: { adminCode: room.code, viewerCode: v } }));
            }}
            className="w-full rounded-full border py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Change receiver code
          </button>
          <CopyCode label="Admin code — keep private" code={room.code} icon={<KeyRound className="h-5 w-5" />} />
          <button
            onClick={() => input.current?.click()}
            disabled={!!busy}
            className="mt-2 flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-input bg-background/40 py-6"
          >
            {busy.startsWith("upload") ? (
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            ) : (
              <CloudUpload className="h-7 w-7 text-primary" />
            )}
            <span className="mt-2 text-sm font-semibold">
              {busy.startsWith("upload") ? `Uploading ${busy.replace("upload ", "")}…` : "Upload files to classroom"}
            </span>
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      <div className="mt-5 mb-2 text-sm text-muted-foreground">
        {room.files.length} file{room.files.length === 1 ? "" : "s"} · kept until the admin deletes them
      </div>
      {room.files.length === 0 ? (
        <p className="rounded-2xl border bg-background/40 p-6 text-center text-sm text-muted-foreground">No files yet.</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {room.files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-2xl border bg-background/40 p-3">
              <FileIcon className="h-6 w-6 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{f.name}</div>
                <div className="text-xs text-muted-foreground">{formatSize(f.size)}</div>
              </div>
              {room.isAdmin && (
                <>
                  <button
                    aria-label={`Rename ${f.name}`}
                    onClick={() => {
                      const n = prompt("New file name", f.name)?.trim();
                      if (n) run("rename", () => renameFile({ data: { adminCode: room.code, fileId: f.id, name: n } }));
                    }}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    aria-label={`Delete ${f.name}`}
                    onClick={() => {
                      if (confirm(`Delete ${f.name}?`)) run("delete", () => delFile({ data: { adminCode: room.code, fileId: f.id } }));
                    }}
                    className="p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
              <a href={f.viewUrl} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1.5 text-xs font-semibold">
                View
              </a>
              <a href={f.url} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
