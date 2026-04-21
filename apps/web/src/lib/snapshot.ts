import type { AgentView, IntentLogView } from "../state/city-store";

const DEFAULT_BASE = process.env.NEXT_PUBLIC_CITY_HTTP_URL ?? "http://127.0.0.1:3071";

interface SnapshotPayload {
  agents: Array<Omit<AgentView, "x" | "y">>;
  recent: IntentLogView[];
}

export async function fetchSnapshot(baseUrl = DEFAULT_BASE): Promise<SnapshotPayload> {
  const res = await fetch(`${baseUrl}/snapshot`, { cache: "no-store" });
  if (!res.ok) throw new Error(`snapshot failed: HTTP ${res.status}`);
  return (await res.json()) as SnapshotPayload;
}
