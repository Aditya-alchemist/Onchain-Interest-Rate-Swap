import React from "react";
import {
  ArrowUpRight,
  ShieldCheck,
  Clock3,
  AlertTriangle,
  Coins,
} from "lucide-react";

export type LoanStatus =
  | "active"
  | "healthy"
  | "at-risk"
  | "liquidatable"
  | "closed"
  | "repaid";

export interface LoanData {
  id: string | number;

  borrower?: string;

  principal: string | number;
  collateral: string | number;

  collateralAsset?: string;
  loanAsset?: string;

  healthFactor?: number;
  interestRate?: number;

  createdAt?: number;
  maturityTime?: number;

  status?: LoanStatus;

  hasHedge?: boolean;
}

interface LoanCardProps {
  loan: LoanData;

  onView?: (loan: LoanData) => void;
  onRepay?: (loan: LoanData) => void;
  onHedge?: (loan: LoanData) => void;

  showActions?: boolean;
  compact?: boolean;
}

const formatNumber = (
  value: string | number | undefined,
  decimals = 2
): string => {
  if (value === undefined || value === null) return "—";

  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const shortenAddress = (address?: string): string => {
  if (!address) return "—";

  if (address.length < 12) return address;

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const getHealthStatus = (
  healthFactor?: number,
  status?: LoanStatus
): LoanStatus => {
  if (status) return status;

  if (healthFactor === undefined) return "active";

  if (healthFactor < 80) return "liquidatable";
  if (healthFactor < 100) return "at-risk";

  return "healthy";
};

const statusConfig: Record<
  LoanStatus,
  {
    label: string;
    className: string;
    icon: React.ReactNode;
  }
> = {
  active: {
    label: "Active",
    className: "loan-status loan-status-active",
    icon: <Clock3 size={14} />,
  },

  healthy: {
    label: "Healthy",
    className: "loan-status loan-status-healthy",
    icon: <ShieldCheck size={14} />,
  },

  "at-risk": {
    label: "At Risk",
    className: "loan-status loan-status-warning",
    icon: <AlertTriangle size={14} />,
  },

  liquidatable: {
    label: "Liquidatable",
    className: "loan-status loan-status-danger",
    icon: <AlertTriangle size={14} />,
  },

  closed: {
    label: "Closed",
    className: "loan-status loan-status-closed",
    icon: <ShieldCheck size={14} />,
  },

  repaid: {
    label: "Repaid",
    className: "loan-status loan-status-closed",
    icon: <ShieldCheck size={14} />,
  },
};

const LoanCard: React.FC<LoanCardProps> = ({
  loan,
  onView,
  onRepay,
  onHedge,
  showActions = true,
  compact = false,
}) => {
  const resolvedStatus = getHealthStatus(
    loan.healthFactor,
    loan.status
  );

  const status = statusConfig[resolvedStatus];

  const healthFactor =
    loan.healthFactor !== undefined
      ? `${formatNumber(loan.healthFactor, 2)}%`
      : "—";

  const interestRate =
    loan.interestRate !== undefined
      ? `${formatNumber(loan.interestRate, 2)}%`
      : "—";

  return (
    <div
      className={`loan-card ${
        compact ? "loan-card-compact" : ""
      }`}
    >
      {/* Header */}
      <div className="loan-card-header">
        <div className="loan-card-title-section">
          <div className="loan-icon">
            <Coins size={18} />
          </div>

          <div>
            <div className="loan-card-title">
              Loan #{loan.id}
            </div>

            {loan.borrower && (
              <div className="loan-card-borrower">
                {shortenAddress(loan.borrower)}
              </div>
            )}
          </div>
        </div>

        <div className={status.className}>
          {status.icon}
          <span>{status.label}</span>
        </div>
      </div>

      {/* Main values */}
      <div className="loan-card-values">
        <div className="loan-value">
          <span className="loan-value-label">
            Principal
          </span>

          <span className="loan-value-number">
            ${formatNumber(loan.principal)}
          </span>

          <span className="loan-value-asset">
            {loan.loanAsset || "USDC"}
          </span>
        </div>

        <div className="loan-value">
          <span className="loan-value-label">
            Collateral
          </span>

          <span className="loan-value-number">
            {formatNumber(loan.collateral, 4)}
          </span>

          <span className="loan-value-asset">
            {loan.collateralAsset || "ETH"}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="loan-card-metrics">
        <div className="loan-metric">
          <span>Health Factor</span>

          <strong
            className={
              resolvedStatus === "liquidatable"
                ? "metric-danger"
                : resolvedStatus === "at-risk"
                ? "metric-warning"
                : "metric-success"
            }
          >
            {healthFactor}
          </strong>
        </div>

        <div className="loan-metric">
          <span>Interest Rate</span>

          <strong>{interestRate}</strong>
        </div>

        <div className="loan-metric">
          <span>Hedge</span>

          <strong>
            {loan.hasHedge ? (
              <span className="metric-success">
                Active
              </span>
            ) : (
              <span className="metric-muted">
                None
              </span>
            )}
          </strong>
        </div>
      </div>

      {/* Health bar */}
      {loan.healthFactor !== undefined && (
        <div className="loan-health-container">
          <div className="loan-health-label">
            <span>Collateral Health</span>
            <span>
              {formatNumber(loan.healthFactor, 2)}%
            </span>
          </div>

          <div className="loan-health-track">
            <div
              className={`loan-health-bar ${
                resolvedStatus === "liquidatable"
                  ? "loan-health-danger"
                  : resolvedStatus === "at-risk"
                  ? "loan-health-warning"
                  : "loan-health-safe"
              }`}
              style={{
                width: `${Math.min(
                  Math.max(loan.healthFactor, 0),
                  100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="loan-card-actions">
          {onView && (
            <button
              type="button"
              className="loan-action-secondary"
              onClick={() => onView(loan)}
            >
              View
              <ArrowUpRight size={15} />
            </button>
          )}

          {onHedge &&
            !loan.hasHedge &&
            resolvedStatus !== "closed" &&
            resolvedStatus !== "repaid" && (
              <button
                type="button"
                className="loan-action-primary"
                onClick={() => onHedge(loan)}
              >
                Hedge
                <ArrowUpRight size={15} />
              </button>
            )}

          {onRepay &&
            resolvedStatus !== "closed" &&
            resolvedStatus !== "repaid" && (
              <button
                type="button"
                className="loan-action-secondary"
                onClick={() => onRepay(loan)}
              >
                Repay
              </button>
            )}
        </div>
      )}
    </div>
  );
};

export default LoanCard;