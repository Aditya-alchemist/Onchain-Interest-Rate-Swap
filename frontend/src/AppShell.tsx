import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import {
  Bell,
  Gauge,
  Landmark,
  Layers3,
  LineChart,
  Moon,
  RefreshCw,
  Shield,
  Sun,
  Wallet,
  X,
} from "lucide-react";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";

import Admin from "./pages/Admin";
import Borrow from "./pages/Borrow";
import Dashboard from "./pages/Dashboard";
import Hedge from "./pages/Hedge";
import Lend from "./pages/Lend";
import Marketplace from "./pages/Marketplace";
import Portfolio from "./pages/Portfolio";
import { useWallet } from "./hooks/useWallet";
import { formatUsdc, useProtocol } from "./hooks/useProtocol";
import { relativeTime, useNotifications } from "./lib/notifications";
import "./App.css";

const navItems = [
  { to: "/", label: "Dashboard", icon: Gauge },
  { to: "/lend", label: "Lend", icon: Landmark },
  { to: "/borrow", label: "Borrow", icon: Wallet },
  { to: "/hedge", label: "Swap", icon: LineChart },
  { to: "/marketplace", label: "Settle", icon: Layers3 },
  { to: "/portfolio", label: "Portfolio", icon: Bell, badge: true },
  { to: "/admin", label: "Admin", icon: Shield },
];

export default function AppShell() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("hedgefi-theme") === "dark");
  const wallet = useWallet();
  const protocol = useProtocol();
  const { unreadCount } = useNotifications();

  // Re-render once a second so the "updated Xs ago" stamp stays honest.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const handle = setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => clearInterval(handle);
  }, []);

  // RainbowKit's own modal controllers — these know which connectors are
  // actually ready in the user's browser and handle the wallet picker,
  // WalletConnect QR flow, and wrong-network prompts for you.
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("hedgefi-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const marketLabel = useMemo(() => {
    const rate = Number(protocol.borrowRateBps) / 100;
    return `${rate.toFixed(2)}% borrow`;
  }, [protocol.borrowRateBps]);

  const handleWalletButtonClick = () => {
    if (wallet.isConnected) {
      openAccountModal?.();
    } else {
      openConnectModal?.();
    }
  };

  return (
    <BrowserRouter>
      <div className="hf-app">
        <header className="terminal-shell">
          <div className="brand-block">
            <div className="brand-mark">H</div>
            <div>
              <strong>HedgeFi</strong>
              <span>fixed-rate credit terminal</span>
            </div>
          </div>

          <div className="market-pill">
            <span>SEPOLIA</span>
            <strong>{marketLabel}</strong>
          </div>

          <div className="top-search">Search loans, swaps, settlements</div>

          <div className="top-metrics">
            <div>
              <span>Liquidity</span>
              <strong>${formatUsdc(protocol.poolLiquidity)}</strong>
            </div>
            <div>
              <span>Wallet</span>
              <strong>{formatUsdc(protocol.usdcBalance)} USDC</strong>
            </div>
          </div>

          <button
            className={`icon-button ${protocol.isLoading ? "is-loading" : ""}`}
            type="button"
            onClick={() => protocol.refetch()}
            title={
              protocol.lastUpdated
                ? `Updated ${relativeTime(protocol.lastUpdated)} · auto-refreshes every 15s`
                : "Refresh"
            }
          >
            <RefreshCw size={17} className={protocol.isLoading ? "spin" : ""} />
          </button>

          <button className="icon-button" type="button" onClick={() => setDarkMode(!darkMode)} title="Theme">
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button
            className={`wallet-chip ${wallet.isWrongNetwork ? "warning" : ""}`}
            type="button"
            onClick={handleWalletButtonClick}
          >
            {wallet.isConnected ? <span className="dot" /> : <Wallet size={16} />}
            <span>{wallet.isConnected ? wallet.shortAddress : "Connect wallet"}</span>
          </button>
        </header>

        <main className="terminal-layout">
          <aside className="side-rail">
            {navItems.map((item) => {
              const Icon = item.icon;
              const showBadge = item.badge && unreadCount > 0;
              return (
                <NavLink key={item.to} to={item.to} end={item.to === "/"} className="rail-button" title={item.label}>
                  <span className="rail-icon">
                    <Icon size={19} />
                    {showBadge && (
                      <span className="rail-badge" aria-label={`${unreadCount} new notifications`}>
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </span>
                  <span className="rail-label">{item.label}</span>
                </NavLink>
              );
            })}
          </aside>

          <section className="workspace">
            {wallet.isWrongNetwork && (
              <div className="notice warning-notice">
                <span>Wrong network. HedgeFi is configured for Sepolia.</span>
                <button type="button" onClick={wallet.switchToSepolia}>
                  Switch
                </button>
              </div>
            )}

            {wallet.connectError && (
              <div className="notice error-notice">{wallet.connectError.message}</div>
            )}

            {protocol.error && (
              <div className="notice error-notice">
                <span>{protocol.error.message}</span>
                <button type="button" className="notice-close" onClick={protocol.clearError} aria-label="Dismiss">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Only while something is actually in flight. Progress and results
                now live in the toasts, so this no longer lingers after a tx. */}
            {protocol.pending && protocol.txStep && (
              <div className="txstep-banner">
                <span className="txstep-spinner" />
                <div className="txstep-body">
                  <strong>
                    Step {protocol.txStep.current} of {protocol.txStep.total} — {protocol.txStep.label}
                  </strong>
                  <span>{protocol.txMessage || "Confirm in your wallet."}</span>
                </div>
                <div className="txstep-dots">
                  {Array.from({ length: protocol.txStep.total }).map((_, i) => (
                    <span key={i} className={`txstep-dot ${i < protocol.txStep!.current ? "on" : ""}`} />
                  ))}
                </div>
              </div>
            )}

            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/lend" element={<Lend />} />
              <Route path="/borrow" element={<Borrow />} />
              <Route path="/hedge" element={<Hedge />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </section>
        </main>
      </div>
    </BrowserRouter>
  );
}