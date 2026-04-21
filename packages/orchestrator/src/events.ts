import { WebSocketServer, WebSocket } from "ws";
import type { CityEvent } from "./types.js";

export interface EventBus {
  port: number;
  emit: (event: CityEvent) => void;
  close: () => Promise<void>;
}

export async function startEventBus(opts: { port: number }): Promise<EventBus> {
  const wss = new WebSocketServer({ port: opts.port });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const addr = wss.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;

  const clients = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  return {
    port,
    emit(event) {
      const line = JSON.stringify(event);
      for (const c of clients) {
        if (c.readyState === WebSocket.OPEN) c.send(line);
      }
    },
    close() {
      return new Promise((resolve) => {
        for (const c of clients) c.close();
        wss.close(() => resolve());
      });
    }
  };
}
