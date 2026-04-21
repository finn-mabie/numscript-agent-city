"use client";
import { ARENA_PRESETS, type ArenaPreset } from "../lib/arena-presets";

export function ArenaPresets(props: {
  onPick: (preset: ArenaPreset) => void;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {ARENA_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          title={p.hint}
          onClick={() => props.onPick(p)}
          className="text-[10px] uppercase tracking-wider border border-[var(--mute)] px-2 py-0.5 hover:bg-[var(--mute)] transition-colors"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
