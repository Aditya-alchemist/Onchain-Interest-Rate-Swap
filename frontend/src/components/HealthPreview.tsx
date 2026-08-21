import React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

/**
 * Live loan-risk preview for the Borrow desk.
 *
 * The numbers here are computed with the SAME formulas the deployed
 * `LoanManager` uses on-chain, so what the user sees before signing
 * matches what `borrow()` will actually enforce:
 *
 *   collateralValueUsdc = collateralEth * ethPrice
 *   maxBorrowable       = collateralValueUsdc * COLLATERAL_FACTOR_BPS / BPS   (75%)
 *   healthFactorBps     = collateralValueUsdc * LIQUIDATION_THRESHOLD_BPS / debt (80%)
 *                         ( >= 10000 healthy, < 10000 liquidatable )
 *   borrow() reverts with ExceedsBorrowLimit when borrow > maxBorrowable
 *
 * These are `public constant` values baked into the LoanManager bytecode,
 * so they can only change with a redeploy (which also changes the contract
 * address the app points at). We mirror them here rather than reading the
 * Governance copies, which LoanManager does not consult for these checks.
 */
export const BPS = 10000;
export const COLLATERAL_FACTOR_BPS = 7500; // 75% max LTV
export const LIQUIDATION_THRESHOLD_BPS = 8000; // 80% liquidation

export type RiskTier = "idle" | "ready" | "safe" | "moderate" | "aggressive" | "reject";

export interface LoanPreview {
  /** Both a positive collateral amount and a positive oracle price are present. */
  hasCollateral: boolean;
  /** A positive borrow amount was entered. */
  hasBorrow: boolean;
  /** Collateral value in USD (collateralEth * ethPrice). */
  collateralUsd: number;
  /** Largest borrow the contract will allow for this collateral (75%). */
  maxBorrow: number;
  /** Projected loan-to-value in basis points (0 when no borrow). */
  ltvBps: number;
  /** Projected health factor in basis points (Infinity when no borrow). 10000 = 1.00x. */
  healthFactorBps: number;
  /** ETH price at which this loan would hit the liquidation line, or null. */
  liqPrice: number | null;
  /** True when the borrow amount exceeds the 75% cap (tx would revert). */
  overLimit: boolean;
  /** Safe to submit: has both inputs and is within the limit. */
  canSubmit: boolean;
  tier: RiskTier;
}

