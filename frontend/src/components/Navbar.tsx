import React, { useState } from "react";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  LogOut,
  Menu,
  Moon,
  Shield,
  Sun,
  Wallet,
  X,
  AlertTriangle,
} from "lucide-react";

import { useWallet } from "../hooks/useWallet";


// ============================================================
// TYPES
// ============================================================

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}


// ============================================================
// NAVIGATION
// ============================================================

const navigation = [
  {
    label: "Dashboard",
    path: "/",
  },
  {
    label: "Borrow",
    path: "/borrow",
  },
  {
    label: "Lend",
    path: "/lend",
  },
  {
    label: "Hedge",
    path: "/hedge",
  },
  {
    label: "Marketplace",
    path: "/marketplace",
  },
  {
    label: "Portfolio",
    path: "/portfolio",
  },
];


// ============================================================
// HELPERS
// ============================================================

function copyToClipboard(
  value: string
) {
  navigator.clipboard.writeText(value);
}


// ============================================================
// COMPONENT
// ============================================================

export default function Navbar({
  darkMode,
  setDarkMode,
}: NavbarProps) {

  // ----------------------------------------------------------
  // Wallet
  // ----------------------------------------------------------

  const {
    address,
    shortAddress,
    isConnected,
    connectorName,
    formattedBalance,

    availableWallets,

    connectSpecificWallet,
    disconnectWallet,

    isConnectPending,

    isWrongNetwork,
    switchToSepolia,
    isSwitchingChain,
  } = useWallet();


  // ----------------------------------------------------------
  // UI state
  // ----------------------------------------------------------

  const [
    walletModalOpen,
    setWalletModalOpen,
  ] = useState(false);

  const [
    walletMenuOpen,
    setWalletMenuOpen,
  ] = useState(false);

  const [
    mobileMenuOpen,
    setMobileMenuOpen,
  ] = useState(false);

  const [
    copied,
    setCopied,
  ] = useState(false);


  // ==========================================================
  // COPY ADDRESS
  // ==========================================================

  const handleCopyAddress = async () => {

    if (!address) {
      return;
    }

    await copyToClipboard(address);

    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1500);
  };


  // ==========================================================
  // WALLET CONNECT
  // ==========================================================

  const handleConnect = (
    connectorId: string
  ) => {

    try {

      connectSpecificWallet(
        connectorId
      );

      setWalletModalOpen(false);

    } catch (error) {

      console.error(
        "Wallet connection failed:",
        error
      );
    }
  };


  // ==========================================================
  // DISCONNECT
  // ==========================================================

  const handleDisconnect = () => {

    disconnectWallet();

    setWalletMenuOpen(false);
  };


  // ==========================================================
  // CLOSE MOBILE MENU
  // ==========================================================

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <>
      <nav
        className={`hf-navbar ${
          darkMode
            ? "hf-navbar-dark"
            : "hf-navbar-light"
        }`}
      >

        {/* ================================================== */}
        {/* LEFT SIDE */}
        {/* ================================================== */}

        <div className="hf-navbar-left">

          {/* Logo */}

          <a
            href="/"
            className="hf-logo"
            onClick={closeMobileMenu}
          >

            <div className="hf-logo-mark">
              H
            </div>

            <div className="hf-logo-text">
              Hedge<span>Fi</span>
            </div>

          </a>


          {/* Desktop navigation */}

          <div className="hf-nav-links">

            {navigation.map(
              (item) => (

                <a
                  key={item.path}
                  href={item.path}
                  className="hf-nav-link"
                >
                  {item.label}
                </a>

              )
            )}

          </div>

        </div>


        {/* ================================================== */}
        {/* RIGHT SIDE */}
        {/* ================================================== */}

        <div className="hf-navbar-right">

          {/* Theme */}

          <button
            className="hf-icon-button"
            onClick={() =>
              setDarkMode(!darkMode)
            }
            aria-label="Toggle theme"
          >

            {darkMode ? (
              <Sun size={18} />
            ) : (
              <Moon size={18} />
            )}

          </button>


          {/* Admin */}

          {isConnected && (
            <a
              href="/admin"
              className="hf-admin-button"
              title="Admin"
            >
              <Shield size={17} />
            </a>
          )}


          {/* ================================================= */}
          {/* CONNECTED WALLET */}
          {/* ================================================= */}

          {isConnected ? (

            <div className="hf-wallet-wrapper">

              <button
                className={`hf-wallet-button ${
                  isWrongNetwork
                    ? "hf-wallet-warning"
                    : ""
                }`}
                onClick={() =>
                  setWalletMenuOpen(
                    !walletMenuOpen
                  )
                }
              >

                <div className="hf-wallet-status-dot" />

                <div className="hf-wallet-info">

                  <span className="hf-wallet-address">
                    {shortAddress}
                  </span>

                  <span className="hf-wallet-balance">
                    {formattedBalance}
                  </span>

                </div>

                <ChevronDown
                  size={16}
                  className={
                    walletMenuOpen
                      ? "hf-chevron-open"
                      : ""
                  }
                />

              </button>


              {/* Wallet dropdown */}

              {walletMenuOpen && (

                <div className="hf-wallet-dropdown">

                  {/* Header */}

                  <div className="hf-wallet-dropdown-header">

                    <div>

                      <span className="hf-dropdown-label">
                        Connected wallet
                      </span>

                      <strong>
                        {connectorName ||
                          "Wallet"}
                      </strong>

                    </div>

                    <div className="hf-wallet-icon">
                      <Wallet size={18} />
                    </div>

                  </div>


                  {/* Network warning */}

                  {isWrongNetwork && (

                    <div className="hf-network-warning">

                      <AlertTriangle
                        size={17}
                      />

                      <div>

                        <strong>
                          Wrong network
                        </strong>

                        <span>
                          Switch to Sepolia
                        </span>

                      </div>

                      <button
                        onClick={
                          switchToSepolia
                        }
                        disabled={
                          isSwitchingChain
                        }
                      >
                        {isSwitchingChain
                          ? "Switching..."
                          : "Switch"}
                      </button>

                    </div>

                  )}


                  {/* Address */}

                  <div className="hf-dropdown-section">

                    <span className="hf-dropdown-label">
                      Address
                    </span>

                    <div className="hf-address-row">

                      <span>
                        {shortAddress}
                      </span>

                      <button
                        onClick={
                          handleCopyAddress
                        }
                        title="Copy address"
                      >

                        {copied ? (
                          "✓"
                        ) : (
                          <Copy size={15} />
                        )}

                      </button>

                    </div>

                  </div>


                  {/* Explorer */}

                  {address && (

                    <a
                      href={`https://sepolia.etherscan.io/address/${address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hf-dropdown-action"
                    >

                      <ExternalLink
                        size={15}
                      />

                      View on Etherscan

                    </a>

                  )}


                  {/* Disconnect */}

                  <button
                    className="hf-dropdown-action hf-disconnect"
                    onClick={
                      handleDisconnect
                    }
                  >

                    <LogOut size={15} />

                    Disconnect

                  </button>

                </div>

              )}

            </div>

          ) : (

            /* ================================================= */
            /* CONNECT BUTTON */
            /* ================================================= */

            <button
              className="hf-connect-button"
              onClick={() =>
                setWalletModalOpen(true)
              }
            >

              <Wallet size={17} />

              Connect Wallet

            </button>

          )}


          {/* Mobile menu */}

          <button
            className="hf-mobile-menu-button"
            onClick={() =>
              setMobileMenuOpen(
                !mobileMenuOpen
              )
            }
          >

            {mobileMenuOpen ? (
              <X size={21} />
            ) : (
              <Menu size={21} />
            )}

          </button>

        </div>

      </nav>


      {/* ==================================================== */}
      {/* MOBILE MENU */}
      {/* ==================================================== */}

      {mobileMenuOpen && (

        <div className="hf-mobile-menu">

          {navigation.map(
            (item) => (

              <a
                key={item.path}
                href={item.path}
                onClick={
                  closeMobileMenu
                }
                className="hf-mobile-link"
              >
                {item.label}
              </a>

            )
          )}

          {!isConnected && (

            <button
              className="hf-mobile-connect"
              onClick={() => {

                setMobileMenuOpen(false);

                setWalletModalOpen(true);

              }}
            >

              <Wallet size={17} />

              Connect Wallet

            </button>

          )}

        </div>

      )}


      {/* ==================================================== */}
      {/* WALLET MODAL */}
      {/* ==================================================== */}

      {walletModalOpen && (

        <div
          className="hf-modal-overlay"
          onClick={() =>
            setWalletModalOpen(false)
          }
        >

          <div
            className="hf-wallet-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {/* Modal header */}

            <div className="hf-modal-header">

              <div>

                <h2>
                  Connect Wallet
                </h2>

                <p>
                  Connect your wallet to HedgeFi
                </p>

              </div>

              <button
                className="hf-modal-close"
                onClick={() =>
                  setWalletModalOpen(false)
                }
              >
                <X size={19} />
              </button>

            </div>


            {/* Wallet list */}

            <div className="hf-wallet-list">

              {availableWallets.map(
                (wallet) => (

                  <button
                    key={wallet.id}
                    className="hf-wallet-option"
                    onClick={() =>
                      handleConnect(
                        wallet.id
                      )
                    }
                    disabled={
                      isConnectPending
                    }
                  >

                    <div className="hf-wallet-option-icon">

                      <Wallet
                        size={21}
                      />

                    </div>

                    <div className="hf-wallet-option-info">

                      <strong>
                        {wallet.name}
                      </strong>

                      <span>
                        {wallet.type ===
                        "injected"
                          ? "Browser wallet"
                          : "Wallet connector"}
                      </span>

                    </div>

                    <ChevronDown
                      size={17}
                      className="hf-wallet-arrow"
                    />

                  </button>

                )
              )}

            </div>


            {/* Loading */}

            {isConnectPending && (

              <div className="hf-wallet-loading">

                Connecting wallet...

              </div>

            )}


            {/* Footer */}

            <div className="hf-modal-footer">

              <span>
                Network
              </span>

              <strong>
                Sepolia Testnet
              </strong>

            </div>

          </div>

        </div>

      )}

    </>
  );
}