import type { CityEvent } from "./event-schema";

const DEFAULT_URL = process.env.NEXT_PUBLIC_CITY_WS_URL ?? "ws://127.0.0.1:3070";

export interface StreamHandle {
  close(): void;
}

export function connectEventStream(
  onEvent: (e: CityEvent) => void,
  url: string = DEFAULT_URL
): StreamHandle {
  let closed = false;
  let ws: WebSocket | null = null;
  let backoff = 500;

  function open() {
    if (closed) return;
    ws = new WebSocket(url);

    ws.onopen = () => { backoff = 500; };
    ws.onmessage = (ev) => {
      try { onEvent(JSON.parse(String(ev.data)) as CityEvent); }
      catch { /* drop malformed frame */ }
    };
    ws.onclose = () => {
      if (closed) return;
      setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 10_000);
    };
    ws.onerror = () => ws?.close();
  }

  open();

  return {
    close() {
      closed = true;
      ws?.close();
    }
  };
}
