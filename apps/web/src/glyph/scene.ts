// apps/web/src/glyph/scene.ts
// Glyph City — Phaser scene (TypeScript port of scene.js).
// Typographic renderer: every visible element is a Phaser.GameObjects.Text
// sitting on a 12px dotted grid. Agents are circled letters, buildings are
// multi-line ASCII blocks, transactions are posting-receipt popups, barriers
// are framed dialog stamps.
//
// Motion model (hybrid):
//   - Agents idle-drift sub-cell inside their current zone (±10px wobble).
//   - Cross-zone moves snap to cell-tweens: 1100ms linear glide to zone center.

import Phaser from "phaser";
import {
  GLYPH_AGENTS,
  glyphAgentById,
  glyphOf,
  hexOf,
  type GlyphAgent,
} from "./agent-map";
import { GLYPH_ZONES, CANVAS_W, CANVAS_H, type GlyphZone } from "./zones";
import type {
  GlyphAdapter,
  GlyphIntentEvent,
  GlyphCommitEvent,
  GlyphRejectEvent,
  GlyphMoveEvent,
} from "./store-adapter";

const COLORS = {
  sky:     "#011E22",
  rule:    "#0a4048",
  ink:     "#D5E1E1",
  inkSoft: "#A6BEC0",
  inkDim:  "#7A9396",
  gold:    "#D4A24A",
  silver:  "#A6BEC0",
  mint:    "#BAEABC",
  red:     "#E5534B",
  teal:    "#60D6CE",
  amber:   "#E8A84A",
  lilac:   "#B79BD9",
} as const;

const FONT = "Berkeley Mono, ui-monospace, Menlo, monospace";

interface AgentSpriteRecord {
  txt: Phaser.GameObjects.Text;
  lbl: Phaser.GameObjects.Text;
  agent: GlyphAgent;
  home: { x: number; y: number };
  zone: string;
  wobblePhase: number;
  tweenActive?: boolean;
}

export class GlyphScene extends Phaser.Scene {
  private agentSprites = new Map<string, AgentSpriteRecord>();
  private receipts: Array<{ container: Phaser.GameObjects.Container; bornAt: number; duration: number }> = [];
  private barriers: Array<{ container: Phaser.GameObjects.Container; bornAt: number; duration: number }> = [];
  private coinTrails: Array<{ elems: Phaser.GameObjects.GameObject[]; bornAt: number; duration: number }> = [];

  constructor(private adapter: GlyphAdapter) {
    super({ key: "GlyphScene" });
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.sky);

    // Dotted grid
    const g = this.add.graphics();
    g.fillStyle(0x0a4048, 1);
    for (let x = 12; x <= CANVAS_W; x += 12) {
      for (let y = 12; y <= CANVAS_H; y += 12) g.fillRect(x, y, 1, 1);
    }

    // Zone rectangles + labels
    for (const [code, z] of Object.entries(GLYPH_ZONES)) {
      const fillHex = Phaser.Display.Color.HexStringToColor(z.hex).color;
      // Fill rect is also the hit-area — clicking a zone opens BuildingPanel.
      // Only zones with an ownerAgentId are clickable (skip "?").
      const fill = this.add.rectangle(z.x, z.y, z.w, z.h, fillHex, 0.07).setOrigin(0, 0);
      if (z.ownerAgentId) {
        fill.setInteractive({ useHandCursor: true });
        const buildingId = code.toLowerCase().replace(/_/g, "-");
        // Map zone code → existing BuildingPanel id convention
        const BUILDING_ID_MAP: Record<string, string> = {
          MKT: "market", BNK: "bank", POS: "post_office",
          INS: "inspector", POL: "pool", ESC: "escrow"
        };
        const panelId = BUILDING_ID_MAP[code] ?? buildingId;
        fill.on("pointerup", () => {
          window.dispatchEvent(new CustomEvent("nac:building-click", { detail: { buildingId: panelId } }));
        });
        fill.on("pointerover", () => fill.setFillStyle(fillHex, 0.14));
        fill.on("pointerout",  () => fill.setFillStyle(fillHex, 0.07));
      }
      const rect = this.add.graphics();
      rect.lineStyle(1, 0x0a4048, 1);
      rect.strokeRect(z.x, z.y, z.w, z.h);

      if (code === "?") {
        // Red diagonals pattern
        for (let i = -z.h; i < z.w; i += 6) {
          const x1 = z.x + Math.max(0, i);
          const y1 = z.y + Math.max(0, -i);
          const x2 = z.x + Math.min(z.w, i + z.h);
          const y2 = z.y + Math.min(z.h, z.h - (i + z.h - z.w));
          this.add.line(0, 0, x1, y1, x2, y2, 0xe5534b, 0.15).setOrigin(0, 0);
        }
      }

      this.add.text(z.x + 10, z.y + 6, `_${code}/`, {
        fontFamily: FONT, fontSize: "10px", color: z.hex,
      }).setResolution(2).setAlpha(0.95);
      this.add.text(z.x + 10 + code.length * 6 + 14, z.y + 6, z.name, {
        fontFamily: FONT, fontSize: "10px", color: COLORS.inkDim,
      }).setResolution(2);

      // Mini ASCII for this zone (ascii lives directly on GlyphZone)
      if (z.ascii) {
        this.add.text(z.x + 14, z.y + 30, z.ascii, {
          fontFamily: FONT, fontSize: "10px", color: z.hex,
          lineSpacing: 1,
        }).setResolution(2).setAlpha(0.55);
      }
    }

