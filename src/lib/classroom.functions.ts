import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len: number) {
  return Array.from(crypto.getRandomValues(new Uint32Array(len)), (n) => CHARS[n % CHARS.length]).join("");
}

const codeSchema = z.string().trim().toUpperCase().min(6).max(12).regex(/^[A-Z0-9]+$/);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function findByAdminCode(adminCode: string) {
  const db = await admin();
  const { data } = await db.from("classrooms").select("id").eq("admin_code", adminCode).maybeSingle();
  if (!data) throw new Error("Invalid admin code");
  return { db, classroomId: data.id };
}

export const createClassroom = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const viewer_code = randomCode(6);
    const admin_code = randomCode(10);
    const { error } = await db.from("classrooms").insert({ name: data.name, viewer_code, admin_code });
    if (error) throw new Error("Could not create classroom");
    return { viewerCode: viewer_code, adminCode: admin_code };
  });

export const openClassroom = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: codeSchema }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: room } = await db
      .from("classrooms")
      .select("id, name, viewer_code, admin_code")
      .or(`viewer_code.eq.${data.code},admin_code.eq.${data.code}`)
      .maybeSingle();
    if (!room) return { found: false as const };
    const isAdmin = room.admin_code === data.code;
    const { data: rows } = await db
      .from("classroom_files")
      .select("id, file_path, file_name, file_size, created_at")
      .eq("classroom_id", room.id)
      .order("created_at", { ascending: false });
    const files = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: s } = await db.storage
          .from("classrooms")
          .createSignedUrl(r.file_path, 3600, { download: r.file_name });
        return { id: r.id, name: r.file_name, size: r.file_size, createdAt: r.created_at, url: s?.signedUrl ?? "" };
      }),
    );
    return {
      found: true as const,
      isAdmin,
      name: room.name,
      viewerCode: isAdmin ? room.viewer_code : null,
      files,
    };
  });

export const getClassroomUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminCode: codeSchema, fileName: z.string().min(1).max(255) }).parse(d))
  .handler(async ({ data }) => {
    const { db, classroomId } = await findByAdminCode(data.adminCode);
    const safe = data.fileName.replace(/[^\w.\-]+/g, "_");
    const path = `${classroomId}/${crypto.randomUUID()}-${safe}`;
    const { data: signed, error } = await db.storage.from("classrooms").createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not prepare upload");
    return { path, token: signed.token };
  });

export const addClassroomFile = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        adminCode: codeSchema,
        path: z.string().min(1).max(500),
        name: z.string().min(1).max(255),
        size: z.number().int().nonnegative(),
        mime: z.string().max(200).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { db, classroomId } = await findByAdminCode(data.adminCode);
    if (!data.path.startsWith(`${classroomId}/`)) throw new Error("Invalid file");
    const { error } = await db.from("classroom_files").insert({
      classroom_id: classroomId,
      file_path: data.path,
      file_name: data.name,
      file_size: data.size,
      mime_type: data.mime,
    });
    if (error) throw new Error("Could not save file");
    return { ok: true };
  });

export const renameClassroomFile = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ adminCode: codeSchema, fileId: z.string().uuid(), name: z.string().trim().min(1).max(255) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { db, classroomId } = await findByAdminCode(data.adminCode);
    await db.from("classroom_files").update({ file_name: data.name }).eq("id", data.fileId).eq("classroom_id", classroomId);
    return { ok: true };
  });

export const deleteClassroomFile = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminCode: codeSchema, fileId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db, classroomId } = await findByAdminCode(data.adminCode);
    const { data: row } = await db
      .from("classroom_files")
      .select("file_path")
      .eq("id", data.fileId)
      .eq("classroom_id", classroomId)
      .maybeSingle();
    if (!row) return { ok: true };
    await db.storage.from("classrooms").remove([row.file_path]);
    await db.from("classroom_files").delete().eq("id", data.fileId);
    return { ok: true };
  });

export const renameClassroom = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminCode: codeSchema, name: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { db, classroomId } = await findByAdminCode(data.adminCode);
    await db.from("classrooms").update({ name: data.name }).eq("id", classroomId);
    return { ok: true };
  });
