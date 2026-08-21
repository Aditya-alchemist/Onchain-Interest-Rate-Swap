import React, { useState } from "react";
import { Boxes, Info, Play } from "lucide-react";

import { formatUsdc, useProtocol } from "../hooks/useProtocol";

export default function DvPTradePanel() {
  const protocol = useProtocol();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [swapId, setSwapId] = useState("");

  const activeSwap = protocol.swapId ? protocol.swapId.toString() : "";

  return (
    <div className="dvp-grid">
      <section className="panel-card trade-ticket">
        <div className="panel-header compact"><h2>Escrow</h2><Boxes size={18} /></div>
        <div className="quote-list tight">
          <div><span>Available</span><strong>{formatUsdc(protocol.escrowAvailable)} USDC</strong></div>
          <div><span>Locked</span><strong>{formatUsdc(protocol.escrowLocked)} USDC</strong></div>
        </div>
        <label>Deposit</label>
        <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="500.00" />
        <button className="buy" disabled={protocol.isTxLoading} onClick={() => protocol.depositToEscrow(depositAmount)}>
          Approve & deposit
        </button>
        <label>Withdraw</label>
        <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="100.00" />
        <button className="secondary" disabled={protocol.isTxLoading} onClick={() => protocol.withdrawFromEscrow(withdrawAmount)}>
          Withdraw escrow
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
        />
        <button
          disabled={protocol.isTxLoading}
          onClick={() => protocol.settleSwap(swapId || activeSwap)}
        >
          Settle swap
        </button>
        {activeSwap && (
          <button className="secondary" type="button" onClick={() => setSwapId(activeSwap)}>
            Use my swap #{activeSwap}
          </button>
        )}
        <p>Settlement nets the fixed and floating legs and moves the difference through escrow via delivery-versus-payment. Run it once each interval has elapsed.</p>
      </section>
    </div>
  );
}
