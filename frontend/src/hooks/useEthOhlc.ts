import { useEffect, useMemo, useState } from "react";

import { buildCandleSeries, candlesFromOhlc } from "../components/StatCharts";
import type { CandleSeries } from "../components/StatCharts";

// ============================================================
// useEthOhlc
// Pulls real ETH/USD candles from CoinGecko — the SAME price feed
// the keeper's oracle bot samples before it pushes on-chain — so the
// chart, the oracle, and the bot all reference one source.
//
// The public /ohlc endpoint is used WITHOUT a key (days<=1 → 30-min
// candles). This is deliberate: every REACT_APP_* variable is inlined
// into the production bundle at build time, so any key referenced here
// would be readable by anyone who opens the site. The CoinGecko key
// belongs to the keeper bots alone and lives only in bots/.env, where
// it stays server-side. Do not reintroduce a key here.
//
// On any failure (rate limit, offline, CORS) we fall back to a
// deterministic path anchored to the live on-chain oracle price, so the
// panel always renders truthfully labelled data.
// ============================================================

export type OhlcStatus = "loading" | "live" | "sim";

const COINGECKO_OHLC =
  "https://api.coingecko.com/api/v3/coins/ethereum/ohlc?vs_currency=usd&days=1";

export interface EthOhlc {
  series: CandleSeries;
  status: OhlcStatus;
  source: string;
}

export function useEthOhlc(fallbackPrice: number): EthOhlc {
  const [real, setReal] = useState<CandleSeries | null>(null);
  const [status, setStatus] = useState<OhlcStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(COINGECKO_OHLC, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
        const rows = (await res.json()) as number[][];
        if (!Array.isArray(rows) || rows.length < 5) throw new Error("empty OHLC payload");
        if (!cancelled) {
          setReal(candlesFromOhlc(rows));
          setStatus("live");
        }
      } catch {
        if (!cancelled) setStatus("sim");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Anchored fallback — recomputed whenever the oracle price changes.
  const sim = useMemo(() => buildCandleSeries(fallbackPrice), [fallbackPrice]);

  const series = status === "live" && real ? real : sim;
  const source =
    status === "live"
      ? "CoinGecko ETH/USD · live"
      : status === "loading"
      ? "loading market data…"
      : "oracle-anchored simulation";

  return { series, status, source };
}

export default useEthOhlc;
