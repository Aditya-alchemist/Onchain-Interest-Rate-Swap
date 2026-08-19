import React from "react";
import ReactDOM from "react-dom/client";

import "@rainbow-me/rainbowkit/styles.css";

import {
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";

import {
  WagmiProvider,
} from "wagmi";

import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

import App from "./App";
import { wagmiConfig } from "./lib/wagmi";

import "./index.css";

const queryClient = new QueryClient();

const root = ReactDOM.createRoot(
  document.getElementById("root")
);

root.render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);