    // Agents — assigned slots so multiple agents in one zone don't stack.
    // Each zone gets a horizontal grid of up to 3 slots in the bottom half;
    // agents wobble within their slot, never crossing each other.
    const zoneOccupants = new Map<string, string[]>(); // zone code → agent ids in residence
    for (const a of GLYPH_AGENTS) {
      const zoneCode = a.home === "?" ? "?" : a.home;
      const list = zoneOccupants.get(zoneCode) ?? [];
      list.push(a.id);
      zoneOccupants.set(zoneCode, list);
    }

    for (const a of GLYPH_AGENTS) {
      const zoneCode = a.home === "?" ? "?" : a.home;
      const z = GLYPH_ZONES[zoneCode];
      const cohort = zoneOccupants.get(zoneCode) ?? [a.id];
      const idx = cohort.indexOf(a.id);
      const n = cohort.length;
      // Horizontal slots, clustered in the lower 40% of the zone (below ASCII art)
      const slotW = z.w / (n + 1);
      const px = z.x + slotW * (idx + 1);
      const py = z.y + z.h * 0.72;
      const txt = this.add.text(px, py, a.glyph, {
        fontFamily: FONT, fontSize: a.red ? "32px" : "28px", color: a.hex,
      }).setResolution(2).setOrigin(0.5, 0.5);
      txt.setInteractive({ useHandCursor: true });
      txt.on("pointerup", () => {
        window.dispatchEvent(new CustomEvent("nac:agent-click", { detail: { id: a.id } }));
      });
      txt.on("pointerover", () => txt.setShadow(0, 0, a.hex, 10, true, true));
      txt.on("pointerout",  () => txt.setShadow());
      const lbl = this.add.text(px, py + (a.red ? 20 : 18), a.name.toUpperCase(), {
        fontFamily: FONT, fontSize: "8px", color: COLORS.inkDim,
        letterSpacing: 1,
      }).setResolution(2).setOrigin(0.5, 0.5);

      this.agentSprites.set(a.id, {
        txt, lbl, agent: a,
        home: { x: px, y: py },
        zone: zoneCode,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }

    // Adapter wiring (push-driven; no tick loop)
    this.adapter.on("intent",     (p) => this.onIntent(p as GlyphIntentEvent));
    this.adapter.on("commit",     (p) => this.onCommit(p as GlyphCommitEvent));
    this.adapter.on("reject",     (p) => this.onReject(p as GlyphRejectEvent));
    this.adapter.on("agent-move", (p) => this.onAgentMove(p as GlyphMoveEvent));
  }

  update(_t: number, _dt: number) {
    // Idle wobble — clamped so an agent never drifts into a neighbor's slot
    // or out of their home zone. Smaller horizontal range (±4px) since slots
    // are narrow; a bit more vertical since the slot has headroom.
    const t = this.time.now / 1000;
    for (const s of this.agentSprites.values()) {
      if (s.tweenActive) continue;
      const dx = Math.sin(t * 0.9 + s.wobblePhase) * 4;
      const dy = Math.cos(t * 0.8 + s.wobblePhase * 1.3) * 5;
      s.txt.x = s.home.x + dx;
      s.txt.y = s.home.y + dy;
      s.lbl.x = s.home.x + dx;
      s.lbl.y = s.home.y + dy + (s.agent.red ? 20 : 18);
    }

    // Expire receipts & barriers
    const now = this.time.now;
    this.receipts = this.receipts.filter((r) => {
      if (now - r.bornAt > r.duration) { r.container.destroy(); return false; }
      return true;
    });
    this.barriers = this.barriers.filter((b) => {
      if (now - b.bornAt > b.duration) { b.container.destroy(); return false; }
      return true;
    });
    this.coinTrails = this.coinTrails.filter((ct) => {
      if (now - ct.bornAt > ct.duration) { ct.elems.forEach((e) => e.destroy()); return false; }
      return true;
    });
  }

  private zoneCenter(code: string): { x: number; y: number } {
    const z = (GLYPH_ZONES as Record<string, { x: number; y: number; w: number; h: number } | undefined>)[code] ?? GLYPH_ZONES.MKT;
    return { x: z.x + z.w / 2, y: z.y + z.h / 2 + 8 };
  }

  private agentPos(id: string): { x: number; y: number } {
    const s = this.agentSprites.get(id);
    if (!s) return this.zoneCenter("MKT");
    return { x: s.txt.x, y: s.txt.y };
  }

  private onAgentMove({ id, toZone, durationMs }: GlyphMoveEvent) {
    const s = this.agentSprites.get(id);
    if (!s) return;
    const z = (GLYPH_ZONES as Record<string, GlyphZone | undefined>)[toZone];
    if (!z) return;
    // Park at a corner of the target zone's floor, offset from the center —
    // the host's slots occupy the center so the visitor stays out of the way.
    // Deterministic jitter per-visitor keeps repeat visitors slightly offset.
    const offsetSign = (id.charCodeAt(id.length - 1) % 2) === 0 ? -1 : 1;
    const visitX = z.x + z.w * 0.5 + offsetSign * (z.w * 0.28);
    const visitY = z.y + z.h * 0.78;
    const origHome = { x: s.home.x, y: s.home.y };
    const origZone = s.zone;

    s.tweenActive = true;
    s.zone = toZone;

    // Outbound glide — to counterparty zone
    this.tweens.add({
      targets: [s.txt, s.lbl],
      x: (tgt: Phaser.GameObjects.Text) => visitX,
      y: (tgt: Phaser.GameObjects.Text) => tgt === s.lbl ? visitY + (s.agent.red ? 20 : 18) : visitY,
      duration: durationMs,
      ease: "Sine.easeInOut",
      onComplete: () => {
        // Linger briefly, then return home so they don't stack in peer zones
        this.time.delayedCall(1800, () => {
          this.tweens.add({
            targets: [s.txt, s.lbl],
            x: (tgt: Phaser.GameObjects.Text) => origHome.x,
            y: (tgt: Phaser.GameObjects.Text) => tgt === s.lbl ? origHome.y + (s.agent.red ? 20 : 18) : origHome.y,
            duration: durationMs,
            ease: "Sine.easeInOut",
            onComplete: () => {
              s.tweenActive = false;
              s.zone = origZone;
              // s.home is unchanged — they return to the same slot
            },
          });
        });
      },
    });
  }

  private onIntent({ from, to, kind, amount, summary, judy }: GlyphIntentEvent) {
    // Speech-bubble at sender — gold for root offer, silver for reply.
    // Shows WHO is talking + the first part of what they're saying, not "$0".
    const fromPos = this.agentPos(from);
    const color = judy ? COLORS.red : (kind === "offer" ? COLORS.gold : COLORS.silver);
    const sender = glyphAgentById(from);
    const name = sender?.name ?? from;

    // Clip body text — bubble gets wider than the older $-bubble
    const shown = summary && summary.length > 48 ? summary.slice(0, 45).trimEnd() + "…" : (summary ?? "");
    const headText = kind === "offer" ? `◆ ${sender?.glyph ?? from} ${name.toUpperCase()} OFFERS` : `↘ ${sender?.glyph ?? from} ${name.toUpperCase()} REPLIES`;
    const bubbleW = Math.max(180, Math.min(280, shown.length * 5.2 + 24));
    const bubbleH = shown ? 38 : 26;

    const bubble = this.add.container(fromPos.x + 20, fromPos.y - bubbleH - 6);
    const bg = this.add.rectangle(0, 0, bubbleW, bubbleH, 0x011e22, 1)
      .setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(color).color);
    bg.setOrigin(0, 0);
    const head = this.add.text(6, 4, headText, {
      fontFamily: FONT, fontSize: "8px", color, letterSpacing: 1.2,
    }).setResolution(2);
    const body = shown
      ? this.add.text(6, 16, shown, {
          fontFamily: FONT, fontSize: "9px", color: COLORS.ink,
          wordWrap: { width: bubbleW - 12 },
        }).setResolution(2)
      : null;
    // If there's a concrete amount (>0), show a small "— $N" suffix in the head
    if (amount > 0) {
      const amt = this.add.text(bubbleW - 6, 4, `$${amount}`, {
        fontFamily: FONT, fontSize: "8px", color: COLORS.gold, letterSpacing: 1.2,
      }).setResolution(2).setOrigin(1, 0);
      bubble.add(amt);
    }
    bubble.add([bg, head, ...(body ? [body] : [])]);
    bubble.setAlpha(0);
    this.tweens.add({ targets: bubble, alpha: 1, duration: 120 });
    this.receipts.push({ container: bubble, bornAt: this.time.now, duration: 2400 });

    // Coin trail only for REPLY intents that actually cross between agents
    // (root offers are broadcasts — from==to for us, so we skip to avoid a
    // self-loop particle trail that makes no sense).
    if (kind === "reply" && to !== from) {
      const toSprite = this.agentSprites.get(to);
      if (toSprite) this.fireCoinTrail(fromPos, this.agentPos(to), judy ? COLORS.red : COLORS.gold);
    }
  }

