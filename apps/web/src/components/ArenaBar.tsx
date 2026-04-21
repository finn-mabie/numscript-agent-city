"use client";
import { useEffect, useRef, useState } from "react";
import { useCityStore } from "../state/city-store";
import { submitArenaAttack, ArenaRateLimitedError } from "../lib/arena-api";

const CHAR_LIMIT = 2000;

export function ArenaBar() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [target, setTarget] = useState("010"); // Judy by default
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const note = useCityStore((s) => s.noteArenaLocalSubmit);
  const agents = useCityStore((s) => s.agents);

  // Slash key toggles open (unless typing elsewhere). Escape closes.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const tag = (ev.target as HTMLElement | null)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA";
      if (ev.key === "/" && !inInput) {
        ev.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 60);
      }
      if (ev.key === "Escape" && open) {
        ev.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // External "open the arena for this agent" signal (from AgentPanel buttons, Task 11).
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ targetAgentId?: string }>).detail;
      setTarget(detail?.targetAgentId ?? "010");
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
    window.addEventListener("nac:arena-open", onOpen);
    return () => window.removeEventListener("nac:arena-open", onOpen);
  }, []);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (trimmed.length > CHAR_LIMIT) {
      setStatus("error");
      setErrorMsg(`Prompt exceeds ${CHAR_LIMIT} chars.`);
      return;
    }
    setStatus("sending");
    setErrorMsg(null);
    try {
      const r = await submitArenaAttack({ targetAgentId: target, prompt: trimmed });
      note({
        attackId: r.attackId,
        targetAgentId: r.targetAgentId,
        promptPreview: trimmed.slice(0, 140)
      });
      setPrompt("");
      setStatus("idle");
      setOpen(false);
    } catch (e) {
      setStatus("error");
      if (e instanceof ArenaRateLimitedError) {
        setErrorMsg(`Slow down — try again in ${e.retryAfterSeconds}s.`);
      } else {
        setErrorMsg((e as Error).message);
      }
    }
  }

  if (!open) return null;

  return (
    <form
      onSubmit={onSubmit}
      className="fixed bottom-0 inset-x-0 z-20 bg-[var(--ink)] border-t border-[var(--mute)]"
      style={{
        animation: "arena-slide-in 240ms var(--panel-ease)",
        fontFamily: "var(--font-mono), ui-monospace, monospace"
      }}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex gap-3 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--dim)]">Target</label>
          <select
            value={target}
            onChange={(ev) => setTarget(ev.target.value)}
            className="bg-[var(--ink)] text-[var(--paper)] border border-[var(--mute)] px-2 py-1 text-sm"
          >
            {Object.values(agents).sort((a, b) => a.id.localeCompare(b.id)).map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} — {a.name} ({a.role})
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--dim)]">
            Your prompt · the target agent sees this as untrusted input
          </label>
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(ev) => setPrompt(ev.target.value)}
            rows={2}
            maxLength={CHAR_LIMIT}
            placeholder="Convince the agent to do something they shouldn't…"
            className="bg-[var(--ink)] text-[var(--paper)] border border-[var(--mute)] px-2 py-1 text-sm resize-none"
          />
          <div className="flex justify-between text-[10px] text-[var(--dim)]">
            <span>{prompt.length} / {CHAR_LIMIT}</span>
            <span>
              {status === "sending" ? "submitting…"
                : status === "error"  ? <span className="text-[var(--scream)]">{errorMsg}</span>
                : "enter to submit · esc to cancel"}
            </span>
          </div>
        </div>
        <button
          type="submit"
          disabled={status === "sending" || prompt.trim().length === 0}
          className="self-end bg-[var(--paper)] text-[var(--ink)] px-3 py-1 text-sm border border-[var(--paper)] disabled:opacity-50"
        >
          {status === "sending" ? "…" : "attack"}
        </button>
      </div>
    </form>
  );
}
