import { describe, expect, it } from "vitest";
import { canEndGroup, groupCodeSchema, groupMessageSchema } from "@/lib/text-groups";

describe("Connected Text groups", () => {
  it("accepts a manually chosen mixed code", () => {
    expect(groupCodeSchema.parse(" aos123 ")).toBe("AOS123");
    expect(groupCodeSchema.safeParse("LETTERS").success).toBe(false);
    expect(groupCodeSchema.safeParse("123456").success).toBe(false);
  });
  it("allows repeated text and file messages", () => {
    const text = "  नमस्ते 👋\n<img src=x onerror=alert(1)>  ";
    expect(groupMessageSchema.parse({ text }).text).toBe(text);
    expect(groupMessageSchema.safeParse({ text: "", fileId: "6fa3c612-418e-4cf0-8cfa-6e2d6cb084ae" }).success).toBe(true);
    expect(groupMessageSchema.safeParse({ text: "  " }).success).toBe(false);
  });
  it("only the creator capability can end the group, not a participant capability", () => {
    expect(canEndGroup("owner-hash", "participant-hash")).toBe(false);
    expect(canEndGroup("owner-hash", "owner-hash")).toBe(true);
  });
});