import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canManageShare } from "@/lib/account-sharing";

const shareCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/);
const fileSchema = z.object({
  code: shareCodeSchema,
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().min(0).max(5 * 1024 ** 3),
  mimeType: z.string().max(200),
});
const uploadedFileSchema = fileSchema.extend({
  path: z.string().regex(/^[A-Z0-9]{6}\/[0-9a-f-]{36}$/i),
});

function browserUrl(url: string) {
  const value = new URL(url);
  const browser = new URL(import.meta.env["VITE_SUPABASE_URL"]);
  return `${browser.origin}${browser.pathname.replace(/\/$/, "")}${value.pathname}${value.search}`;
}

async function confirmUploadedObject(
  storage: Awaited<ReturnType<typeof import("@/integrations/supabase/client.server").supabaseAdmin.storage.from>>,
  path: string,
) {
  const slash = path.indexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await storage.list(folder, { search: name, limit: 100 });
  if (error || !data?.some((item) => item.name === name)) {
    throw new Error("The uploaded file was not found. Please try again.");
  }
}

export const claimOwnedShareCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ code: shareCodeSchema, expiresAt: z.string().datetime().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existingShares, error: sharesError } = await supabaseAdmin
      .from("shares")
      .select("id")
      .eq("code", data.code)
      .limit(1);
    if (sharesError) throw new Error("Could not reserve this code. Please try again.");
    if (existingShares?.length) throw new Error("This code is already in use. Please try again.");

    const { error } = await supabaseAdmin.from("share_code_ownership").insert({
      code: data.code,
      owner_id: context.userId,
      expires_at: data.expiresAt,
    });
    if (error) throw new Error("This code is already in use. Please try again.");
    return { code: data.code };
  });

export const prepareOwnedShareUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => fileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owner, error: ownerError } = await supabaseAdmin
      .from("share_code_ownership")
      .select("owner_id, expires_at")
      .eq("code", data.code)
      .maybeSingle();
    if (ownerError || !owner || !canManageShare(owner.owner_id, context.userId)) {
      throw new Error("You can only add files to your own shares.");
    }
    if (owner.expires_at && Date.parse(owner.expires_at) <= Date.now()) {
      throw new Error("This share code has expired. Create a new share to send more files.");
    }

    const path = `${data.code}/${crypto.randomUUID()}`;
    const { data: signed, error } = await supabaseAdmin.storage.from("shares").createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not prepare the upload. Please try again.");
    return { path, url: browserUrl(signed.signedUrl) };
  });

export const completeOwnedShareUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => uploadedFileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owner, error: ownerError } = await supabaseAdmin
      .from("share_code_ownership")
      .select("owner_id, expires_at")
      .eq("code", data.code)
      .maybeSingle();
    if (ownerError || !owner || !canManageShare(owner.owner_id, context.userId)) {
      throw new Error("You can only add files to your own shares.");
    }
    await confirmUploadedObject(supabaseAdmin.storage.from("shares"), data.path);

    const { data: share, error: shareError } = await supabaseAdmin
      .from("shares")
      .insert({
        code: data.code,
        file_path: data.path,
        file_name: data.fileName,
        file_size: data.fileSize,
        mime_type: data.mimeType || null,
        expires_at: owner.expires_at,
        owner_id: null,
      })
      .select("id")
      .single();
    if (shareError || !share) throw new Error("Could not save this file to your share.");

    const { error: mappingError } = await supabaseAdmin.from("share_ownership").insert({
      share_id: share.id,
      owner_id: context.userId,
    });
    if (mappingError) {
      await supabaseAdmin.from("shares").delete().eq("id", share.id);
      throw new Error("Could not save this file to your share.");
    }
    return { ok: true };
  });

export const completeGuestShareUpload = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    uploadedFileSchema.extend({ expiresAt: z.string().datetime().nullable() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owner, error: ownerError } = await supabaseAdmin
      .from("share_code_ownership")
      .select("code")
      .eq("code", data.code)
      .maybeSingle();
    if (ownerError || owner) throw new Error("This code belongs to an account. Sign in to manage it.");
    await confirmUploadedObject(supabaseAdmin.storage.from("shares"), data.path);

    const { error } = await supabaseAdmin.from("shares").insert({
      code: data.code,
      file_path: data.path,
      file_name: data.fileName,
      file_size: data.fileSize,
      mime_type: data.mimeType || null,
      expires_at: data.expiresAt,
      owner_id: null,
    });
    if (error) throw new Error("Could not save this file. Please try again.");
    return { ok: true };
  });

export const saveReceivedShareCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: shareCodeSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("received_share_history").upsert(
      { user_id: context.userId, code: data.code },
      { onConflict: "user_id,code", ignoreDuplicates: true },
    );
    if (error) throw new Error("Could not save this code to your history.");
    return { ok: true };
  });

