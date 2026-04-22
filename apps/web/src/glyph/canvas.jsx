/* global React, NCData */
// Glyph City — canvas mid-shot. A 21:9 still of the whole village at rest.
// Purely typographic. The 6 buildings as ASCII zones, the 10 agents as circled
// letters drifting between them, one committed transaction in flight, the
// intent-board rail pinned to the right.

window.GCCanvasStill = function GCCanvasStill() {
  const W = 1260, H = 540;
  const { AGENTS, BUILDINGS } = NCData;

  // Dotted bg
  const dots = [];
  for (let x = 12; x <= W; x += 24) {
    for (let y = 12; y <= H; y += 24) {
      dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r="0.6" fill="#0a4048"/>);
    }
  }

  // Zone layout — 3 cols × 2 rows of building zones; 850px wide, 400px tall.
  const zones = {
    MKT: { x: 40,  y: 60,  w: 260, h: 170 },
    BNK: { x: 320, y: 60,  w: 260, h: 170 },
    POS: { x: 600, y: 60,  w: 260, h: 170 },
    INS: { x: 40,  y: 250, w: 260, h: 170 },
    POL: { x: 320, y: 250, w: 260, h: 170 },
    ESC: { x: 600, y: 250, w: 260, h: 170 },
  };

  // Agent positions — hand-placed inside zones, with a couple walking between.
  const agentPos = {
    A: { x: 110, y: 180, zone:'MKT' },
    F: { x: 220, y: 200, zone:'MKT' },
    D: { x: 430, y: 180, zone:'BNK' },
    B: { x: 720, y: 100, zone:'POS' },     // Bob, in motion
    C: { x: 130, y: 370, zone:'INS' },
    E: { x: 230, y: 390, zone:'INS' },
    I: { x: 180, y: 340, zone:'INS' },
    H: { x: 450, y: 370, zone:'POL' },
    G: { x: 720, y: 370, zone:'ESC' },
    J: { x: 960, y: 300, zone:'?' },       // Judy, lurking off-grid
  };

  const getAgent = (id) => AGENTS.find(a => a.id === id);

  // Bob's coin trail — a path from MKT (Alice) to POS (towards Escrow).
  const trailPts = [
    [170, 190],[220, 170],[290, 150],[370, 130],[450, 120],[530, 110],[610, 105],[700, 100]
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
         style={{fontFamily:'Berkeley Mono, monospace'}}>
      <defs>
        <filter id="cg-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <pattern id="cg-diagRed" width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M0,4 L4,0" stroke="#E5534B" strokeOpacity="0.3" strokeWidth="0.7"/>
        </pattern>
      </defs>

      <rect width={W} height={H} fill="#011E22"/>
      {dots}

      {/* Top rail */}
      <line x1="0" y1="26" x2={W} y2="26" stroke="#0a4048"/>
      <g fontSize="10" letterSpacing="1.4" fill="#7A9396">
        <text x="16" y="17" fill="#D5E1E1">_NUMSCRIPT.CITY/</text>
        <text x="200" y="17">TICK 4,092</text>
        <text x="290" y="17">COMMIT 3,014</text>
        <text x="400" y="17" fill="#E5534B">REJECT 88</text>
        <text x="500" y="17" fill="#BAEABC">● LIVE</text>
        <text x="900" y="17" fill="#7A9396">INTENT-BOARD →</text>
      </g>

      {/* --- Building zones + ASCII --- */}
      {BUILDINGS.map(b => {
        const z = zones[b.code];
        return (
          <g key={b.code} transform={`translate(${z.x}, ${z.y})`}>
            <rect x="0" y="0" width={z.w} height={z.h}
                  fill={`${b.hex}14`} stroke="#0a4048" strokeDasharray="2 3"/>
            <text x="10" y="16" fontSize="9" letterSpacing="1.6" fill={b.hex}>
              _{b.code}/
            </text>
            <text x="40" y="16" fontSize="9" letterSpacing="1.4" fill="#7A9396">
              {b.name.toUpperCase()}
            </text>
            {/* Mini ASCII — pulled from data, shrunk */}
            <g fontSize="10" fill={b.hex} opacity="0.75"
               transform="translate(14, 44)">
              {b.ascii.split('\n').map((ln, i) => (
                <text key={i} y={i*11} xmlSpace="preserve">{ln}</text>
              ))}
            </g>
          </g>
        );
      })}

      {/* --- Coin-flow trail (Alice → Bob, marching dots) --- */}
      <g>
        {trailPts.map((p,i) => (
          <text key={i} x={p[0]} y={p[1]} fontSize="12" fill="#D4A24A"
                opacity={0.35 + i*0.09} textAnchor="middle">$</text>
        ))}
      </g>

      {/* --- Agents --- */}
      {Object.entries(agentPos).map(([id, p]) => {
        const a = getAgent(id);
        const red = a.red;
        return (
          <g key={id} transform={`translate(${p.x}, ${p.y})`}>
            {red && (
              <rect x="-32" y="-30" width="64" height="60" fill="url(#cg-diagRed)"/>
            )}
            <text fontSize={red ? 46 : 38} fill={a.hex} filter="url(#cg-glow)"
                  textAnchor="middle" y="4">{a.glyph}</text>
            <text fontSize="9" letterSpacing="1.2" fill="#7A9396"
                  textAnchor="middle" y={red ? 44 : 36}>
              {a.name.toUpperCase()}
            </text>
          </g>
        );
      })}

      {/* --- Amount plate mid-flight --- */}
      <g transform="translate(560, 92)">
        <rect x="-36" y="-12" width="72" height="22" fill="#011E22" stroke="#D4A24A"/>
        <text x="0" y="3" fontSize="11" fill="#D4A24A" textAnchor="middle" letterSpacing="0.5">
          $120.00
        </text>
      </g>

      {/* --- A barrier stamp pending over Judy, tiny --- */}
      <g transform="translate(960, 260) rotate(-2)">
        <rect x="-58" y="-14" width="116" height="28" fill="#011E22" stroke="#E5534B"/>
        <text x="0" y="5" fontSize="10" fill="#E5534B" textAnchor="middle" letterSpacing="1.6">
          ⊘ OVERDRAFT
        </text>
      </g>

      {/* --- Intent board (right sidebar, flush to right edge) --- */}
      <g transform={`translate(${W-300}, 50)`} fontSize="10">
        <rect x="0" y="0" width="280" height={H-80} fill="#011E22" stroke="#0a4048"/>
        <text x="14" y="18" fontSize="10" letterSpacing="1.6" fill="#D5E1E1">
          _INTENT-BOARD/
        </text>
        <line x1="0" y1="28" x2="280" y2="28" stroke="#0a4048"/>

        {/* Root offer from Alice — gold border */}
        <g transform="translate(14, 42)">
          <rect x="0" y="0" width="252" height="60" fill="#011E22" stroke="#D4A24A"/>
          <text x="10" y="15" fill="#D4A24A" letterSpacing="1.4">Ⓐ ALICE · OFFER</text>
          <text x="10" y="32" fill="#D5E1E1">sell 100u @ $1.20</text>
          <text x="10" y="48" fill="#7A9396">tx 4,410 · open</text>
        </g>

        {/* Reply from Bob — silver, thread line */}
        <line x1="26" y1="102" x2="26" y2="122" stroke="#A6BEC0" strokeDasharray="2 2"/>
        <g transform="translate(26, 118)">
          <rect x="0" y="0" width="240" height="50" fill="#011E22" stroke="#A6BEC0"/>
          <text x="10" y="15" fill="#A6BEC0" letterSpacing="1.4">Ⓑ BOB · REPLY</text>
          <text x="10" y="32" fill="#D5E1E1">take 100u · deliver</text>
        </g>

        {/* Committed line */}
        <g transform="translate(14, 190)">
          <text x="0"  y="0" fill="#BAEABC" letterSpacing="1.4">✓ COMMIT 4,412</text>
          <text x="0"  y="16" fill="#7A9396">Ⓐ→Ⓑ  $120.00</text>
        </g>

        {/* Rejected line */}
        <g transform="translate(14, 240)">
          <text x="0"  y="0" fill="#E5534B" letterSpacing="1.4">⊘ REJECT 4,414</text>
          <text x="0"  y="16" fill="#7A9396">Ⓙ→BNK  OVERDRAFT</text>
        </g>

        {/* Schema reject */}
        <g transform="translate(14, 290)">
          <text x="0"  y="0" fill="#60D6CE" letterSpacing="1.4">⬡ SCHEMA 4,408</text>
          <text x="0"  y="16" fill="#7A9396">Ⓙ→POS  amount:string</text>
        </g>

        {/* 404 */}
        <g transform="translate(14, 340)">
          <text x="0"  y="0" fill="#E8A84A" letterSpacing="1.4">404 TEMPLATE 4,401</text>
          <text x="0"  y="16" fill="#7A9396">Ⓙ→MKT  v2.free_money</text>
        </g>

        {/* Already-seen */}
        <g transform="translate(14, 390)">
          <text x="0"  y="0" fill="#B79BD9" letterSpacing="1.4">⟳ ALREADY-SEEN</text>
          <text x="0"  y="16" fill="#7A9396">Ⓙ→BNK  nonce 0xa7c3…</text>
        </g>
      </g>

      {/* Bottom rail */}
      <line x1="0" y1={H-22} x2={W} y2={H-22} stroke="#0a4048"/>
      <g fontSize="9" letterSpacing="1.4" fill="#7A9396">
        <text x="16" y={H-8}>AGENTS 10/10</text>
        <text x="120" y={H-8}>TX/SEC 14.2</text>
        <text x="220" y={H-8} fill="#BAEABC">COMMIT 99.3%</text>
        <text x="340" y={H-8} fill="#E5534B">REJECT 0.7%</text>
        <text x={W-220} y={H-8}>_CANVAS/ MID-SHOT · VILLAGE AT REST</text>
      </g>
    </svg>
  );
};
