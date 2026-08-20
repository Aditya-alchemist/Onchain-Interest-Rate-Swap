import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getContract,
  getWriteContracts,
} from "../lib/contracts";

import { useWallet } from "./useWallet";


// ============================================================
// TYPES
// ============================================================

export interface SwapData {
  id: bigint;
  loanTokenId: bigint;
  notionalUsdc: bigint;
  fixedRateBps: bigint;
  duration: bigint;
  settlementInterval: bigint;
  startTime: bigint;
  active: boolean;
}

export interface SwapState {
  swap: SwapData | null;

  swapId: bigint | null;
  swapTokenId: bigint | null;

  isLoading: boolean;
  error: Error | null;
}


// ============================================================
// HELPERS
// ============================================================

function normalizeBigInt(
  value: bigint | string | number
): bigint {
  return BigInt(value);
}


// ============================================================
// HOOK
// ============================================================

export function useSwap(
  loanTokenId?: bigint | string | number
) {

  const {
    address,
    isConnected,
    isSepolia,
  } = useWallet();


  // ==========================================================
  // STATE
  // ==========================================================

  const [swapId, setSwapId] =
    useState<bigint | null>(null);

  const [swapTokenId, setSwapTokenId] =
    useState<bigint | null>(null);

  const [swap, setSwap] =
    useState<SwapData | null>(null);

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState<Error | null>(null);


  // ==========================================================
  // GET SWAP ID FOR LOAN
  // ==========================================================

  const getSwapIdForLoan =
    useCallback(
      async (
        tokenId: bigint | string | number
      ): Promise<bigint> => {

        const swapEngine =
          getContract("SwapEngine");

        const result =
          await swapEngine.loanToSwapId(
            normalizeBigInt(tokenId)
          );

        return normalizeBigInt(result);
      },
      []
    );


  // ==========================================================
  // GET LOAN TOKEN ID FOR SWAP
  // ==========================================================

  const getLoanTokenIdForSwap =
    useCallback(
      async (
        id: bigint | string | number
      ): Promise<bigint> => {

        const swapEngine =
          getContract("SwapEngine");

        const result =
          await swapEngine.swapToTokenId(
            normalizeBigInt(id)
          );

        return normalizeBigInt(result);
      },
      []
    );


  // ==========================================================
  // LOAD SWAP
  // ==========================================================
  //
  // IMPORTANT:
  //
  // The SwapEngine ABI you supplied does NOT expose a public
  // `swaps()` getter.
  //
  // Therefore this hook does not invent one.
  //
  // We can determine the relationship:
  //
  // loanTokenId -> swapId
  // swapId -> loanTokenId
  //
  // but full SwapData requires the SwapEngine ABI to expose
  // the underlying swap struct/getter.
  //
  // ==========================================================

  const fetchSwap =
    useCallback(
      async () => {

        if (
          loanTokenId === undefined ||
          loanTokenId === null
        ) {
          setSwap(null);
          setSwapId(null);
          setSwapTokenId(null);
          return;
        }

        setIsLoading(true);
        setError(null);

        try {

          const id =
            await getSwapIdForLoan(
              loanTokenId
            );

          setSwapId(id);

          const tokenId =
            await getLoanTokenIdForSwap(
              id
            );

          setSwapTokenId(tokenId);

          /*
           * Do not construct fake SwapData here.
           *
           * Your current SwapEngine ABI does not expose swaps().
           */

          setSwap(null);

        } catch (err) {

          const normalizedError =
            err instanceof Error
              ? err
              : new Error(
                  "Failed to fetch swap information"
                );

          setError(normalizedError);

        } finally {
          setIsLoading(false);
        }

      },
      [
        loanTokenId,
        getSwapIdForLoan,
        getLoanTokenIdForSwap,
      ]
    );


  // ==========================================================
  // OPEN SWAP
  // ==========================================================

  const openSwap =
    useCallback(
      async (
        tokenId: bigint | string | number,
        notionalUsdc: bigint | string | number,
        fixedRateBps: bigint | string | number,
        duration: bigint | string | number,
        settlementInterval:
          bigint | string | number
      ) => {

        if (!isConnected) {
          throw new Error(
            "Connect your wallet first."
          );
        }

        if (!isSepolia) {
          throw new Error(
            "Please switch to Sepolia."
          );
        }

        const contracts =
          await getWriteContracts();

        const tx =
          await contracts.swapEngine.openSwap(
            normalizeBigInt(tokenId),
            normalizeBigInt(notionalUsdc),
            normalizeBigInt(fixedRateBps),
            normalizeBigInt(duration),
            normalizeBigInt(
              settlementInterval
            )
          );

        const receipt =
          await tx.wait();

        await fetchSwap();

        return receipt;
      },
      [
        isConnected,
        isSepolia,
        fetchSwap,
      ]
    );


  // ==========================================================
  // CLOSE SWAP BY LOAN
  // ==========================================================

  const closeSwapByLoan =
    useCallback(
      async (
        tokenId: bigint | string | number
      ) => {

        if (!isConnected) {
          throw new Error(
            "Connect your wallet first."
          );
        }

        if (!isSepolia) {
          throw new Error(
            "Please switch to Sepolia."
          );
        }

        const contracts =
          await getWriteContracts();

        const tx =
          await contracts.swapEngine.closeSwapByLoan(
            normalizeBigInt(tokenId)
          );

        const receipt =
          await tx.wait();

        await fetchSwap();

        return receipt;
      },
      [
        isConnected,
        isSepolia,
        fetchSwap,
      ]
    );


  // ==========================================================
  // SETTLE SWAP
  // ==========================================================

  const settleSwap =
    useCallback(
      async (
        id: bigint | string | number
      ) => {

        if (!isConnected) {
          throw new Error(
            "Connect your wallet first."
          );
        }

        if (!isSepolia) {
          throw new Error(
            "Please switch to Sepolia."
          );
        }

        const contracts =
          await getWriteContracts();

        const tx =
          await contracts.swapEngine.settleSwap(
            normalizeBigInt(id)
          );

        const receipt =
          await tx.wait();

        await fetchSwap();

        return receipt;
      },
      [
        isConnected,
        isSepolia,
        fetchSwap,
      ]
    );


  // ==========================================================
  // SETTLE MULTIPLE SWAPS
  // ==========================================================

  const settleSwaps =
    useCallback(
      async (
        ids: Array<
          bigint | string | number
        >
      ) => {

        if (!isConnected) {
          throw new Error(
            "Connect your wallet first."
          );
        }

        if (!isSepolia) {
          throw new Error(
            "Please switch to Sepolia."
          );
        }

        const contracts =
          await getWriteContracts();

        const normalizedIds =
          ids.map(normalizeBigInt);

        const tx =
          await contracts.swapEngine.settleSwaps(
            normalizedIds
          );

        const receipt =
          await tx.wait();

        await fetchSwap();

        return receipt;
      },
      [
        isConnected,
        isSepolia,
        fetchSwap,
      ]
    );


  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    fetchSwap();
  }, [fetchSwap]);


  // ==========================================================
  // RETURN
  // ==========================================================

  return {

    // --------------------------------------------------------
    // Wallet
    // --------------------------------------------------------

    address,
    isConnected,
    isSepolia,


    // --------------------------------------------------------
    // Swap state
    // --------------------------------------------------------

    swap,
    swapId,
    swapTokenId,

    isLoading,
    error,


    // --------------------------------------------------------
    // Reads
    // --------------------------------------------------------

    fetchSwap,
    getSwapIdForLoan,
    getLoanTokenIdForSwap,


    // --------------------------------------------------------
    // Writes
    // --------------------------------------------------------

    openSwap,
    closeSwapByLoan,
    settleSwap,
    settleSwaps,
  };
}


export default useSwap;