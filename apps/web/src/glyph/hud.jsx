/* global React, ReactDOM, NCData */
// Glyph City — HUD components.
// Intent board (threaded), ticker strip, top rail, bottom rail.
// These live as plain DOM, flush against the scene — NO boxes, hairlines only.

window.GCIntentBoard = function GCIntentBoard({ engine }) {
  const [threads, setThreads] = React.useState([]);
  const [flatLog, setFlatLog] = React.useState([]);

  React.useEffect(() => {
    const onIntent = ({ id, from, to, kind, summary, amount, judy, parent }) => {
      setThreads(prev => {
        const copy = [...prev];
        if (kind === 'offer') {
          copy.unshift({ id, from, to, amount, summary, replies: [], state:'open', judy });
          return copy.slice(0, 12);
        } else if (kind === 'reply') {
          const t = copy.find(x => x.id === parent);
          if (t) t.replies.push({ from, summary });
          return copy;
        }
        return prev;
      });
    };
    const onCommit = ({ id, from, to, amount, txid }) => {
      setThreads(prev => prev.map(t => t.id === id ? {...t, state:'committed', txid} : t));
      setFlatLog(prev => [{ kind:'commit', from, to, amount, txid }, ...prev].slice(0, 18));
    };
    const onReject = ({ id, from, to, amount, txid, barrier }) => {
      setThreads(prev => prev.map(t => t.id === id ? {...t, state:'rejected', txid, barrier} : t));
      setFlatLog(prev => [{ kind:'reject', from, to, amount, txid, barrier }, ...prev].slice(0, 18));
    };
    engine.on('intent', onIntent);
    engine.on('commit', onCommit);
    engine.on('reject', onReject);
    return () => {
      engine.off('intent', onIntent);
      engine.off('commit', onCommit);
      engine.off('reject', onReject);
    };
  }, [engine]);

  const getG = (id) => NCData.A[id]?.glyph || id;
  const getC = (id) => NCData.A[id]?.hex   || '#D5E1E1';

  const barrierSig = { schema:'⬡', overdraft:'⊘', unknown:'404', seen:'⟳' };
  const barrierHex = { schema:'#60D6CE', overdraft:'#E5534B', unknown:'#E8A84A', seen:'#B79BD9' };

  return (
    <div className="ib">
      <div className="ib-head">_INTENT-BOARD/</div>
      <div className="ib-threads">
        {threads.slice(0, 6).map(t => (
          <div key={t.id} className={`ib-thread ib-${t.state} ${t.judy?'ib-judy':''}`}>
            <div className="ib-root">
              <span className="ib-tag" style={{color: t.judy ? '#E5534B' : '#D4A24A'}}>
                {t.judy ? '⚠ ATTEMPT' : '◆ OFFER'}
              </span>
              <span className="ib-who" style={{color:getC(t.from)}}>
                {getG(t.from)} {t.judy?'':'→'} {t.judy?'':getG(t.to)}
              </span>
              <span className="ib-amt">${t.amount}</span>
              <div className="ib-sum">{t.summary}</div>
              {t.state === 'committed' && (
                <div className="ib-state" style={{color:'#BAEABC'}}>✓ COMMIT {t.txid}</div>
              )}
              {t.state === 'rejected' && (
                <div className="ib-state" style={{color:barrierHex[t.barrier]}}>
                  {barrierSig[t.barrier]} {t.barrier.toUpperCase()} {t.txid}
                </div>
              )}
            </div>
            {t.replies.map((r, i) => (
              <div key={i} className="ib-reply">
                <span className="ib-connector"/>
                <span className="ib-tag" style={{color:'#A6BEC0'}}>↘ REPLY</span>
                <span className="ib-who" style={{color:getC(r.from)}}>{getG(r.from)}</span>
                <div className="ib-sum">{r.summary}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="ib-log-head">_LOG/</div>
      <div className="ib-log">
        {flatLog.map((l, i) => (
          <div key={i} className="ib-log-row">
            {l.kind === 'commit' ? (
              <>
                <span style={{color:'#BAEABC'}}>✓ COMMIT {l.txid}</span>
                <span style={{color:'#7A9396'}}>{getG(l.from)}→{getG(l.to)}</span>
                <span style={{color:'#D5E1E1'}}>${l.amount}</span>
              </>
            ) : (
              <>
                <span style={{color:barrierHex[l.barrier]}}>
                  {barrierSig[l.barrier]} {(l.barrier||'').toUpperCase()} {l.txid}
                </span>
                <span style={{color:'#7A9396'}}>{getG(l.from)}→{l.to}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

window.GCTicker = function GCTicker({ engine }) {
  const [rows, setRows] = React.useState([]);
  React.useEffect(() => {
    const onCommit = ({ from, to, amount, txid }) => {
      setRows(prev => [{ kind:'commit', from, to, amount, txid }, ...prev].slice(0, 10));
    };
    const onReject = ({ from, to, amount, txid, barrier }) => {
      setRows(prev => [{ kind:'reject', from, to, amount, txid, barrier }, ...prev].slice(0, 10));
    };
    engine.on('commit', onCommit);
    engine.on('reject', onReject);
    return () => { engine.off('commit', onCommit); engine.off('reject', onReject); };
  }, [engine]);

  const getG = (id) => NCData.A[id]?.glyph || id;
  const bSig = { schema:'⬡', overdraft:'⊘', unknown:'404', seen:'⟳' };
  const bHex = { schema:'#60D6CE', overdraft:'#E5534B', unknown:'#E8A84A', seen:'#B79BD9' };

  return (
    <div className="tk">
      <div className="tk-lbl">_TICKER/</div>
      <div className="tk-rows">
        {rows.map((r, i) => (
          <div key={r.txid+'-'+i} className="tk-row">
            <span className="tk-tx">{r.txid}</span>
            <span className="tk-who">{getG(r.from)}→{typeof r.to==='string' && r.to.length===1 ? getG(r.to) : r.to}</span>
            {r.kind === 'commit'
              ? <span className="tk-amt" style={{color:'#BAEABC'}}>✓ ${r.amount}</span>
              : <span className="tk-amt" style={{color:bHex[r.barrier]||'#E5534B'}}>{bSig[r.barrier]||'⊘'} ${r.amount}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

window.GCTopRail = function GCTopRail({ engine }) {
  const [s, setS] = React.useState({ tick: 0, commits: 0, rejects: 0 });
  React.useEffect(() => {
    const fn = ({ tick, commits, rejects }) => setS({ tick, commits, rejects });
    engine.on('tick', fn);
    return () => engine.off('tick', fn);
  }, [engine]);
  return (
    <div className="tr">
      <span className="tr-brand">_NUMSCRIPT.CITY/</span>
      <span className="tr-dim">TICK {s.tick.toLocaleString()}</span>
      <span className="tr-dim">COMMIT {s.commits.toLocaleString()}</span>
      <span className="tr-red">REJECT {s.rejects.toLocaleString()}</span>
      <span className="tr-mint">● LIVE</span>
      <span className="tr-spacer"/>
      <span className="tr-dim">VAULT $482,311.00</span>
    </div>
  );
};

window.GCBottomRail = function GCBottomRail({ engine }) {
  const [s, setS] = React.useState({ commits:0, rejects:0, tick:0 });
  React.useEffect(() => {
    const fn = (p) => setS(p); engine.on('tick', fn); return () => engine.off('tick', fn);
  }, [engine]);
  const total = s.commits + s.rejects;
  const cPct = total ? (s.commits/total*100).toFixed(1) : '0.0';
  const rPct = total ? (s.rejects/total*100).toFixed(1) : '0.0';
  return (
    <div className="br">
      <span>AGENTS 10/10</span>
      <span>TX/SEC {(Math.random()*3+12).toFixed(1)}</span>
      <span style={{color:'#BAEABC'}}>COMMIT {cPct}%</span>
      <span style={{color:'#E5534B'}}>REJECT {rPct}%</span>
      <span className="br-spacer"/>
      <span>_LIVE/ · ONE TYPOGRAPHIC SURFACE</span>
    </div>
  );
};
