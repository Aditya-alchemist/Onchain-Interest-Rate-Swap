import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";
import { http } from "wagmi";

// ============================================================
// ENV
// ============================================================

const SEPOLIA_RPC_URL =
  process.env.REACT_APP_SEPOLIA_RPC_URL || "";

const WALLETCONNECT_PROJECT_ID =
  process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || "";


// ============================================================
// RAINBOWKIT / WAGMI CONFIG
// ============================================================

export const wagmiConfig = getDefaultConfig({
  appName: "HedgeFi",

  projectId:
    WALLETCONNECT_PROJECT_ID || "hedgefi-local-dev",

  chains: [sepolia],

  transports: {
    [sepolia.id]: http(
      SEPOLIA_RPC_URL || undefined
    ),
  },

  ssr: false,
});


// ============================================================
// CONSTANTS
// ============================================================

export const SEPOLIA_CHAIN_ID = sepolia.id;

export const SEPOLIA_RPC_URL_VALUE =
  SEPOLIA_RPC_URL;

export const WALLET_CONNECT_PROJECT_ID =
  WALLETCONNECT_PROJECT_ID;