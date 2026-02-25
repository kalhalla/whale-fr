'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Config ────────────────────────────────────────────────
const PAIR_CONFIG = [
  { symbol: 'BTC', kraken: 'pf_xbtusd', name: 'Bitcoin' },
  { symbol: 'ETH', kraken: 'pf_ethusd', name: 'Ethereum' },
  { symbol: 'SOL', kraken: 'pf_solusd', name: 'Solana' },
  { symbol: 'XRP', kraken: 'pf_xrpusd', name: 'Ripple' },
  { symbol: 'LINK', kraken: 'pf_linkusd', name: 'Chainlink' },
  { symbol: 'DOGE', kraken: 'pf_dogeusd', name: 'Dogecoin' },
  { symbol: 'AVAX', kraken: 'pf_avaxusd', name: 'Avalanche' },
  { symbol: 'ADA', kraken: 'pf_adausd', name: 'Cardano' },
  { symbol: 'DOT', kraken: 'pf_dotusd', name: 'Polkadot' },
  { symbol: 'LTC', kraken: 'pf_ltcusd', name: 'Litecoin' },
  { symbol: 'UNI', kraken: 'pf_uniusd', name: 'Uniswap' },
  { symbol: 'ATOM', kraken: 'pf_atomusd', name: 'Cosmos' },
  { symbol: 'APT', kraken: 'pf_aptusd', name: 'Aptos' },
  { symbol: 'ARB', kraken: 'pf_arbusd', name: 'Arbitrum' },
  { symbol: 'SUI', kraken: 'pf_suiusd', name: 'Sui' },
];

const Z_THRESHOLD = 2.0;