function toNum(value: string): number {
  const n = parseFloat((value ?? "").toString().replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pure, side-effect-free risk math. Exported so the Borrow page can reuse the
 * `overLimit` / `canSubmit` flags to guard the submit button, and so the logic
 * can be unit-tested against the Solidity reference.
 */
export function computeLoanPreview(
  collateralEthInput: string,
  borrowUsdcInput: string,
  ethPriceUsd: number
): LoanPreview {
  const collateralEth = toNum(collateralEthInput);
  const borrowUsd = toNum(borrowUsdcInput);
  const price = Number.isFinite(ethPriceUsd) ? ethPriceUsd : 0;

  const hasCollateral = collateralEth > 0 && price > 0;
  const hasBorrow = borrowUsd > 0;

  const collateralUsd = collateralEth * price;
  const maxBorrow = (collateralUsd * COLLATERAL_FACTOR_BPS) / BPS;

  const ltvBps = hasBorrow && collateralUsd > 0 ? (borrowUsd / collateralUsd) * BPS : 0;
  const healthFactorBps = hasBorrow
    ? (collateralUsd * LIQUIDATION_THRESHOLD_BPS) / borrowUsd
    : Infinity;

  // Price at which health factor reaches exactly 1.00x (the liquidation line).
  const liqPrice =
    hasBorrow && collateralEth > 0
      ? (borrowUsd * BPS) / (collateralEth * LIQUIDATION_THRESHOLD_BPS)
      : null;

  // A cent of slack absorbs float rounding at the exact boundary.
  const overLimit = hasCollateral && hasBorrow && borrowUsd > maxBorrow + 0.01;
  const canSubmit = hasCollateral && hasBorrow && !overLimit;

  let tier: RiskTier;
  if (!hasCollateral) tier = "idle";
  else if (overLimit) tier = "reject";
  else if (!hasBorrow) tier = "ready";
  else if (healthFactorBps >= 16000) tier = "safe";
  else if (healthFactorBps >= 12300) tier = "moderate";
  else tier = "aggressive";

  return {
    hasCollateral,
    hasBorrow,
    collateralUsd,
    maxBorrow,
    ltvBps,
    healthFactorBps,
    liqPrice,
    overLimit,
    canSubmit,
    tier,
  };
}

const TIER_LABEL: Record<RiskTier, string> = {
  idle: "Awaiting inputs",
  ready: "Add an amount",
  safe: "Healthy",
  moderate: "Moderate",
  aggressive: "Aggressive",
  reject: "Over limit",
};

function usd(n: number, maxFrac = 2): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

function hfDisplay(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  const x = bps / BPS;
  if (x >= 100) return "99+";
  return x.toFixed(2);
}

/** How full the health bar renders: HF 1.00x = empty, >= 2.5x = full. */
function healthBarPct(bps: number): number {
  if (!Number.isFinite(bps)) return 100;
  const x = bps / BPS;
  const pct = ((x - 1) / (2.5 - 1)) * 100;
  return Math.max(0, Math.min(100, pct));
}

export interface HealthPreviewProps {
  preview: LoanPreview;
  /** For the liquidation-price context line. */
  ethPriceUsd: number;
}

/**
 * Renders the live, input-driven risk panel inside the Borrow ticket.
 * All values come straight from `computeLoanPreview` so they stay in lockstep
 * with what the contract will do.
 */
export default function HealthPreview({ preview, ethPriceUsd }: HealthPreviewProps) {
  const { tier } = preview;
  const barPct = healthBarPct(preview.healthFactorBps);

  const dropToLiq =
    preview.liqPrice != null && ethPriceUsd > 0
      ? ((ethPriceUsd - preview.liqPrice) / ethPriceUsd) * 100
      : null;

  return (
    <div className={`hf-preview ${tier}`}>
      <div className="hf-head">
        <span className="hf-title">
          {tier === "reject" ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
          Position preview
        </span>
        <span className={`hf-pill ${tier}`}>{TIER_LABEL[tier]}</span>
      </div>

      {!preview.hasCollateral ? (
        <p className="hf-empty">Enter ETH collateral to preview your loan's health factor.</p>
      ) : (
        <>
          <div className="hf-hero">
            <div className="hf-hero-top">
              <span className="hf-hero-label">Projected health factor</span>
              <strong className="hf-hero-value">{hfDisplay(preview.healthFactorBps)}<em>×</em></strong>
            </div>
            <div className="hf-meter">
              <div style={{ width: `${barPct}%` }} />
              <span className="hf-meter-mark" title="Liquidation at 1.00×" />
            </div>
            <span className="hf-hero-sub">
              Liquidates at 1.00× · {LIQUIDATION_THRESHOLD_BPS / 100}% liquidation threshold
            </span>
          </div>

          <div className="hf-grid">
            <div>
              <span>Projected LTV</span>
              <strong>{preview.hasBorrow ? `${(preview.ltvBps / 100).toFixed(1)}%` : "—"}</strong>
            </div>
            <div>
              <span>Max borrowable</span>
              <strong>${usd(preview.maxBorrow)}</strong>
            </div>
            <div>
              <span>Collateral value</span>
              <strong>${usd(preview.collateralUsd)}</strong>
            </div>
            <div>
              <span>Liquidation price</span>
              <strong>
                {preview.liqPrice != null ? `$${usd(preview.liqPrice)}` : "—"}
                {dropToLiq != null && dropToLiq > 0 && (
                  <em className="hf-drop"> (−{dropToLiq.toFixed(0)}%)</em>
                )}
              </strong>
            </div>
          </div>

          {preview.overLimit && (
            <div className="hf-note danger">
              <AlertTriangle size={13} />
              <span>
                Exceeds the {COLLATERAL_FACTOR_BPS / 100}% limit — max ${usd(preview.maxBorrow)} for this
                collateral. The transaction would revert.
              </span>
            </div>
          )}
          {!preview.overLimit && preview.hasBorrow && tier === "aggressive" && (
            <div className="hf-note warn">
              <AlertTriangle size={13} />
              <span>Near the limit — a small ETH drop could push this loan toward liquidation.</span>
            </div>
          )}
          {!preview.hasBorrow && (
            <div className="hf-note muted">
              <span>Enter a borrow amount to see your health factor and LTV.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
