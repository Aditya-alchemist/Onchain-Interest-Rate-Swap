import React, { useEffect, useState } from "react";
import { AlertTriangle, Boxes, CheckCircle2, Info, Play, RefreshCw } from "lucide-react";

import { formatBps, formatUsdc, SettlementPreview, TX, useProtocol } from "../hooks/useProtocol";

/** Turn a period in seconds into something readable on a ticket. */
function humanPeriod(seconds: bigint): string {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "—";
  if (total < 3600) return `${Math.round(total / 60)}m`;
  if (total < 86400) return `${(total / 3600).toFixed(1)}h`;
  return `${(total / 86400).toFixed(2)}d`;
}

export default function DvPTradePanel() {
  const protocol = useProtocol();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [swapId, setSwapId] = useState("");

  const activeSwap = protocol.swapId ? protocol.swapId.toString() : "";
  const targetSwap = swapId.trim() || activeSwap;

  // Live settlement preview. The old panel fired settleSwap blind and the user
  // got "transaction execution reverted" with no idea why. Now the exact net,
  // the payer, and the reason it would fail are on screen before signing.
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!targetSwap) {
      setPreview(null);
      return;
    }

    setPreviewing(true);
    const handle = setTimeout(() => {
      protocol
        .previewSettlement(targetSwap)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // lastUpdated re-runs the preview after every confirmed transaction and
    // after each poll, so the ticket never shows a stale net.
  }, [protocol.previewSettlement, protocol.lastUpdated, targetSwap]);

  const settleBusy = protocol.isBusy(TX.settleSwap);

  return (
    <div className="dvp-grid">
      <section className="panel-card trade-ticket">
        <div className="panel-header compact"><h2>Escrow</h2><Boxes size={18} /></div>
        <div className="quote-list tight">
          <div><span>Available</span><strong>{formatUsdc(protocol.escrowAvailable)} USDC</strong></div>
          <div><span>Locked</span><strong>{formatUsdc(protocol.escrowLocked)} USDC</strong></div>
          <div><span>Wallet</span><strong>{formatUsdc(protocol.usdcBalance)} USDC</strong></div>
        </div>

        <label>Deposit</label>
        <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="500.00" />
        <button
          className="buy"
          disabled={protocol.isBusy(TX.escrowDeposit)}
          onClick={() => protocol.depositToEscrow(depositAmount).catch(() => {})}
        >
          {protocol.isBusy(TX.escrowDeposit) ? "Working…" : "Approve & deposit"}
        </button>

        <label>Withdraw</label>
        <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="100.00" />
        <button
          className="secondary"
          disabled={protocol.isBusy(TX.escrowWithdraw)}
          onClick={() => protocol.withdrawFromEscrow(withdrawAmount).catch(() => {})}
        >
          {protocol.isBusy(TX.escrowWithdraw) ? "Working…" : "Withdraw escrow"}
        </button>

        <div className="ticket-hint">
          <Info size={14} />
          <span>Escrow deposits use the same smart flow: allowance check, approve only if needed, then deposit.</span>
        </div>
      </section>

      <section className="panel-card trade-ticket">
        <div className="panel-header compact"><h2>Settle swap</h2><Play size={18} /></div>

        <label>Swap ID</label>
        <input
          value={swapId}
          onChange={(event) => setSwapId(event.target.value)}
          placeholder={activeSwap || "1"}
          inputMode="numeric"
        />

        {activeSwap && (
          <button className="ghost-link" type="button" onClick={() => setSwapId(activeSwap)}>
            Use my swap #{activeSwap}
          </button>
        )}

        {targetSwap && (
          <div className={`settle-preview ${preview?.ok ? "ok" : preview ? "blocked" : ""}`}>
            {previewing && !preview ? (
              <div className="settle-preview__row muted">
                <RefreshCw size={13} className="spin" />
                <span>Reading swap #{targetSwap} on-chain…</span>
              </div>
            ) : preview ? (
              <>
                <div className="quote-list tight">
                  <div>
                    <span>Accrued period</span>
                    <strong>{humanPeriod(preview.periodSeconds)}</strong>
                  </div>
                  <div>
                    <span>Fixed leg</span>
                    <strong>{formatUsdc(preview.fixedLeg)} USDC</strong>
                  </div>
                  <div>
                    <span>Floating leg @ {formatBps(preview.floatingRateBps)}</span>
                    <strong>{formatUsdc(preview.floatingLeg)} USDC</strong>
                  </div>
                  <div>
                    <span>Net payment</span>
                    <strong className={preview.direction === "fixedReceives" ? "tone-green" : preview.direction === "floatingReceives" ? "tone-red" : ""}>
                      {formatUsdc(preview.amount)} USDC
                      {preview.direction === "fixedReceives"
                        ? " → you"
                        : preview.direction === "floatingReceives"
                        ? " → counterparty"
                        : ""}
                    </strong>
                  </div>
                </div>

                <div className={`settle-preview__row ${preview.ok ? "ok" : "blocked"}`}>
                  {preview.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  <span>
                    {preview.ok
                      ? preview.amount === BigInt(0)
                        ? "Nothing is owed either way this period — settling just advances the clock."
                        : "Ready to settle. The payer has enough free escrow to cover the net."
                      : preview.blocker}
                  </span>
                </div>
              </>
            ) : (
              <div className="settle-preview__row muted">
                <Info size={13} />
                <span>Could not read that swap. Check the ID.</span>
              </div>
            )}
          </div>
        )}

        <button
          disabled={settleBusy || !targetSwap || (preview ? !preview.ok : false)}
          onClick={() => protocol.settleSwap(targetSwap).catch(() => {})}
        >
          {settleBusy ? "Settling…" : "Settle swap"}
        </button>

        <p>
          Settlement nets the fixed and floating legs and moves the difference through escrow via
          delivery-versus-payment. Whoever owes money must have that much free (unlocked) in escrow, or
          EscrowManager.lock reverts and the whole settlement fails.
        </p>
      </section>
    </div>
  );
}
