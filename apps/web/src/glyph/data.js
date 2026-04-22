/* global React */
// Glyph City — data layer
// Agents, buildings, barriers, receipts. No JSX here — just plain data.

window.NCData = (function(){

  // Agent signature hues (map to CSS vars in styles.css, but also mirrored here
  // so inline SVGs can use the literal hex).
  const A = {
    A: { id:'A', glyph:'Ⓐ', name:'Alice',    role:'Market-maker',     short:'posts & clears quotes',          hex:'#D4A24A', var:'--a-alice', home:'MKT' },
    B: { id:'B', glyph:'Ⓑ', name:'Bob',      role:'Courier',          short:'moves postings end-to-end',      hex:'#60D6CE', var:'--a-bob',   home:'POS' },
    C: { id:'C', glyph:'Ⓒ', name:'Carol',    role:'Inspector',        short:'audits schemas before commit',   hex:'#BAEABC', var:'--a-carol', home:'INS' },
    D: { id:'D', glyph:'Ⓓ', name:'Dave',     role:'Lender',           short:'underwrites, holds collateral',  hex:'#8CB8D6', var:'--a-dave',  home:'BNK' },
    E: { id:'E', glyph:'Ⓔ', name:'Eve',      role:'Researcher',       short:'probes & publishes findings',    hex:'#B79BD9', var:'--a-eve',   home:'INS' },
    F: { id:'F', glyph:'Ⓕ', name:'Frank',    role:'Writer',           short:'drafts offers, settles copy',    hex:'#E8A84A', var:'--a-frank', home:'MKT' },
    G: { id:'G', glyph:'Ⓖ', name:'Grace',    role:'Illustrator',      short:'delivers artifacts to escrow',   hex:'#F5B8C8', var:'--a-grace', home:'ESC' },
    H: { id:'H', glyph:'Ⓗ', name:'Heidi',    role:'Pool-keeper',      short:'rebalances the liquidity pool',  hex:'#7FD6A8', var:'--a-heidi', home:'POL' },
    I: { id:'I', glyph:'Ⓘ', name:'Ivan',     role:'Disputant',        short:'files & pursues disputes',       hex:'#C9B892', var:'--a-ivan',  home:'INS' },
    J: { id:'J', glyph:'Ⓙ', name:'Judy',     role:'Red agent',        short:'probes for cage weaknesses',     hex:'#E5534B', var:'--a-judy',  home:'?',   red:true },
  };

  const AGENTS = ['A','B','C','D','E','F','G','H','I','J'].map(k => A[k]);

  // Buildings — ASCII art + tint hue + code + description.
  // ASCII is intentionally small (≤6 rows), built from: ╭╮╰╯│─═║╔╗╚╝█▓▒░┼┬┴├┤
  const BUILDINGS = [
    {
      code: 'MKT',
      name: 'Market',
      hex:  '#D4A24A',
      desc: 'Open order book. Alice & Frank post here.',
      capacity: 'Cap 40 open',
      ascii:
`╔═══════════╗
║ $ │ $ │ $ ║
╠═══╪═══╪═══╣
║ ¢ │ ¢ │ ¢ ║
╚═══╧═══╧═══╝`
    },
    {
      code: 'BNK',
      name: 'Bank',
      hex:  '#8CB8D6',
      desc: 'Custody, rails, fiat ramps. Dave lives upstairs.',
      capacity: 'Vault $482,311.00',
      ascii:
`   ┌─────┐
  ┌┴─────┴┐
  │ B·A·N·K│
  ├─┬─┬─┬─┤
  │▓│▓│▓│▓│
  └─┴─┴─┴─┘`
    },
    {
      code: 'POS',
      name: 'Post Office',
      hex:  '#60D6CE',
      desc: 'Message relay for intents + replies. Bob stages here.',
      capacity: 'Queue 12',
      ascii:
`┌──────────┐
│ ▢ ▢ ▢ ▢ │
│  ↘  POST │
│   ╲      │
└──┬───┬───┘
   │ ✉ │    `
    },
    {
      code: 'INS',
      name: 'Inspector Kiosk',
      hex:  '#BAEABC',
      desc: 'Schema & policy checks. Carol presides.',
      capacity: '1-of-3 quorum',
      ascii:
`  ┌─────┐
  │ ?   │
  │  ✓  │
  │   ✗ │
 ─┴─────┴─
 │       │`
    },
    {
      code: 'POL',
      name: 'Liquidity Pool',
      hex:  '#7FD6A8',
      desc: 'Two-sided reserve. Heidi rebalances every 60 ticks.',
      capacity: '≈ 280k units',
      ascii:
`┌─────────────┐
│≈≈≈ ◎ ≈≈≈ ◎ ≈│
│≈ ◎ ≈≈≈ ◎ ≈≈│
│≈≈≈ ◎ ≈≈≈ ◎ ≈│
└─────────────┘`
    },
    {
      code: 'ESC',
      name: 'Escrow Vault',
      hex:  '#B79BD9',
      desc: 'Conditional holds. Grace delivers, Ivan disputes.',
      capacity: '7 holds open',
      ascii:
`╔═══════════╗
║ █████████ ║
║ █ LOCK  █ ║
║ █  ⎔    █ ║
║ █████████ ║
╚═══════════╝`
    },
  ];

  // Three coin-flow receipts — committed, in-flight, rejected
  const RECEIPTS = [
    {
      status: 'committed',
      pinColor: '#BAEABC',
      headline: 'COMMIT · Tx 4412',
      lines: [
        { parts: [ {t:'+ $120.00', c:'amt'} ] },
        { parts: [ {t:'from ', c:'dim'}, {t:'Ⓐ Alice', c:'from'} ] },
        { parts: [ {t:'→ ',    c:'dim'}, {t:'Ⓑ Bob',   c:'to'} ] },
        { parts: [ {t:'commit ', c:'dim'}, {t:'4,412  ', c:'tx'}, {t:'OK', c:'ok'} ] },
      ]
    },
    {
      status: 'inflight',
      pinColor: '#D4A24A',
      headline: 'POSTING · Tx 4413',
      lines: [
        { parts: [ {t:'+ $ 42.50', c:'amt'} ] },
        { parts: [ {t:'from ', c:'dim'}, {t:'Ⓖ Grace', c:'from'} ] },
        { parts: [ {t:'→ ',    c:'dim'}, {t:'ESC-vault', c:'to'} ] },
        { parts: [ {t:'hold  ', c:'dim'}, {t:'4,413  ', c:'tx'}, {t:'⋯', c:'dim'} ] },
      ]
    },
    {
      status: 'rejected',
      pinColor: '#E5534B',
      headline: 'REJECT · Tx 4414',
      lines: [
        { parts: [ {t:'– $900.00', c:'bad'} ] },
        { parts: [ {t:'from ', c:'dim'}, {t:'Ⓙ Judy',  c:'from'} ] },
        { parts: [ {t:'→ ',    c:'dim'}, {t:'BNK-vault', c:'to'} ] },
        { parts: [ {t:'reject ', c:'dim'}, {t:'4,414  ', c:'tx'}, {t:'OVERDRAFT', c:'bad'} ] },
      ]
    },
  ];

  // Four barrier dialogs — schema, overdraft, unknown, already-seen
  const BARRIERS = [
    {
      key:'schema',
      name:'Schema barrier',
      code:'E/SCHEMA',
      hex:'#60D6CE',
      notes:'Raised when a posting does not parse against the declared template. Inspector kiosk (Carol) issues.',
      lines: [
        { t: '┌─ CAGE ─────────────────────────┐', c:'t' },
        { t: '│  ⬡  SCHEMA REJECTION           │', c:'t' },
        { t: '│                                │', c:'t' },
        { t: '│  tx     ', c:'lbl', r: { t:'4,414', c:'val' }, tail:{t:'                  │',c:'t'} },
        { t: '│  by     ', c:'lbl', r: { t:'Ⓙ Judy', c:'val' }, tail:{t:'                 │',c:'t'} },
        { t: '│  field  ', c:'lbl', r: { t:'amount', c:'val' }, tail:{t:'                 │',c:'t'} },
        { t: '│  want   ', c:'lbl', r: { t:'uint64', c:'val' }, tail:{t:'                 │',c:'t'} },
        { t: '│  got    ', c:'lbl', r: { t:'string "lots"', c:'bad' }, tail:{t:'          │',c:'t'} },
        { t: '└────────────────────────────────┘', c:'t' },
      ]
    },
    {
      key:'overdraft',
      name:'Overdraft barrier',
      code:'E/⊘',
      hex:'#E5534B',
      notes:'Raised when a posting would drive a source account below zero. Ledger refuses to commit.',
      lines: [
        { t: '┌─ CAGE ─────────────────────────┐', c:'t' },
        { t: '│  ⊘  OVERDRAFT REJECTION        │', c:'t' },
        { t: '│                                │', c:'t' },
        { t: '│  tx     ', c:'lbl', r: { t:'4,414', c:'val' }, tail:{t:'                  │',c:'t'} },
        { t: '│  by     ', c:'lbl', r: { t:'Ⓙ Judy', c:'val' }, tail:{t:'                 │',c:'t'} },
        { t: '│  debit  ', c:'lbl', r: { t:'$900.00', c:'bad' }, tail:{t:'                │',c:'t'} },
        { t: '│  avail  ', c:'lbl', r: { t:'$  0.00', c:'val' }, tail:{t:'                │',c:'t'} },
        { t: '│  short  ', c:'lbl', r: { t:'$900.00', c:'bad' }, tail:{t:'                │',c:'t'} },
        { t: '└────────────────────────────────┘', c:'t' },
      ]
    },
    {
      key:'unknown',
      name:'Unknown template',
      code:'E/404',
      hex:'#E8A84A',
      notes:'Raised when the posting names a template the ledger does not know. No implicit templates.',
      lines: [
        { t: '┌─ CAGE ─────────────────────────┐', c:'t' },
        { t: '│  404  TEMPLATE NOT FOUND       │', c:'t' },
        { t: '│                                │', c:'t' },
        { t: '│  tx     ', c:'lbl', r: { t:'4,414', c:'val' }, tail:{t:'                  │',c:'t'} },
        { t: '│  by     ', c:'lbl', r: { t:'Ⓙ Judy', c:'val' }, tail:{t:'                 │',c:'t'} },
        { t: '│  tmpl   ', c:'lbl', r: { t:'v2.free_money', c:'bad' }, tail:{t:'          │',c:'t'} },
        { t: '│  known  ', c:'lbl', r: { t:'posting, hold, clear', c:'val' }, tail:{t:'    │',c:'t'} },
        { t: '│  hint   ', c:'lbl', r: { t:'register via Inspector', c:'val' }, tail:{t:'  │',c:'t'} },
        { t: '└────────────────────────────────┘', c:'t' },
      ]
    },
    {
      key:'seen',
      name:'Already-seen',
      code:'E/IDEM',
      hex:'#B79BD9',
      notes:'Raised when a posting reuses a nonce that already committed. Idempotency keeps replays harmless.',
      lines: [
        { t: '┌─ CAGE ─────────────────────────┐', c:'t' },
        { t: '│  ⟳  ALREADY SEEN               │', c:'t' },
        { t: '│                                │', c:'t' },
        { t: '│  tx     ', c:'lbl', r: { t:'4,414', c:'val' }, tail:{t:'                  │',c:'t'} },
        { t: '│  by     ', c:'lbl', r: { t:'Ⓙ Judy', c:'val' }, tail:{t:'                 │',c:'t'} },
        { t: '│  nonce  ', c:'lbl', r: { t:'0xa7c3…f19', c:'val' }, tail:{t:'              │',c:'t'} },
        { t: '│  first  ', c:'lbl', r: { t:'tick 4,301', c:'val' }, tail:{t:'              │',c:'t'} },
        { t: '│  effect ', c:'lbl', r: { t:'no-op', c:'val' }, tail:{t:'                  │',c:'t'} },
        { t: '└────────────────────────────────┘', c:'t' },
      ]
    },
  ];

  return { AGENTS, BUILDINGS, RECEIPTS, BARRIERS, A };
})();
