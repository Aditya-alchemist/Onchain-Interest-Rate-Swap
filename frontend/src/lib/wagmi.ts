import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";
import { http } from "wagmi";

const SEPOLIA_RPC_URL =
  process.env.REACT_APP_SEPOLIA_RPC_URL || "";

const WALLETCONNECT_PROJECT_ID =
  process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || "";

export const wagmiConfig = getDefaultConfig({
  appName: "HedgeFi",
  projectId: WALLETCONNECT_PROJECT_ID || "hedgefi-local-dev",
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(
      SEPOLIA_RPC_URL || undefined
    ),
  },
  ssr: false,
});

export const SEPOLIA_CHAIN_ID = sepolia.id;