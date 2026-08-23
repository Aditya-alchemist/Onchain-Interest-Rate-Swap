import React, { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { formatUnits, parseUnits } from "viem";

import { describeError } from "../lib/errors";
import { formatBps, formatUsdc, TX, useProtocol } from "../hooks/useProtocol";

/**
 * ============================================================
 * HedgePanel
 * ============================================================
 *
 * This panel used to call useLoan() and useSwap() itself — and useSwap() with
 * no loan token id, which makes it bail out and return a null swap forever.
 * That is why a successful openSwap transaction left the Hedge page looking
 * completely unchanged. It now reads the shared protocol store, so the swap it
 * just opened appears the moment the transaction confirms, and every other
 * page sees it too.
 */

interface HedgePanelProps {
  loanTokenId?: bigint | number | string;
  loanTokenIdOverride?: bigint | number | string;
  onSuccess?: (swapId?: bigint) => void;
  className?: string;
}

const ZERO = BigInt(0);
const USDC_DECIMALS = 6;

const SWAP_STATUS: Record<number, string> = {
  0: "None",
  1: "Active",
  2: "Matured",
  3: "Closed",
};

function toBigInt(value: bigint | number | string | undefined): bigint {
  if (value === undefined || value === null || value === "") return ZERO;
  if (typeof value === "bigint") return value;
  try {
    return BigInt(value);
  } catch {
    return ZERO;
  }
}

function formatEth(value?: bigint): string {
  if (value === undefined) return "0.0000";
  return Number(formatUnits(value, 18)).toFixed(4);
}

function shorten(address?: string): string {
  if (!address) return "Wallet not connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Unix seconds -> local date/time, for maturity and settlement stamps. */
function stamp(seconds?: bigint): string {
  if (!seconds || seconds === ZERO) return "—";
  return new Date(Number(seconds) * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HedgePanel({
  loanTokenId,
  loanTokenIdOverride,
  onSuccess,
  className = "",
}: HedgePanelProps) {
  const protocol = useProtocol();

  const { address, isConnected, isSepolia, loan, hasActiveLoan, swap, swapId } = protocol;

  const [notional, setNotional] = useState("");
  const [fixedRate, setFixedRate] = useState("");
  const [duration, setDuration] = useState("30");
  const [settlementInterval, setSettlementInterval] = useState("86400");
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isOpeningSwap = protocol.isBusy(TX.openHedge);

  // ----------------------------------------------------------
  // Which loan are we hedging?
  // ----------------------------------------------------------

  const effectiveLoanTokenId = useMemo(() => {
    if (loanTokenIdOverride !== undefined) return toBigInt(loanTokenIdOverride);
    if (loanTokenId !== undefined) return toBigInt(loanTokenId);
    if (loan?.tokenId !== undefined) return toBigInt(loan.tokenId);
    return ZERO;
  }, [loan?.tokenId, loanTokenId, loanTokenIdOverride]);

  const maxNotional = useMemo(
    () => (loan?.principalUsdc ? toBigInt(loan.principalUsdc) : undefined),
    [loan?.principalUsdc]
  );

  const alreadyHedged = Boolean(swap && swap.status === 1);

  // Default the fixed rate to the live floating rate the first time we know it,
  // so the user has a sensible starting point instead of an empty box.
  const suggestedRate = useMemo(
    () => (Number(protocol.borrowRateBps) / 100).toFixed(2),
    [protocol.borrowRateBps]
  );

  /**
   * The deployed SwapEngine is itself the floating payer, and the deployed
   * EscrowManager only exposes deposit(), which credits msg.sender — so the
   * counterparty's escrow can never be funded by anyone. Any period where the
   * floating rate is above your fixed rate therefore owes YOU money and reverts
   * inside EscrowManager.lock. Warn before the hedge is opened, not after.
   */
  const rateWarning = useMemo(() => {
    const chosen = Number(fixedRate);
    const floating = Number(protocol.borrowRateBps) / 100;
    if (!Number.isFinite(chosen) || chosen <= 0) return null;
    if (chosen >= floating) return null;
    return `A fixed rate of ${chosen.toFixed(2)}% sits below the ${floating.toFixed(
      2
    )}% floating rate, so each period the protocol would owe you. The deployed counterparty escrow cannot be funded, so those settlements revert. Set the fixed rate at or above ${floating.toFixed(
      2
    )}% for a hedge that settles cleanly.`;
  }, [fixedRate, protocol.borrowRateBps]);

  // ----------------------------------------------------------
  // Validation (mirrors SwapEngine.openSwap's requires)
  // ----------------------------------------------------------

  function validate(): string | null {
    if (!isConnected) return "Connect your wallet first.";
    if (!isSepolia) return "Please switch to Sepolia.";
    if (effectiveLoanTokenId === ZERO) return "No loan to hedge — open a loan on the Borrow page first.";
    if (!hasActiveLoan) return "You do not have an active loan.";
    if (alreadyHedged) {
      return `Loan #${effectiveLoanTokenId} already has an open hedge (swap #${swapId}). SwapEngine rejects a second one.`;
    }
    if (!notional || !/^\d*\.?\d*$/.test(notional.trim()) || Number(notional) <= 0) {
      return "Enter a valid hedge notional.";
    }
    if (!fixedRate || Number(fixedRate) <= 0) return "Enter a valid fixed rate.";
    if (Number(fixedRate) > 100) return "The fixed rate cannot exceed 100%.";
    if (!duration || Number(duration) <= 0) return "Enter a valid duration.";
    if (!settlementInterval || Number(settlementInterval) <= 0) return "Enter a valid settlement interval.";

    const parsed = parseUnits(notional.trim(), USDC_DECIMALS);
    if (maxNotional !== undefined && parsed > maxNotional) {
      return `Notional cannot exceed your loan principal of ${formatUsdc(maxNotional)} USDC.`;
    }
    if (Number(settlementInterval) > Number(duration) * 86400) {
      return "The settlement interval is longer than the hedge itself — pick a shorter interval or a longer duration.";
    }
    return null;
  }

  // ----------------------------------------------------------
  // Submit
  // ----------------------------------------------------------

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    const validationError = validate();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    try {
      // openHedge does the parsing, runs the transaction through the shared
      // store, drives the toast, and refetches everything on success.
      const newSwapId = await protocol.openHedge(
        effectiveLoanTokenId,
        notional,
        fixedRate,
        duration,
        settlementInterval
      );

      setSuccessMessage(
        newSwapId ? `Hedge opened. Swap #${newSwapId.toString()} is now live.` : "Hedge opened successfully."
      );
      onSuccess?.(newSwapId ?? undefined);
      setNotional("");
    } catch (error: unknown) {
      setLocalError(describeError(error, "Failed to open hedge."));
    }
  }

  const errorMessage = localError || null;

  if (protocol.isLoading && !loan) {
    return (
      <section className={`hedge-panel ${className}`}>
        <div className="hedge-panel__loading">Loading loan information…</div>
      </section>
    );
  }

  return (
    <section className={`hedge-panel ${className}`}>
      <div className="hedge-panel__header">
        <div>
          <span className="hedge-panel__eyebrow">INTEREST RATE HEDGE</span>
          <h2 className="hedge-panel__title">Lock your borrowing rate</h2>
          <p className="hedge-panel__description">
            Convert your floating-rate exposure into a fixed-rate hedge using a HedgeFi interest-rate swap.
          </p>
        </div>

        <div className="hedge-panel__status">
          <span className={isConnected && isSepolia ? "status-dot status-dot--active" : "status-dot"} />
          <span>{isConnected ? shorten(address) : "Wallet not connected"}</span>
        </div>
      </div>

      <div className="hedge-panel__summary">
        <div className="hedge-summary-card">
          <span className="hedge-summary-card__label">Loan</span>
          <strong>{effectiveLoanTokenId > ZERO ? `#${effectiveLoanTokenId.toString()}` : "—"}</strong>
        </div>
        <div className="hedge-summary-card">
          <span className="hedge-summary-card__label">Principal</span>
          <strong>{formatUsdc(loan?.principalUsdc ? toBigInt(loan.principalUsdc) : undefined)} USDC</strong>
        </div>
        <div className="hedge-summary-card">
          <span className="hedge-summary-card__label">Floating rate</span>
          <strong>{formatBps(protocol.borrowRateBps)}</strong>
        </div>
        <div className="hedge-summary-card">
          <span className="hedge-summary-card__label">Collateral</span>
          <strong>{formatEth(loan?.collateralEth ? toBigInt(loan.collateralEth) : undefined)} ETH</strong>
        </div>
      </div>

      {/* Live hedge, read straight from the shared store. Before, this never
          appeared because the panel's private useSwap() call had no token id. */}
      {swap && (
        <div className={`hedge-active-card ${swap.status === 1 ? "is-active" : ""}`}>
          <div className="hedge-active-card__head">
            <div>
              <span className="hedge-summary-card__label">Open hedge</span>
              <strong>Swap #{swap.id.toString()}</strong>
            </div>
            <span className={`loan-status ${swap.status === 1 ? "loan-status-healthy" : "loan-status-closed"}`}>
              {SWAP_STATUS[swap.status] ?? "Unknown"}
            </span>
          </div>

          <div className="quote-list tight">
            <div><span>Notional</span><strong>{formatUsdc(swap.notionalUsdc)} USDC</strong></div>
            <div><span>Fixed rate you pay</span><strong>{formatBps(swap.fixedRateBps)}</strong></div>
            <div><span>Floating rate you receive</span><strong>{formatBps(protocol.borrowRateBps)}</strong></div>
            <div>
              <span>Net carry</span>
              <strong className={protocol.borrowRateBps > swap.fixedRateBps ? "tone-green" : "tone-red"}>
                {protocol.borrowRateBps > swap.fixedRateBps ? "+" : ""}
                {formatBps(
                  protocol.borrowRateBps > swap.fixedRateBps
                    ? protocol.borrowRateBps - swap.fixedRateBps
                    : swap.fixedRateBps - protocol.borrowRateBps
                )}
                {protocol.borrowRateBps > swap.fixedRateBps ? " in your favour" : " against you"}
              </strong>
            </div>
            <div><span>Settles every</span><strong>{(Number(swap.settlementInterval) / 3600).toFixed(1)}h</strong></div>
            <div><span>Last settled</span><strong>{stamp(swap.lastSettlementTime)}</strong></div>
            <div><span>Matures</span><strong>{stamp(swap.maturityTime)}</strong></div>
          </div>

          <p className="hedge-active-card__note">
            The hedge unwinds automatically when you repay the loan, or at maturity on the next settlement.
            Settle it from the Settlement desk on the Marketplace page.
          </p>
        </div>
      )}

      <form className="hedge-panel__form" onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="form-field__heading">
            <label htmlFor="hedge-notional">Hedge Notional</label>
            {maxNotional !== undefined && (
              <button
                type="button"
                className="form-field__max"
                onClick={() => setNotional(formatUnits(maxNotional, USDC_DECIMALS))}
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
              onChange={(event) => setNotional(event.target.value)}
            />
            <span>USDC</span>
          </div>
        </div>

        <div className="form-field">
          <div className="form-field__heading">
            <label htmlFor="hedge-fixed-rate">Fixed Rate</label>
            <button type="button" className="form-field__max" onClick={() => setFixedRate(suggestedRate)}>
              MATCH {suggestedRate}%
            </button>
          </div>
          <div className="input-with-suffix">
            <input
              id="hedge-fixed-rate"
              type="number"
              min="0"
              step="0.01"
              placeholder={suggestedRate}
              value={fixedRate}
              onChange={(event) => setFixedRate(event.target.value)}
            />
            <span>%</span>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="hedge-duration">Hedge Duration</label>
          <div className="input-with-suffix">
            <input
              id="hedge-duration"
              type="number"
              min="1"
              step="1"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
            <span>days</span>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="settlement-interval">Settlement Interval</label>
          <select
            id="settlement-interval"
            value={settlementInterval}
            onChange={(event) => setSettlementInterval(event.target.value)}
          >
            <option value="3600">Every hour</option>
            <option value="21600">Every 6 hours</option>
            <option value="43200">Every 12 hours</option>
            <option value="86400">Daily</option>
            <option value="604800">Weekly</option>
          </select>
        </div>

        <div className="hedge-panel__preview">
          <div>
            <span>Current floating rate</span>
            <strong>{formatBps(protocol.borrowRateBps)}</strong>
          </div>
          <div className="preview-arrow">→</div>
          <div>
            <span>Locked fixed rate</span>
            <strong>{fixedRate ? `${Number(fixedRate).toFixed(2)}%` : "—"}</strong>
          </div>
        </div>

        {errorMessage && <div className="hedge-panel__error">{errorMessage}</div>}
        {!errorMessage && rateWarning && (
          <div className="hedge-panel__warning">
            <AlertTriangle size={14} />
            <span>{rateWarning}</span>
          </div>
        )}
        {successMessage && <div className="hedge-panel__success">{successMessage}</div>}

        <button
          type="submit"
          className="hedge-panel__submit"
          disabled={isOpeningSwap || !isConnected || !isSepolia || !hasActiveLoan || alreadyHedged}
        >
          {isOpeningSwap
            ? "Opening Hedge…"
            : !isConnected
            ? "Connect Wallet"
            : !isSepolia
            ? "Switch to Sepolia"
            : !hasActiveLoan
            ? "No Active Loan"
            : alreadyHedged
            ? `Already hedged (swap #${swapId})`
            : "Open Hedge"}
        </button>
      </form>

      <div className="hedge-panel__footer">
        <span>Settlement is handled by HedgeFi&apos;s settlement engine.</span>
        <span>Sepolia</span>
      </div>
    </section>
  );
}
