import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  JsonRpcSigner,
  Signer,
} from "ethers";

import { getWalletClient } from "@wagmi/core";
import { wagmiConfig } from "./wagmi";
import { ADDRESSES, CHAIN_ID } from "./addresses";


// ============================================================
// ABIs
// ============================================================

import MockUSDCAbi from "./abis/MockUSDC.json";
import MockPriceOracleAbi from "./abis/MockPriceOracle.json";
import GovernanceAbi from "./abis/Governance.json";
import InterestRateModelAbi from "./abis/InterestRateModel.json";
import CollateralVaultAbi from "./abis/CollateralVault.json";
import LendingPoolAbi from "./abis/LendingPool.json";
import LoanManagerAbi from "./abis/LoanManager.json";
import LoanNFTAbi from "./abis/LoanNFT.json";
import PositionRegistryAbi from "./abis/PositionRegistry.json";

import SwapNFTAbi from "./abis/SwapNFT.json";
import SwapFactoryAbi from "./abis/SwapFactory.json";
import SwapEngineAbi from "./abis/SwapEngine.json";

import SettlementEngineAbi from "./abis/SettlementEngine.json";
import NettingEngineAbi from "./abis/NettingEngine.json";
import EscrowManagerAbi from "./abis/EscrowManager.json";
import DvPEngineAbi from "./abis/DvPEngine.json";

import LiquidationEngineAbi from "./abis/LiquidationEngine.json";


// ============================================================
// TYPES
// ============================================================

declare global {
  interface Window {
    ethereum?: any;
  }
}


// ============================================================
// RPC URL
// ============================================================

const RPC_URL =
  process.env.REACT_APP_SEPOLIA_RPC_URL || "";


// ============================================================
// ABI MAP
// ============================================================

export const ABIS = {
  MockUSDC: MockUSDCAbi,
  MockPriceOracle: MockPriceOracleAbi,
  Governance: GovernanceAbi,
  InterestRateModel: InterestRateModelAbi,
  CollateralVault: CollateralVaultAbi,
  LendingPool: LendingPoolAbi,
  LoanManager: LoanManagerAbi,
  LoanNFT: LoanNFTAbi,
  PositionRegistry: PositionRegistryAbi,
  SwapNFT: SwapNFTAbi,
  SwapFactory: SwapFactoryAbi,
  SwapEngine: SwapEngineAbi,
  SettlementEngine: SettlementEngineAbi,
  NettingEngine: NettingEngineAbi,
  EscrowManager: EscrowManagerAbi,
  DvPEngine: DvPEngineAbi,
  LiquidationEngine: LiquidationEngineAbi,
} as const;


// ============================================================
// CONTRACT ADDRESS MAP
// ============================================================

export const CONTRACT_ADDRESSES = {
  MockUSDC: ADDRESSES.MOCK_USDC,
  MockPriceOracle: ADDRESSES.PRICE_ORACLE,
  Governance: ADDRESSES.GOVERNANCE,
  InterestRateModel: ADDRESSES.INTEREST_RATE_MODEL,
  CollateralVault: ADDRESSES.COLLATERAL_VAULT,
  LendingPool: ADDRESSES.LENDING_POOL,
  LoanManager: ADDRESSES.LOAN_MANAGER,
  LoanNFT: ADDRESSES.LOAN_NFT,
  PositionRegistry: ADDRESSES.POSITION_REGISTRY,
  SwapNFT: ADDRESSES.SWAP_NFT,
  SwapFactory: ADDRESSES.SWAP_FACTORY,
  SwapEngine: ADDRESSES.SWAP_ENGINE,
  SettlementEngine: ADDRESSES.SETTLEMENT_ENGINE,
  NettingEngine: ADDRESSES.NETTING_ENGINE,
  EscrowManager: ADDRESSES.ESCROW_MANAGER,
  DvPEngine: ADDRESSES.DVP_ENGINE,
  LiquidationEngine: ADDRESSES.LIQUIDATION_ENGINE,
} as const;


// ============================================================
// READ-ONLY PROVIDER
// ============================================================

let rpcProvider: JsonRpcProvider | null = null;

export function getRpcProvider(): JsonRpcProvider {
  if (!rpcProvider) {
    if (!RPC_URL) {
      throw new Error(
        "REACT_APP_SEPOLIA_RPC_URL is not configured."
      );
    }
    rpcProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID);
  }
  return rpcProvider;
}


