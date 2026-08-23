import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ContractTransactionReceipt, EventLog } from "ethers";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";

import { useWallet } from "./useWallet";
import { getContract, getWriteContracts, CONTRACT_ADDRESSES } from "../lib/contracts";
import { describeError, isUserRejection, toDisplayError } from "../lib/errors";
import { useNotifications } from "../lib/notifications";
import { useLoan } from "./useLoan";
import { useSwap } from "./useSwap";

const USDC_DECIMALS = 6;
const ZERO = BigInt(0);
const BPS = BigInt(10000);
const YEAR_SECONDS = BigInt(31536000); // 365 days, matches InterestMath
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** How often to re-read chain state while the tab is visible. */
const POLL_INTERVAL_MS = 15000;

export interface TxStep {
  current: number;
  total: number;
  label: string;
}

/**
 * Action keys. Every button binds its spinner to one of these instead of to a
 * single global flag, so pressing "Withdraw" no longer puts "Supply" into a
 * loading state as well.
 */
export const TX = {
  poolDeposit: "pool.deposit",
  poolWithdraw: "pool.withdraw",
  borrow: "loan.borrow",
  repay: "loan.repay",
  liquidate: "loan.liquidate",
  openHedge: "hedge.open",
  closeHedge: "hedge.close",
  settleSwap: "swap.settle",
  escrowDeposit: "escrow.deposit",
  escrowWithdraw: "escrow.withdraw",
  executeSettlement: "dvp.execute",
  mintUsdc: "admin.mint",
  governance: "admin.governance",
  setEthPrice: "admin.oracle",
} as const;

export type TxKey = (typeof TX)[keyof typeof TX];

/**
 * The Admin page has several mint buttons and a dozen governance buttons. They
 * all used one key each, so pressing "Set fee" spun "Set treasury" too. These
 * derive a distinct key per target/method so only the pressed button reacts.
 */
export function mintTxKey(target?: string): string {
  return `${TX.mintUsdc}:${(target || "").trim().toLowerCase() || "self"}`;
}

export function govTxKey(method: string): string {
  return `${TX.governance}:${method}`;
}

export interface ProtocolSnapshot {
  usdcBalance: bigint;
  poolDeposit: bigint;
  poolTotalDeposits: bigint;
  poolTotalBorrows: bigint;
  poolLiquidity: bigint;
  borrowRateBps: bigint;
  escrowAvailable: bigint;
  escrowLocked: bigint;
  treasury: string;
  collateralFactorBps: bigint;
  liquidationThresholdBps: bigint;
  protocolFeeBps: bigint;
  settlementInterval: bigint;
  paused: boolean;
  // interest rate model parameters (real, on-chain)
  baseRateBps: bigint;
  slope1Bps: bigint;
  slope2Bps: bigint;
  kinkBps: bigint;
  // price oracle
  ethPrice: bigint;
  oracleDecimals: number;
  /** Escrow balance held by the SwapEngine — it is the floating-leg counterparty. */
  counterpartyEscrow: bigint;
}

const initialSnapshot: ProtocolSnapshot = {
  usdcBalance: ZERO,
  poolDeposit: ZERO,
  poolTotalDeposits: ZERO,
  poolTotalBorrows: ZERO,
  poolLiquidity: ZERO,
  borrowRateBps: ZERO,
  escrowAvailable: ZERO,
  escrowLocked: ZERO,
  treasury: "",
  collateralFactorBps: ZERO,
  liquidationThresholdBps: ZERO,
  protocolFeeBps: ZERO,
  settlementInterval: ZERO,
  paused: false,
  baseRateBps: ZERO,
  slope1Bps: ZERO,
  slope2Bps: ZERO,
  kinkBps: ZERO,
  ethPrice: ZERO,
  oracleDecimals: 8,
  counterpartyEscrow: ZERO,
};

function toBigInt(value: unknown): bigint {
  if (value === undefined || value === null || value === "") return ZERO;
  try {
    return BigInt(value as bigint | string | number);
  } catch {
    return ZERO;
  }
}

/**
 * Parse a user-typed id. Returns null rather than throwing, which is what
 * caused the "invalid BigNumberish value" crash when a blank input reached
 * ethers.
 */
function parseId(value: unknown): bigint | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "bigint") return value > ZERO ? value : null;
  const text = String(value).trim();
  if (!text || !/^\d+$/.test(text)) return null;
  const parsed = BigInt(text);
  return parsed > ZERO ? parsed : null;
}

function receiptEventArg(
  receipt: ContractTransactionReceipt | null,
  eventName: string,
  argName: string
): bigint | undefined {
  const log = receipt?.logs.find(
    (item): item is EventLog => "fragment" in item && item.fragment?.name === eventName
  );
  const value = log?.args?.[argName];
  return value === undefined ? undefined : BigInt(value);
}

function receiptHash(value: unknown): string | undefined {
  const hash = (value as { hash?: string } | null)?.hash;
  return typeof hash === "string" && hash.startsWith("0x") ? hash : undefined;
}

// ============================================================
// FORMATTERS  (unchanged public API)
// ============================================================

