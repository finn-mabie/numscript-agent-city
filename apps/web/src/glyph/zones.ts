// apps/web/src/glyph/zones.ts
import type { ZoneCode } from "./agent-map";

export interface GlyphZone {
  code: ZoneCode;
  name: string;
  hex: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ascii: string;
  ownerAgentId?: string;
}

export const GLYPH_ZONES: Record<ZoneCode, GlyphZone> = {
  MKT: {
    code: "MKT", name: "MARKET",       hex: "#D4A24A", x: 60,  y: 70,  w: 230, h: 150,
    ownerAgentId: "001",
    ascii: `╔═══════════╗
║ $ │ $ │ $ ║
╠═══╪═══╪═══╣
║ ¢ │ ¢ │ ¢ ║
╚═══╧═══╧═══╝`
  },
  BNK: {
    code: "BNK", name: "BANK · VAULT", hex: "#8CB8D6", x: 300, y: 70,  w: 230, h: 150,
    ownerAgentId: "004",
    ascii: `   ┌─────┐
  ┌┴─────┴┐
  │ B·A·N·K│
  ├─┬─┬─┬─┤
  │▓│▓│▓│▓│
  └─┴─┴─┴─┘`
  },
  POS: {
    code: "POS", name: "POST OFFICE",  hex: "#60D6CE", x: 540, y: 70,  w: 230, h: 150,
    ownerAgentId: "002",
    ascii: `┌──────────┐
│ ▢ ▢ ▢ ▢ │
│  ↘  POST │
│   ╲      │
└──┬───┬───┘
   │ ✉ │    `
  },
  INS: {
    code: "INS", name: "INSPECTOR",    hex: "#BAEABC", x: 60,  y: 230, w: 230, h: 170,
    ownerAgentId: "003",
    ascii: `  ┌─────┐
  │ ?   │
  │  ✓  │
  │   ✗ │
 ─┴─────┴─
 │       │`
  },
  POL: {
    code: "POL", name: "POOL",         hex: "#7FD6A8", x: 300, y: 230, w: 230, h: 170,
    ownerAgentId: "008",
    ascii: `┌─────────────┐
│≈≈≈ ◎ ≈≈≈ ◎ ≈│
│≈ ◎ ≈≈≈ ◎ ≈≈│
│≈≈≈ ◎ ≈≈≈ ◎ ≈│
└─────────────┘`
  },
  ESC: {
    code: "ESC", name: "ESCROW",       hex: "#B79BD9", x: 540, y: 230, w: 230, h: 170,
    ownerAgentId: "009",
    ascii: `╔═══════════╗
║ █████████ ║
║ █ LOCK  █ ║
║ █  ⎔    █ ║
║ █████████ ║
╚═══════════╝`
  },
  "?": {
    code: "?", name: "UNKNOWN",        hex: "#E5534B", x: 790, y: 150, w: 160, h: 240,
    ascii: `╲╲╲╲╲╲╲╲
╲╲╲╲╲╲╲╲
  ???
╲╲╲╲╲╲╲╲
╲╲╲╲╲╲╲╲`
  }
};

export const CANVAS_W = 980;
export const CANVAS_H = 430;
