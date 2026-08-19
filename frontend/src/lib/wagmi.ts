import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";
import { http } from "wagmi";

const WALLETCONNECT_PROJECT_ID =
  process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || "";

export const wagmiConfig = getDefaultConfig({
  appName: "HedgeFi",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [sepolia],

  transports: {
    [sepolia.id]: http(
      process.env.REACT_APP_SEPOLIA_RPC_URL
    ),
  },
});