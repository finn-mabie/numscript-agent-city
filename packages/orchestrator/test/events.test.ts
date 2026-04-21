import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import { startEventBus } from "../src/events.js";

describe("event bus", () => {
  it("broadcasts events to connected clients as JSON lines", async () => {
    const bus = await startEventBus({ port: 0 }); // ephemeral port
    const url = `ws://127.0.0.1:${bus.port}`;
    const received: string[] = [];

    const ws = new WebSocket(url);
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));
    ws.on("message", (data) => received.push(data.toString()));

    bus.emit({ kind: "idle", agentId: "001", tickId: "001:1", at: 123 });
    bus.emit({ kind: "committed", agentId: "002", tickId: "002:1", at: 124, data: { templateId: "p2p_transfer" } });

    // Give the socket time to flush
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(2);
    expect(JSON.parse(received[0]).kind).toBe("idle");
    expect(JSON.parse(received[1]).data.templateId).toBe("p2p_transfer");

    ws.close();
    await bus.close();
  });
});
