import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hashTextCode } from "@/lib/text-sharing";
import { canEndGroup, groupCodeSchema, groupFileSchema, groupMessageSchema, groupNameSchema, groupTokenSchema, newGroupToken } from "@/lib/text-groups";

async function database() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function membership(token: string) {
  const db = await database();
  const { data: member, error } = await db.from("text_group_members").select("id, group_id, name").eq("token_hash", await hashTextCode(token)).maybeSingle();
  if (error) throw new Error("Could not connect. Please retry.");
  if (!member) throw new Error("This group has ended or your connection is no longer valid.");
  const { data: group, error: groupError } = await db.from("text_groups").select("id, ended_at").eq("id", member.group_id).maybeSingle();
  if (groupError) throw new Error("Could not connect. Please retry.");
  if (!group || group.ended_at) throw new Error("This group has ended.");
  return { db, member, group };
}
function browserUrl(url: string) {
  const value = new URL(url);
  const browser = new URL(import.meta.env["VITE_SUPABASE_URL"]);
  return `${browser.origin}${browser.pathname.replace(/\/$/, "")}${value.pathname}${value.search}`;
}
export const createTextGroup = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: groupCodeSchema, name: groupNameSchema }).parse(input))
  .handler(async ({ data }) => {
    const db = await database();
    const ownerToken = newGroupToken();
    const token = newGroupToken();
    const { data: group, error } = await db.from("text_groups").insert({ code_hash: await hashTextCode(data.code), owner_hash: await hashTextCode(ownerToken) }).select("id").single();
    if (error || !group) throw new Error(error?.code === "23505" ? "This code is already used. Choose another." : "Could not create group.");
    const { error: memberError } = await db.from("text_group_members").insert({ group_id: group.id, token_hash: await hashTextCode(token), name: data.name });
    if (memberError) { await db.from("text_groups").delete().eq("id", group.id); throw new Error("Could not create group."); }
    return { token, ownerToken, code: data.code, name: data.name };
  });
export const joinTextGroup = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: groupCodeSchema, name: groupNameSchema }).parse(input))
  .handler(async ({ data }) => {
    const db = await database();
    const { data: group, error } = await db.from("text_groups").select("id").eq("code_hash", await hashTextCode(data.code)).is("ended_at", null).maybeSingle();
    if (error) throw new Error("Could not join group. Please retry.");
    if (!group) throw new Error("No active group found. Check the code.");
    const token = newGroupToken();
    const { error: memberError } = await db.from("text_group_members").insert({ group_id: group.id, token_hash: await hashTextCode(token), name: data.name });
    if (memberError) throw new Error("Could not join group. It may have ended.");
    return { token, code: data.code, name: data.name };
  });
export const readTextGroup = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: groupTokenSchema, before: z.string().datetime().optional() }).parse(input))
  .handler(async ({ data }) => {
    const { db, group } = await membership(data.token);
    let query = db.from("text_group_messages").select("id, content, created_at, member_id, file_id").eq("group_id", group.id).order("created_at", { ascending: false }).limit(100);
    if (data.before) query = query.lt("created_at", data.before);
    const { data: rows, error } = await query;
    if (error) throw new Error("Could not load messages.");
    const { data: members, error: membersError } = await db.from("text_group_members").select("id, name").eq("group_id", group.id);
    if (membersError) throw new Error("Could not load messages.");
    const ids = (rows ?? []).flatMap((row) => row.file_id ? [row.file_id] : []);
    const { data: files, error: filesError } = ids.length ? await db.from("text_group_files").select("id, file_path, file_name, file_size, mime_type").eq("group_id", group.id).in("id", ids) : { data: [], error: null };
    if (filesError) throw new Error("Could not load attachments.");
    const attachments = await Promise.all((files ?? []).map(async (file) => {
      const { data: signed, error: signedError } = await db.storage.from("text-groups").createSignedUrl(file.file_path, 60, { download: file.file_name });
      const { data: view, error: viewError } = await db.storage.from("text-groups").createSignedUrl(file.file_path, 60);
      if (signedError || viewError || !signed || !view) throw new Error("Could not open attachment.");
      return { id: file.id, name: file.file_name, size: file.file_size, mime: file.mime_type, url: browserUrl(signed.signedUrl), viewUrl: browserUrl(view.signedUrl) };
    }));
    return { messages: (rows ?? []).reverse().map((row) => ({ id: row.id, text: row.content, at: row.created_at, memberId: row.member_id, sender: members?.find((m) => m.id === row.member_id)?.name ?? "Device", file: attachments.find((file) => file.id === row.file_id) ?? null })), hasOlder: rows?.length === 100 };
  });
export const prepareGroupUpload = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: groupTokenSchema, file: groupFileSchema }).parse(input))
  .handler(async ({ data }) => {
    const { db, member, group } = await membership(data.token);
    const id = crypto.randomUUID();
    const path = `${group.id}/${id}`;
    const { error } = await db.from("text_group_files").insert({ id, group_id: group.id, member_id: member.id, file_path: path, file_name: data.file.name, file_size: data.file.size, mime_type: data.file.mime });
    if (error) throw new Error("Could not prepare file.");
    const { data: signed, error: signedError } = await db.storage.from("text-groups").createSignedUploadUrl(path);
    if (!signed || signedError) throw new Error("Could not prepare upload.");
    return { fileId: id, url: browserUrl(signed.signedUrl) };
  });
export const postGroupMessage = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: groupTokenSchema, message: groupMessageSchema }).parse(input))
  .handler(async ({ data }) => {
    const { db, member, group } = await membership(data.token);
    if (data.message.fileId) {
      const { data: file } = await db.from("text_group_files").select("file_path, file_size").eq("id", data.message.fileId).eq("group_id", group.id).eq("member_id", member.id).maybeSingle();
      if (!file) throw new Error("Invalid attachment.");
      const { data: stored, error } = await db.storage.from("text-groups").list(group.id, { search: data.message.fileId });
      if (error || !stored?.some((item) => item.name === data.message.fileId && Number(item.metadata?.["size"]) === file.file_size)) throw new Error("File upload is incomplete. Retry sending.");
    }
    const { error } = await db.from("text_group_messages").insert({ group_id: group.id, member_id: member.id, content: data.message.text, file_id: data.message.fileId ?? null });
    if (error) throw new Error("Could not send. The group may have ended.");
    return { ok: true };
  });
export const endTextGroup = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ ownerToken: groupTokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const db = await database();
    const hash = await hashTextCode(data.ownerToken);
    const { data: group, error } = await db.from("text_groups").select("id, owner_hash").eq("owner_hash", hash).maybeSingle();
    if (error || !group || !canEndGroup(group.owner_hash, hash)) throw new Error("Only the group creator can delete this group.");
    const { error: endError } = await db.from("text_groups").update({ ended_at: new Date().toISOString() }).eq("id", group.id);
    if (endError) throw new Error("Could not delete group. Please retry.");
    while (true) {
      const { data: files, error: listError } = await db.storage.from("text-groups").list(group.id, { limit: 100 });
      if (listError) throw new Error("Group ended. Retry deletion to clear remaining files.");
      if (!files?.length) break;
      const { error: removeError } = await db.storage.from("text-groups").remove(files.map((file) => `${group.id}/${file.name}`));
      if (removeError) throw new Error("Group ended. Retry deletion to clear remaining files.");
    }
    const { error: deleteError } = await db.from("text_group_members").delete().eq("group_id", group.id);
    if (deleteError) throw new Error("Group ended. Retry deletion to clear remaining messages.");
    return { ok: true };
  });