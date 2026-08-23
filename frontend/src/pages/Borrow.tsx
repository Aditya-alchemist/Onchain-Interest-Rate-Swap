import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, Info, RotateCcw } from "lucide-react";

import LoanCard from "../components/LoanCard";
import StatStrip from "../components/StatStrip";
import HealthPreview, { computeLoanPreview } from "../components/HealthPreview";
import { formatBps, formatEth, formatFactor, formatUsdc, TX, useProtocol } from "../hooks/useProtocol";

export default function Borrow() {
  const protocol = useProtocol();
  const navigate = useNavigate();
  const [borrowAmount, setBorrowAmount] = useState("");
  const [collateralEth, setCollateralEth] = useState("");

  // Live risk preview — mirrors the on-chain LoanManager math so what the user
  // sees before signing is exactly what borrow() will enforce.
  const preview = useMemo(
    () => computeLoanPreview(collateralEth, borrowAmount, protocol.ethPriceUsd),
    [collateralEth, borrowAmount, protocol.ethPriceUsd]
  );

  const loanCard = useMemo(() => {
    if (!protocol.loan) return null;
    // Health factor can come back as a uint256 sentinel when debt is ~0.
    const hfRaw = Number(protocol.healthFactorBps) / 100;
    const healthFactor = Number.isFinite(hfRaw) && hfRaw < 100000 ? hfRaw : undefined;
    return {
      id: protocol.loan.tokenId.toString(),
      principal: Number(formatUsdc(protocol.loan.principalUsdc).replace(/,/g, "")),
      collateral: Number(formatEth(protocol.loan.collateralEth)),
      healthFactor,
      interestRate: Number(protocol.loan.borrowRateBps) / 100,
      hasHedge: Boolean(protocol.swapId),
      status: protocol.healthFactorBps < BigInt(10000) ? ("liquidatable" as const) : ("healthy" as const),
    };
  }, [protocol.healthFactorBps, protocol.loan, protocol.swapId]);

  /** Positive when the wallet cannot cover the live debt — the #1 repay revert. */
  const repayShortfall = useMemo(() => {
    if (!protocol.hasActiveLoan) return 0;
    const short = protocol.debt - protocol.usdcBalance;
    return short > BigInt(0) ? Number(short) : 0;
  }, [protocol.debt, protocol.hasActiveLoan, protocol.usdcBalance]);

  return (
    <div className="page-grid split-grid">
      <section className="hero-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">BORROW DESK</span>
            <h1>Borrow USDC against ETH</h1>
          </div>
          <div className="price-chip"><span>Current rate</span><strong style={{ color: "var(--down)" }}>{formatBps(protocol.borrowRateBps)}</strong></div>
        </div>

        <StatStrip
          items={[
            { label: "Debt", value: `${formatUsdc(protocol.debt)} USDC`, tone: "amber" },
            { label: "Collateral value", value: `$${formatUsdc(protocol.collateralValue)}`, tone: "green" },
            { label: "Health factor", value: formatFactor(protocol.healthFactorBps, protocol.hasActiveLoan), tone: "blue" },
            { label: "LTV", value: formatFactor(protocol.ltvBps, protocol.hasActiveLoan), tone: "red" },
          ]}
        />

        {loanCard ? (
          <LoanCard
            loan={loanCard}
            busy={protocol.isBusy(TX.repay)}
            onRepay={() => protocol.repay().catch(() => {})}
            onHedge={() => navigate("/hedge")}
          />
        ) : (
          <div className="empty-state">No active loan yet. Use the ticket on the right to open one.</div>
        )}
      </section>

      <aside className="right-stack">
        <section className="panel-card trade-ticket">
          <div className="panel-header compact"><h2>Open loan</h2><Banknote size={18} /></div>
          <label>Borrow amount (USDC)</label>
          <input value={borrowAmount} onChange={(event) => setBorrowAmount(event.target.value)} placeholder="500.00" />
          <label>ETH collateral</label>
          <input value={collateralEth} onChange={(event) => setCollateralEth(event.target.value)} placeholder="0.25" />

          <HealthPreview preview={preview} ethPriceUsd={protocol.ethPriceUsd} />

          <button
            className="buy"
            disabled={protocol.isBusy(TX.borrow) || protocol.hasActiveLoan || !preview.canSubmit}
            onClick={() => protocol.borrow(borrowAmount, collateralEth).catch(() => {})}
          >
            {protocol.isBusy(TX.borrow)
              ? "Working…"
              : protocol.hasActiveLoan
              ? "Loan already open"
              : preview.overLimit
              ? "Exceeds 75% borrow limit"
              : "Deposit ETH & borrow"}
          </button>
          <div className="ticket-hint">
            <Info size={14} />
            <span>Your ETH collateral is sent with the same transaction — no ERC-20 approval needed to open a loan.</span>
          </div>
        </section>

        <section className="panel-card trade-ticket">
          <div className="panel-header compact"><h2>Repay</h2><RotateCcw size={18} /></div>
          <label>Outstanding debt</label>
          <div className="big-number">{formatUsdc(protocol.debt)} <span style={{ fontSize: 15, color: "var(--muted)" }}>USDC</span></div>

          {protocol.hasActiveLoan && (
            <div className={`ticket-hint ${repayShortfall > 0 ? "warn" : ""}`}>
              <Info size={14} />
              <span>
                {repayShortfall > 0
                  ? `Your wallet holds ${formatUsdc(protocol.usdcBalance)} USDC — ${formatUsdc(
                      protocol.debt - protocol.usdcBalance
                    )} short of the debt. Withdraw from the pool or escrow first.`
                  : `Wallet holds ${formatUsdc(protocol.usdcBalance)} USDC — enough to clear the debt.${
                      protocol.swapId ? ` Repaying also unwinds hedge #${protocol.swapId}.` : ""
                    }`}
              </span>
            </div>
          )}

          <button
            disabled={protocol.isBusy(TX.repay) || !protocol.hasActiveLoan}
            onClick={() => protocol.repay().catch(() => {})}
          >
            {protocol.isBusy(TX.repay) ? "Working…" : "Approve & repay"}
          </button>
          <p>We read your live debt (interest keeps accruing), approve USDC with a small buffer, simulate the call to surface any revert reason, then repay in full.</p>
        </section>
      </aside>
    </div>
  );
}