export function formatUsdc(value?: bigint, decimals = 2): string {
  return Number(formatUnits(value ?? ZERO, USDC_DECIMALS)).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatBps(value?: bigint): string {
  return `${(Number(value ?? ZERO) / 100).toFixed(2)}%`;
}

/**
 * Health factor and LTV come back as bps. When there is no debt, the
 * LoanManager returns a uint256 sentinel (effectively infinite), which
 * naïvely formats as "1.15e+75%". Guard against that: show "—" when there
 * is no active position and "∞" when the ratio is effectively unbounded.
 */
export function formatFactor(value?: bigint, active = true): string {
  if (!active || value === undefined) return "—";
  const pct = Number(value) / 100;
  if (!Number.isFinite(pct) || pct > 100000) return "∞";
  return `${pct.toFixed(2)}%`;
}

export function formatEth(value?: bigint, decimals = 4): string {
  return Number(formatEther(value ?? ZERO)).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function parseUsdcInput(value: string): bigint {
  const text = (value ?? "").toString().trim();
  if (!text || !/^\d*\.?\d*$/.test(text)) return ZERO;
  try {
    return parseUnits(text || "0", USDC_DECIMALS);
  } catch {
    return ZERO;
  }
}

export function toUsdcNumber(value?: bigint): number {
  return Number(formatUnits(value ?? ZERO, USDC_DECIMALS));
}

/**
 * Compute the annual borrow rate (in bps) for a given utilization,
 * replicating InterestRateModel.getBorrowRate exactly. Used to draw
 * the real on-chain rate curve.
 */
export function borrowRateAtUtilization(
  utilizationBps: number,
  params: { baseRateBps: number; slope1Bps: number; slope2Bps: number; kinkBps: number }
): number {
  const { baseRateBps, slope1Bps, slope2Bps, kinkBps } = params;
  if (kinkBps <= 0) return baseRateBps;
  if (utilizationBps <= kinkBps) {
    return baseRateBps + (utilizationBps * slope1Bps) / kinkBps;
  }
  const excess = utilizationBps - kinkBps;
  return baseRateBps + slope1Bps + (excess * slope2Bps) / (10000 - kinkBps);
}

// ============================================================
// SETTLEMENT PREVIEW  (mirrors SwapMath.netSettlement)
// ============================================================

export type SettlementDirection = "none" | "fixedReceives" | "floatingReceives";

export interface SettlementPreview {
  ok: boolean;
  /** Why this cannot be settled right now, in plain English. */
  blocker?: string;
  direction: SettlementDirection;
  amount: bigint;
  fixedLeg: bigint;
  floatingLeg: bigint;
  periodSeconds: bigint;
  floatingRateBps: bigint;
  payer?: string;
  payee?: string;
  /** Escrow available to whoever owes money this period. */
  payerEscrow?: bigint;
  shortfall?: bigint;
}

/** legAmount = notional * rateBps * period / (BPS * YEAR) — simple interest. */
function legAmount(notional: bigint, rateBps: bigint, periodSeconds: bigint): bigint {
  return (notional * rateBps * periodSeconds) / (BPS * YEAR_SECONDS);
}

// ============================================================
// IMPLEMENTATION
// ============================================================

function useProtocolState() {
  const { address, isConnected, isSepolia } = useWallet();
  const loanApi = useLoan();
  const loanTokenId = loanApi.loan?.tokenId;
  const swapApi = useSwap(loanTokenId);
  const { fetchLoan } = loanApi;
  const { fetchSwap } = swapApi;
  const notifications = useNotifications();

  const [snapshot, setSnapshot] = useState<ProtocolSnapshot>(initialSnapshot);
  const [isLoading, setIsLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [txMessage, setTxMessage] = useState<string | null>(null);
  const [txStep, setTxStep] = useState<TxStep | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  /** Toast currently being driven by runTx, so nested helpers can update it. */
  const activeToast = useRef<string | null>(null);
  const pendingRef = useRef<string | null>(null);

  const utilizationBps = useMemo(() => {
    if (snapshot.poolTotalDeposits === ZERO) return ZERO;
    return (snapshot.poolTotalBorrows * BPS) / snapshot.poolTotalDeposits;
  }, [snapshot.poolTotalBorrows, snapshot.poolTotalDeposits]);

  const ethPriceUsd = useMemo(() => {
    if (snapshot.ethPrice === ZERO) return 0;
    return Number(formatUnits(snapshot.ethPrice, snapshot.oracleDecimals));
  }, [snapshot.ethPrice, snapshot.oracleDecimals]);

  // ----------------------------------------------------------
  // READS
  // ----------------------------------------------------------

  const refetch = useCallback(
    async (options?: { quiet?: boolean }) => {
      if (!options?.quiet) setIsLoading(true);

      try {
        const usdc = getContract("MockUSDC");
        const lendingPool = getContract("LendingPool");
        const escrow = getContract("EscrowManager");
        const governance = getContract("Governance");
        const irm = getContract("InterestRateModel");
        const oracle = getContract("MockPriceOracle");

        const [
          usdcBalance,
          poolDeposit,
          poolTotalDeposits,
          poolTotalBorrows,
          poolLiquidity,
          borrowRateBps,
          escrowAvailable,
          escrowLocked,
          counterpartyEscrow,
          treasury,
          collateralFactorBps,
          liquidationThresholdBps,
          protocolFeeBps,
          settlementInterval,
          paused,
          baseRateBps,
          slope1Bps,
          slope2Bps,
          kinkBps,
          ethPrice,
          oracleDecimals,
        ] = await Promise.all([
          address ? usdc.balanceOf(address) : ZERO,
          address ? lendingPool.deposits(address) : ZERO,
          lendingPool.totalDeposits(),
          lendingPool.totalBorrows(),
          lendingPool.availableLiquidity(),
          lendingPool.currentBorrowRateBps(),
          address ? escrow.availableBalance(address) : ZERO,
          address ? escrow.lockedBalance(address) : ZERO,
          escrow.availableBalance(CONTRACT_ADDRESSES.SwapEngine),
          governance.treasury(),
          governance.collateralFactorBps(),
          governance.liquidationThresholdBps(),
          governance.protocolFeeBps(),
          governance.settlementInterval(),
          governance.paused(),
          irm.baseRateBps(),
          irm.slope1Bps(),
          irm.slope2Bps(),
          irm.kinkBps(),
          oracle.getEthPrice(),
          oracle.decimals(),
        ]);

        setSnapshot({
          usdcBalance: toBigInt(usdcBalance),
          poolDeposit: toBigInt(poolDeposit),
          poolTotalDeposits: toBigInt(poolTotalDeposits),
          poolTotalBorrows: toBigInt(poolTotalBorrows),
          poolLiquidity: toBigInt(poolLiquidity),
          borrowRateBps: toBigInt(borrowRateBps),
          escrowAvailable: toBigInt(escrowAvailable),
          escrowLocked: toBigInt(escrowLocked),
          counterpartyEscrow: toBigInt(counterpartyEscrow),
          treasury,
          collateralFactorBps: toBigInt(collateralFactorBps),
          liquidationThresholdBps: toBigInt(liquidationThresholdBps),
          protocolFeeBps: toBigInt(protocolFeeBps),
          settlementInterval: toBigInt(settlementInterval),
          paused: Boolean(paused),
          baseRateBps: toBigInt(baseRateBps),
          slope1Bps: toBigInt(slope1Bps),
          slope2Bps: toBigInt(slope2Bps),
          kinkBps: toBigInt(kinkBps),
          ethPrice: toBigInt(ethPrice),
          oracleDecimals: Number(oracleDecimals),
        });

        await fetchLoan();
        await fetchSwap();
        setLastUpdated(Date.now());
        setError(null);
      } catch (err) {
        // A failed background poll should not blow away a useful tx error.
        if (!options?.quiet) setError(toDisplayError(err, "Failed to refresh protocol data."));
      } finally {
        if (!options?.quiet) setIsLoading(false);
      }
    },
    [address, fetchLoan, fetchSwap]
  );

  useEffect(() => {
    refetch();
  }, [refetch]);

  /**
   * Poll while the tab is visible. Without this the UI only ever reflected
   * what was true when the page loaded, so keeper-bot settlements, oracle
   * pushes and other wallets' activity were invisible until a manual reload.
   */
  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (pendingRef.current) return; // a tx already refetches when it lands
      refetch({ quiet: true });
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  // ----------------------------------------------------------
  // WRITE PLUMBING
  // ----------------------------------------------------------

  const stage = useCallback(
    (title: string, message?: string, step?: TxStep) => {
      setTxMessage(message ?? title);
      setTxStep(step ?? null);
      if (activeToast.current) {
        notifications.update(activeToast.current, {
          kind: "pending",
          title,
          message,
          step: step ? { current: step.current, total: step.total } : undefined,
        });
      }
    },
    [notifications]
  );

  const reportHash = useCallback(
    (hash?: string) => {
      if (hash && activeToast.current) notifications.update(activeToast.current, { hash });
    },
    [notifications]
  );

  const runTx = useCallback(
    async <T,>(key: string, label: string, action: () => Promise<T>): Promise<T> => {
      if (!isConnected) throw toDisplayError(new Error("Connect your wallet first."));
      if (!isSepolia) throw toDisplayError(new Error("Please switch to Sepolia."));
      if (pendingRef.current) {
        throw toDisplayError(new Error("Another transaction is still in flight. Wait for it to finish."));
      }

      pendingRef.current = key;
      setPending(key);
      setError(null);
      setTxMessage(label);
      setTxStep(null);

      activeToast.current = notifications.push({
        kind: "pending",
        title: label,
        message: "Confirm in your wallet…",
      });

      try {
        const result = await action();

        const hash = receiptHash(result);
        if (activeToast.current) {
          notifications.update(activeToast.current, {
            kind: "success",
            title: `${label.replace(/\.$/, "")} — confirmed`,
            message: undefined,
            step: undefined,
            hash,
          });
        }

        setTxMessage("Transaction confirmed.");
        await refetch();
        return result;
      } catch (err) {
        const normalized = toDisplayError(err, "Transaction failed.");

        if (activeToast.current) {
          notifications.update(activeToast.current, {
            kind: isUserRejection(err) ? "info" : "error",
            title: isUserRejection(err) ? "Cancelled" : `${label.replace(/\.$/, "")} — failed`,
            message: normalized.message,
            step: undefined,
          });
        }

        // A rejection is not an app error worth pinning to the banner.
        if (!isUserRejection(err)) setError(normalized);
        throw normalized;
      } finally {
        pendingRef.current = null;
        activeToast.current = null;
        setPending(null);
        setTxStep(null);
      }
    },
    [isConnected, isSepolia, notifications, refetch]
  );

  /**
   * Smart two-step flow: read the current allowance, approve only if it is
   * insufficient (step 1/2), then run the real action (step 2/2). When the
   * allowance already covers the amount, it runs as a single step.
   */
  const approveThenRun = useCallback(
    async <T,>(
      spender: string,
      amount: bigint,
      actionLabel: string,
      action: (contracts: Awaited<ReturnType<typeof getWriteContracts>>) => Promise<T>
    ): Promise<T> => {
      if (!address) throw toDisplayError(new Error("Connect your wallet first."));

      const contracts = await getWriteContracts();
      const allowance = toBigInt(await contracts.mockUSDC.allowance(address, spender));
      const needsApproval = allowance < amount;
      const total = needsApproval ? 2 : 1;

      if (needsApproval) {
        stage("Approve USDC", "Step 1 of 2 — confirm the USDC approval in your wallet.", {
          current: 1,
          total,
          label: "Approve USDC",
        });
        const approval = await contracts.mockUSDC.approve(spender, amount);
        reportHash(approval?.hash);
        stage("Approving USDC", "Waiting for the approval to be mined…", {
          current: 1,
          total,
          label: "Approve USDC",
        });
        await approval.wait();
      }

      const current = needsApproval ? 2 : 1;
      stage(
        actionLabel,
        needsApproval ? `Step 2 of 2 — ${actionLabel} — confirm in your wallet.` : `${actionLabel} — confirm in your wallet.`,
        { current, total, label: actionLabel }
      );

      return action(contracts);
    },
    [address, reportHash, stage]
  );

  // ----------------------------------------------------------
  // LENDING POOL
  // ----------------------------------------------------------

  const depositToPool = useCallback(
    (amount: string) =>
      runTx(TX.poolDeposit, "Supply USDC to the pool", async () => {
        const parsed = parseUsdcInput(amount);
        if (parsed <= ZERO) throw new Error("Enter an amount greater than zero.");
        if (parsed > snapshot.usdcBalance) {
          throw new Error(
            `You only hold ${formatUsdc(snapshot.usdcBalance)} USDC. Lower the amount, or mint test USDC on the Admin page.`
          );
        }
        return approveThenRun(CONTRACT_ADDRESSES.LendingPool, parsed, "Deposit to lending pool", async (c) => {
          const tx = await c.lendingPool.deposit(parsed);
          reportHash(tx?.hash);
          stage("Depositing", "Waiting for confirmation…");
          return tx.wait();
        });
      }),
    [approveThenRun, reportHash, runTx, snapshot.usdcBalance, stage]
  );

  const withdrawFromPool = useCallback(
    (amount: string) =>
      runTx(TX.poolWithdraw, "Withdraw from the pool", async () => {
        const parsed = parseUsdcInput(amount);
        if (parsed <= ZERO) throw new Error("Enter an amount greater than zero.");
        if (parsed > snapshot.poolDeposit) {
          throw new Error(
            `You have only supplied ${formatUsdc(snapshot.poolDeposit)} USDC to the pool.`
          );
        }
        if (parsed > snapshot.poolLiquidity) {
          throw new Error(
            `The pool only has ${formatUsdc(
              snapshot.poolLiquidity
            )} USDC free right now — the rest is out on loan. Withdraw less, or wait for a borrower to repay.`
          );
        }
        const contracts = await getWriteContracts();
        const tx = await contracts.lendingPool.withdraw(parsed);
        reportHash(tx?.hash);
        stage("Withdrawing", "Waiting for confirmation…");
        return tx.wait();
      }),
    [reportHash, runTx, snapshot.poolDeposit, snapshot.poolLiquidity, stage]
  );

  // ----------------------------------------------------------
  // BORROW / REPAY
  // ----------------------------------------------------------

  const borrow = useCallback(
    (borrowAmountUsdc: string, collateralEth: string) =>
      runTx(TX.borrow, "Open collateralised loan", async () => {
        const principal = parseUsdcInput(borrowAmountUsdc);
        if (principal <= ZERO) throw new Error("Enter a borrow amount greater than zero.");

        let collateral: bigint;
        try {
          collateral = parseEther((collateralEth || "0").trim());
        } catch {
          throw new Error("Enter a valid ETH collateral amount.");
        }
        if (collateral <= ZERO) throw new Error("Enter an ETH collateral amount greater than zero.");
        if (principal > snapshot.poolLiquidity) {
          throw new Error(
            `The pool only has ${formatUsdc(snapshot.poolLiquidity)} USDC available to lend right now.`
          );
        }

        stage("Open collateralised loan", "Confirm in your wallet — your ETH is sent with this call.");
        const receipt = await loanApi.borrow(principal, collateral);
        reportHash(receiptHash(receipt));
        return receipt;
      }),
    [loanApi, reportHash, runTx, snapshot.poolLiquidity, stage]
  );

  /**
   * Repay in full.
   *
   * The old version approved and fired blind, so any revert deeper in the call
   * tree — LoanManager pulls USDC, hands it to LendingPool, then unwinds the
   * hedge through SwapEngine/SwapFactory/SwapNFT/PositionRegistry — surfaced as
   * a bare "transaction execution reverted". We now pre-flight the two things
   * that actually go wrong, then simulate the whole call so the real revert
   * reason is decoded before any gas is spent.
   */
  const repay = useCallback(
    () =>
      runTx(TX.repay, "Repay loan", async () => {
        if (!address) throw new Error("Connect your wallet first.");

        const loanManager = getContract("LoanManager");
        const usdc = getContract("MockUSDC");

        stage("Repay loan", "Reading your live debt…");
        const [freshDebt, walletBalance] = await Promise.all([
          loanManager.debtOf(address).then(toBigInt),
          usdc.balanceOf(address).then(toBigInt),
        ]);

        if (freshDebt <= ZERO) throw new Error("No outstanding debt to repay.");

        // The single most common repay failure: the borrowed USDC was supplied
        // to the pool or moved into escrow, so the wallet cannot cover the debt.
        if (walletBalance < freshDebt) {
          const short = freshDebt - walletBalance;
          const parked: string[] = [];
          if (snapshot.poolDeposit > ZERO) parked.push(`${formatUsdc(snapshot.poolDeposit)} supplied to the pool`);
          if (snapshot.escrowAvailable > ZERO) parked.push(`${formatUsdc(snapshot.escrowAvailable)} free in escrow`);
          if (snapshot.escrowLocked > ZERO) parked.push(`${formatUsdc(snapshot.escrowLocked)} locked in escrow`);

          throw new Error(
            `Repaying needs ${formatUsdc(freshDebt)} USDC but your wallet holds ${formatUsdc(
              walletBalance
            )} — short by ${formatUsdc(short)} USDC.${
              parked.length ? ` You currently have ${parked.join(" and ")}.` : ""
            } Move USDC back to your wallet (or mint test USDC on the Admin page) and try again.`
          );
        }

        // 1% buffer so the approval still covers the amount once a few more
        // seconds of interest have accrued by the time the tx mines.
        const approveAmount = freshDebt + freshDebt / BigInt(100) + BigInt(1);

        return approveThenRun(CONTRACT_ADDRESSES.LoanManager, approveAmount, "Repay loan", async (c) => {
          // Simulate against current state. This is where a hedge that cannot
          // be unwound, or a paused pool, shows its real revert reason.
          stage("Repay loan", "Checking the transaction will succeed…");
          try {
            await c.loanManager.repay.staticCall();
          } catch (simulationError) {
            const detail = describeError(simulationError, "");
            const hedged = Boolean(swapApi.swapId);
            throw new Error(
              detail
                ? `Repayment would revert: ${detail}${
                    hedged
                      ? " Note that repaying also unwinds hedge #" +
                        swapApi.swapId +
                        ", and that unwind is part of the same transaction."
                      : ""
                  }`
                : "Repayment simulation failed for an unknown reason."
            );
          }

          stage("Repay loan", "Confirm the repayment in your wallet.");
          const receipt = await loanApi.repay();
          reportHash(receiptHash(receipt));
          return receipt;
        });
      }),
    [
      address,
      approveThenRun,
      loanApi,
      reportHash,
      runTx,
      snapshot.escrowAvailable,
      snapshot.escrowLocked,
      snapshot.poolDeposit,
      stage,
      swapApi.swapId,
    ]
  );

  const liquidate = useCallback(
    (tokenId: string) =>
      runTx(TX.liquidate, "Liquidate position", async () => {
        if (!address) throw new Error("Connect your wallet first.");
        const id = parseId(tokenId);
        if (!id) throw new Error("Enter a valid loan token ID (a whole number greater than zero).");

        const loanManager = getContract("LoanManager");
        const borrower: string = await loanManager.loanBorrower(id);
        if (!borrower || borrower === ZERO_ADDRESS) {
          throw new Error("No active loan for that token ID.");
        }
        const liquidatable = Boolean(await loanManager.isLiquidatable(id));
        if (!liquidatable) throw new Error("That position is healthy and cannot be liquidated.");

        const targetDebt = toBigInt(await loanManager.debtOf(borrower));
        if (targetDebt > snapshot.usdcBalance) {
          throw new Error(
            `Liquidating means repaying ${formatUsdc(targetDebt)} USDC, but you hold ${formatUsdc(
              snapshot.usdcBalance
            )}.`
          );
        }
        const approveAmount = targetDebt + targetDebt / BigInt(100) + BigInt(1);
        return approveThenRun(CONTRACT_ADDRESSES.LoanManager, approveAmount, "Liquidate position", async () => {
          const receipt = await loanApi.liquidate(id);
          reportHash(receiptHash(receipt));
          return receipt;
        });
      }),
    [address, approveThenRun, loanApi, reportHash, runTx, snapshot.usdcBalance]
  );

  // ----------------------------------------------------------
  // HEDGING
  // ----------------------------------------------------------

  const openHedge = useCallback(
    async (
      loanTokenIdArg: bigint,
      notionalUsdc: string,
      fixedRatePercent: string,
      durationDays: string,
      settlementIntervalSeconds: string
    ) =>
      runTx(TX.openHedge, "Open rate hedge", async () => {
        const tokenId = parseId(loanTokenIdArg);
        if (!tokenId) throw new Error("No loan token to hedge. Open a loan first.");

        const notional = parseUsdcInput(notionalUsdc);
        if (notional <= ZERO) throw new Error("Enter a hedge notional greater than zero.");

        const rate = Number(fixedRatePercent);
        if (!Number.isFinite(rate) || rate <= 0) throw new Error("Enter a fixed rate greater than zero.");
        const fixedRateBps = BigInt(Math.round(rate * 100));
        if (fixedRateBps > BPS) throw new Error("The fixed rate cannot exceed 100%.");

        const days = Number(durationDays);
        if (!Number.isFinite(days) || days <= 0) throw new Error("Enter a duration of at least one day.");
        const durationSeconds = BigInt(Math.round(days)) * BigInt(86400);

        const interval = Number(settlementIntervalSeconds);
        if (!Number.isFinite(interval) || interval <= 0) throw new Error("Pick a settlement interval.");
        const intervalSeconds = BigInt(Math.round(interval));

        stage("Open rate hedge", "Confirm the swap in your wallet.");
        const receipt = await swapApi.openSwap(tokenId, notional, fixedRateBps, durationSeconds, intervalSeconds);
        reportHash(receiptHash(receipt));

        const swapId =
          receiptEventArg(receipt, "SwapOpened", "swapId") ||
          toBigInt(await getContract("SwapFactory").getSwapForLoan(tokenId));
        return swapId;
      }),
    [reportHash, runTx, stage, swapApi]
  );

  /**
   * Read everything needed to decide whether a settlement can go through, and
   * replicate SwapMath.netSettlement so the UI can show the net before asking
   * for a signature.
   */
  const previewSettlement = useCallback(
    async (swapIdInput: bigint | string): Promise<SettlementPreview> => {
      const empty: SettlementPreview = {
        ok: false,
        direction: "none",
        amount: ZERO,
        fixedLeg: ZERO,
        floatingLeg: ZERO,
        periodSeconds: ZERO,
        floatingRateBps: ZERO,
      };

      const id = parseId(swapIdInput);
      if (!id) return { ...empty, blocker: "Enter a valid swap ID (a whole number greater than zero)." };

      const swapFactory = getContract("SwapFactory");
      const lendingPool = getContract("LendingPool");
      const escrow = getContract("EscrowManager");

      const raw: any = await swapFactory.getSwap(id);
      const status = Number(raw.status ?? raw[9]);
      const notional = toBigInt(raw.notionalUsdc ?? raw[3]);
      const fixedRateBps = toBigInt(raw.fixedRateBps ?? raw[4]);
      const maturityTime = toBigInt(raw.maturityTime ?? raw[6]);
      const lastSettlementTime = toBigInt(raw.lastSettlementTime ?? raw[8]);
      const fixedPayer = String(raw.fixedPayer ?? raw[1]);
      const floatingPayer = String(raw.floatingPayer ?? raw[2]);

      if (status === 0) return { ...empty, blocker: `Swap #${id} does not exist.` };
      if (status !== 1) {
        return {
          ...empty,
          blocker: `Swap #${id} is ${status === 2 ? "matured" : "closed"}, so it can no longer be settled.`,
        };
      }

      const now = BigInt(Math.floor(Date.now() / 1000));
      const effectiveNow = now > maturityTime ? maturityTime : now;
      const periodSeconds = effectiveNow > lastSettlementTime ? effectiveNow - lastSettlementTime : ZERO;

      if (periodSeconds <= ZERO) {
        return { ...empty, blocker: "This swap was already settled for the current period — nothing has accrued yet." };
      }

      const floatingRateBps = toBigInt(await lendingPool.currentBorrowRateBps());
      const fixedLeg = legAmount(notional, fixedRateBps, periodSeconds);
      const floatingLeg = legAmount(notional, floatingRateBps, periodSeconds);

      let direction: SettlementDirection = "none";
      let amount = ZERO;
      let payer: string | undefined;
      let payee: string | undefined;

      if (floatingLeg > fixedLeg) {
        direction = "fixedReceives";
        amount = floatingLeg - fixedLeg;
        payer = floatingPayer;
        payee = fixedPayer;
      } else if (fixedLeg > floatingLeg) {
        direction = "floatingReceives";
        amount = fixedLeg - floatingLeg;
        payer = fixedPayer;
        payee = floatingPayer;
      }

      const base = {
        direction,
        amount,
        fixedLeg,
        floatingLeg,
        periodSeconds,
        floatingRateBps,
        payer,
        payee,
      };

      // Net of zero still succeeds on-chain: it records the settlement and
      // advances lastSettlementTime without moving any cash.
      if (amount === ZERO) return { ...base, ok: true };

      const payerEscrow = toBigInt(await escrow.availableBalance(payer));
      if (payerEscrow < amount) {
        const shortfall = amount - payerEscrow;
        const payerIsCounterparty =
          (payer || "").toLowerCase() === CONTRACT_ADDRESSES.SwapEngine.toLowerCase();

        return {
          ...base,
          ok: false,
          payerEscrow,
          shortfall,
          blocker: payerIsCounterparty
            ? `The floating leg owes you ${formatUsdc(amount)} USDC this period, and the payer is the SwapEngine itself — HedgeFi writes swaps against the protocol as counterparty. Its escrow holds ${formatUsdc(
                payerEscrow
              )} USDC (${formatUsdc(
                shortfall
              )} short), so EscrowManager.lock reverts and the settlement fails. The deployed EscrowManager only has deposit(), which credits msg.sender, so no wallet can top the SwapEngine up. Until the contracts are redeployed, a period only settles when the floating rate is at or below your fixed rate: match the two rates, or lower the borrow-rate bounds from the Admin console, so you are the payer and can cover it from your own escrow.`
            : `You owe ${formatUsdc(amount)} USDC on this settlement but only have ${formatUsdc(
                payerEscrow
              )} USDC free in escrow — deposit at least ${formatUsdc(shortfall)} more USDC into escrow first.`,
        };
      }

      return { ...base, ok: true, payerEscrow };
    },
    []
  );

  /**
   * Settle an interest-rate swap. SwapEngine.settleSwap is public, so this is
   * the correct user-facing entry point: it computes the net payment and, when
   * a payment is due, triggers the DvP leg internally. Calling
   * DvPEngine.executeSettlement directly is owner/engine-only.
   */
  const settleSwap = useCallback(
    (swapIdInput: string) =>
      runTx(TX.settleSwap, "Settle swap", async () => {
        const id = parseId(swapIdInput) ?? swapApi.swapId ?? null;
        if (!id) throw new Error("Enter a valid swap ID (a whole number greater than zero).");

        stage("Settle swap", "Checking the settlement window…");
        const preview = await previewSettlement(id);
        if (!preview.ok) throw new Error(preview.blocker || "This swap cannot be settled right now.");

        stage(
          "Settle swap",
          preview.amount === ZERO
            ? "Net is 0.00 USDC this period — this only advances the settlement clock. Confirm in your wallet."
            : `Net ${formatUsdc(preview.amount)} USDC to the ${
                preview.direction === "fixedReceives" ? "fixed" : "floating"
              } leg. Confirm in your wallet.`
        );

        const receipt = await swapApi.settleSwap(id);
        reportHash(receiptHash(receipt));
        return receipt;
      }),
    [previewSettlement, reportHash, runTx, stage, swapApi]
  );

  /**
   * Closing a hedge on its own is not possible from a wallet:
   * SwapEngine.closeSwapByLoan is onlyLoanManager. The hedge unwinds as part
   * of repay(), or when settleSwap runs at maturity. Surfacing that plainly is
   * better than firing a call that always reverts.
   */
  const closeHedge = useCallback(
    (_loanTokenId: bigint) =>
      runTx(TX.closeHedge, "Close hedge", async () => {
        throw new Error(
          "A hedge cannot be closed on its own — SwapEngine.closeSwapByLoan only accepts calls from LoanManager. Repay the loan (which unwinds the hedge in the same transaction), or let it run to maturity, where the next settlement closes it."
        );
      }),
    [runTx]
  );

  // ----------------------------------------------------------
  // ESCROW
  // ----------------------------------------------------------

  const depositToEscrow = useCallback(
    (amount: string) =>
      runTx(TX.escrowDeposit, "Deposit to escrow", async () => {
        const parsed = parseUsdcInput(amount);
        if (parsed <= ZERO) throw new Error("Enter an amount greater than zero.");
        if (parsed > snapshot.usdcBalance) {
          throw new Error(
            `You only hold ${formatUsdc(snapshot.usdcBalance)} USDC. Lower the amount, or mint test USDC on the Admin page.`
          );
        }
        return approveThenRun(CONTRACT_ADDRESSES.EscrowManager, parsed, "Deposit to escrow", async (c) => {
          const tx = await c.escrowManager.deposit(parsed);
          reportHash(tx?.hash);
          stage("Depositing to escrow", "Waiting for confirmation…");
          return tx.wait();
        });
      }),
    [approveThenRun, reportHash, runTx, snapshot.usdcBalance, stage]
  );

  const withdrawFromEscrow = useCallback(
    (amount: string) =>
      runTx(TX.escrowWithdraw, "Withdraw from escrow", async () => {
        const parsed = parseUsdcInput(amount);
        if (parsed <= ZERO) throw new Error("Enter an amount greater than zero.");
        if (parsed > snapshot.escrowAvailable) {
          throw new Error(
            `Only ${formatUsdc(snapshot.escrowAvailable)} USDC is free in escrow${
              snapshot.escrowLocked > ZERO
                ? ` — ${formatUsdc(snapshot.escrowLocked)} USDC is locked against a pending settlement`
                : ""
            }.`
          );
        }
        const contracts = await getWriteContracts();
        const tx = await contracts.escrowManager.withdraw(parsed);
        reportHash(tx?.hash);
        stage("Withdrawing from escrow", "Waiting for confirmation…");
        return tx.wait();
      }),
    [reportHash, runTx, snapshot.escrowAvailable, snapshot.escrowLocked, stage]
  );

  /**
   * Owner/keeper only: execute a specific DvP settlement id directly.
   * Regular users should use settleSwap instead.
   */
  const executeSettlement = useCallback(
    (settlementId: string) =>
      runTx(TX.executeSettlement, "Execute DvP settlement", async () => {
        const id = parseId(settlementId);
        if (!id) throw new Error("Enter a valid settlement ID (a whole number greater than zero).");
        const contracts = await getWriteContracts();
        const tx = await contracts.dvpEngine.executeSettlement(id);
        reportHash(tx?.hash);
        stage("Executing settlement", "Waiting for confirmation…");
        return tx.wait();
      }),
    [reportHash, runTx, stage]
  );

  // ----------------------------------------------------------
  // ADMIN
  // ----------------------------------------------------------

  const mintUsdc = useCallback(
    (to: string, amount: string) =>
      runTx(mintTxKey(to), "Mint test USDC", async () => {
        const parsed = parseUsdcInput(amount);
        if (parsed <= ZERO) throw new Error("Enter an amount greater than zero.");
        const recipient = (to || address || "").trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) throw new Error("Enter a valid recipient address.");
        const contracts = await getWriteContracts();
        const tx = await contracts.mockUSDC.mint(recipient, parsed);
        reportHash(tx?.hash);
        stage("Minting", "Waiting for confirmation…");
        return tx.wait();
      }),
    [address, reportHash, runTx, stage]
  );

  const setGovernanceValue = useCallback(
    (method: string, args: Array<string | bigint>) =>
      runTx(govTxKey(method), `Governance · ${method}`, async () => {
        const contracts = await getWriteContracts();
        const fn = (contracts.governance as any)[method];
        if (typeof fn !== "function") throw new Error(`Governance has no method "${method}".`);
        const tx = await fn(...args);
        reportHash(tx?.hash);
        stage("Submitting governance update", "Waiting for confirmation…");
        return tx.wait();
      }),
    [reportHash, runTx, stage]
  );

  const setEthPrice = useCallback(
    (priceUsd: string) =>
      runTx(TX.setEthPrice, "Update ETH oracle price", async () => {
        const value = Number(priceUsd);
        if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a price greater than zero.");
        const contracts = await getWriteContracts();
        const scaled = parseUnits(priceUsd.trim(), snapshot.oracleDecimals);
        const tx = await contracts.priceOracle.setEthPrice(scaled);
        reportHash(tx?.hash);
        stage("Updating oracle", "Waiting for confirmation…");
        return tx.wait();
      }),
    [reportHash, runTx, snapshot.oracleDecimals, stage]
  );

  // ----------------------------------------------------------
  // DERIVED RISK NUMBERS
  // ----------------------------------------------------------

  /**
   * The ETH price at which health factor hits exactly 1.0:
   *
   *   collateralEth * P_liq * threshold = debt
   *   =>  P_liq = debt / (collateralEth * threshold)
   */
  const liquidationPriceUsd = useMemo(() => {
    const collateralEth = Number(formatEther(loanApi.loan?.collateralEth ?? ZERO));
    const debtUsdc = toUsdcNumber(loanApi.debt);
    const thresholdBps = Number(snapshot.liquidationThresholdBps || BigInt(8000));
    if (!collateralEth || !debtUsdc || !thresholdBps) return 0;
    return (debtUsdc * 10000) / (collateralEth * thresholdBps);
  }, [loanApi.debt, loanApi.loan?.collateralEth, snapshot.liquidationThresholdBps]);

  /** How far ETH can fall before liquidation, as a percentage of spot. */
  const liquidationDistancePct = useMemo(() => {
    if (!liquidationPriceUsd || !ethPriceUsd) return 0;
    return ((ethPriceUsd - liquidationPriceUsd) / ethPriceUsd) * 100;
  }, [ethPriceUsd, liquidationPriceUsd]);

  const collateralEthAmount = useMemo(
    () => Number(formatEther(loanApi.loan?.collateralEth ?? ZERO)),
    [loanApi.loan?.collateralEth]
  );

  /** Wallet + pool + escrow + collateral, less debt. Everything in USD. */
  const portfolioValueUsd = useMemo(() => {
    const wallet = toUsdcNumber(snapshot.usdcBalance);
    const supplied = toUsdcNumber(snapshot.poolDeposit);
    const escrow = toUsdcNumber(snapshot.escrowAvailable + snapshot.escrowLocked);
    const collateral = collateralEthAmount * ethPriceUsd;
    const debt = toUsdcNumber(loanApi.debt);
    return { wallet, supplied, escrow, collateral, debt, net: wallet + supplied + escrow + collateral - debt };
  }, [
    collateralEthAmount,
    ethPriceUsd,
    loanApi.debt,
    snapshot.escrowAvailable,
    snapshot.escrowLocked,
    snapshot.poolDeposit,
    snapshot.usdcBalance,
  ]);

  const isBusy = useCallback((key?: string) => (key ? pending === key : pending !== null), [pending]);

  /** Dismiss the error banner without waiting for the next successful read. */
  const clearError = useCallback(() => {
    setError(null);
    setTxMessage(null);
  }, []);

  return {
    ...snapshot,
    utilizationBps,
    ethPriceUsd,

    address,
    isConnected,
    isSepolia,

    loan: loanApi.loan,
    debt: loanApi.debt,
    collateralValue: loanApi.collateralValue,
    healthFactorBps: loanApi.healthFactorBps,
    ltvBps: loanApi.ltvBps,
    hasActiveLoan: loanApi.hasActiveLoan,

    swap: swapApi.swap,
    swapId: swapApi.swapId,
    swapTokenId: swapApi.swapTokenId,
    hasActiveSwap: swapApi.hasActiveSwap,

    // derived risk / portfolio
    liquidationPriceUsd,
    liquidationDistancePct,
    collateralEthAmount,
    portfolioValueUsd,

    isLoading: isLoading || loanApi.isLoading || swapApi.isLoading,
    /** Which action is in flight, or null. */
    pending,
    isBusy,
    /** Kept for compatibility — true while ANY action is in flight. */
    isTxLoading: pending !== null,
    error: error || loanApi.error || swapApi.error,
    clearError,
    txMessage,
    txStep,
    lastUpdated,

    refetch,
    previewSettlement,
    depositToPool,
    withdrawFromPool,
    borrow,
    repay,
    liquidate,
    openHedge,
    closeHedge,
    settleSwap,
    depositToEscrow,
    withdrawFromEscrow,
    executeSettlement,
    mintUsdc,
    setGovernanceValue,
    setEthPrice,
  };
}

export type ProtocolApi = ReturnType<typeof useProtocolState>;

// ============================================================
// SHARED STORE
// ============================================================

/**
 * Why this exists.
 *
 * Every page and panel used to call useProtocol() directly, which meant each
 * one built its OWN copy of the state and its own polling. Marketplace and
 * DvPTradePanel are mounted together, so the escrow balance genuinely rendered
 * as 100.00 in one panel and 600.00 in the other. A transaction fired from a
 * panel refetched only that panel's copy, which is why nothing updated until a
 * manual page reload, and why the Hedge page never showed a freshly opened
 * swap. One provider, one copy, every consumer in sync.
 */
const ProtocolContext = createContext<ProtocolApi | null>(null);

export function ProtocolProvider({ children }: { children: ReactNode }) {
  const value = useProtocolState();
  return createElement(ProtocolContext.Provider, { value }, children);
}

export function useProtocol(): ProtocolApi {
  const context = useContext(ProtocolContext);
  if (!context) {
    throw new Error(
      "useProtocol must be used inside <ProtocolProvider>. Wrap the app in App.js so every page shares one copy of protocol state."
    );
  }
  return context;
}

export default useProtocol;
