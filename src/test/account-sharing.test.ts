import { describe, expect, it } from "vitest";
import { canManageShare } from "@/lib/account-sharing";

describe("Account share ownership", () => {
  it("allows only the exact owner to manage a share", () => {
    expect(canManageShare("owner-user", "owner-user")).toBe(true);
    expect(canManageShare("another-user", "owner-user")).toBe(false);
  });

  it("does not allow unowned shares to be managed as account shares", () => {
    expect(canManageShare(null, "owner-user")).toBe(false);
    expect(canManageShare(undefined, "owner-user")).toBe(false);
  });
});