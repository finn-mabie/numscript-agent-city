/* global Phaser, NCData */
// Glyph City — engine
// Pure model layer. No rendering.
// Exposes: NCEngine.create({ seed }) → { state, tick(), on(event, fn), off() }
//
// Events emitted:
//   'intent'         { id, from, to, kind: 'offer'|'reply', amount, summary, parent? }
//   'commit'         { id, from, to, amount, txid }
//   'reject'         { id, from, to, amount, txid, barrier: 'schema'|'overdraft'|'unknown'|'seen', detail }
//   'agent-move'     { id, fromZone, toZone, durationMs }
//   'tick'           { tick, commits, rejects }

window.NCEngine = (function () {
  const ZONES = ['MKT','BNK','POS','INS','POL','ESC'];

  function mulberry32(seed){
    return function(){
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = seed;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function create(opts) {
    const rand = mulberry32(opts?.seed ?? 42);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const chance = (p) => rand() < p;

    const listeners = {};
    const on = (ev, fn) => { (listeners[ev] ||= new Set()).add(fn); };
    const off = (ev, fn) => { listeners[ev]?.delete(fn); };
    const emit = (ev, payload) => { listeners[ev]?.forEach(fn => fn(payload)); };

    const state = {
      tick: 0,
      commits: 0,
      rejects: 0,
      txCounter: 4400,
      vaultBalance: 482311,
      poolBalance: 280000,
      openOffers: [],         // [{ id, from, amount, price, summary }]
      seenNonces: new Set(),
      agentZones: {},         // id → zone
      // pool of intent threads for the intent-board UI
      threads: [],
    };

    // Seed agent zones
    for (const a of NCData.AGENTS) {
      state.agentZones[a.id] = a.home === '?' ? '?' : a.home;
    }

    // Agents occasionally move to another zone (committed-path)
    function maybeMoveAgent() {
      const a = pick(NCData.AGENTS);
      if (a.red) return;
      const curr = state.agentZones[a.id];
      const candidates = ZONES.filter(z => z !== curr);
      const next = pick(candidates);
      state.agentZones[a.id] = next;
      emit('agent-move', { id: a.id, fromZone: curr, toZone: next, durationMs: 1100 });
    }

    // Generate a benign transaction between two normal agents
    function runBenignTransaction() {
      const from = pick(NCData.AGENTS.filter(a => !a.red));
      let to = pick(NCData.AGENTS.filter(a => a.id !== from.id && !a.red));
      const amount = Math.round(20 + rand() * 280);
      const txid = ++state.txCounter;
      const id = `tx-${txid}`;

      // Emit an offer first, then a reply (thread), then commit.
      const thread = {
        id,
        rootIntent: { kind:'offer', from: from.id, to: to.id, amount,
                      summary: `sell ${Math.round(amount/1.2)}u @ $${(1.2).toFixed(2)}` },
        reply:      { kind:'reply', from: to.id, to: from.id, amount,
                      summary: `take ${Math.round(amount/1.2)}u · deliver` },
        state: 'open'
      };
      state.threads.unshift(thread);
      if (state.threads.length > 40) state.threads.length = 40;

      emit('intent', { id, from: from.id, to: to.id, kind:'offer', amount,
                       summary: thread.rootIntent.summary });
      setTimeout(() => {
        emit('intent', { id, from: to.id, to: from.id, kind:'reply', amount,
                         summary: thread.reply.summary, parent: id });
        setTimeout(() => {
          thread.state = 'committed';
          state.commits++;
          emit('commit', { id, from: from.id, to: to.id, amount, txid });
        }, 350);
      }, 220);
    }

    // Generate a Judy attack biased toward overdraft
    function runJudyAttack() {
      const judy = NCData.A.J;
      const r = rand();
      // Weights: overdraft 0.5, schema 0.22, unknown 0.16, seen 0.12
      let barrier;
      if (r < 0.50) barrier = 'overdraft';
      else if (r < 0.72) barrier = 'schema';
      else if (r < 0.88) barrier = 'unknown';
      else barrier = 'seen';

      const txid = ++state.txCounter;
      const id = `tx-${txid}`;
      let amount = 0, detail = {}, to = 'BNK';

      if (barrier === 'overdraft') {
        amount = 900 + Math.floor(rand() * 1400);
        to = pick(['BNK','POL','ESC']);
        detail = { debit: amount, avail: 0, short: amount };
      } else if (barrier === 'schema') {
        amount = 120;
        to = pick(['POS','MKT']);
        detail = { field:'amount', want:'uint64', got:'string "lots"' };
      } else if (barrier === 'unknown') {
        amount = 50;
        to = pick(['MKT','POS','POL']);
        detail = { tmpl: pick(['v2.free_money','v9.backdoor','draft.sudo_credit']) };
      } else {
        amount = 220;
        to = pick(['BNK','ESC']);
        detail = { nonce:'0xa7c3…f19', first: 4301 };
      }

      // Show the queued intent briefly, then slam the barrier
      emit('intent', { id, from: judy.id, to, kind:'offer', amount,
                       summary: `debit $${amount.toFixed(2)}  from ${to.toLowerCase()}:vault`,
                       judy: true });
      setTimeout(() => {
        state.rejects++;
        emit('reject', { id, from: judy.id, to, amount, txid, barrier, detail });
      }, 260);
    }

    function tickOnce() {
      state.tick++;

      // Medium cadence: ~1 tx/sec. Tick runs every 500ms, so ~50% per tick.
      if (chance(0.50)) runBenignTransaction();

      // 1 agent move every ~4 ticks
      if (chance(0.25)) maybeMoveAgent();

      // Judy attack every ~10s → tick runs every 500ms → 5% per tick.
      if (chance(0.055)) runJudyAttack();

      emit('tick', { tick: state.tick, commits: state.commits, rejects: state.rejects });
    }

    return { state, tick: tickOnce, on, off };
  }

  return { create };
})();
