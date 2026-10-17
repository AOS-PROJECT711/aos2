import { z } from "zod";

export const textContentSchema = z.string().min(1).max(50000).refine((text) => text.trim().length > 0, "Enter some text first.");
export const textCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/, "Enter the 10-character text code.");

export function createTextCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function hashTextCode(code: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}