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

  private onCommit({ from, to, amount }: GlyphCommitEvent) {
    // New choreography:
    //   1. If the two agents are in different zones, WALK the payer over
    //      to the payee. (Agents' home/zone tracked in agentSprites;
    //      moveAgentTo handles the glide + auto-return after commit.)
    //   2. After arrival, flash halos on both agents (gold=paid, mint=paid-to)
    //      and float +/- amount deltas above each glyph.
    //
    // Self-transactions (waterfall_pay, liquidate_wallet) fire everything
    // at the actor's current position with a neutral halo.
    if (from !== to) {
      const payerS = this.agentSprites.get(from);
      const payeeS = this.agentSprites.get(to);
      if (!payerS || !payeeS) {
        this.flashCommit(from, to, amount);
        return;
      }

      // If the payer is already at the payee's zone (possible from a
      // previous move), skip the walk and fire immediately.
      const alreadyClose =
        Math.abs(payerS.txt.x - payeeS.txt.x) < 70 &&
        Math.abs(payerS.txt.y - payeeS.txt.y) < 70;
      if (alreadyClose) {
        this.flashCommit(from, to, amount);
        return;
      }

      // Walk payer to a spot next to the payee, then flash on arrival.
      const targetX = payeeS.txt.x + (Math.random() > 0.5 ? 22 : -22);
      const targetY = payeeS.txt.y;
      const origHome = { x: payerS.home.x, y: payerS.home.y };
      payerS.tweenActive = true;
      this.tweens.add({
        targets: [payerS.txt, payerS.lbl],
        x: (tgt: Phaser.GameObjects.Text) => targetX,
        y: (tgt: Phaser.GameObjects.Text) => tgt === payerS.lbl ? targetY + (payerS.agent.red ? 20 : 18) : targetY,
        duration: 700,
        ease: "Sine.easeInOut",
        onComplete: () => {
          this.flashCommit(from, to, amount);
          // Linger at peer for 900ms, then return home
          this.time.delayedCall(900, () => {
            this.tweens.add({
              targets: [payerS.txt, payerS.lbl],
              x: (tgt: Phaser.GameObjects.Text) => origHome.x,
              y: (tgt: Phaser.GameObjects.Text) => tgt === payerS.lbl ? origHome.y + (payerS.agent.red ? 20 : 18) : origHome.y,
              duration: 700,
              ease: "Sine.easeInOut",
              onComplete: () => { payerS.tweenActive = false; },
            });
          });
        },
      });
    } else {
      this.flashCommit(from, to, amount);
    }
  }

  /**
   * Two-party commit flash: glow halo on each agent + floating deltas.
   * Payer loses money (red minus), payee gains money (green plus).
   * Lasts ~1.4s, lightweight, no modal UI.
   */
  private flashCommit(from: string, to: string, amount: number) {
    const payerS = this.agentSprites.get(from);
    const payeeS = this.agentSprites.get(to);
    if (!payerS) return;

    // Halo on payer (gold/paid)
    const payerHalo = this.add.circle(payerS.txt.x, payerS.txt.y, 18, 0xd4a24a, 0.35);
    payerHalo.setStrokeStyle(1.5, 0xd4a24a, 0.9);
    this.tweens.add({
      targets: payerHalo, radius: 28, alpha: 0,
      duration: 900, ease: "cubic.out",
      onComplete: () => payerHalo.destroy(),
    });

    // Payer delta: red minus, drifts up-left
    if (amount > 0) {
      const payerDelta = this.add.text(payerS.txt.x - 16, payerS.txt.y - 14, `−$${amount.toFixed(2)}`, {
        fontFamily: FONT, fontSize: "11px", color: COLORS.red,
        fontStyle: "bold",
      }).setResolution(2).setOrigin(0.5, 0.5);
      this.tweens.add({
        targets: payerDelta,
        y: payerDelta.y - 22,
        alpha: 0,
        duration: 1400, ease: "cubic.out",
        onComplete: () => payerDelta.destroy(),
      });
    }

    // Halo + delta on payee (only when distinct from payer)
    if (payeeS && payeeS !== payerS) {
      const payeeHalo = this.add.circle(payeeS.txt.x, payeeS.txt.y, 18, 0xbaeabc, 0.35);
      payeeHalo.setStrokeStyle(1.5, 0xbaeabc, 0.9);
      this.tweens.add({
        targets: payeeHalo, radius: 28, alpha: 0,
        duration: 900, ease: "cubic.out",
        onComplete: () => payeeHalo.destroy(),
      });

      if (amount > 0) {
        const payeeDelta = this.add.text(payeeS.txt.x + 16, payeeS.txt.y - 14, `+$${amount.toFixed(2)}`, {
          fontFamily: FONT, fontSize: "11px", color: COLORS.mint,
          fontStyle: "bold",
        }).setResolution(2).setOrigin(0.5, 0.5);
        this.tweens.add({
          targets: payeeDelta,
          y: payeeDelta.y - 22,
          alpha: 0,
          duration: 1400, ease: "cubic.out",
          onComplete: () => payeeDelta.destroy(),
        });
      }
    }
  }

  private onReject({ from, barrier }: GlyphRejectEvent) {
    // Subtle, compact rejection marker at the sender's feet. The big framed
    // "_CAGE/ BARRIER ENGAGED_" dialog was too in-your-face for a city that
    // produces 40+ events/minute — rejects should be persistent-ish in the
    // log rail but visually quick on the canvas.
    const fromPos = this.agentPos(from);

    const cfgMap: Record<GlyphRejectEvent["barrier"], { color: string; sigil: string }> = {
      schema:    { color: COLORS.teal,  sigil: "⬡" },
      overdraft: { color: COLORS.red,   sigil: "⊘" },
      unknown:   { color: COLORS.amber, sigil: "404" },
      seen:      { color: COLORS.lilac, sigil: "⟳" },
    };
    const cfg = cfgMap[barrier];
    const colorInt = Phaser.Display.Color.HexStringToColor(cfg.color).color;

    // Small pill: sigil + short label, drifts up and fades. ~1s total.
    const c = this.add.container(fromPos.x, fromPos.y - 22);
    const bg = this.add.rectangle(0, 0, 42, 16, 0x011e22, 0.92)
      .setStrokeStyle(1, colorInt).setOrigin(0.5);
    const label = this.add.text(0, 0, cfg.sigil, {
      fontFamily: FONT, fontSize: "10px", color: cfg.color,
    }).setResolution(2).setOrigin(0.5);
    c.add([bg, label]);
    c.setAlpha(0);

    this.tweens.add({ targets: c, alpha: 1, duration: 120 });
    this.tweens.add({
      targets: c, y: c.y - 10, alpha: 0,
      delay: 500, duration: 400, ease: "cubic.in",
    });
    this.barriers.push({ container: c, bornAt: this.time.now, duration: 1000 });
  }
}
