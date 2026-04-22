// apps/web/src/glyph/asset-palette.ts
// Mirrors packages/orchestrator/src/assets.ts (render-only subset).
// If you change ASSET_REGISTRY on the backend, update this too.

export interface AssetRender {
  hex: string;
  decimals: number;
  unitLabel: string;
  prefix: boolean;  // true → "$1.23"; false → "3 🍓"
}

export const ASSET_PALETTE: Record<string, AssetRender> = {
  "USD/2":         { hex: "#BAEABC", decimals: 2, unitLabel: "$",  prefix: true  },
  "EUR/2":         { hex: "#8CB8D6", decimals: 2, unitLabel: "€",  prefix: true  },
  "STRAWBERRY/0":  { hex: "#F5B8C8", decimals: 0, unitLabel: "🍓", prefix: false },
  "COMPUTEHOUR/0": { hex: "#60D6CE", decimals: 0, unitLabel: "💻", prefix: false }
};

export function formatAmount(code: string | undefined, minorAmount: number): string {
  const a = code ? ASSET_PALETTE[code] : undefined;
  if (!a) return String(minorAmount);
  const value = a.decimals === 0
    ? String(minorAmount)
    : (minorAmount / Math.pow(10, a.decimals)).toFixed(a.decimals);
  return a.prefix ? `${a.unitLabel}${value}` : `${value} ${a.unitLabel}`;
}

export function hexFor(code: string | undefined): string {
  return code && ASSET_PALETTE[code] ? ASSET_PALETTE[code].hex : "#BAEABC";
}

export function decimalsFor(code: string | undefined): number {
  return code && ASSET_PALETTE[code] ? ASSET_PALETTE[code].decimals : 2;
}