const RISK_MODES: Record<string, { risk: number; lev: number; color: string; bg: string }> = {
  LOW: { risk: 1, lev: 3, color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  MEDIUM: { risk: 3, lev: 7, color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  HIGH: { risk: 5, lev: 10, color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  ULTRA: { risk: 10, lev: 15, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
};

// ─── Components ────────────────────────────────────────────
function Sparkline({ data, color, w = 90, h = 24 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (data.length < 2) return <div style={{ width: w, height: h }} />;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h * 0.8 - h * 0.1}`
  ).join(' ');
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
}

function Gauge({ value, size = 34 }: { value: number | null; size?: number }) {
  const v = Math.max(-4, Math.min(4, value || 0));
  const angle = -135 + ((v + 4) / 8) * 270;
  const r = size / 2 - 3, cx = size / 2, cy = size / 2;
  const rad = (angle * Math.PI) / 180;
  let color = 'rgba(255,255,255,0.1)';
  if (value !== null) {
    if (value < -Z_THRESHOLD) color = '#0dffa8';
    else if (value > Z_THRESHOLD) color = '#ff4d6a';
    else if (Math.abs(value) > 1.5) color = '#ffd93d';
  }
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1.5" />
      <line x1={cx} y1={cy} x2={cx + Math.cos(rad) * (r - 5)} y2={cy + Math.sin(rad) * (r - 5)}
        stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="1.5" fill={color} />
    </svg>
  );
}

// ─── Formatters ────────────────────────────────────────────
const fP = (p: number | null) => {
  if (!p) return '—';
  if (p >= 1000) return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  return '$' + p.toFixed(6);
};
const fV = (v: number) => {
  if (!v) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  return '$' + (v / 1e3).toFixed(0) + 'K';
};
const fF = (r: number | null) => {
  if (r === null || r === undefined || isNaN(r)) return '—';
  return (r >= 0 ? '+' : '') + (r * 100).toFixed(4) + '%';
};
const fZ = (z: number | null) => {
  if (z === null || z === undefined) return '—';
  return (z >= 0 ? '+' : '') + z.toFixed(2) + 'σ';
};

// ─── Types ─────────────────────────────────────────────────
interface PairSignal {
  symbol: string;
  name: string;
  kraken: string;
  price: number | null;
  fundingRate: number;
  fundingPrediction: number;
  openInterest: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  bid: number;
  ask: number;
  zScore: number | null;
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  signalStrength: number;
  confluence: boolean;
  hasData: boolean;
  historyCount: number;
  sparkline: number[];
}

// ─── Main Dashboard ────────────────────────────────────────
export default function Dashboard() {
  const [signals, setSignals] = useState<PairSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [riskMode, setRiskMode] = useState('HIGH');
  const [signalMode, setSignalMode] = useState<'UNION' | 'CONFLUENCE'>('UNION');
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [view, setView] = useState<'signals' | 'analytics'>('signals');
  const [refreshCount, setRefreshCount] = useState(0);
  const [zLoading, setZLoading] = useState(true);
  const [balance] = useState(5000);
  const priceHistRef = useRef<Record<string, number[]>>({});
  const zScoreCache = useRef<Record<string, number | null>>({});

  // ─── Fetch live tickers from our server-side route ─────
  const fetchTickers = useCallback(async () => {
    try {
      const res = await fetch('/api/tickers');
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error('Tickers API error');

      // Build signals from ticker data + cached Z-scores
      const hist = { ...priceHistRef.current };
      const newSignals: PairSignal[] = PAIR_CONFIG.map(pair => {
        const ticker = data.tickers[pair.kraken];
        const z = zScoreCache.current[pair.symbol] ?? null;
        const price = ticker?.price || null;

        // Accumulate sparkline
        if (price) {
          if (!hist[pair.symbol]) hist[pair.symbol] = [];
          hist[pair.symbol].push(price);
          if (hist[pair.symbol].length > 40) hist[pair.symbol].shift();
        }

        const fundingRate = ticker?.fundingRate || 0;
        let signal: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
        let signalStrength = 0;
        if (z !== null) {
          if (z < -Z_THRESHOLD) { signal = 'LONG'; signalStrength = Math.min(Math.abs(z) / 4, 1); }
          if (z > Z_THRESHOLD) { signal = 'SHORT'; signalStrength = Math.min(Math.abs(z) / 4, 1); }
        }

        const fundingExtreme = Math.abs(fundingRate) > 0.0002;
        const confluence = signal !== 'NEUTRAL' && fundingExtreme &&
          ((signal === 'LONG' && fundingRate < 0) || (signal === 'SHORT' && fundingRate > 0));

        return {
          ...pair,
          price,
          fundingRate,
          fundingPrediction: ticker?.fundingRatePrediction || 0,
          openInterest: ticker?.openInterest || 0,
          volume24h: ticker?.volume24h || 0,
          change24h: ticker?.change24h || 0,
          high24h: ticker?.high24h || 0,
          low24h: ticker?.low24h || 0,
          bid: ticker?.bid || 0,
          ask: ticker?.ask || 0,
          zScore: z,
          signal,
          signalStrength,
          confluence,
          hasData: !!ticker,
          historyCount: 0,
          sparkline: hist[pair.symbol] || [],
        };
      });

      priceHistRef.current = hist;
      setSignals(newSignals);
      setLastUpdate(Date.now());
      setError(null);
      setLoading(false);
      setRefreshCount(c => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
      setLoading(false);
    }
  }, []);

  // ─── Fetch Z-scores from our server-side route ─────────
  const fetchZScores = useCallback(async () => {
    setZLoading(true);
    try {
      const symbols = PAIR_CONFIG.map(p => p.symbol).join(',');
      const res = await fetch(`/api/funding?symbols=${symbols}&limit=100`);
      if (!res.ok) throw new Error(`Funding API returned ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error('Funding API error');

      const newZScores: Record<string, number | null> = {};
      for (const [sym, info] of Object.entries(data.data) as [string, any][]) {
        newZScores[sym] = info.zScore;
      }
      zScoreCache.current = newZScores;

      // Update signals with new Z-scores
      setSignals(prev => prev.map(s => {
        const z = newZScores[s.symbol] ?? null;
        let signal: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
        let signalStrength = 0;
        if (z !== null) {
          if (z < -Z_THRESHOLD) { signal = 'LONG'; signalStrength = Math.min(Math.abs(z) / 4, 1); }
          if (z > Z_THRESHOLD) { signal = 'SHORT'; signalStrength = Math.min(Math.abs(z) / 4, 1); }
        }
        const fundingExtreme = Math.abs(s.fundingRate) > 0.0002;
        const confluence = signal !== 'NEUTRAL' && fundingExtreme &&
          ((signal === 'LONG' && s.fundingRate < 0) || (signal === 'SHORT' && s.fundingRate > 0));

        return { ...s, zScore: z, signal, signalStrength, confluence };
      }));
    } catch (err) {
      console.error('Z-score fetch error:', err);
    }
    setZLoading(false);
  }, []);

  // ─── Effects ───────────────────────────────────────────
  useEffect(() => {
    fetchTickers();
    fetchZScores();
  }, [fetchTickers, fetchZScores]);

  useEffect(() => {
    const t = setInterval(fetchTickers, 15000);
    return () => clearInterval(t);
  }, [fetchTickers]);

  useEffect(() => {
    const t = setInterval(fetchZScores, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchZScores]);

  // ─── Derived ───────────────────────────────────────────
  const activeSignals = signals.filter(s => s.signal !== 'NEUTRAL');
  const confluenceSignals = signals.filter(s => s.confluence);
  const risk = RISK_MODES[riskMode];

  const displaySignals = signalMode === 'CONFLUENCE'
    ? signals.filter(s => s.confluence || s.signal !== 'NEUTRAL')
    : signals;

  const sortedSignals = [...displaySignals].sort((a, b) => {
    if (a.signal !== 'NEUTRAL' && b.signal === 'NEUTRAL') return -1;
    if (a.signal === 'NEUTRAL' && b.signal !== 'NEUTRAL') return 1;
    if (a.confluence && !b.confluence) return -1;
    if (!a.confluence && b.confluence) return 1;
    return Math.abs(b.zScore || 0) - Math.abs(a.zScore || 0);
  });

  // ─── Render ────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 50% at 20% 80%, rgba(0,40,80,0.12) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 85% 15%, rgba(13,255,168,0.02) 0%, transparent 60%)',
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', opacity: 0.02,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 4px)',
      }} />

      <div style={{ position: 'relative', zIndex: 2 }}>
        {/* ═══ HEADER ═══ */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', borderBottom: '1px solid rgba(13,255,168,0.06)',
          background: 'rgba(5,8,15,0.85)', backdropFilter: 'blur(16px)',
          flexWrap: 'wrap', gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ fontSize: '18px', letterSpacing: '-0.5px', fontWeight: 700 }}>
              <span style={{ color: '#0dffa8' }}>🐋</span>
              <span style={{ color: 'rgba(255,255,255,0.65)', marginLeft: '6px' }}>WHALE</span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>FR</span>
            </div>
            <div style={{ height: '18px', width: '1px', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ display: 'flex', gap: '1px' }}>
              {(['signals', 'analytics'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: '3px 12px', fontSize: '9px', textTransform: 'uppercase',
                  letterSpacing: '1.2px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: view === v ? 'rgba(13,255,168,0.06)' : 'transparent',
                  color: view === v ? '#0dffa8' : 'rgba(255,255,255,0.25)', borderRadius: '3px',
                }}>{v}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '1px', background: 'rgba(255,255,255,0.02)', borderRadius: '3px', padding: '1px' }}>
              {(['UNION', 'CONFLUENCE'] as const).map(m => (
                <button key={m} onClick={() => setSignalMode(m)} style={{
                  padding: '2px 8px', fontSize: '8px', letterSpacing: '0.8px',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: signalMode === m ? (m === 'CONFLUENCE' ? 'rgba(168,85,247,0.15)' : 'rgba(13,255,168,0.08)') : 'transparent',
                  color: signalMode === m ? (m === 'CONFLUENCE' ? '#c084fc' : '#0dffa8') : 'rgba(255,255,255,0.18)', borderRadius: '2px',
                }}>{m}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '1px', background: 'rgba(255,255,255,0.02)', borderRadius: '3px', padding: '1px' }}>
              {Object.keys(RISK_MODES).map(m => (
                <button key={m} onClick={() => setRiskMode(m)} style={{
                  padding: '2px 7px', fontSize: '8px', letterSpacing: '0.3px',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: riskMode === m ? RISK_MODES[m].bg : 'transparent',
                  color: riskMode === m ? RISK_MODES[m].color : 'rgba(255,255,255,0.18)', borderRadius: '2px',
                }}>{m}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {error ? (
                <>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#ff4d6a' }} />
                  <span style={{ fontSize: '8px', color: '#ff4d6a' }}>ERROR</span>
                </>
              ) : (
                <>
                  <div style={{
                    width: '5px', height: '5px', borderRadius: '50%', background: '#0dffa8',
                    boxShadow: '0 0 6px rgba(13,255,168,0.5)', animation: 'pulse 2s infinite',
                  }} />
                  <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.8px' }}>
                    LIVE {lastUpdate ? `· ${Math.round((Date.now() - lastUpdate) / 1000)}s` : ''}
                  </span>
                </>
              )}
              {zLoading && <span style={{ fontSize: '8px', color: '#fbbf24' }}>Z-SCORES...</span>}
            </div>
          </div>
        </header>

        {/* ═══ ERROR BANNER ═══ */}
        {error && (
          <div style={{
            padding: '10px 20px', fontSize: '11px',
            background: 'rgba(255,77,106,0.06)', borderBottom: '1px solid rgba(255,77,106,0.1)',
            color: '#fca5a5',
          }}>
            <strong>API Error:</strong> {error}
            <button onClick={fetchTickers} style={{
              marginLeft: '12px', padding: '2px 10px', fontSize: '10px',
              border: '1px solid rgba(255,77,106,0.2)', background: 'transparent',
              color: '#fca5a5', borderRadius: '3px', cursor: 'pointer', fontFamily: 'inherit',
            }}>Retry</button>
          </div>
        )}

        {/* ═══ METRICS BAR ═══ */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'rgba(255,255,255,0.008)',
        }}>
          {[
            { l: 'BALANCE', v: `£${balance.toLocaleString()}`, c: '#c8d6e5' },
            { l: 'ACTIVE SIGNALS', v: loading ? '...' : String(activeSignals.length), c: activeSignals.length > 0 ? '#ffd93d' : 'rgba(255,255,255,0.3)' },
            { l: 'CONFLUENCE', v: loading ? '...' : String(confluenceSignals.length), c: confluenceSignals.length > 0 ? '#c084fc' : 'rgba(255,255,255,0.3)' },
            { l: 'PAIRS LIVE', v: loading ? '...' : String(signals.filter(s => s.hasData).length), c: '#0dffa8' },
            { l: 'RISK', v: `${riskMode} · ${risk.risk}% @ ${risk.lev}x`, c: risk.color },
          ].map((m, i) => (
            <div key={i} style={{ padding: '10px 16px', borderRight: '1px solid rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: '7px', letterSpacing: '1.2px', color: 'rgba(255,255,255,0.15)', marginBottom: '3px' }}>{m.l}</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: m.c, letterSpacing: '-0.3px' }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* ═══ MAIN LAYOUT ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', minHeight: 'calc(100vh - 110px)' }}>
          <div style={{ padding: '16px', overflow: 'auto' }}>

            {/* Loading */}
            {loading && signals.length === 0 && (
              <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '12px' }}>
                Connecting to Kraken Futures API...
              </div>
            )}

            {view === 'signals' && (
              <>
                {/* Active signals banner */}
                {activeSignals.length > 0 && (
                  <div style={{
                    marginBottom: '12px', padding: '10px 14px',
                    background: 'rgba(13,255,168,0.03)', border: '1px solid rgba(13,255,168,0.08)',
                    borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: '8px', letterSpacing: '1.2px', color: 'rgba(13,255,168,0.4)' }}>ACTIVE</span>
                    {activeSignals.map(s => (
                      <div key={s.symbol} onClick={() => setSelectedPair(s.symbol)} style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '2px 8px', borderRadius: '3px', cursor: 'pointer',
                        background: s.confluence ? 'rgba(168,85,247,0.1)' : s.signal === 'LONG' ? 'rgba(13,255,168,0.06)' : 'rgba(255,77,106,0.06)',
                        border: `1px solid ${s.confluence ? 'rgba(168,85,247,0.2)' : s.signal === 'LONG' ? 'rgba(13,255,168,0.12)' : 'rgba(255,77,106,0.12)'}`,
                      }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: s.signal === 'LONG' ? '#0dffa8' : '#ff4d6a' }}>{s.symbol}</span>
                        <span style={{ fontSize: '8px', color: s.signal === 'LONG' ? '#0dffa880' : '#ff4d6a80' }}>{s.signal}</span>
                        <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)' }}>{fZ(s.zScore)}</span>
                        {s.confluence && <span style={{ fontSize: '7px', color: '#c084fc' }}>✦</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Signal Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: '6px' }}>
                  {sortedSignals.map(s => (
                    <div
                      key={s.symbol}
                      onClick={() => setSelectedPair(selectedPair === s.symbol ? null : s.symbol)}
                      style={{
                        background: selectedPair === s.symbol ? 'rgba(13,255,168,0.03)'
                          : s.confluence ? 'rgba(168,85,247,0.02)'
                          : s.signal !== 'NEUTRAL' ? (s.signal === 'LONG' ? 'rgba(13,255,168,0.01)' : 'rgba(255,77,106,0.01)')
                          : 'rgba(255,255,255,0.012)',
                        border: `1px solid ${
                          selectedPair === s.symbol ? 'rgba(13,255,168,0.15)'
                          : s.confluence ? 'rgba(168,85,247,0.12)'
                          : s.signal !== 'NEUTRAL' ? (s.signal === 'LONG' ? 'rgba(13,255,168,0.07)' : 'rgba(255,77,106,0.07)')
                          : 'rgba(255,255,255,0.03)'}`,
                        borderRadius: '6px', padding: '12px 14px', cursor: 'pointer',
                        transition: 'border-color 0.15s',
                        opacity: s.hasData ? 1 : 0.35,
                        animation: 'fadeIn 0.3s ease',
                      }}
                    >
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{s.symbol}</span>
                            {s.signal !== 'NEUTRAL' && (
                              <span style={{
                                fontSize: '8px', padding: '1px 5px', borderRadius: '2px', fontWeight: 600,
                                background: s.signal === 'LONG' ? 'rgba(13,255,168,0.1)' : 'rgba(255,77,106,0.1)',
                                color: s.signal === 'LONG' ? '#0dffa8' : '#ff4d6a',
                              }}>{s.signal}</span>
                            )}
                            {s.confluence && <span style={{ fontSize: '7px', color: '#c084fc', fontWeight: 600 }}>✦ CONF</span>}
                          </div>
                          <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.15)' }}>{s.name}</span>
                        </div>
                        <Gauge value={s.zScore} />
                      </div>

                      {/* Price + Sparkline */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.3px' }}>
                            {fP(s.price)}
                          </div>
                          {s.change24h !== 0 && (
                            <div style={{ fontSize: '10px', color: s.change24h >= 0 ? '#0dffa8' : '#ff4d6a' }}>
                              {s.change24h >= 0 ? '▲' : '▼'} {Math.abs(s.change24h).toFixed(2)}%
                            </div>
                          )}
                        </div>
                        <Sparkline data={s.sparkline} color={s.change24h >= 0 ? '#0dffa8' : '#ff4d6a'} />
                      </div>

                      {/* Metrics */}
                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px',
                        paddingTop: '7px', borderTop: '1px solid rgba(255,255,255,0.03)',
                      }}>
                        <div>
                          <div style={{ fontSize: '6.5px', letterSpacing: '0.8px', color: 'rgba(255,255,255,0.12)', marginBottom: '1px' }}>FUNDING</div>
                          <div style={{ fontSize: '9px', fontWeight: 600, color: s.fundingRate >= 0 ? '#ff4d6a' : '#0dffa8' }}>
                            {fF(s.fundingRate)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '6.5px', letterSpacing: '0.8px', color: 'rgba(255,255,255,0.12)', marginBottom: '1px' }}>Z-SCORE</div>
                          <div style={{
                            fontSize: '9px', fontWeight: 600,
                            color: s.zScore === null ? 'rgba(255,255,255,0.2)' : Math.abs(s.zScore) > Z_THRESHOLD ? (s.zScore < 0 ? '#0dffa8' : '#ff4d6a') : 'rgba(255,255,255,0.35)',
                          }}>{s.zScore !== null ? fZ(s.zScore) : 'loading...'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '6.5px', letterSpacing: '0.8px', color: 'rgba(255,255,255,0.12)', marginBottom: '1px' }}>VOLUME</div>
                          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>{fV(s.volume24h)}</div>
                        </div>
                      </div>

                      {/* Expanded */}
                      {selectedPair === s.symbol && s.hasData && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '9px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                            <div><span style={{ color: 'rgba(255,255,255,0.15)' }}>Open Interest: </span><span style={{ color: 'rgba(255,255,255,0.45)' }}>{fV(s.openInterest)}</span></div>
                            <div><span style={{ color: 'rgba(255,255,255,0.15)' }}>Predicted FR: </span><span style={{ color: 'rgba(255,255,255,0.45)' }}>{fF(s.fundingPrediction)}</span></div>
                            <div><span style={{ color: 'rgba(255,255,255,0.15)' }}>24h Range: </span><span style={{ color: 'rgba(255,255,255,0.45)' }}>{fP(s.low24h)} – {fP(s.high24h)}</span></div>
                            <div><span style={{ color: 'rgba(255,255,255,0.15)' }}>Bid/Ask: </span><span style={{ color: 'rgba(255,255,255,0.45)' }}>{fP(s.bid)} / {fP(s.ask)}</span></div>
                          </div>
                          {s.signal !== 'NEUTRAL' && (
                            <div style={{
                              padding: '8px 10px', borderRadius: '4px', lineHeight: 1.5,
                              background: s.signal === 'LONG' ? 'rgba(13,255,168,0.03)' : 'rgba(255,77,106,0.03)',
                              border: `1px solid ${s.signal === 'LONG' ? 'rgba(13,255,168,0.1)' : 'rgba(255,77,106,0.1)'}`,
                              color: 'rgba(255,255,255,0.4)',
                            }}>
                              <strong style={{ color: s.signal === 'LONG' ? '#0dffa8' : '#ff4d6a' }}>{s.signal}</strong>
                              {' · '}
                              {s.signal === 'LONG'
                                ? `Shorts overleveraged (Z: ${s.zScore?.toFixed(2)}σ). Negative funding = shorts paying longs.`
                                : `Longs overleveraged (Z: ${s.zScore?.toFixed(2)}σ). Positive funding = longs paying shorts.`
                              }
                              <br />
                              <span style={{ color: risk.color }}>
                                Risk: £{(balance * risk.risk / 100 * s.signalStrength).toFixed(0)}
                                {' · '}{Math.min(Math.round(risk.lev * s.signalStrength), risk.lev)}x leverage
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {view === 'analytics' && (
              <div>
                <div style={{ fontSize: '8px', letterSpacing: '1.2px', color: 'rgba(255,255,255,0.15)', marginBottom: '14px' }}>
                  FUNDING RATE ANALYSIS · LIVE DATA
                </div>
                <div style={{
                  background: 'rgba(255,255,255,0.012)', border: '1px solid rgba(255,255,255,0.03)',
                  borderRadius: '6px', overflow: 'hidden',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {['Pair', 'Price', '24h', 'Funding', 'Predicted', 'Z-Score', 'Signal', 'OI', 'Volume'].map(h => (
                          <th key={h} style={{ padding: '8px', textAlign: 'left', fontSize: '7px', letterSpacing: '0.8px', color: 'rgba(255,255,255,0.2)', fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...signals].sort((a, b) => Math.abs(b.zScore || 0) - Math.abs(a.zScore || 0)).map((s, i) => (
                        <tr key={s.symbol} style={{
                          borderBottom: '1px solid rgba(255,255,255,0.02)',
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.005)',
                          opacity: s.hasData ? 1 : 0.3,
                        }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700 }}>{s.symbol}</td>
                          <td style={{ padding: '6px 8px' }}>{fP(s.price)}</td>
                          <td style={{ padding: '6px 8px', color: s.change24h >= 0 ? '#0dffa8' : '#ff4d6a' }}>
                            {s.change24h ? `${s.change24h >= 0 ? '+' : ''}${s.change24h.toFixed(2)}%` : '—'}
                          </td>
                          <td style={{ padding: '6px 8px', color: s.fundingRate >= 0 ? '#ff4d6a' : '#0dffa8', fontWeight: 600 }}>{fF(s.fundingRate)}</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.3)' }}>{fF(s.fundingPrediction)}</td>
                          <td style={{
                            padding: '6px 8px', fontWeight: 600,
                            color: s.zScore === null ? 'rgba(255,255,255,0.15)' : Math.abs(s.zScore) > Z_THRESHOLD ? (s.zScore < 0 ? '#0dffa8' : '#ff4d6a') : 'rgba(255,255,255,0.35)',
                          }}>{fZ(s.zScore)}</td>
                          <td style={{ padding: '6px 8px' }}>
                            {s.signal !== 'NEUTRAL' ? (
                              <span style={{
                                fontSize: '8px', padding: '1px 5px', borderRadius: '2px', fontWeight: 600,
                                background: s.signal === 'LONG' ? 'rgba(13,255,168,0.1)' : 'rgba(255,77,106,0.1)',
                                color: s.signal === 'LONG' ? '#0dffa8' : '#ff4d6a',
                              }}>{s.signal}{s.confluence ? ' ✦' : ''}</span>
                            ) : <span style={{ color: 'rgba(255,255,255,0.1)' }}>—</span>}
                          </td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.25)' }}>{fV(s.openInterest)}</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.25)' }}>{fV(s.volume24h)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Z-Score Bar Chart */}
                <div style={{
                  marginTop: '16px', padding: '14px',
                  background: 'rgba(255,255,255,0.012)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px',
                }}>
                  <div style={{ fontSize: '8px', letterSpacing: '1.2px', color: 'rgba(255,255,255,0.15)', marginBottom: '10px' }}>Z-SCORE DISTRIBUTION</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                    {signals.filter(s => s.zScore !== null).sort((a, b) => (a.zScore || 0) - (b.zScore || 0)).map(s => {
                      const barH = Math.max((Math.abs(s.zScore!) / 4) * 70, 4);
                      const color = s.zScore! < -Z_THRESHOLD ? '#0dffa8' : s.zScore! > Z_THRESHOLD ? '#ff4d6a' : 'rgba(255,255,255,0.08)';
                      return (
                        <div key={s.symbol} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                          <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.2)', marginBottom: '2px' }}>{s.zScore!.toFixed(1)}</div>
                          <div style={{ width: '100%', height: barH, background: color, borderRadius: '2px 2px 0 0', opacity: 0.7 }} />
                          <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.25)', marginTop: '3px' }}>{s.symbol}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '7px', color: 'rgba(255,255,255,0.1)' }}>
                    <span>← LONG zone (Z &lt; -{Z_THRESHOLD})</span>
                    <span>SHORT zone (Z &gt; +{Z_THRESHOLD}) →</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ SIDEBAR ═══ */}
          <div style={{
            borderLeft: '1px solid rgba(255,255,255,0.03)', background: 'rgba(255,255,255,0.005)',
            padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'auto',
          }}>
            {/* Journey */}
            <div style={{
              padding: '12px', background: 'rgba(13,255,168,0.015)',
              border: '1px solid rgba(13,255,168,0.06)', borderRadius: '6px',
            }}>
              <div style={{ fontSize: '7px', letterSpacing: '1.2px', color: 'rgba(13,255,168,0.35)', marginBottom: '5px' }}>
                £5K → £100K JOURNEY
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#0dffa8', letterSpacing: '-0.5px' }}>
                  £{balance.toLocaleString()}
                </span>
                <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.15)' }}>of £100K</span>
              </div>
              <div style={{ position: 'relative', height: '4px', background: 'rgba(255,255,255,0.03)', borderRadius: '2px' }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${(balance / 100000) * 100}%`,
                  background: 'linear-gradient(90deg, #0dffa8, #0da8ff)', borderRadius: '2px',
                }} />
              </div>
            </div>

            {/* Extremes Leaderboard */}
            <div style={{
              padding: '12px', background: 'rgba(255,255,255,0.012)',
              border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px', flex: 1,
            }}>
              <div style={{ fontSize: '7px', letterSpacing: '1.2px', color: 'rgba(255,255,255,0.15)', marginBottom: '8px' }}>
                FUNDING RATE EXTREMES
              </div>
              {[...signals].filter(s => s.hasData).sort((a, b) => Math.abs(b.zScore || 0) - Math.abs(a.zScore || 0)).slice(0, 10).map((s, i) => (
                <div key={s.symbol} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '3px 0', borderBottom: i < 9 ? '1px solid rgba(255,255,255,0.02)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.1)', width: '10px' }}>{i + 1}</span>
                    <span style={{ fontSize: '10px', fontWeight: 600 }}>{s.symbol}</span>
                    {s.signal !== 'NEUTRAL' && (
                      <span style={{ fontSize: '7px', color: s.signal === 'LONG' ? '#0dffa880' : '#ff4d6a80' }}>{s.signal}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '8px', color: s.fundingRate >= 0 ? '#ff4d6a' : '#0dffa8' }}>{fF(s.fundingRate)}</span>
                    <span style={{
                      fontSize: '8px', fontWeight: 600, minWidth: '36px', textAlign: 'right',
                      color: s.zScore === null ? 'rgba(255,255,255,0.1)' : Math.abs(s.zScore) > Z_THRESHOLD ? (s.zScore < 0 ? '#0dffa8' : '#ff4d6a') : 'rgba(255,255,255,0.2)',
                    }}>{fZ(s.zScore)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Data Status */}
            <div style={{
              padding: '10px 12px', background: 'rgba(255,255,255,0.008)',
              border: '1px solid rgba(255,255,255,0.02)', borderRadius: '6px',
              fontSize: '8px', color: 'rgba(255,255,255,0.12)', lineHeight: 1.6,
            }}>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 600, marginBottom: '3px' }}>DATA SOURCES</div>
              <div>Prices: Kraken Futures (15s refresh)</div>
              <div>Z-Scores: Bybit historical (5min refresh)</div>
              <div>Window: {30} periods · Threshold: ±{Z_THRESHOLD}σ</div>
              <div style={{ marginTop: '3px', color: 'rgba(255,255,255,0.08)' }}>
                Refreshes: {refreshCount} · {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
