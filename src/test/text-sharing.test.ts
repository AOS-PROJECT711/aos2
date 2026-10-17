import { describe, expect, it } from "vitest";
import { textContentSchema, textCodeSchema } from "@/lib/text-sharing";

describe("Text-only sharing", () => {
  it("preserves multiline text, whitespace, and symbols exactly", () => {
    const text = "  Hello\nनमस्ते 👋\n<b>Plain text only</b>  ";
    expect(textContentSchema.parse(text)).toBe(text);
  });
  it("rejects files and other non-text payloads", () => {
    expect(textContentSchema.safeParse({ name: "file.txt" }).success).toBe(false);
  });
  it("rejects empty and whitespace-only messages", () => {
    expect(textContentSchema.safeParse("").success).toBe(false);
    expect(textContentSchema.safeParse(" \n\t").success).toBe(false);
  });
  it("normalizes valid text codes and rejects malformed codes", () => {
    expect(textCodeSchema.parse(" abc234def5 ")).toBe("ABC234DEF5");
    expect(textCodeSchema.safeParse("ABC123").success).toBe(false);
    expect(textCodeSchema.safeParse("<script>!!").success).toBe(false);
  });
});