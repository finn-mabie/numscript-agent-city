/* global React, NCData */
// Glyph City — agent roster, building lexicon, coin-flow receipts,
// and the four barrier dialogs. All pure React markup (no SVG).

window.GCRoster = function GCRoster() {
  const { AGENTS } = NCData;
  return (
    <div className="row row--agents">
      {AGENTS.map(a => (
        <div key={a.id} className={`cell agent ${a.red ? 'agent--red' : ''}`}
             style={{ '--ac': a.hex }}>
          <span className="swatch" style={{background:a.hex}}/>
          <div className="glyph">{a.glyph}</div>
          <div className="meta">
            <span className="id">{a.name}</span>
            <span className="pair">{a.id} · {a.home}</span>
            <span className="role">{a.role.toUpperCase()} · {a.short}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

window.GCBuildings = function GCBuildings() {
  const { BUILDINGS } = NCData;
  return (
    <div className="row row--buildings">
      {BUILDINGS.map(b => (
        <div key={b.code} className="cell building" style={{'--bc': b.hex}}>
          <span className="tag">{b.code}</span>
          <pre className="ascii">{b.ascii}</pre>
          <div className="foot">
            <span className="name">{b.name}</span>
            <span className="capacity">{b.capacity}</span>
            <span className="desc">{b.desc}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

window.GCReceipts = function GCReceipts() {
  const { RECEIPTS } = NCData;
  return (
    <div className="receipts">
      {RECEIPTS.map((r, i) => (
        <div key={i} className={`receipt ${r.status==='rejected' ? 'reject':''}`}
             style={{'--ac': r.pinColor}}>
          <span className="pin"/>
          <div className="h">{r.headline}</div>
          <pre className="body">
{r.lines.map((ln, li) => (
  <React.Fragment key={li}>
    {ln.parts.map((p, pi) => (
      <span key={pi} className={p.c}>{p.t}</span>
    ))}
    {'\n'}
  </React.Fragment>
))}
          </pre>
        </div>
      ))}
    </div>
  );
};

window.GCBarriers = function GCBarriers() {
  const { BARRIERS } = NCData;
  return (
    <div className="row row--barriers">
      {BARRIERS.map(b => (
        <div key={b.key} className="cell barrier" style={{'--bc': b.hex}}>
          <pre className="dialog">
{b.lines.map((ln, i) => (
  <React.Fragment key={i}>
    <span className={ln.c||'t'}>{ln.t}</span>
    {ln.r && <span className={ln.r.c}>{ln.r.t}</span>}
    {ln.tail && <span className={ln.tail.c}>{ln.tail.t}</span>}
    {'\n'}
  </React.Fragment>
))}
          </pre>
          <div className="caption">
            <span className="name">{b.name}</span>
            <span className="code">{b.code}</span>
            <span className="notes">{b.notes}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

window.GCChromePreview = function GCChromePreview() {
  // A schematic of the full page layout — the "dissolved chrome" demo.
  // Shows: top rail, canvas, intent board on the right, activity ticker
  // on the bottom, all rendered in the same typographic grid.
  const W = 1120, H = 630;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
         style={{fontFamily:'Berkeley Mono, monospace'}}>
      <rect width={W} height={H} fill="#011E22"/>
      {/* bg dots */}
      {(() => {
        const dots=[];
        for (let x=12; x<=W; x+=20) for (let y=12; y<=H; y+=20) {
          dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r="0.55" fill="#0a4048"/>);
        }
        return dots;
      })()}

      {/* top rail */}
      <line x1="0" y1="30" x2={W} y2="30" stroke="#0a4048"/>
      <g fontSize="11" letterSpacing="1.6" fill="#7A9396">
        <text x="18" y="20" fill="#D5E1E1">_NUMSCRIPT.CITY/</text>
        <text x="220" y="20">TICK 4,412</text>
        <text x="320" y="20">COMMIT 3,108</text>
        <text x="450" y="20" fill="#E5534B">REJECT 94</text>
        <text x="560" y="20" fill="#BAEABC">● LIVE</text>
        <text x={W-180} y="20">VAULT $482,311.00</text>
      </g>

      {/* Main vertical rule — no boxes, just a hairline between canvas + intent */}
      <line x1={W-320} y1="30" x2={W-320} y2={H-54} stroke="#0a4048"/>

      {/* Canvas area label */}
      <text x="18" y="54" fontSize="10" letterSpacing="1.6" fill="#7A9396">_CANVAS/</text>

      {/* Mini village — just zone labels + a couple agents as glyphs */}
      {[
        {code:'MKT', x:60,  y:100, w:220, h:150, hex:'#D4A24A'},
        {code:'BNK', x:310, y:100, w:220, h:150, hex:'#8CB8D6'},
        {code:'POS', x:560, y:100, w:200, h:150, hex:'#60D6CE'},
        {code:'INS', x:60,  y:290, w:220, h:180, hex:'#BAEABC'},
        {code:'POL', x:310, y:290, w:220, h:180, hex:'#7FD6A8'},
        {code:'ESC', x:560, y:290, w:200, h:180, hex:'#B79BD9'},
      ].map(z => (
        <g key={z.code}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h}
                fill={`${z.hex}10`} stroke="#0a4048" strokeDasharray="2 3"/>
          <text x={z.x+12} y={z.y+16} fontSize="9" letterSpacing="1.6" fill={z.hex}>
            _{z.code}/
          </text>
        </g>
      ))}

      {/* A handful of agents scattered in */}
      {[
        {g:'Ⓐ', x:150, y:180, c:'#D4A24A'},
        {g:'Ⓕ', x:230, y:200, c:'#E8A84A'},
        {g:'Ⓓ', x:420, y:180, c:'#8CB8D6'},
        {g:'Ⓑ', x:650, y:170, c:'#60D6CE'},
        {g:'Ⓒ', x:150, y:380, c:'#BAEABC'},
        {g:'Ⓔ', x:230, y:400, c:'#B79BD9'},
        {g:'Ⓘ', x:190, y:350, c:'#C9B892'},
        {g:'Ⓗ', x:420, y:380, c:'#7FD6A8'},
        {g:'Ⓖ', x:650, y:380, c:'#F5B8C8'},
      ].map((a,i)=>(
        <g key={i}>
          <text x={a.x} y={a.y} fontSize="34" fill={a.c} textAnchor="middle">{a.g}</text>
        </g>
      ))}

      {/* Right sidebar — intent board, labelled as same typographic surface */}
      <g transform={`translate(${W-312}, 48)`}>
        <text fontSize="10" letterSpacing="1.6" fill="#7A9396">_INTENT-BOARD/</text>
        <line x1="0" y1="14" x2="292" y2="14" stroke="#0a4048"/>
        {[
          {c:'#D4A24A', l:'Ⓐ OFFER · sell 100u @ $1.20', t:'tx 4,410 · open'},
          {c:'#A6BEC0', l:'Ⓑ REPLY · take 100u', t:'tx 4,410 · matched', indent:14},
          {c:'#BAEABC', l:'✓ COMMIT 4,412', t:'Ⓐ→Ⓑ $120.00'},
          {c:'#E5534B', l:'⊘ REJECT 4,414', t:'Ⓙ→BNK overdraft'},
          {c:'#60D6CE', l:'⬡ SCHEMA 4,408', t:'Ⓙ→POS amount:string'},
          {c:'#E8A84A', l:'404 TEMPLATE 4,401', t:'Ⓙ→MKT v2.free_money'},
        ].map((it,i) => (
          <g key={i} transform={`translate(${it.indent||0}, ${40 + i*54})`}>
            <rect x="0" y="0" width={278-(it.indent||0)} height="40"
                  fill="#011E22" stroke={it.c}/>
            <text x="10" y="16" fontSize="10" letterSpacing="1.4" fill={it.c}>{it.l}</text>
            <text x="10" y="30" fontSize="10" fill="#7A9396">{it.t}</text>
          </g>
        ))}
      </g>

      {/* Bottom ticker */}
      <line x1="0" y1={H-54} x2={W} y2={H-54} stroke="#0a4048"/>
      <text x="18" y={H-40} fontSize="10" letterSpacing="1.6" fill="#7A9396">_TICKER/</text>
      {(() => {
        const entries = [
          ['4,412', 'Ⓐ→Ⓑ', '$120.00', '#BAEABC', '✓'],
          ['4,413', 'Ⓖ→ESC', '$ 42.50', '#D4A24A', '·'],
          ['4,414', 'Ⓙ→BNK', '$900.00', '#E5534B', '⊘'],
          ['4,415', 'Ⓗ→POL', '$ 88.00', '#BAEABC', '✓'],
          ['4,416', 'Ⓓ→Ⓐ',  '$210.00', '#BAEABC', '✓'],
        ];
        return entries.map((e,i) => (
          <g key={i} transform={`translate(${80 + i*200}, ${H-40})`} fontSize="10" letterSpacing="1.3">
            <text x="0" y="0" fill="#7A9396">{e[0]}</text>
            <text x="44" y="0" fill="#D5E1E1">{e[1]}</text>
            <text x="110" y="0" fill={e[3]}>{e[2]}</text>
            <text x="180" y="0" fill={e[3]}>{e[4]}</text>
          </g>
        ));
      })()}
      <line x1="0" y1={H-22} x2={W} y2={H-22} stroke="#0a4048"/>
      <text x="18" y={H-8} fontSize="9" letterSpacing="1.4" fill="#7A9396">
        LAYOUT · NO BOXES · HAIRLINES ONLY · ONE TYPOGRAPHIC SURFACE
      </text>
    </svg>
  );
};
