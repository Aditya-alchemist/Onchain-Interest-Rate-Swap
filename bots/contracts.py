import json

from web3 import Web3

from config import (
    # Network
    SEPOLIA_RPC_URL,

    # Core
    SWAP_FACTORY_ADDRESS,
    SWAP_ENGINE_ADDRESS,
    LENDING_POOL_ADDRESS,
    PRICE_ORACLE_ADDRESS,
    LOAN_NFT_ADDRESS,
    POSITION_REGISTRY_ADDRESS,
    COLLATERAL_VAULT_ADDRESS,
    LOAN_MANAGER_ADDRESS,
    MOCK_USDC_ADDRESS,

    # Settlement
    SETTLEMENT_ENGINE_ADDRESS,
    NETTING_ENGINE_ADDRESS,
    ESCROW_MANAGER_ADDRESS,
    DVP_ENGINE_ADDRESS,

    # Liquidation
    LIQUIDATION_ENGINE_ADDRESS,
)


# ============================================================
# WEB3
# ============================================================

w3 = Web3(
    Web3.HTTPProvider(SEPOLIA_RPC_URL)
)


# ============================================================
# ABI LOADER
# ============================================================

def load_abi(contract_name):

    path = f"abis/{contract_name}.json"

    with open(
        path,
        "r",
        encoding="utf-8"
    ) as f:

        data = json.load(f)

    # Supports both:
    #
    # 1. Raw ABI:
    #    [...]
    #
    # 2. Foundry artifact:
    #    {"abi": [...]}
    #
    if isinstance(data, dict):
        return data["abi"]

    return data


# ============================================================
# ADDRESS HELPER
# ============================================================

def checksum(address):

    if not address:
        raise ValueError(
            "Contract address is not configured"
        )

    return Web3.to_checksum_address(address)


# ============================================================
# CONNECTION CHECK
# ============================================================

if not w3.is_connected():

    raise RuntimeError(
        "Could not connect to Sepolia RPC"
    )


if w3.eth.chain_id != 11155111:

    raise RuntimeError(
        f"Wrong chain. Expected Sepolia "
        f"(11155111), got {w3.eth.chain_id}"
    )


# ============================================================
# CORE CONTRACTS
# ============================================================

mock_usdc = w3.eth.contract(
    address=checksum(MOCK_USDC_ADDRESS),
    abi=load_abi("MockUSDC")
)


price_oracle = w3.eth.contract(
    address=checksum(PRICE_ORACLE_ADDRESS),
    abi=load_abi("MockPriceOracle")
)


lending_pool = w3.eth.contract(
    address=checksum(LENDING_POOL_ADDRESS),
    abi=load_abi("LendingPool")
)


collateral_vault = w3.eth.contract(
    address=checksum(COLLATERAL_VAULT_ADDRESS),
    abi=load_abi("CollateralVault")
)


loan_manager = w3.eth.contract(
    address=checksum(LOAN_MANAGER_ADDRESS),
    abi=load_abi("LoanManager")
)


loan_nft = w3.eth.contract(
    address=checksum(LOAN_NFT_ADDRESS),
    abi=load_abi("LoanNFT")
)


position_registry = w3.eth.contract(
    address=checksum(POSITION_REGISTRY_ADDRESS),
    abi=load_abi("PositionRegistry")
)


# ============================================================
# SWAP CONTRACTS
# ============================================================

swap_factory = w3.eth.contract(
    address=checksum(SWAP_FACTORY_ADDRESS),
    abi=load_abi("SwapFactory")
)


swap_engine = w3.eth.contract(
    address=checksum(SWAP_ENGINE_ADDRESS),
    abi=load_abi("SwapEngine")
)


# ============================================================
# SETTLEMENT CONTRACTS
# ============================================================

settlement_engine = w3.eth.contract(
    address=checksum(SETTLEMENT_ENGINE_ADDRESS),
    abi=load_abi("SettlementEngine")
)


netting_engine = w3.eth.contract(
    address=checksum(NETTING_ENGINE_ADDRESS),
    abi=load_abi("NettingEngine")
)


escrow_manager = w3.eth.contract(
    address=checksum(ESCROW_MANAGER_ADDRESS),
    abi=load_abi("EscrowManager")
)


dvp_engine = w3.eth.contract(
    address=checksum(DVP_ENGINE_ADDRESS),
    abi=load_abi("DvPEngine")
)


# ============================================================
# LIQUIDATION
# ============================================================

liquidation_engine = w3.eth.contract(
    address=checksum(LIQUIDATION_ENGINE_ADDRESS),
    abi=load_abi("LiquidationEngine")
)


# ============================================================
# CONNECTION INFO
# ============================================================

print(
    f"[contracts] Connected to chain {w3.eth.chain_id}"
)