// packages/orchestrator/src/assets.ts
export interface Asset {
  code: string;
  label: string;
  emoji: string;
  hex: string;
  decimals: number;
  unitLabel: string;
  prefix: boolean;        // true: "$12.34"; false: "3 🍓"
  isCurrency: boolean;
  totalSupply: number | null;
}

export const ASSET_REGISTRY: Asset[] = [
  { code: "USD/2",          label: "US Dollar",     emoji: "🇺🇸", hex: "#BAEABC", decimals: 2, unitLabel: "$", prefix: true,  isCurrency: true,  totalSupply: null },
  { code: "EUR/2",          label: "Euro",          emoji: "🇪🇺", hex: "#8CB8D6", decimals: 2, unitLabel: "€", prefix: true,  isCurrency: true,  totalSupply: null },
  { code: "STRAWBERRY/0",   label: "Strawberry",    emoji: "🍓", hex: "#F5B8C8", decimals: 0, unitLabel: "🍓", prefix: false, isCurrency: false, totalSupply: 200 },
  { code: "COMPUTEHOUR/0",  label: "Compute Hour",  emoji: "💻", hex: "#60D6CE", decimals: 0, unitLabel: "💻", prefix: false, isCurrency: false, totalSupply: 50 }
];

const BY_CODE = new Map(ASSET_REGISTRY.map((a) => [a.code, a]));

export function assetByCode(code: string): Asset | undefined {
  return BY_CODE.get(code);
}

export function isCommodity(code: string): boolean {
  const a = BY_CODE.get(code);
  return !!a && a.isCurrency === false;
}

/**
 * Format a minor-units amount for human display. Currencies use prefix
 * symbols ("$1.23"); commodities use suffix ("3 🍓"). Unknown assets
 * fall back to "<amount> <code>".
 */
export function formatAmount(code: string, minorAmount: number): string {
  const a = BY_CODE.get(code);
  if (!a) return `${minorAmount} ${code}`;
  const value = a.decimals === 0
    ? String(minorAmount)
    : (minorAmount / Math.pow(10, a.decimals)).toFixed(a.decimals);
  return a.prefix ? `${a.unitLabel}${value}` : `${value} ${a.unitLabel}`;
}
