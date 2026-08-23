import React from "react";
import { Layers3 } from "lucide-react";

import DvPTradePanel from "../components/DvPTradePanel";
import StatStrip from "../components/StatStrip";
import { formatUsdc, useProtocol } from "../hooks/useProtocol";

export default function Marketplace() {
  const protocol = useProtocol();

  const available = Number(protocol.escrowAvailable);
  const locked = Number(protocol.escrowLocked);
  const total = available + locked;
  const availPct = total > 0 ? (available / total) * 100 : 0;
  const lockedPct = total > 0 ? (locked / total) * 100 : 0;

  return (
    <div className="page-grid split-grid">
      <section className="hero-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">DVP SETTLEMENT</span>
            <h1>Escrow & delivery-versus-payment</h1>
          </div>
          <div className="price-chip"><span>Escrow total</span><strong style={{ color: "var(--blue)" }}>{formatUsdc(protocol.escrowAvailable + protocol.escrowLocked)}</strong></div>
        </div>

        <div className="chart-panel">
          <div className="chart-head">
            <div>
              <h3>Escrow composition</h3>
              <p>Available balance can be withdrawn; locked balance is committed to pending settlements.</p>
            </div>
          </div>

          <div className="chart-legend">
            <span><i style={{ background: "var(--up)" }} /> Available {availPct.toFixed(0)}%</span>
            <span><i style={{ background: "var(--amber)" }} /> Locked {lockedPct.toFixed(0)}%</span>
          </div>

          <div className="health-meter" style={{ height: 14, margin: "8px 0 20px", display: "flex" }}>
            <div style={{ width: `${availPct}%`, background: "var(--up)", borderRadius: 0 }} />
            <div style={{ width: `${lockedPct}%`, background: "var(--amber)", borderRadius: 0 }} />
          </div>

          <div className="loan-card-values" style={{ marginBottom: 0 }}>
            <div className="loan-value">
              <span className="loan-value-label">Available</span>
              <span className="loan-value-number">{formatUsdc(protocol.escrowAvailable)}</span>
              <span className="loan-value-asset">USDC · withdrawable</span>
            </div>
            <div className="loan-value">
              <span className="loan-value-label">Locked</span>
              <span className="loan-value-number">{formatUsdc(protocol.escrowLocked)}</span>
              <span className="loan-value-asset">USDC · in settlement</span>
            </div>
          </div>
        </div>

        <StatStrip
          items={[
            { label: "Free escrow", value: `${formatUsdc(protocol.escrowAvailable)} USDC`, tone: "green" },
            { label: "Locked escrow", value: `${formatUsdc(protocol.escrowLocked)} USDC`, tone: "amber" },
            { label: "Swap token", value: protocol.swapTokenId ? `#${protocol.swapTokenId}` : "None", tone: "blue" },
            { label: "Interval", value: `${Number(protocol.settlementInterval)}s`, tone: "blue" },
          ]}
        />
      </section>

      <aside className="right-stack wide-stack">
        <div className="panel-header compact" style={{ padding: "0 2px" }}>
          <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><Layers3 size={17} /> Settlement desk</h2>
        </div>
        <DvPTradePanel />
      </aside>
    </div>
  );
}
