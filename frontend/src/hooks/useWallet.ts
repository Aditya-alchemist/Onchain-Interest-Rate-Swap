import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";

import { sepolia } from "wagmi/chains";


// ============================================================
// CONSTANTS
// ============================================================

const SEPOLIA_CHAIN_ID = sepolia.id;


// ============================================================
// TYPES
// ============================================================

export interface WalletConnector {
  id: string;
  name: string;
  ready: boolean;
  type: string;
}


// ============================================================
// HOOK
// ============================================================

export function useWallet() {
  // ----------------------------------------------------------
  // Account
  // ----------------------------------------------------------

  const {
    address,
    isConnected,
    isConnecting,
    isReconnecting,
    connector,
  } = useAccount();


  // ----------------------------------------------------------
  // Balance
  // ----------------------------------------------------------

  const {
    data: balance,
    isLoading: isBalanceLoading,
    refetch: refetchBalance,
  } = useBalance({
    address,
    chainId: SEPOLIA_CHAIN_ID,
  });


  // ----------------------------------------------------------
  // Connect
  // ----------------------------------------------------------

  const {
    connect,
    connectors,
    isPending: isConnectPending,
    error: connectError,
    reset: resetConnect,
  } = useConnect();


  // ----------------------------------------------------------
  // Disconnect
  // ----------------------------------------------------------

  const {
    disconnect,
  } = useDisconnect();


  // ----------------------------------------------------------
  // Network
  // ----------------------------------------------------------

  const chainId = useChainId();

  const {
    switchChain,
    isPending: isSwitchingChain,
    error: switchChainError,
  } = useSwitchChain();


  // ==========================================================
  // NETWORK STATE
  // ==========================================================

  const isSepolia =
    chainId === SEPOLIA_CHAIN_ID;

  const isWrongNetwork =
    isConnected && !isSepolia;


  // ==========================================================
  // CONNECT WALLET
  // ==========================================================

  function connectWallet(
    connectorId?: string
  ) {
    /*
     * If a connector ID is supplied, use that wallet.
     *
     * Otherwise use the first available connector.
     *
     * RainbowKit will normally provide the wallet-selection
     * UI, but this function lets our own components trigger
     * wallet connections when required.
     */

    let selectedConnector = connectors[0];

    if (connectorId) {
      const found = connectors.find(
        (item) => item.id === connectorId
      );

      if (found) {
        selectedConnector = found;
      }
    }

    if (!selectedConnector) {
      throw new Error(
        "No wallet connector is available."
      );
    }

    connect({
      connector: selectedConnector,
    });
  }


  // ==========================================================
  // CONNECT SPECIFIC WALLET
  // ==========================================================

  function connectSpecificWallet(
    connectorId: string
  ) {
    const selectedConnector =
      connectors.find(
        (item) => item.id === connectorId
      );

    if (!selectedConnector) {
      throw new Error(
        `Wallet connector "${connectorId}" was not found.`
      );
    }

    connect({
      connector: selectedConnector,
    });
  }


  // ==========================================================
  // DISCONNECT
  // ==========================================================

  function disconnectWallet() {
    disconnect();
  }


  // ==========================================================
  // SWITCH TO SEPOLIA
  // ==========================================================

  function switchToSepolia() {
    if (!switchChain) {
      throw new Error(
        "Wallet does not support network switching."
      );
    }

    switchChain({
      chainId: SEPOLIA_CHAIN_ID,
    });
  }


  // ==========================================================
  // FORMATTED ADDRESS
  // ==========================================================

  function shortenAddress(
    walletAddress?: string
  ): string {
    if (!walletAddress) {
      return "";
    }

    if (walletAddress.length < 12) {
      return walletAddress;
    }

    return `${walletAddress.slice(
      0,
      6
    )}...${walletAddress.slice(-4)}`;
  }


  // ==========================================================
  // FORMATTED BALANCE
  // ==========================================================

  const formattedBalance = balance
  ? `${Number(balance.value) / 10 ** balance.decimals} ${
      balance.symbol
    }`
  : "0.0000 ETH";


  // ==========================================================
  // CONNECTOR INFORMATION
  // ==========================================================

  const availableWallets =
    connectors.map(
      (item) => ({
        id: item.id,
        name: item.name,
        ready: item.type !== "injected"
          ? true
          : true,
        type: item.type,
      })
    );


  // ==========================================================
  // RETURN
  // ==========================================================

  return {

    // --------------------------------------------------------
    // Account
    // --------------------------------------------------------

    address,

    shortAddress:
      shortenAddress(address),

    isConnected,

    isConnecting,

    isReconnecting,


    // --------------------------------------------------------
    // Active wallet
    // --------------------------------------------------------

    connector,

    connectorName:
      connector?.name ?? null,


    // --------------------------------------------------------
    // Balance
    // --------------------------------------------------------

    balance,

    formattedBalance,

    isBalanceLoading,

    refetchBalance,


    // --------------------------------------------------------
    // Available wallets
    // --------------------------------------------------------

    connectors,

    availableWallets,


    // --------------------------------------------------------
    // Connect
    // --------------------------------------------------------

    connectWallet,

    connectSpecificWallet,

    isConnectPending,

    connectError,

    resetConnect,


    // --------------------------------------------------------
    // Disconnect
    // --------------------------------------------------------

    disconnectWallet,


    // --------------------------------------------------------
    // Network
    // --------------------------------------------------------

    chainId,

    isSepolia,

    isWrongNetwork,

    sepoliaChainId:
      SEPOLIA_CHAIN_ID,


    // --------------------------------------------------------
    // Network switching
    // --------------------------------------------------------

    switchToSepolia,

    isSwitchingChain,

    switchChainError,
  };
}

export default useWallet;