// ============================================================
// SIGNER — uses wagmi/RainbowKit connected wallet
// ============================================================

export async function getSigner(): Promise<Signer> {
  const walletClient = await getWalletClient(wagmiConfig);

  if (!walletClient) {
    throw new Error("Connect your wallet first.");
  }

  const { account, chain } = walletClient;

  if (chain.id !== CHAIN_ID) {
    throw new Error(
      `Wrong network. Please switch to Sepolia (chain ID ${CHAIN_ID}).`
    );
  }

  // Use window.ethereum directly but check wagmi is connected
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed.");
  }

  const provider = new BrowserProvider(window.ethereum as any);
  const signer = await provider.getSigner(account.address);
  return signer;
}

// ============================================================
// GENERIC CONTRACT FACTORY
// ============================================================

export function getContract(
  name: keyof typeof ABIS,
  runner?: JsonRpcProvider | Signer
): Contract {
  const address = CONTRACT_ADDRESSES[name];
  const abi = ABIS[name];

  if (!address) {
    throw new Error(`Missing address for ${name}`);
  }

  return new Contract(
    address,
    abi,
    runner || getRpcProvider()
  );
}


// ============================================================
// READ-ONLY CONTRACTS
// ============================================================

export const contracts = {
  mockUSDC: () =>
    getContract("MockUSDC"),

  priceOracle: () =>
    getContract("MockPriceOracle"),

  governance: () =>
    getContract("Governance"),

  interestRateModel: () =>
    getContract("InterestRateModel"),

  collateralVault: () =>
    getContract("CollateralVault"),

  lendingPool: () =>
    getContract("LendingPool"),

  loanManager: () =>
    getContract("LoanManager"),

  loanNFT: () =>
    getContract("LoanNFT"),

  positionRegistry: () =>
    getContract("PositionRegistry"),

  swapNFT: () =>
    getContract("SwapNFT"),

  swapFactory: () =>
    getContract("SwapFactory"),

  swapEngine: () =>
    getContract("SwapEngine"),

  settlementEngine: () =>
    getContract("SettlementEngine"),

  nettingEngine: () =>
    getContract("NettingEngine"),

  escrowManager: () =>
    getContract("EscrowManager"),

  dvpEngine: () =>
    getContract("DvPEngine"),

  liquidationEngine: () =>
    getContract("LiquidationEngine"),
};


// ============================================================
// WRITE CONTRACTS — connected to user's wallet signer
// ============================================================

export async function getWriteContracts() {
  const signer = await getSigner();

  return {
    mockUSDC:
      getContract("MockUSDC", signer),

    priceOracle:
      getContract("MockPriceOracle", signer),

    governance:
      getContract("Governance", signer),

    interestRateModel:
      getContract("InterestRateModel", signer),

    collateralVault:
      getContract("CollateralVault", signer),

    lendingPool:
      getContract("LendingPool", signer),

    loanManager:
      getContract("LoanManager", signer),

    loanNFT:
      getContract("LoanNFT", signer),

    positionRegistry:
      getContract("PositionRegistry", signer),

    swapNFT:
      getContract("SwapNFT", signer),

    swapFactory:
      getContract("SwapFactory", signer),

    swapEngine:
      getContract("SwapEngine", signer),

    settlementEngine:
      getContract("SettlementEngine", signer),

    nettingEngine:
      getContract("NettingEngine", signer),

    escrowManager:
      getContract("EscrowManager", signer),

    dvpEngine:
      getContract("DvPEngine", signer),

    liquidationEngine:
      getContract("LiquidationEngine", signer),
  };
}


// ============================================================
// HELPERS
// ============================================================

export async function getWalletAddress(): Promise<string> {
  const signer = await getSigner();
  return signer.getAddress();
}

export async function checkNetwork(): Promise<boolean> {
  const walletClient = await getWalletClient(wagmiConfig);
  if (!walletClient) return false;
  return walletClient.chain.id === CHAIN_ID;
}

export async function switchToSepolia(): Promise<void> {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed.");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xAA36A7" }],
    });
  } catch (error: any) {
    if (error.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0xAA36A7",
            chainName: "Sepolia",
            nativeCurrency: {
              name: "Sepolia ETH",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: [
              "https://sepolia.etherscan.io",
            ],
          },
        ],
      });
    } else {
      throw error;
    }
  }
}

export function getContractAddress(
  name: keyof typeof CONTRACT_ADDRESSES
): string {
  return CONTRACT_ADDRESSES[name];
}