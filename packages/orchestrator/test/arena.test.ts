import { describe, it, expect } from "vitest";
import { createArenaQueue, newAttackId, hashPrompt, hashIp } from "../src/arena.js";

describe("arena queue", () => {
  it("enqueue then drain returns FIFO", () => {
    const q = createArenaQueue();
    q.enqueue({ attackId: "a1", targetAgentId: "010", prompt: "drain it" });
    q.enqueue({ attackId: "a2", targetAgentId: "010", prompt: "again" });
    q.enqueue({ attackId: "a3", targetAgentId: "001", prompt: "alice" });
    const first = q.drain("010");
    expect(first?.attackId).toBe("a1");
    const second = q.drain("010");
    expect(second?.attackId).toBe("a2");
    expect(q.drain("010")).toBeNull();
    expect(q.drain("001")?.attackId).toBe("a3");
  });

  it("peek and size return correct state", () => {
    const q = createArenaQueue();
    q.enqueue({ attackId: "a1", targetAgentId: "010", prompt: "x" });
    expect(q.size("010")).toBe(1);
    expect(q.peek("010")?.attackId).toBe("a1");
    q.drain("010");
    expect(q.size("010")).toBe(0);
  });

  it("TTL expires stale entries", () => {
    let now = 1_000;
    const q = createArenaQueue({ ttlMs: 500, now: () => now });
    q.enqueue({ attackId: "stale", targetAgentId: "010", prompt: "x" });
    now = 1_600; // past TTL
    expect(q.drain("010")).toBeNull();
  });
});

describe("arena helpers", () => {
  it("newAttackId shape", () => {
    const id = newAttackId(() => 1_700_000_000_000);
    expect(id).toMatch(/^atk_[a-z0-9]+_[a-f0-9]{8}$/);
  });

  it("hashPrompt and hashIp are deterministic with salt", () => {
    expect(hashPrompt("hi", "s")).toBe(hashPrompt("hi", "s"));
    expect(hashPrompt("hi", "s")).not.toBe(hashPrompt("hi", "t"));
    expect(hashIp("1.2.3.4", "s")).toBe(hashIp("1.2.3.4", "s"));
    expect(hashIp("1.2.3.4", "s")).not.toBe(hashIp("1.2.3.5", "s"));
  });
});
