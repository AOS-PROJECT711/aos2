import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const shareCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/);
const fileNameSchema = z.string().trim().min(1).max(255);
const shareUploadSchema = z.object({
  code: shareCodeSchema,
  fileName: fileNameSchema,
  fileSize: z.number().int().min(0).max(5 * 1024 ** 3),
  mimeType: z.string().max(200),
});

function browserUrl(url: string) {
  const value = new URL(url);
  const browser = new URL(import.meta.env["VITE_SUPABASE_URL"]);
  return `${browser.origin}${browser.pathname.replace(/\/$/, "")}${value.pathname}${value.search}`;
}

export const prepareShareUpload = createServerFn({ method: "POST" })
  .inputValidator((input) => shareUploadSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${data.code}/${crypto.randomUUID()}`;
    const { data: signed, error } = await supabaseAdmin.storage.from("shares").createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not prepare upload. Please try again.");
    return { path, url: browserUrl(signed.signedUrl) };
  });

export const findShareFiles = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: shareCodeSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("shares")
      .select("file_path, file_name, file_size, expires_at, created_at")
      .eq("code", data.code)
      .order("created_at");
    if (error) throw new Error("Could not open these files. Please try again.");

    const now = Date.now();
    const available = (rows ?? []).filter((row) => !row.expires_at || Date.parse(row.expires_at) > now);
    const files = await Promise.all(
      available.map(async (row) => {
        const [download, view] = await Promise.all([
          supabaseAdmin.storage.from("shares").createSignedUrl(row.file_path, 3600, { download: row.file_name }),
          supabaseAdmin.storage.from("shares").createSignedUrl(row.file_path, 3600),
        ]);
        if (download.error || view.error || !download.data || !view.data) {
          throw new Error("Could not open these files. Please try again.");
        }
        return {
          name: row.file_name,
          size: row.file_size,
          url: browserUrl(download.data.signedUrl),
          viewUrl: browserUrl(view.data.signedUrl),
        };
      }),
    );

    return { files, expiresAt: available[0]?.expires_at ?? null };
  });