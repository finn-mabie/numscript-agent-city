// apps/web/src/glyph/agent-map.ts
// Bidirectional mapping between our 3-digit agent ids and the Glyph City
// single-letter glyphs + per-agent hue. Render boundary only — the wire
// protocol still uses the 3-digit ids.

export type ZoneCode = "MKT" | "BNK" | "POS" | "INS" | "POL" | "ESC" | "?";

export interface GlyphAgent {
  id: string;          // "001" … "010"
  letter: string;      // "A" … "J"
  glyph: string;       // "Ⓐ" … "Ⓙ"
  name: string;
  role: string;
  hex: string;
  home: ZoneCode;
  red?: boolean;
}

export const GLYPH_AGENTS: GlyphAgent[] = [
  { id: "001", letter: "A", glyph: "Ⓐ", name: "Alice", role: "Market-maker", hex: "#D4A24A", home: "MKT" },
  { id: "002", letter: "B", glyph: "Ⓑ", name: "Bob",   role: "Courier",      hex: "#60D6CE", home: "POS" },
  { id: "003", letter: "C", glyph: "Ⓒ", name: "Carol", role: "Inspector",    hex: "#BAEABC", home: "INS" },
  { id: "004", letter: "D", glyph: "Ⓓ", name: "Dave",  role: "Lender",       hex: "#8CB8D6", home: "BNK" },
  { id: "005", letter: "E", glyph: "Ⓔ", name: "Eve",   role: "Researcher",   hex: "#B79BD9", home: "INS" },
  { id: "006", letter: "F", glyph: "Ⓕ", name: "Frank", role: "Writer",       hex: "#E8A84A", home: "MKT" },
  { id: "007", letter: "G", glyph: "Ⓖ", name: "Grace", role: "Illustrator",  hex: "#F5B8C8", home: "ESC" },
  { id: "008", letter: "H", glyph: "Ⓗ", name: "Heidi", role: "Pool-keeper",  hex: "#7FD6A8", home: "POL" },
  { id: "009", letter: "I", glyph: "Ⓘ", name: "Ivan",  role: "Disputant",    hex: "#C9B892", home: "ESC" },
  { id: "010", letter: "J", glyph: "Ⓙ", name: "Judy",  role: "Red agent",    hex: "#E5534B", home: "?", red: true }
];

const BY_ID     = new Map(GLYPH_AGENTS.map((a) => [a.id, a]));
const BY_LETTER = new Map(GLYPH_AGENTS.map((a) => [a.letter, a]));

export function glyphAgentById(id: string): GlyphAgent | undefined {
  return BY_ID.get(id);
}
export function glyphAgentByLetter(letter: string): GlyphAgent | undefined {
  return BY_LETTER.get(letter);
}
export function glyphOf(id: string): string {
  return BY_ID.get(id)?.glyph ?? "?";
}
export function hexOf(id: string): string {
  return BY_ID.get(id)?.hex ?? "#D5E1E1";
}
