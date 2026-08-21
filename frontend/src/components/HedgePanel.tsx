import React, {useState, useMemo } from "react";
import { formatUnits, parseUnits } from "viem";

import { useWallet } from "../hooks/useWallet";
import { useLoan } from "../hooks/useLoan";
import { useSwap } from "../hooks/useSwap";
import { getContract } from "../lib/contracts";

// ============================================================
// TYPES
// ============================================================

interface HedgePanelProps {
  loanTokenId?: bigint | number | string;
  loanTokenIdOverride?: bigint | number | string;
  onSuccess?: (swapId?: bigint) => void;
  className?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const ZERO = BigInt("0");
const USDC_DECIMALS = 6;
const SECONDS_PER_DAY = BigInt("86400");

// ============================================================
// HELPERS
// ============================================================

function toBigInt(
  value: bigint | number | string | undefined
): bigint {
  if (value === undefined || value === "") {
    return ZERO;
  }

  if (typeof value === "bigint") {
    return value;
  }

  return BigInt(value);
}

function formatUsdc(value?: bigint): string {
  if (value === undefined) {
    return "0.00";
  }

  return Number(
    formatUnits(value, USDC_DECIMALS)
  ).toFixed(2);
}

function formatBps(value?: bigint): string {
  if (value === undefined) {
    return "0.00%";
  }

  return `${(Number(value) / 100).toFixed(2)}%`;
}

function formatEth(value?: bigint): string {
  if (value === undefined) {
    return "0.0000";
  }

  return Number(
    formatUnits(value, 18)
  ).toFixed(4);
}

// ============================================================
// COMPONENT
// ============================================================

export default function HedgePanel({
  loanTokenId,
  loanTokenIdOverride,
  onSuccess,
  className = "",
}: HedgePanelProps) {
  const {
    isConnected,
    isSepolia,
    shortAddress,
  } = useWallet();

  const {
    loan,
    hasActiveLoan,
    isLoading: isLoanLoading,
  } = useLoan();

  const {
    openSwap,
    isLoading: isOpeningSwap,
    error: openSwapError,
  } = useSwap();

  // ==========================================================
  // STATE
  // ==========================================================

  const [notional, setNotional] = useState("");
  const [fixedRate, setFixedRate] = useState("");
  const [duration, setDuration] = useState("30");
  const [settlementInterval, setSettlementInterval] =
    useState("86400");

  const [localError, setLocalError] =
    useState<string | null>(null);

  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  // ==========================================================
  // LOAN TOKEN ID
  // ==========================================================

  const effectiveLoanTokenId = useMemo(() => {
    if (loanTokenIdOverride !== undefined) {
      return toBigInt(loanTokenIdOverride);
    }

    if (loanTokenId !== undefined) {
      return toBigInt(loanTokenId);
    }

    if (loan?.tokenId !== undefined) {
      return toBigInt(loan.tokenId);
    }

    return ZERO;
  }, [
    loanTokenId,
    loanTokenIdOverride,
    loan,
  ]);

  // ==========================================================
  // MAX NOTIONAL
  // ==========================================================

  const maxNotional = useMemo(() => {
    if (!loan?.principalUsdc) {
      return undefined;
    }

    return toBigInt(loan.principalUsdc);
  }, [loan]);

  // ==========================================================
  // VALIDATION
  // ==========================================================

  function validate(): string | null {
    if (!isConnected) {
      return "Connect your wallet first.";
    }

    if (!isSepolia) {
      return "Please switch to Sepolia.";
    }

    if (effectiveLoanTokenId === ZERO) {
      return "No valid loan token ID was provided.";
    }

    if (!hasActiveLoan) {
      return "You do not have an active loan.";
    }

    if (!notional || Number(notional) <= 0) {
      return "Enter a valid hedge notional.";
    }

    if (!fixedRate || Number(fixedRate) <= 0) {
      return "Enter a valid fixed rate.";
    }

    if (!duration || Number(duration) <= 0) {
      return "Enter a valid duration.";
    }

    if (
      !settlementInterval ||
      Number(settlementInterval) <= 0
    ) {
      return "Enter a valid settlement interval.";
    }

    if (
      maxNotional !== undefined &&
      parseUnits(notional, USDC_DECIMALS) > maxNotional
    ) {
      return `Notional cannot exceed your loan principal of ${formatUsdc(
        maxNotional
      )} USDC.`;
    }

    return null;
  }

  // ==========================================================
  // OPEN HEDGE
  // ==========================================================

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLocalError(null);
    setSuccessMessage(null);

    const validationError = validate();

    if (validationError) {
      setLocalError(validationError);
      return;
    }

    try {
      const notionalUsdc = parseUnits(
        notional,
        USDC_DECIMALS
      );

      const fixedRateBps = BigInt(
        Math.round(Number(fixedRate) * 100)
      );

      const durationSeconds =
        BigInt(duration) * SECONDS_PER_DAY;

      const settlementIntervalSeconds =
        BigInt(settlementInterval);

      /*
       * Current useSwap API:
       *
       * openSwap(
       *   loanTokenId,
       *   notionalUsdc,
       *   fixedRateBps,
       *   duration,
       *   settlementInterval
       * )
       */

      const receipt = await openSwap(
        effectiveLoanTokenId,
        notionalUsdc,
        fixedRateBps,
        durationSeconds,
        settlementIntervalSeconds
      );

      const openedLog = receipt?.logs?.find(
        (log: any) =>
          log?.fragment?.name === "SwapOpened"
      );

      const swapId =
        openedLog?.args?.swapId !== undefined
          ? BigInt(openedLog.args.swapId)
          : BigInt(
              await getContract("SwapEngine").loanToSwapId(
                effectiveLoanTokenId
              )
            );

      setSuccessMessage(
        swapId !== undefined
          ? `Hedge opened successfully. Swap #${swapId.toString()}`
          : "Hedge opened successfully."
      );

      onSuccess?.(swapId);

      setNotional("");
      setFixedRate("");
    } catch (error: unknown) {
      const err = error as {
        shortMessage?: string;
        reason?: string;
        message?: string;
      };

      setLocalError(
        err.shortMessage ||
          err.reason ||
          err.message ||
          "Failed to open hedge."
      );
    }
  }

