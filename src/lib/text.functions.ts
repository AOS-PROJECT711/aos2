import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createTextCode, hashTextCode, textCodeSchema, textContentSchema } from "@/lib/text-sharing";

export const sendText = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ text: textContentSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = createTextCode();
      const { error } = await supabaseAdmin.from("text_shares").insert({ code_hash: await hashTextCode(code), content: data.text });
      if (!error) return { code };
      if (error.code !== "23505") throw new Error("Could not send text. Please try again.");
    }
    throw new Error("Could not create a text code. Please try again.");
  });

export const receiveText = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: textCodeSchema }).parse(input))
  .handler(async ({ data }) => {
    const codeHash = await hashTextCode(data.code);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share, error } = await supabaseAdmin.from("text_shares").select("content").eq("code_hash", codeHash).maybeSingle();
    if (error) throw new Error("Could not receive text. Please try again.");
    if (!share) throw new Error("No text found — check the text code.");
    return { text: share.content };
  });