export const getAccountHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ownedCodes, error: ownershipError } = await supabaseAdmin
      .from("share_code_ownership")
      .select("code, expires_at, created_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (ownershipError) throw new Error("Could not load your sent shares.");

    const codes = (ownedCodes ?? []).map((item) => item.code);
    const { data: files, error: filesError } = codes.length
      ? await supabaseAdmin
          .from("shares")
          .select("id, code, file_name, file_size, created_at")
          .in("code", codes)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (filesError) throw new Error("Could not load your sent files.");

    const { data: received, error: receivedError } = await context.supabase
      .from("received_share_history")
      .select("id, code, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (receivedError) throw new Error("Could not load your received history.");

    return {
      sent: (ownedCodes ?? []).map((item) => ({
        code: item.code,
        expiresAt: item.expires_at,
        createdAt: item.created_at,
        files: (files ?? [])
          .filter((file) => file.code === item.code)
          .map((file) => ({
            id: file.id,
            name: file.file_name,
            size: file.file_size,
            createdAt: file.created_at,
          })),
      })),
      received: (received ?? []).map((item) => ({
        id: item.id,
        code: item.code,
        createdAt: item.created_at,
      })),
    };
  });

export const removeReceivedShareCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("received_share_history")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not remove this code from your history.");
    return { ok: true };
  });

export const deleteOwnedShareFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: shareCodeSchema, fileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: codeOwner, error: ownerError } = await supabaseAdmin
      .from("share_code_ownership")
      .select("owner_id")
      .eq("code", data.code)
      .maybeSingle();
    if (ownerError || !codeOwner || !canManageShare(codeOwner.owner_id, context.userId)) {
      throw new Error("You can only remove files from your own shares.");
    }

    const { data: file, error: fileError } = await supabaseAdmin
      .from("shares")
      .select("file_path")
      .eq("id", data.fileId)
      .eq("code", data.code)
      .maybeSingle();
    if (fileError || !file) throw new Error("This file is no longer available in your share.");
    const { data: fileOwner, error: mappingError } = await supabaseAdmin
      .from("share_ownership")
      .select("owner_id")
      .eq("share_id", data.fileId)
      .maybeSingle();
    if (mappingError || !fileOwner || !canManageShare(fileOwner.owner_id, context.userId)) {
      throw new Error("You can only remove files from your own shares.");
    }

    const { error: storageError } = await supabaseAdmin.storage.from("shares").remove([file.file_path]);
    if (storageError) throw new Error("Could not delete the stored file. Please try again.");
    const { error: deleteError } = await supabaseAdmin
      .from("shares")
      .delete()
      .eq("id", data.fileId)
      .eq("code", data.code);
    if (deleteError) throw new Error("The file was removed from storage but its history could not be updated.");
    return { ok: true };
  });

export const deleteOwnedShareCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: shareCodeSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owner, error: ownerError } = await supabaseAdmin
      .from("share_code_ownership")
      .select("owner_id")
      .eq("code", data.code)
      .maybeSingle();
    if (ownerError || !owner || !canManageShare(owner.owner_id, context.userId)) {
      throw new Error("You can only delete your own shares.");
    }

    const { data: files, error: filesError } = await supabaseAdmin
      .from("shares")
      .select("id, file_path")
      .eq("code", data.code);
    if (filesError) throw new Error("Could not load the files in this share.");
    const fileIds = (files ?? []).map((file) => file.id);
    if (fileIds.length) {
      const { data: mappings, error: mappingError } = await supabaseAdmin
        .from("share_ownership")
        .select("share_id, owner_id")
        .in("share_id", fileIds);
      if (
        mappingError ||
        (mappings ?? []).length !== fileIds.length ||
        (mappings ?? []).some((item) => !canManageShare(item.owner_id, context.userId))
      ) {
        throw new Error("You can only delete your own shares.");
      }
      const paths = (files ?? []).map((file) => file.file_path);
      for (let index = 0; index < paths.length; index += 100) {
        const { error } = await supabaseAdmin.storage.from("shares").remove(paths.slice(index, index + 100));
        if (error) throw new Error("Could not delete every file. Please try again.");
      }
      const { error: deleteFilesError } = await supabaseAdmin.from("shares").delete().eq("code", data.code);
      if (deleteFilesError) throw new Error("Could not delete this share. Please try again.");
    }

    const { error: deleteCodeError } = await supabaseAdmin
      .from("share_code_ownership")
      .delete()
      .eq("code", data.code)
      .eq("owner_id", context.userId);
    if (deleteCodeError) throw new Error("Could not remove this share code. Please try again.");
    return { ok: true };
  });