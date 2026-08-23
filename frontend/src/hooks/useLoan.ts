import { useCallback, useState, useEffect } from "react";

import { useWallet } from "./useWallet";
import { getContract, getWriteContracts } from "../lib/contracts";


// ============================================================
// TYPES
// ============================================================

export interface LoanData {
  collateralEth: bigint;
  principalUsdc: bigint;
  borrowRateBps: bigint;
  startTime: bigint;
  tokenId: bigint;
  active: boolean;
}

export interface LoanInfo {
  borrower: string;
  loan: LoanData;
}

export interface LoanState {
  loan: LoanData | null;
  borrower: string | null;
  debt: bigint;
  collateralValue: bigint;
  healthFactorBps: bigint;
  ltvBps: bigint;
  maxBorrowable: bigint;
  hasActiveLoan: boolean;
  isLoading: boolean;
  error: Error | null;
}


// ============================================================
// HOOK
// ============================================================

export function useLoan() {
  const {
    address,
    isConnected,
    isSepolia,
  } = useWallet();

  // ----------------------------------------------------------
  // State
  // ----------------------------------------------------------

  const [loan, setLoan] = useState<LoanData | null>(null);
  const [debt, setDebt] = useState<bigint>(BigInt(0));
  const [collateralValue, setCollateralValue] =
    useState<bigint>(BigInt(0));

  const [healthFactorBps, setHealthFactorBps] =
    useState<bigint>(BigInt(0));

  const [ltvBps, setLtvBps] =
    useState<bigint>(BigInt(0));

  const [hasActiveLoan, setHasActiveLoan] =
    useState<boolean>(false);

  const [isLoading, setIsLoading] =
    useState<boolean>(false);

  const [error, setError] =
    useState<Error | null>(null);


  // ==========================================================
  // READ LOAN
  // ==========================================================

  const fetchLoan = useCallback(async () => {
    if (!address || !isConnected || !isSepolia) {
      setLoan(null);
      setDebt(BigInt(0));
      setCollateralValue(BigInt(0));
      setHealthFactorBps(BigInt(0));
      setLtvBps(BigInt(0));
      setHasActiveLoan(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const loanManager =
        getContract("LoanManager");

      // ------------------------------------------------------
      // Loan
      // ------------------------------------------------------

      const loanResult =
        await loanManager.loans(address);

      const loanData: LoanData = {
        collateralEth: BigInt(
          loanResult.collateralEth
        ),

        principalUsdc: BigInt(
          loanResult.principalUsdc
        ),

        borrowRateBps: BigInt(
          loanResult.borrowRateBps
        ),

        startTime: BigInt(
          loanResult.startTime
        ),

        tokenId: BigInt(
          loanResult.tokenId
        ),

        active: Boolean(
          loanResult.active
        ),
      };

      setLoan(
        loanData.active
          ? loanData
          : null
      );


      // ------------------------------------------------------
      // Debt
      // ------------------------------------------------------

      const debtValue =
        await loanManager.debtOf(address);

      setDebt(
        BigInt(debtValue)
      );


      // ------------------------------------------------------
      // Collateral value
      // ------------------------------------------------------

      const collateral =
        await loanManager.collateralValueUsdc(
          address
        );

      setCollateralValue(
        BigInt(collateral)
      );


      // ------------------------------------------------------
      // Health factor
      // ------------------------------------------------------

      const healthFactor =
        await loanManager.healthFactorBps(
          address
        );

      setHealthFactorBps(
        BigInt(healthFactor)
      );


      // ------------------------------------------------------
      // LTV
      // ------------------------------------------------------

      const currentLtv =
        await loanManager.ltvBps(
          address
        );

      setLtvBps(
        BigInt(currentLtv)
      );


      // ------------------------------------------------------
      // Active loan
      // ------------------------------------------------------

      const active =
        await loanManager.hasActiveLoan(
          address
        );

      setHasActiveLoan(
        Boolean(active)
      );

    } catch (err) {
      const normalizedError =
        err instanceof Error
          ? err
          : new Error(
              "Failed to fetch loan information"
            );

      setError(normalizedError);

    } finally {
      setIsLoading(false);
    }
  }, [
    address,
    isConnected,
    isSepolia,
  ]);


  // ==========================================================
  // MAX BORROWABLE
  // ==========================================================

  const getMaxBorrowable = useCallback(
    async (
      collateralEth: bigint | string | number
    ): Promise<bigint> => {

      const loanManager =
        getContract("LoanManager");

      const result =
        await loanManager.maxBorrowable(
          collateralEth
        );

      return BigInt(result);
    },
    []
  );


  // ==========================================================
  // GET LOAN BY TOKEN ID
  // ==========================================================

  const getLoanByTokenId = useCallback(
    async (
      tokenId: bigint | string | number
    ): Promise<LoanInfo> => {

      const loanManager =
        getContract("LoanManager");

      const result =
        await loanManager.getLoanByTokenId(
          tokenId
        );

      const borrower =
        result.borrower;

      const rawLoan =
        result.loan;

      const loanData: LoanData = {
        collateralEth: BigInt(
          rawLoan.collateralEth
        ),

        principalUsdc: BigInt(
          rawLoan.principalUsdc
        ),

        borrowRateBps: BigInt(
          rawLoan.borrowRateBps
        ),

        startTime: BigInt(
          rawLoan.startTime
        ),

        tokenId: BigInt(
          rawLoan.tokenId
        ),

        active: Boolean(
          rawLoan.active
        ),
      };

      return {
        borrower,
        loan: loanData,
      };
    },
    []
  );


  // ==========================================================
  // BORROW
  // ==========================================================

  const borrow = useCallback(
    async (
      borrowAmountUsdc: bigint | string | number,
      collateralEth: bigint | string | number
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
        await contracts.loanManager.borrow(
          borrowAmountUsdc,
          {
            value: collateralEth,
          }
        );

      const receipt =
        await tx.wait();

      await fetchLoan();

      return receipt;
    },
    [
      isConnected,
      isSepolia,
      fetchLoan,
    ]
  );


  // ==========================================================
  // REPAY
  // ==========================================================

  const repay = useCallback(
    async () => {

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
        await contracts.loanManager.repay();

      const receipt =
        await tx.wait();

      await fetchLoan();

      return receipt;
    },
    [
      isConnected,
      isSepolia,
      fetchLoan,
    ]
  );


  // ==========================================================
  // LIQUIDATABLE
  // ==========================================================

  const isLoanLiquidatable =
    useCallback(
      async (
        tokenId: bigint | string | number
      ): Promise<boolean> => {

        const loanManager =
          getContract("LoanManager");

        return Boolean(
          await loanManager.isLiquidatable(
            tokenId
          )
        );
      },
      []
    );


  // ==========================================================
  // LIQUIDATE  (routes through LiquidationEngine)
  // ==========================================================
  //
  // LoanManager.liquidate(tokenId, liquidator) is guarded by
  // onlyLiquidationEngine and reverts for external callers.
  // The public entry point is LiquidationEngine.liquidate(loanId),
  // which checks isLiquidatable and forwards with
  // liquidator = msg.sender.

  const liquidate = useCallback(
    async (tokenId: bigint | string | number) => {
      if (!isConnected) {
        throw new Error("Connect your wallet first.");
      }

      if (!isSepolia) {
        throw new Error("Please switch to Sepolia.");
      }

      const contracts = await getWriteContracts();

      const tx = await contracts.liquidationEngine.liquidate(tokenId);

      const receipt = await tx.wait();

      await fetchLoan();

      return receipt;
    },
    [isConnected, isSepolia, fetchLoan]
  );


  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    fetchLoan();
  }, [fetchLoan]);


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
    // Loan state
    // --------------------------------------------------------

    loan,
    borrower: address ?? null,

    debt,
    collateralValue,

    healthFactorBps,
    ltvBps,

    hasActiveLoan,

    isLoading,
    error,


    // --------------------------------------------------------
    // Reads
    // --------------------------------------------------------

    fetchLoan,
    getMaxBorrowable,
    getLoanByTokenId,
    isLoanLiquidatable,


    // --------------------------------------------------------
    // Writes
    // --------------------------------------------------------

    borrow,
    repay,
    liquidate,
  };
}


export default useLoan;