  private fireCoinTrail(from: { x: number; y: number }, to: { x: number; y: number }, color: string) {
    const dots: Phaser.GameObjects.Text[] = [];
    const N = 5;
    for (let i = 0; i < N; i++) {
      const d = this.add.text(from.x, from.y, "$", {
        fontFamily: FONT, fontSize: "11px", color,
      }).setResolution(2).setOrigin(0.5);
      d.setAlpha(0);
      dots.push(d);
      this.tweens.add({
        targets: d,
        x: to.x, y: to.y,
        alpha: { from: 0.9, to: 0 },
        duration: 800,
        delay: i * 80,
        ease: "Sine.easeOut",
      });
    }
    this.coinTrails.push({ elems: dots, bornAt: this.time.now, duration: 1400 });
  }

  private onCommit({ from, to, amount, txid }: GlyphCommitEvent) {
    const pos = this.agentPos(to);
    const c = this.add.container(pos.x + 16, pos.y - 4);
    const bg = this.add.rectangle(0, 0, 170, 58, 0x011e22, 1)
      .setStrokeStyle(1, 0xbaeabc).setOrigin(0, 0);
    const pin = this.add.rectangle(0, 0, 2, 58, 0xbaeabc).setOrigin(0, 0);
    const head = this.add.text(10, 6, `COMMIT · tx ${txid}`, {
      fontFamily: FONT, fontSize: "8px", color: COLORS.mint, letterSpacing: 1.2,
    }).setResolution(2);
    const l1 = this.add.text(10, 20, `+ $${amount.toFixed(2)}`, {
      fontFamily: FONT, fontSize: "11px", color: COLORS.gold,
    }).setResolution(2);
    // Resolve 3-digit agent ids to glyphs for the transfer line
    const fromGlyph = glyphOf(from);
    const toGlyph = glyphOf(to);
    const l2 = this.add.text(10, 34, `${fromGlyph} → ${toGlyph}`, {
      fontFamily: FONT, fontSize: "9px", color: COLORS.ink,
    }).setResolution(2);
    const l3 = this.add.text(10, 46, "OK", {
      fontFamily: FONT, fontSize: "9px", color: COLORS.mint,
    }).setResolution(2);
    c.add([bg, pin, head, l1, l2, l3]);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, y: c.y - 6, duration: 180 });
    this.receipts.push({ container: c, bornAt: this.time.now, duration: 1800 });
  }

  private onReject({ from, to, amount, txid, barrier, detail }: GlyphRejectEvent) {
    // Center-ish on rejection site — between sender and target
    const judyPos = this.agentPos(from);
    // to may be a zone code (e.g. "BNK") or an agent id (e.g. "004")
    const targetPos = (GLYPH_ZONES as Record<string, unknown>)[to]
      ? this.zoneCenter(to)
      : this.agentPos(to);
    const cx = (judyPos.x + targetPos.x) / 2;
    const cy = (judyPos.y + targetPos.y) / 2;

    const cfgMap = {
      schema:    { color: COLORS.teal,  sigil: "⬡",   code: "E/SCHEMA", title: "Schema rejection",
                   rows: [["field", detail.field], ["want", detail.want], ["got", detail.got, COLORS.red]] as [string, string | number, string?][] },
      overdraft: { color: COLORS.red,   sigil: "⊘",   code: "E/⊘",      title: "Overdraft rejection",
                   rows: [["debit", `$${detail.debit}`, COLORS.red], ["avail", "$0"], ["short", `$${detail.short}`, COLORS.red]] as [string, string | number, string?][] },
      unknown:   { color: COLORS.amber, sigil: "404", code: "E/404",    title: "Template not found",
                   rows: [["tmpl", detail.tmpl, COLORS.red], ["known", "posting, hold"], ["hint", "register it"]] as [string, string | number, string?][] },
      seen:      { color: COLORS.lilac, sigil: "⟳",   code: "E/IDEM",   title: "Already seen",
                   rows: [["nonce", detail.nonce], ["first", `tick ${detail.first}`], ["effect", "no-op"]] as [string, string | number, string?][] },
    } as const;

    const cfg = cfgMap[barrier];

    const c = this.add.container(cx, cy);
    c.setAngle(-1.5);

    const colorInt = Phaser.Display.Color.HexStringToColor(cfg.color).color;
    const bg = this.add.rectangle(0, 0, 260, 130, 0x011e22, 1)
      .setStrokeStyle(1.5, colorInt).setOrigin(0.5);
    const titleBar = this.add.rectangle(-130, -65, 260, 18, colorInt, 1).setOrigin(0, 0);
    const titleTxt = this.add.text(-124, -62, "_CAGE/ BARRIER ENGAGED", {
      fontFamily: FONT, fontSize: "8px", color: "#011E22", letterSpacing: 1.2,
    }).setResolution(2);
    const titleCode = this.add.text(124, -62, cfg.code, {
      fontFamily: FONT, fontSize: "8px", color: "#011E22", letterSpacing: 1.2,
    }).setResolution(2).setOrigin(1, 0);

    const sigil = this.add.text(-120, -35, cfg.sigil, {
      fontFamily: FONT, fontSize: "28px", color: cfg.color,
    }).setResolution(2);
    const heading = this.add.text(-80, -32, cfg.title, {
      fontFamily: FONT, fontSize: "13px", color: COLORS.ink,
    }).setResolution(2);
    const subline = this.add.text(-80, -16, `LEDGER REFUSED · TX ${txid}`, {
      fontFamily: FONT, fontSize: "8px", color: COLORS.inkDim, letterSpacing: 1.2,
    }).setResolution(2);

    const rows = cfg.rows.flatMap((r, i) => {
      const k = this.add.text(-120, 6 + i * 16, String(r[0]).padEnd(8), {
        fontFamily: FONT, fontSize: "10px", color: COLORS.inkDim,
      }).setResolution(2);
      const v = this.add.text(-56, 6 + i * 16, String(r[1]), {
        fontFamily: FONT, fontSize: "10px", color: r[2] ?? COLORS.ink,
      }).setResolution(2);
      return [k, v];
    });

    // Footer line: resolved from sender agent record
    const sender = glyphAgentById(from);
    const bySig = this.add.text(-120, 54, "by", {
      fontFamily: FONT, fontSize: "10px", color: COLORS.inkDim,
    }).setResolution(2);
    const byVal = this.add.text(-56, 54, sender ? `${sender.glyph} ${sender.name}` : from, {
      fontFamily: FONT, fontSize: "10px", color: COLORS.red,
    }).setResolution(2);

    c.add([bg, titleBar, titleTxt, titleCode, sigil, heading, subline, ...rows, bySig, byVal]);
    c.setScale(0.8);
    c.setAlpha(0);
    this.tweens.add({
      targets: c, scale: 1, alpha: 1, duration: 180, ease: "Back.easeOut",
    });
    this.barriers.push({ container: c, bornAt: this.time.now, duration: 2800 });

    // Give the whole target zone a red pulse (only if to is a zone code)
    const z = (GLYPH_ZONES as Record<string, { x: number; y: number; w: number; h: number } | undefined>)[to];
    if (z) {
      const pulse = this.add.rectangle(z.x, z.y, z.w, z.h, 0xe5534b, 0.18).setOrigin(0, 0);
      this.tweens.add({
        targets: pulse, alpha: 0, duration: 650,
        onComplete: () => pulse.destroy(),
      });
    }
  }
}
