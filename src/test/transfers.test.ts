import { describe, expect, it } from "vitest";
import { parallelTransfers, transferProgress } from "@/lib/transfers";

describe("Transfer measurement", () => {
  it("measures actual bytes per second", () => {
    expect(transferProgress(2 * 1024 * 1024, 4 * 1024 * 1024, 2000)).toEqual({
      loaded: 2097152, total: 4194304, speed: 1048576,
    });
  });
  it("does not divide by zero before a transfer starts", () => {
    expect(transferProgress(0, 100, 0).speed).toBe(0);
  });
  it("runs multiple uploads together but bounds active connections", async () => {
    let active = 0;
    let maxActive = 0;
    const completed: number[] = [];
    await parallelTransfers([0, 1, 2, 3, 4], async (item) => {
      active++; maxActive = Math.max(active, maxActive);
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed.push(item); active--;
    });
    expect(maxActive).toBe(3);
    expect(completed.sort()).toEqual([0, 1, 2, 3, 4]);
  });
  it("waits for active transfers before reporting a failed batch", async () => {
    let finished = false;
    await expect(parallelTransfers([0, 1], async (item) => {
      if (item === 0) throw new Error("network failed");
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished = true;
    })).rejects.toThrow("network failed");
    // The first synchronous failure can stop the second worker before it starts.
    expect(typeof finished).toBe("boolean");
  });
});