  // ==========================================================
  // ERROR
  // ==========================================================

  const errorMessage =
    localError ||
    openSwapError?.message ||
    null;

  // ==========================================================
  // LOADING
  // ==========================================================

  if (isLoanLoading) {
    return (
      <section className={`hedge-panel ${className}`}>
        <div className="hedge-panel__loading">
          Loading loan information...
        </div>
      </section>
    );
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <section className={`hedge-panel ${className}`}>
      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="hedge-panel__header">
        <div>
          <span className="hedge-panel__eyebrow">
            INTEREST RATE HEDGE
          </span>

          <h2 className="hedge-panel__title">
            Lock your borrowing rate
          </h2>

          <p className="hedge-panel__description">
            Convert your floating-rate exposure into a
            fixed-rate hedge using a HedgeFi
            interest-rate swap.
          </p>
        </div>

        <div className="hedge-panel__status">
          <span
            className={
              isConnected && isSepolia
                ? "status-dot status-dot--active"
                : "status-dot"
            }
          />

          <span>
            {isConnected
              ? shortAddress || "Connected"
              : "Wallet not connected"}
          </span>
        </div>
      </div>

      {/* ======================================================
          LOAN SUMMARY
      ====================================================== */}

      <div className="hedge-panel__summary">
        <div className="hedge-summary-card">
          <span className="hedge-summary-card__label">
            Loan
          </span>

          <strong>
            {effectiveLoanTokenId > ZERO
              ? `#${effectiveLoanTokenId.toString()}`
              : "—"}
          </strong>
        </div>

        <div className="hedge-summary-card">
          <span className="hedge-summary-card__label">
            Principal
          </span>

          <strong>
            {formatUsdc(
              loan?.principalUsdc
                ? toBigInt(loan.principalUsdc)
                : undefined
            )}{" "}
            USDC
          </strong>
        </div>

        <div className="hedge-summary-card">
          <span className="hedge-summary-card__label">
            Current rate
          </span>

          <strong>
            {loan?.borrowRateBps !== undefined
              ? formatBps(
                  toBigInt(loan.borrowRateBps)
                )
              : "—"}
          </strong>
        </div>

        <div className="hedge-summary-card">
          <span className="hedge-summary-card__label">
            Collateral
          </span>

          <strong>
            {formatEth(
              loan?.collateralEth
                ? toBigInt(loan.collateralEth)
                : undefined
            )}{" "}
            ETH
          </strong>
        </div>
      </div>

      {/* ======================================================
          FORM
      ====================================================== */}

      <form
        className="hedge-panel__form"
        onSubmit={handleSubmit}
      >
        {/* ====================================================
            NOTIONAL
        ==================================================== */}

        <div className="form-field">
          <div className="form-field__heading">
            <label htmlFor="hedge-notional">
              Hedge Notional
            </label>

            {maxNotional !== undefined && (
              <button
                type="button"
                className="form-field__max"
                onClick={() =>
                  setNotional(
                    formatUsdc(maxNotional)
                  )
                }
              >
                MAX
              </button>
            )}
          </div>

          <div className="input-with-suffix">
            <input
              id="hedge-notional"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={notional}
              onChange={(event) =>
                setNotional(event.target.value)
              }
            />

            <span>USDC</span>
          </div>
        </div>

        {/* ====================================================
            FIXED RATE
        ==================================================== */}

        <div className="form-field">
          <label htmlFor="hedge-fixed-rate">
            Fixed Rate
          </label>

          <div className="input-with-suffix">
            <input
              id="hedge-fixed-rate"
              type="number"
              min="0"
              step="0.01"
              placeholder="8.00"
              value={fixedRate}
              onChange={(event) =>
                setFixedRate(event.target.value)
              }
            />

            <span>%</span>
          </div>
        </div>

        {/* ====================================================
            DURATION
        ==================================================== */}

        <div className="form-field">
          <label htmlFor="hedge-duration">
            Hedge Duration
          </label>

          <div className="input-with-suffix">
            <input
              id="hedge-duration"
              type="number"
              min="1"
              step="1"
              value={duration}
              onChange={(event) =>
                setDuration(event.target.value)
              }
            />

            <span>days</span>
          </div>
        </div>

        {/* ====================================================
            SETTLEMENT
        ==================================================== */}

        <div className="form-field">
          <label htmlFor="settlement-interval">
            Settlement Interval
          </label>

          <select
            id="settlement-interval"
            value={settlementInterval}
            onChange={(event) =>
              setSettlementInterval(
                event.target.value
              )
            }
          >
            <option value="3600">
              Every hour
            </option>

            <option value="21600">
              Every 6 hours
            </option>

            <option value="43200">
              Every 12 hours
            </option>

            <option value="86400">
              Daily
            </option>

            <option value="604800">
              Weekly
            </option>
          </select>
        </div>

        {/* ====================================================
            RATE PREVIEW
        ==================================================== */}

        <div className="hedge-panel__preview">
          <div>
            <span>Current floating rate</span>

            <strong>
              {loan?.borrowRateBps !== undefined
                ? formatBps(
                    toBigInt(
                      loan.borrowRateBps
                    )
                  )
                : "—"}
            </strong>
          </div>

          <div className="preview-arrow">
            →
          </div>

          <div>
            <span>Locked fixed rate</span>

            <strong>
              {fixedRate
                ? `${Number(fixedRate).toFixed(2)}%`
                : "—"}
            </strong>
          </div>
        </div>

        {/* ====================================================
            ERROR
        ==================================================== */}

        {errorMessage && (
          <div className="hedge-panel__error">
            {errorMessage}
          </div>
        )}

        {/* ====================================================
            SUCCESS
        ==================================================== */}

        {successMessage && (
          <div className="hedge-panel__success">
            {successMessage}
          </div>
        )}

        {/* ====================================================
            SUBMIT
        ==================================================== */}

        <button
          type="submit"
          className="hedge-panel__submit"
          disabled={
            isOpeningSwap ||
            !isConnected ||
            !isSepolia ||
            !hasActiveLoan
          }
        >
          {isOpeningSwap
            ? "Opening Hedge..."
            : !isConnected
            ? "Connect Wallet"
            : !isSepolia
            ? "Switch to Sepolia"
            : !hasActiveLoan
            ? "No Active Loan"
            : "Open Hedge"}
        </button>
      </form>

      {/* ======================================================
          FOOTER
      ====================================================== */}

      <div className="hedge-panel__footer">
        <span>
          Settlement is handled by HedgeFi&apos;s
          settlement engine.
        </span>

        <span>Sepolia</span>
      </div>
    </section>
  );
}
