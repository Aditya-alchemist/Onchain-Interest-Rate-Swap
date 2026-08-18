import os

from dotenv import load_dotenv


load_dotenv()


# ============================================================
# NETWORK
# ============================================================

SEPOLIA_RPC_URL = os.getenv("SEPOLIA_RPC_URL")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")

CHAIN_ID = int(
    os.getenv("CHAIN_ID", "11155111")
)


# ============================================================
# CORE CONTRACT ADDRESSES
# ============================================================

SWAP_FACTORY_ADDRESS = os.getenv("SWAP_FACTORY")
SWAP_ENGINE_ADDRESS = os.getenv("SWAP_ENGINE")

LENDING_POOL_ADDRESS = os.getenv("LENDING_POOL")
PRICE_ORACLE_ADDRESS = os.getenv("PRICE_ORACLE")

LOAN_NFT_ADDRESS = os.getenv("LOAN_NFT")
POSITION_REGISTRY_ADDRESS = os.getenv("POSITION_REGISTRY")

COLLATERAL_VAULT_ADDRESS = os.getenv("COLLATERAL_VAULT")
LOAN_MANAGER_ADDRESS = os.getenv("LOAN_MANAGER")

MOCK_USDC_ADDRESS = os.getenv("MOCK_USDC_ADDRESS")


# ============================================================
# SETTLEMENT CONTRACT ADDRESSES
# ============================================================

SETTLEMENT_ENGINE_ADDRESS = os.getenv(
    "SETTLEMENT_ENGINE"
)

NETTING_ENGINE_ADDRESS = os.getenv(
    "NETTING_ENGINE"
)

ESCROW_MANAGER_ADDRESS = os.getenv(
    "ESCROW_MANAGER"
)

DVP_ENGINE_ADDRESS = os.getenv(
    "DVP_ENGINE"
)


# ============================================================
# LIQUIDATION
# ============================================================

LIQUIDATION_ENGINE_ADDRESS = os.getenv(
    "LIQUIDATION_ENGINE"
)


# ============================================================
# BOT CONFIG
# ============================================================

POLL_INTERVAL = int(
    os.getenv("POLL_INTERVAL", "30")
)

DRY_RUN = (
    os.getenv("DRY_RUN", "true").lower()
    == "true"
)


# ============================================================
# VALIDATION
# ============================================================

required = {

    # Network
    "SEPOLIA_RPC_URL": SEPOLIA_RPC_URL,
    "PRIVATE_KEY": PRIVATE_KEY,

    # Core
    "SWAP_FACTORY": SWAP_FACTORY_ADDRESS,
    "SWAP_ENGINE": SWAP_ENGINE_ADDRESS,

    "LENDING_POOL": LENDING_POOL_ADDRESS,
    "PRICE_ORACLE": PRICE_ORACLE_ADDRESS,

    "LOAN_NFT": LOAN_NFT_ADDRESS,
    "POSITION_REGISTRY": POSITION_REGISTRY_ADDRESS,

    "COLLATERAL_VAULT": COLLATERAL_VAULT_ADDRESS,
    "LOAN_MANAGER": LOAN_MANAGER_ADDRESS,

    "MOCK_USDC_ADDRESS": MOCK_USDC_ADDRESS,

    # Settlement
    "SETTLEMENT_ENGINE": SETTLEMENT_ENGINE_ADDRESS,
    "NETTING_ENGINE": NETTING_ENGINE_ADDRESS,
    "ESCROW_MANAGER": ESCROW_MANAGER_ADDRESS,
    "DVP_ENGINE": DVP_ENGINE_ADDRESS,

    # Liquidation
    "LIQUIDATION_ENGINE": LIQUIDATION_ENGINE_ADDRESS,
}


for name, value in required.items():

    if not value:
        raise ValueError(
            f"{name} not configured"
        )