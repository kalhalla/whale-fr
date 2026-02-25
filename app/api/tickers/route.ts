import { NextResponse } from 'next/server';

const KRAKEN_URL = 'https://futures.kraken.com/derivatives/api/v3/tickers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch(KRAKEN_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Kraken API returned ${res.status}` }, { status: res.status });
    }

    const data = await res.json();

    if (data.result !== 'success') {
      return NextResponse.json({ error: 'Kraken API error' }, { status: 500 });
    }

    // Filter to perpetual futures only and build a clean map
    const tickers: Record<string, any> = {};
    for (const t of data.tickers) {
      if (t.tag !== 'perpetual') continue;
      tickers[t.symbol.toLowerCase()] = {
        symbol: t.symbol,
        pair: t.pair,
        price: t.markPrice || t.last,
        last: t.last,
        fundingRate: t.fundingRate || 0,
        fundingRatePrediction: t.fundingRatePrediction || 0,
        openInterest: t.openInterest || 0,
        volume24h: t.volumeQuote || t.vol24h || 0,
        change24h: t.change24h || 0,
        high24h: t.high24h || 0,
        low24h: t.low24h || 0,
        bid: t.bid || 0,
        ask: t.ask || 0,
        bidSize: t.bidSize || 0,
        askSize: t.askSize || 0,
        suspended: t.suspended || false,
      };
    }

    return NextResponse.json({
      success: true,
      tickers,
      serverTime: data.serverTime,
      count: Object.keys(tickers).length,
      timestamp: Date.now(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch Kraken data' },
      { status: 500 }
    );
  }
}
