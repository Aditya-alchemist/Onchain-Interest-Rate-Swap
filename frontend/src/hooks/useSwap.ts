import { useCallback, useState, useEffect } from "react";

import { getContract, getWriteContracts } from "../lib/contracts";
import { useWallet } from "./useWallet";

// ============================================================
// TYPES
// ============================================================

/** Mirrors SwapFactory.SwapStatus: None=0, Active=1, Matured=2, Closed=3 */
export type SwapStatus = 0 | 1 | 2 | 3;

export const SWAP_STATUS_LABEL: Record<number, string> = {
  0: "None",
  1: "Active",
  2: "Matured",
  3: "Closed",
};

export interface SwapData {
  id: bigint;
  loanTokenId: bigint;
  fixedPayer: string;
  floatingPayer: string;
  notionalUsdc: bigint;
  fixedRateBps: bigint;
  startTime: bigint;
  maturityTime: bigint;
  settlementInterval: bigint;
  lastSettlementTime: bigint;
  status: number;
  /** convenience: status === Active */
  active: boolean;
  /** convenience: maturityTime - startTime */
  duration: bigint;
}

export interface SwapState {
  swap: SwapData | null;
  swapId: bigint | null;
  swapTokenId: bigint | null;
  hasActiveSwap: boolean;
  isLoading: boolean;
  error: Error | null;
}

// ============================================================
// HELPERS
// ============================================================

function normalizeBigInt(value: bigint | string | number): bigint {
  return BigInt(value);
}

/**
 * Map the tuple returned by SwapFactory.getSwap(swapId) into SwapData.
 * ethers v6 returns a Result that supports both named and indexed access.
 */
function mapSwap(id: bigint, raw: any): SwapData {
  const loanTokenId = BigInt(raw.loanTokenId ?? raw[0]);
  const fixedPayer = String(raw.fixedPayer ?? raw[1]);
  const floatingPayer = String(raw.floatingPayer ?? raw[2]);
  const notionalUsdc = BigInt(raw.notionalUsdc ?? raw[3]);
  const fixedRateBps = BigInt(raw.fixedRateBps ?? raw[4]);
  const startTime = BigInt(raw.startTime ?? raw[5]);
  const maturityTime = BigInt(raw.maturityTime ?? raw[6]);
  const settlementInterval = BigInt(raw.settlementInterval ?? raw[7]);
  const lastSettlementTime = BigInt(raw.lastSettlementTime ?? raw[8]);
  const status = Number(raw.status ?? raw[9]);

  return {
    id,
    loanTokenId,
    fixedPayer,
    floatingPayer,
    notionalUsdc,
    fixedRateBps,
    startTime,
    maturityTime,
    settlementInterval,
    lastSettlementTime,
    status,
    active: status === 1,
    duration: maturityTime > startTime ? maturityTime - startTime : BigInt(0),
  };
}

// ============================================================
// HOOK
// ============================================================

