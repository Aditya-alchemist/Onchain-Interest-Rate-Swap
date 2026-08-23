import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * ============================================================
 * usePortfolioHistory
 * ============================================================
 *
 * There is no on-chain time series to read for a wallet's portfolio — the
 * contracts only store current state. So instead of inventing a fake history,
 * this hook RECORDS the real values every time the shared protocol store
 * finishes a read (every 15s while the tab is visible, plus after every
 * transaction) and persists them to localStorage.
 *
 * The result is a genuine history of what this wallet actually held, built up
 * across sessions. Every point on the portfolio charts is a value that was
 * really read from Sepolia at that timestamp — nothing is simulated.
 */

const STORAGE_PREFIX = "hedgefi.portfolio.history.v1";
const MAX_SAMPLES = 288; // ~24h at one sample per 5 minutes
const MIN_GAP_MS = 45_000; // don't spam a point on every 15s poll
const MATERIAL_DELTA = 0.01; // but always record a real balance change

export interface PortfolioSample {
  /** ms epoch when these values were read from chain. */
  t: number;
  wallet: number;
  supplied: number;
  escrow: number;
  collateral: number;
  debt: number;
  net: number;
  eth: number;
  /** Health factor in percent (0 when there is no loan). */
  hf: number;
}

export interface PortfolioHistoryInput {
  address?: string;
  /** Timestamp of the last successful read — the trigger for sampling. */
  lastUpdated: number;
  wallet: number;
  supplied: number;
  escrow: number;
  collateral: number;
  debt: number;
  net: number;
  eth: number;
  hf: number;
}

/**
 * A sample plus its x-axis label. Deliberately a type alias of a plain object
 * type rather than `PortfolioSample & { label }` — recharts props accept
 * `Record<string, any>`, and TypeScript only grants an implicit index signature
 * to object-literal types, not to interfaces.
 */
export type PortfolioRow = {
  t: number;
  wallet: number;
  supplied: number;
  escrow: number;
  collateral: number;
  debt: number;
  net: number;
  eth: number;
  hf: number;
  label: string;
};

function storageKey(address?: string): string {
  return `${STORAGE_PREFIX}:${(address || "anon").toLowerCase()}`;
}

function load(address?: string): PortfolioSample[] {
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.t === "number" && Number.isFinite(s.t))
      .map((s) => ({
        t: s.t,
        wallet: Number(s.wallet) || 0,
        supplied: Number(s.supplied) || 0,
        escrow: Number(s.escrow) || 0,
        collateral: Number(s.collateral) || 0,
        debt: Number(s.debt) || 0,
        net: Number(s.net) || 0,
        eth: Number(s.eth) || 0,
        hf: Number(s.hf) || 0,
      }))
      .slice(-MAX_SAMPLES);
  } catch {
    return [];
  }
}

function save(address: string | undefined, samples: PortfolioSample[]): void {
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(samples.slice(-MAX_SAMPLES)));
  } catch {
    /* quota or private mode — the charts still work for this session */
  }
}

/** Did anything the user would notice actually move? */
function changed(a: PortfolioSample, b: PortfolioHistoryInput): boolean {
  return (
    Math.abs(a.wallet - b.wallet) > MATERIAL_DELTA ||
    Math.abs(a.supplied - b.supplied) > MATERIAL_DELTA ||
    Math.abs(a.escrow - b.escrow) > MATERIAL_DELTA ||
    Math.abs(a.debt - b.debt) > MATERIAL_DELTA ||
    Math.abs(a.collateral - b.collateral) > MATERIAL_DELTA
  );
}

export function usePortfolioHistory(input: PortfolioHistoryInput) {
  const { address, lastUpdated } = input;

  const [samples, setSamples] = useState<PortfolioSample[]>(() => load(address));

  // Reload the right bucket when the wallet changes.
  const addressRef = useRef(address);
  useEffect(() => {
    if (addressRef.current === address) return;
    addressRef.current = address;
    setSamples(load(address));
  }, [address]);

  // Keep the newest input in a ref so the sampling effect only depends on
  // lastUpdated — otherwise every re-render would push a point.
  const latest = useRef(input);
  latest.current = input;

  useEffect(() => {
    if (!lastUpdated) return; // nothing has been read from chain yet

    const point = latest.current;
    const sample: PortfolioSample = {
      t: lastUpdated,
      wallet: point.wallet,
      supplied: point.supplied,
      escrow: point.escrow,
      collateral: point.collateral,
      debt: point.debt,
      net: point.net,
      eth: point.eth,
      hf: point.hf,
    };

    setSamples((prev) => {
      const previous = prev[prev.length - 1];
      if (previous) {
        if (previous.t === sample.t) return prev; // same read, already stored
        const tooSoon = sample.t - previous.t < MIN_GAP_MS;
        if (tooSoon && !changed(previous, point)) return prev;
      }
      const next = [...prev, sample].slice(-MAX_SAMPLES);
      save(addressRef.current, next);
      return next;
    });
  }, [lastUpdated]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(addressRef.current));
    } catch {
      /* ignore */
    }
    setSamples([]);
  }, []);

  /** Chart-ready rows with a short clock label on the x axis. */
  const rows = useMemo<PortfolioRow[]>(
    () =>
      samples.map((s) => ({
        ...s,
        label: new Date(s.t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      })),
    [samples]
  );

  const first = samples[0];
  const last = samples[samples.length - 1];
  const netChange = first && last ? last.net - first.net : 0;
  const netChangePct = first && first.net !== 0 ? (netChange / Math.abs(first.net)) * 100 : 0;

  return {
    samples,
    rows,
    clear,
    /** Enough points to draw a meaningful line? */
    ready: samples.length >= 2,
    windowStart: first?.t ?? 0,
    netChange,
    netChangePct,
  };
}

export default usePortfolioHistory;
