/* global React, NCData */
// Glyph City — the hero still.
// A tight close-up on the moment Judy's overdraft attempt slams into the cage.
// Purely typographic + grid — no pixel art. Rendered as a single inline SVG for
// pixel-perfect screenshotability.

window.GCHeroStill = function GCHeroStill() {
  // Viewbox: 16:9 — the aspect of the hero frame. Coordinates are cells (12px each
  // at base; scales freely).
  const W = 960, H = 540;

  // Dotted background grid
  const gridDots = [];
  for (let x = 0; x <= W; x += 24) {
    for (let y = 0; y <= H; y += 24) {
      gridDots.push(<circle key={`d-${x}-${y}`} cx={x} cy={y} r="0.8" fill="#0a4048"/>);
    }
  }

  // ---- Compose the scene ----
  // Left third: the BNK building (dim), Dave sleeping.
  // Right third: Judy, red, arrow pointing at the vault.
  // Center: the barrier dialog, slammed down with a tiny rotation.

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
         style={{fontFamily:'Berkeley Mono, monospace'}}>
      <defs>
        <pattern id="diag" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0,6 L6,0" stroke="#E5534B" strokeOpacity="0.18" strokeWidth="1"/>
        </pattern>
        <pattern id="diagRed" width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M0,4 L4,0" stroke="#E5534B" strokeOpacity="0.45" strokeWidth="0.8"/>
        </pattern>
        <filter id="redGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="goldGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Background */}
      <rect width={W} height={H} fill="#011E22"/>
      {gridDots}

      {/* Top status strip — canvas chrome, dissolved into the grid */}
      <g fontSize="11" letterSpacing="1.6" fill="#7A9396">
        <line x1="0" y1="28" x2={W} y2="28" stroke="#0a4048" strokeWidth="1"/>
        <text x="18" y="19" fill="#D5E1E1">_NUMSCRIPT.CITY/</text>
        <text x="220" y="19">TICK 4,414</text>
        <text x="330" y="19">COMMIT 3,108</text>
        <text x="470" y="19" fill="#E5534B">REJECT 95</text>
        <text x="580" y="19" fill="#BAEABC">● LIVE</text>
        <text x={W-176} y="19">VAULT $482,311.00</text>
      </g>

      {/* Left: BNK building (labelled zone) */}
      <g transform="translate(48, 80)">
        <rect x="0" y="0" width="280" height="380" fill="rgba(140,184,214,0.04)" stroke="#0a4048" strokeDasharray="2 3"/>
        <text x="14" y="22" fontSize="10" letterSpacing="1.8" fill="#7A9396">_BNK/ BANK · VAULT</text>
        <g fontSize="16" fill="#8CB8D6" transform="translate(36, 90)">
          <text x="0" y="0">   ┌─────┐</text>
          <text x="0" y="20">  ┌┴─────┴┐</text>
          <text x="0" y="40">  │ B·A·N·K│</text>
          <text x="0" y="60">  ├─┬─┬─┬─┤</text>
          <text x="0" y="80">  │▓│▓│▓│▓│</text>
          <text x="0" y="100">  └─┴─┴─┴─┘</text>
        </g>
        {/* Dave at the bank, dim */}
        <g transform="translate(200, 230)">
          <text fontSize="44" fill="#8CB8D6" opacity="0.7">Ⓓ</text>
          <text y="20" x="-4" fontSize="9" letterSpacing="1.3" fill="#7A9396">DAVE</text>
        </g>
        {/* Vault readout */}
        <g transform="translate(14, 320)" fontSize="11" letterSpacing="0.6">
          <text y="0" fill="#7A9396">balance</text>
          <text y="0" x="100" fill="#D5E1E1">$482,311.00</text>
          <text y="18" fill="#7A9396">floor  </text>
          <text y="18" x="100" fill="#D5E1E1">$      0.00</text>
          <text y="36" fill="#7A9396">holds  </text>
          <text y="36" x="100" fill="#D5E1E1">7 open</text>
        </g>
      </g>

      {/* Right: Judy, red, scanlines */}
      <g transform="translate(660, 80)">
        <rect x="0" y="0" width="252" height="380" fill="url(#diag)" stroke="#8B3632" strokeDasharray="2 3"/>
        <text x="14" y="22" fontSize="10" letterSpacing="1.8" fill="#E5534B">_?/ UNKNOWN ORIGIN</text>
        {/* Judy glyph, big and glowing */}
        <g transform="translate(126, 190)" filter="url(#redGlow)">
          <text textAnchor="middle" fontSize="150" fill="#E5534B" y="50">Ⓙ</text>
        </g>
        <g transform="translate(14, 306)" fontSize="11" letterSpacing="0.6">
          <text y="0" fill="#E5534B">AGENT   </text>
          <text y="0" x="80" fill="#D5E1E1">Ⓙ Judy</text>
          <text y="18" fill="#E5534B">ROLE    </text>
          <text y="18" x="80" fill="#D5E1E1">red agent</text>
          <text y="36" fill="#E5534B">ATTEMPT </text>
          <text y="36" x="80" fill="#D5E1E1">debit $900 from BNK</text>
        </g>
        {/* Attack arrow — dashed, pointing into the barrier */}
        <g stroke="#E5534B" strokeWidth="1.2" fill="none">
          <path d="M 8 190 L -80 190" strokeDasharray="4 4" markerEnd="url(#redArrow)"/>
        </g>
        <defs>
          <marker id="redArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#E5534B"/>
          </marker>
        </defs>
      </g>

      {/* CENTER: the barrier dialog — the hero of the hero */}
      <g transform="translate(480, 290) rotate(-1.5)">
        {/* slam shadow */}
        <g transform="translate(6, 8)" opacity="0.25">
          <rect x="-205" y="-116" width="410" height="232" fill="url(#diagRed)"/>
        </g>
        {/* frame */}
        <rect x="-205" y="-116" width="410" height="232" fill="#011E22" stroke="#E5534B" strokeWidth="1.5"/>
        {/* corner cuts to sell "stamp" */}
        <g stroke="#E5534B" strokeWidth="2" fill="none">
          <path d="M -205 -100 L -195 -100 L -195 -116"/>
          <path d="M 205 -100 L 195 -100 L 195 -116"/>
          <path d="M -205 100 L -195 100 L -195 116"/>
          <path d="M 205 100 L 195 100 L 195 116"/>
        </g>
        {/* title bar */}
        <rect x="-205" y="-116" width="410" height="26" fill="#E5534B"/>
        <text x="-194" y="-98" fontSize="11" letterSpacing="2" fill="#011E22" fontWeight="500">
          _CAGE/ BARRIER ENGAGED
        </text>
        <text x="184" y="-98" textAnchor="end" fontSize="11" letterSpacing="2" fill="#011E22">
          E/⊘
        </text>

        {/* Big ⊘ and headline */}
        <g transform="translate(-180, -62)">
          <text fontSize="52" fill="#E5534B" filter="url(#redGlow)" y="32">⊘</text>
          <text x="70" y="8"  fontSize="22" fill="#D5E1E1" fontFamily="'Polymath Display', serif"
                letterSpacing="-0.5">Overdraft rejection</text>
          <text x="70" y="28" fontSize="11" letterSpacing="1.4" fill="#7A9396">
            LEDGER REFUSED TO COMMIT TX 4,414
          </text>
        </g>

        {/* Key/value rows */}
        <g fontSize="13" transform="translate(-180, 0)">
          {[
            ['tx',     '4,414',       '#D5E1E1'],
            ['by',     'Ⓙ Judy',     '#D5E1E1'],
            ['debit',  '$900.00',     '#E5534B'],
            ['avail',  '$  0.00',     '#D5E1E1'],
            ['short',  '$900.00',     '#E5534B'],
          ].map(([k,v,c], i) => (
            <g key={k} transform={`translate(0, ${i*20})`}>
              <text x="0"   y="0" fill="#7A9396">{k.padEnd(8)}</text>
              <text x="70"  y="0" fill={c}>{v}</text>
            </g>
          ))}
        </g>
      </g>

      {/* Intent-board thread behind the barrier — a memory of what Judy posted */}
      <g transform="translate(370, 118)" fontSize="10" letterSpacing="0.6" opacity="0.85">
        <rect x="0" y="0" width="220" height="60" fill="#011E22" stroke="#8B3632" strokeDasharray="2 2"/>
        <text x="10" y="15" fill="#E5534B" letterSpacing="1.6">INTENT · Ⓙ → BNK</text>
        <text x="10" y="32" fill="#D5E1E1">debit $900  from bnk:vault</text>
        <text x="10" y="48" fill="#7A9396">to ¤judy:wallet  <tspan fill="#E5534B">[queued]</tspan></text>
      </g>

      {/* Corner meta — the Bloomberg-y bottom rail */}
      <g fontSize="10" letterSpacing="1.6" fill="#7A9396">
        <line x1="0" y1={H-28} x2={W} y2={H-28} stroke="#0a4048"/>
        <text x="18" y={H-11}>AGENTS 10/10</text>
        <text x="130" y={H-11}>TX/SEC 14.2</text>
        <text x="240" y={H-11} fill="#BAEABC">COMMIT 99.3%</text>
        <text x="370" y={H-11} fill="#E5534B">REJECT 0.7%</text>
        <text x={W-170} y={H-11}>_HERO/ BARRIER-SLAM</text>
      </g>
    </svg>
  );
};