export function useSwap(loanTokenId?: bigint | string | number) {
  const { address, isConnected, isSepolia } = useWallet();

  const [swapId, setSwapId] = useState<bigint | null>(null);
  const [swapTokenId, setSwapTokenId] = useState<bigint | null>(null);
  const [swap, setSwap] = useState<SwapData | null>(null);
  const [hasActiveSwap, setHasActiveSwap] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // ----------------------------------------------------------
  // swapId <-> loanTokenId lookups
  // ----------------------------------------------------------

  const getSwapIdForLoan = useCallback(
    async (tokenId: bigint | string | number): Promise<bigint> => {
      const swapFactory = getContract("SwapFactory");
      // getSwapForLoan reads the loanToSwap mapping on the factory.
      const result = await swapFactory.getSwapForLoan(normalizeBigInt(tokenId));
      return normalizeBigInt(result);
    },
    []
  );

  const getLoanTokenIdForSwap = useCallback(
    async (id: bigint | string | number): Promise<bigint> => {
      const swapEngine = getContract("SwapEngine");
      const result = await swapEngine.swapToTokenId(normalizeBigInt(id));
      return normalizeBigInt(result);
    },
    []
  );

  /** Read the full SwapPosition struct from SwapFactory. */
  const getSwapById = useCallback(
    async (id: bigint | string | number): Promise<SwapData | null> => {
      const normalized = normalizeBigInt(id);
      if (normalized === BigInt(0)) return null;
      const swapFactory = getContract("SwapFactory");
      const raw = await swapFactory.getSwap(normalized);
      return mapSwap(normalized, raw);
    },
    []
  );

  // ----------------------------------------------------------
  // LOAD SWAP  — reads real position data from SwapFactory
  // ----------------------------------------------------------

  const fetchSwap = useCallback(async () => {
    if (loanTokenId === undefined || loanTokenId === null) {
      setSwap(null);
      setSwapId(null);
      setSwapTokenId(null);
      setHasActiveSwap(false);
      return;
    }

    const tokenId = normalizeBigInt(loanTokenId);
    if (tokenId === BigInt(0)) {
      setSwap(null);
      setSwapId(null);
      setSwapTokenId(null);
      setHasActiveSwap(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const swapFactory = getContract("SwapFactory");

      const id = normalizeBigInt(await swapFactory.getSwapForLoan(tokenId));
      setSwapId(id === BigInt(0) ? null : id);

      if (id === BigInt(0)) {
        setSwap(null);
        setSwapTokenId(null);
        setHasActiveSwap(false);
        return;
      }

      const raw = await swapFactory.getSwap(id);
      const mapped = mapSwap(id, raw);
      setSwap(mapped);
      setHasActiveSwap(mapped.active);

      try {
        const nft = await getLoanTokenIdForSwap(id);
        setSwapTokenId(nft === BigInt(0) ? null : nft);
      } catch {
        setSwapTokenId(null);
      }
    } catch (err) {
      const normalizedError =
        err instanceof Error ? err : new Error("Failed to fetch swap information");
      setError(normalizedError);
    } finally {
      setIsLoading(false);
    }
  }, [loanTokenId, getLoanTokenIdForSwap]);

  // ----------------------------------------------------------
  // WRITES
  // ----------------------------------------------------------

  const openSwap = useCallback(
    async (
      tokenId: bigint | string | number,
      notionalUsdc: bigint | string | number,
      fixedRateBps: bigint | string | number,
      duration: bigint | string | number,
      settlementInterval: bigint | string | number
    ) => {
      if (!isConnected) throw new Error("Connect your wallet first.");
      if (!isSepolia) throw new Error("Please switch to Sepolia.");

      const contracts = await getWriteContracts();
      const tx = await contracts.swapEngine.openSwap(
        normalizeBigInt(tokenId),
        normalizeBigInt(notionalUsdc),
        normalizeBigInt(fixedRateBps),
        normalizeBigInt(duration),
        normalizeBigInt(settlementInterval)
      );
      const receipt = await tx.wait();
      await fetchSwap();
      return receipt;
    },
    [isConnected, isSepolia, fetchSwap]
  );

  const closeSwapByLoan = useCallback(
    async (tokenId: bigint | string | number) => {
      if (!isConnected) throw new Error("Connect your wallet first.");
      if (!isSepolia) throw new Error("Please switch to Sepolia.");

      const contracts = await getWriteContracts();
      const tx = await contracts.swapEngine.closeSwapByLoan(normalizeBigInt(tokenId));
      const receipt = await tx.wait();
      await fetchSwap();
      return receipt;
    },
    [isConnected, isSepolia, fetchSwap]
  );

  const settleSwap = useCallback(
    async (id: bigint | string | number) => {
      if (!isConnected) throw new Error("Connect your wallet first.");
      if (!isSepolia) throw new Error("Please switch to Sepolia.");

      const contracts = await getWriteContracts();
      const tx = await contracts.swapEngine.settleSwap(normalizeBigInt(id));
      const receipt = await tx.wait();
      await fetchSwap();
      return receipt;
    },
    [isConnected, isSepolia, fetchSwap]
  );

  const settleSwaps = useCallback(
    async (ids: Array<bigint | string | number>) => {
      if (!isConnected) throw new Error("Connect your wallet first.");
      if (!isSepolia) throw new Error("Please switch to Sepolia.");

      const contracts = await getWriteContracts();
      const tx = await contracts.swapEngine.settleSwaps(ids.map(normalizeBigInt));
      const receipt = await tx.wait();
      await fetchSwap();
      return receipt;
    },
    [isConnected, isSepolia, fetchSwap]
  );

  // ----------------------------------------------------------
  // INITIAL LOAD
  // ----------------------------------------------------------

  useEffect(() => {
    fetchSwap();
  }, [fetchSwap]);

  return {
    address,
    isConnected,
    isSepolia,

    swap,
    swapId,
    swapTokenId,
    hasActiveSwap,

    isLoading,
    error,

    fetchSwap,
    getSwapIdForLoan,
    getLoanTokenIdForSwap,
    getSwapById,

    openSwap,
    closeSwapByLoan,
    settleSwap,
    settleSwaps,
  };
}

export default useSwap;
