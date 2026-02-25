# 🐋 WHALE FR — Funding Rate Trading Dashboard

Live cryptocurrency funding rate monitoring with Z-score signal generation.

## What It Does

- **Live prices** from Kraken Futures API (15 pairs, 15-second refresh)
- **Historical Z-scores** from Bybit funding rate history (100 periods, 5-minute refresh)
- **Signal generation** when Z-score exceeds ±2.0σ (LONG/SHORT)
- **Confluence detection** when Z-score signal aligns with extreme current funding rate
- **4 risk modes** — LOW (1%/3x) through ULTRA (10%/15x)
- **UNION/CONFLUENCE** signal filtering modes

## Deploy to Vercel (30 seconds)

### Option A: Vercel CLI
```bash
npm install
npx vercel deploy --prod
```

### Option B: Push to GitHub
1. Create a new GitHub repo
2. Push these files to it
3. Import the repo in Vercel dashboard (vercel.com/new)
4. It auto-detects Next.js and deploys

No environment variables needed. Both APIs (Kraken Futures, Bybit) are public.

## Server-Side API Routes

The app proxies all external API calls through server-side routes to avoid CORS:

- `GET /api/tickers` → Kraken Futures perpetual tickers
- `GET /api/funding?symbols=BTC,ETH,SOL&limit=100` → Bybit historical funding rates + Z-score calculation

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Server-side API routes (no CORS issues)
- No external dependencies beyond Next.js
