import { z } from "zod";

export const groupCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,10}$/, "Use 6–10 letters and numbers.").refine((code) => /[A-Z]/.test(code) && /[0-9]/.test(code), "Include both letters and numbers.");
export const groupNameSchema = z.string().trim().min(1, "Enter your name.").max(40);
export const groupTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const groupFileSchema = z.object({ name: z.string().min(1).max(255), size: z.number().int().min(0).max(5 * 1024 ** 3), mime: z.string().max(200) });
export const groupMessageSchema = z.object({ text: z.string().max(50000), fileId: z.string().uuid().optional() }).refine((value) => value.text.trim().length > 0 || Boolean(value.fileId), "Enter text or attach a file.");
export type GroupSession = { token: string; code: string; name: string; ownerToken?: string };
export function newGroupToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join("");
}
export function canEndGroup(storedOwnerHash: string, suppliedOwnerHash: string) {
  return storedOwnerHash === suppliedOwnerHash;
}