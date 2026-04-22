/* global Phaser, NCData, NCEngine */
// Glyph City — Phaser scene.
// Typographic renderer: every visible element is a Phaser.GameObjects.Text
// sitting on a 12px dotted grid. Agents are circled letters, buildings are
// multi-line ASCII blocks, transactions are posting-receipt popups, barriers
// are framed dialog stamps.
//
// Motion model (hybrid):
//   - Agents idle-drift sub-cell inside their current zone (±10px wobble).
//   - Cross-zone moves snap to cell-tweens: 1100ms linear glide to zone center.

window.makeGlyphScene = function (engine) {
  const COLORS = {
    sky:     '#011E22',
    rule:    '#0a4048',
    ink:     '#D5E1E1',
    inkSoft: '#A6BEC0',
    inkDim:  '#7A9396',
    gold:    '#D4A24A',
    silver:  '#A6BEC0',
    mint:    '#BAEABC',
    red:     '#E5534B',
    teal:    '#60D6CE',
    amber:   '#E8A84A',
    lilac:   '#B79BD9',
  };

  const ZONES = {
    MKT: { x: 60,  y: 70,  w: 230, h: 150, hex:'#D4A24A', label:'MKT', name:'MARKET' },
    BNK: { x: 300, y: 70,  w: 230, h: 150, hex:'#8CB8D6', label:'BNK', name:'BANK · VAULT' },
    POS: { x: 540, y: 70,  w: 230, h: 150, hex:'#60D6CE', label:'POS', name:'POST OFFICE' },
    INS: { x: 60,  y: 230, w: 230, h: 170, hex:'#BAEABC', label:'INS', name:'INSPECTOR' },
    POL: { x: 300, y: 230, w: 230, h: 170, hex:'#7FD6A8', label:'POL', name:'POOL' },
    ESC: { x: 540, y: 230, w: 230, h: 170, hex:'#B79BD9', label:'ESC', name:'ESCROW' },
    '?': { x: 790, y: 150, w: 160, h: 240, hex:'#E5534B', label:'?',   name:'UNKNOWN' },
  };

  const FONT = 'Berkeley Mono, ui-monospace, Menlo, monospace';

  // Scene width/height — match container
  const W = 980, H = 430;

  class GlyphScene extends Phaser.Scene {
    constructor() {
      super({ key: 'GlyphScene' });
      this.agentSprites = {};  // id → { txt, label, target, wobble }
      this.receipts = [];      // { container, bornAt }
      this.barriers = [];      // { container, bornAt }
      this.coinTrails = [];    // { elems, bornAt, duration }
    }

    create() {
      this.cameras.main.setBackgroundColor(COLORS.sky);

      // Dotted grid
      const g = this.add.graphics();
      g.fillStyle(0x0a4048, 1);
      for (let x = 12; x <= W; x += 12) {
        for (let y = 12; y <= H; y += 12) g.fillRect(x, y, 1, 1);
      }

      // Zone rectangles + labels
      Object.entries(ZONES).forEach(([code, z]) => {
        const fillHex = Phaser.Display.Color.HexStringToColor(z.hex).color;
        const tint = this.add.rectangle(z.x, z.y, z.w, z.h, fillHex, 0.07)
          .setOrigin(0,0);
        const rect = this.add.graphics();
        rect.lineStyle(1, 0x0a4048, 1);
        rect.strokeRect(z.x, z.y, z.w, z.h);

        if (code === '?') {
          // Red diagonals pattern
          for (let i = -z.h; i < z.w; i += 6) {
            const x1 = z.x + Math.max(0, i);
            const y1 = z.y + Math.max(0, -i);
            const x2 = z.x + Math.min(z.w, i + z.h);
            const y2 = z.y + Math.min(z.h, z.h - (i + z.h - z.w));
            this.add.line(0,0, x1,y1, x2,y2, 0xE5534B, 0.15).setOrigin(0,0);
          }
        }

        this.add.text(z.x + 10, z.y + 6, `_${code}/`, {
          fontFamily: FONT, fontSize: '10px', color: z.hex,
        }).setAlpha(0.95);
        this.add.text(z.x + 10 + code.length*6 + 14, z.y + 6, z.name, {
          fontFamily: FONT, fontSize: '10px', color: COLORS.inkDim,
        });

        // Mini ASCII for this zone
        const b = NCData.BUILDINGS.find(bb => bb.code === code);
        if (b) {
          this.add.text(z.x + 14, z.y + 30, b.ascii, {
            fontFamily: FONT, fontSize: '10px', color: z.hex,
            lineSpacing: 1,
          }).setAlpha(0.55);
        }
      });

      // Agents
      NCData.AGENTS.forEach(a => {
        const z = ZONES[a.home === '?' ? '?' : a.home];
        const px = z.x + z.w/2 + (Math.random()-0.5) * (z.w*0.6);
        const py = z.y + z.h/2 + 8 + (Math.random()-0.5) * (z.h*0.4);
        const txt = this.add.text(px, py, a.glyph, {
          fontFamily: FONT, fontSize: a.red ? '32px' : '28px', color: a.hex,
        }).setOrigin(0.5, 0.5);
        const lbl = this.add.text(px, py + (a.red ? 20 : 18), a.name.toUpperCase(), {
          fontFamily: FONT, fontSize: '8px', color: COLORS.inkDim,
          letterSpacing: 1,
        }).setOrigin(0.5, 0.5);

        this.agentSprites[a.id] = {
          txt, lbl, agent: a,
          home: { x: px, y: py },
          zone: a.home === '?' ? '?' : a.home,
          wobblePhase: Math.random() * Math.PI * 2,
        };
      });

      // Engine wiring
      engine.on('intent',   (p) => this.onIntent(p));
      engine.on('commit',   (p) => this.onCommit(p));
      engine.on('reject',   (p) => this.onReject(p));
      engine.on('agent-move', (p) => this.onAgentMove(p));

      // Tick loop — run engine every 500ms
      this.time.addEvent({ delay: 500, loop: true, callback: () => engine.tick() });
    }

    update(_t, dt) {
      // Idle wobble
      const t = this.time.now / 1000;
      Object.values(this.agentSprites).forEach(s => {
        if (s.tweenActive) return;
        const dx = Math.sin(t * 0.8 + s.wobblePhase) * 3;
        const dy = Math.cos(t * 0.7 + s.wobblePhase * 1.3) * 2;
        s.txt.x = s.home.x + dx;
        s.txt.y = s.home.y + dy;
        s.lbl.x = s.home.x + dx;
        s.lbl.y = s.home.y + dy + (s.agent.red ? 20 : 18);
      });

      // Expire receipts & barriers
      const now = this.time.now;
      this.receipts = this.receipts.filter(r => {
        if (now - r.bornAt > r.duration) { r.container.destroy(); return false; }
        return true;
      });
      this.barriers = this.barriers.filter(b => {
        if (now - b.bornAt > b.duration) { b.container.destroy(); return false; }
        return true;
      });
      this.coinTrails = this.coinTrails.filter(ct => {
        if (now - ct.bornAt > ct.duration) { ct.elems.forEach(e => e.destroy()); return false; }
        return true;
      });
    }

    zoneCenter(code) {
      const z = ZONES[code] || ZONES.MKT;
      return { x: z.x + z.w/2, y: z.y + z.h/2 + 8 };
    }

    agentPos(id) {
      const s = this.agentSprites[id];
      if (!s) return this.zoneCenter('MKT');
      return { x: s.txt.x, y: s.txt.y };
    }

    onAgentMove({ id, toZone, durationMs }) {
      const s = this.agentSprites[id];
      if (!s) return;
      const target = this.zoneCenter(toZone);
      // offset slightly inside zone
      target.x += (Math.random()-0.5) * 40;
      target.y += (Math.random()-0.5) * 30;
      s.zone = toZone;
      s.tweenActive = true;
      this.tweens.add({
        targets: [s.txt, s.lbl],
        x: (tgt) => target.x,
        y: (tgt) => tgt === s.lbl ? target.y + (s.agent.red?20:18) : target.y,
        duration: durationMs,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          s.tweenActive = false;
          s.home = { x: target.x, y: target.y };
        }
      });
    }

    onIntent({ id, from, to, kind, summary, amount, judy }) {
      // Small typed bubble at sender — gold for root, silver for reply
      const fromPos = this.agentPos(from);
      const color = judy ? COLORS.red : (kind === 'offer' ? COLORS.gold : COLORS.silver);
      const bubble = this.add.container(fromPos.x + 20, fromPos.y - 24);
      const bg = this.add.rectangle(0, 0, 150, 28, 0x011E22, 1).setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(color).color);
      bg.setOrigin(0, 0);
      const head = this.add.text(6, 4, (kind === 'offer' ? '◆ OFFER' : '↘ REPLY'), {
        fontFamily: FONT, fontSize: '8px', color, letterSpacing: 1.2
      });
      const body = this.add.text(6, 16, `$${amount}`, {
        fontFamily: FONT, fontSize: '9px', color: COLORS.ink,
      });
      bubble.add([bg, head, body]);
      bubble.setAlpha(0);
      this.tweens.add({ targets: bubble, alpha: 1, duration: 120 });
      this.receipts.push({ container: bubble, bornAt: this.time.now, duration: 1500 });

      // Animate a coin trail from sender to receiver (if to is an agent id)
      const toSprite = this.agentSprites[to];
      if (toSprite) this.fireCoinTrail(fromPos, this.agentPos(to), judy ? COLORS.red : COLORS.gold);
    }

    fireCoinTrail(from, to, color) {
      const dots = [];
      const N = 5;
      for (let i = 0; i < N; i++) {
        const d = this.add.text(from.x, from.y, '$', {
          fontFamily: FONT, fontSize: '11px', color,
        }).setOrigin(0.5);
        d.setAlpha(0);
        dots.push(d);
        this.tweens.add({
          targets: d,
          x: to.x, y: to.y,
          alpha: { from: 0.9, to: 0 },
          duration: 800,
          delay: i * 80,
          ease: 'Sine.easeOut',
        });
      }
      this.coinTrails.push({ elems: dots, bornAt: this.time.now, duration: 1400 });
    }

    onCommit({ id, from, to, amount, txid }) {
      const pos = this.agentPos(to);
      const c = this.add.container(pos.x + 16, pos.y - 4);
      const bg = this.add.rectangle(0,0, 170, 58, 0x011E22, 1)
        .setStrokeStyle(1, 0xBAEABC).setOrigin(0,0);
      const pin = this.add.rectangle(0, 0, 2, 58, 0xBAEABC).setOrigin(0,0);
      const head = this.add.text(10, 6, `COMMIT · tx ${txid}`, {
        fontFamily: FONT, fontSize: '8px', color: COLORS.mint, letterSpacing: 1.2
      });
      const l1 = this.add.text(10, 20, `+ $${amount.toFixed(2)}`, {
        fontFamily: FONT, fontSize: '11px', color: COLORS.gold,
      });
      const l2 = this.add.text(10, 34, `Ⓐ${from} → Ⓐ${to}`.replace(/Ⓐ([A-J])/g, (_,id) => NCData.A[id]?.glyph || id), {
        fontFamily: FONT, fontSize: '9px', color: COLORS.ink,
      });
      const l3 = this.add.text(10, 46, 'OK', {
        fontFamily: FONT, fontSize: '9px', color: COLORS.mint,
      });
      c.add([bg, pin, head, l1, l2, l3]);
      c.setAlpha(0);
      this.tweens.add({ targets: c, alpha: 1, y: c.y - 6, duration: 180 });
      this.receipts.push({ container: c, bornAt: this.time.now, duration: 1800 });
    }

    onReject({ id, from, to, amount, txid, barrier, detail }) {
      // Center-ish on rejection site — between Judy and target building
      const judyPos = this.agentPos(from);
      const targetPos = this.zoneCenter(to);
      const cx = (judyPos.x + targetPos.x) / 2;
      const cy = (judyPos.y + targetPos.y) / 2;

      const cfg = {
        schema:    { color: COLORS.teal,  sigil:'⬡',   code:'E/SCHEMA',   title:'Schema rejection',
                     rows: [['field', detail.field], ['want', detail.want], ['got', detail.got, COLORS.red]] },
        overdraft: { color: COLORS.red,   sigil:'⊘',   code:'E/⊘',        title:'Overdraft rejection',
                     rows: [['debit', `$${detail.debit}`, COLORS.red], ['avail', `$0`], ['short', `$${detail.short}`, COLORS.red]] },
        unknown:   { color: COLORS.amber, sigil:'404', code:'E/404',      title:'Template not found',
                     rows: [['tmpl', detail.tmpl, COLORS.red], ['known', 'posting, hold'], ['hint', 'register it']] },
        seen:      { color: COLORS.lilac, sigil:'⟳',   code:'E/IDEM',     title:'Already seen',
                     rows: [['nonce', detail.nonce], ['first', `tick ${detail.first}`], ['effect', 'no-op']] },
      }[barrier];

      const c = this.add.container(cx, cy);
      c.setAngle(-1.5);

      const colorInt = Phaser.Display.Color.HexStringToColor(cfg.color).color;
      const bg = this.add.rectangle(0, 0, 260, 130, 0x011E22, 1)
        .setStrokeStyle(1.5, colorInt).setOrigin(0.5);
      const titleBar = this.add.rectangle(-130, -65, 260, 18, colorInt, 1).setOrigin(0,0);
      const titleTxt = this.add.text(-124, -62, `_CAGE/ BARRIER ENGAGED`, {
        fontFamily: FONT, fontSize: '8px', color: '#011E22', letterSpacing: 1.2
      });
      const titleCode = this.add.text(124, -62, cfg.code, {
        fontFamily: FONT, fontSize: '8px', color: '#011E22', letterSpacing: 1.2
      }).setOrigin(1, 0);

      const sigil = this.add.text(-120, -35, cfg.sigil, {
        fontFamily: FONT, fontSize: '28px', color: cfg.color,
      });
      const heading = this.add.text(-80, -32, cfg.title, {
        fontFamily: FONT, fontSize: '13px', color: COLORS.ink,
      });
      const subline = this.add.text(-80, -16, `LEDGER REFUSED · TX ${txid}`, {
        fontFamily: FONT, fontSize: '8px', color: COLORS.inkDim, letterSpacing: 1.2
      });

      const rows = cfg.rows.map((r, i) => {
        const k = this.add.text(-120, 6 + i*16, r[0].padEnd(8), {
          fontFamily: FONT, fontSize: '10px', color: COLORS.inkDim
        });
        const v = this.add.text(-56, 6 + i*16, String(r[1]), {
          fontFamily: FONT, fontSize: '10px', color: r[2] || COLORS.ink
        });
        return [k, v];
      }).flat();

      // Footer line: by Judy
      const bySig = this.add.text(-120, 54, 'by', {
        fontFamily: FONT, fontSize: '10px', color: COLORS.inkDim
      });
      const byVal = this.add.text(-56, 54, `Ⓙ Judy`, {
        fontFamily: FONT, fontSize: '10px', color: COLORS.red
      });

      c.add([bg, titleBar, titleTxt, titleCode, sigil, heading, subline, ...rows, bySig, byVal]);
      c.setScale(0.8); c.setAlpha(0);
      this.tweens.add({
        targets: c, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut'
      });
      this.barriers.push({ container: c, bornAt: this.time.now, duration: 2800 });

      // Give the whole target zone a red pulse
      const z = ZONES[to];
      if (z) {
        const pulse = this.add.rectangle(z.x, z.y, z.w, z.h, 0xE5534B, 0.18).setOrigin(0,0);
        this.tweens.add({ targets: pulse, alpha: 0, duration: 650,
          onComplete: () => pulse.destroy() });
      }
    }
  }

  return { GlyphScene, W, H };
};
