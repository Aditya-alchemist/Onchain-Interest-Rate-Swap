import os
import time
import requests

from config import (
    POLL_INTERVAL,
    DRY_RUN,
)

from contracts import price_oracle
from utils import (
    build_transaction,
    send_transaction,
    wait_for_transaction,
)


# ============================================================
# CONFIGURATION
# ============================================================

COINGECKO_URL = os.getenv(
    "COINGECKO_API_URL",
    "https://api.coingecko.com/api/v3/simple/price",
)

COINGECKO_API_KEY = os.getenv(
    "COINGECKO_API_KEY",
)

ORACLE_UPDATE_INTERVAL = int(
    os.getenv(
        "ORACLE_UPDATE_INTERVAL",
        "60",
    )
)

ORACLE_MIN_CHANGE_BPS = int(
    os.getenv(
        "ORACLE_MIN_CHANGE_BPS",
        "25",
    )
)

ORACLE_MAX_STALE_AGE = int(
    os.getenv(
        "ORACLE_MAX_STALE_AGE",
        "300",
    )
)


# ============================================================
# ON-CHAIN PRICE
# ============================================================

def get_eth_price():

    return (
        price_oracle
        .functions
        .getEthPrice()
        .call()
    )


# ============================================================
# MARKET PRICE
# ============================================================

def fetch_market_price():

    params = {
        "ids": "ethereum",
        "vs_currencies": "usd",
        "include_last_updated_at": "true",
    }

    headers = {}

    if COINGECKO_API_KEY:

        headers[
            "x-cg-demo-api-key"
        ] = COINGECKO_API_KEY

    response = requests.get(
        COINGECKO_URL,
        params=params,
        headers=headers,
        timeout=10,
    )

    response.raise_for_status()

    data = response.json()

    if "ethereum" not in data:

        raise RuntimeError(
            "CoinGecko response missing ethereum"
        )

    ethereum = data["ethereum"]

    price = ethereum.get("usd")

    if price is None:

        raise RuntimeError(
            "CoinGecko returned no ETH/USD price"
        )

    # --------------------------------------------------------
    # Staleness
    # --------------------------------------------------------

    last_updated = ethereum.get(
        "last_updated_at"
    )

    if last_updated is not None:

        age = (
            int(time.time())
            - int(last_updated)
        )

        if age > ORACLE_MAX_STALE_AGE:

            raise RuntimeError(
                f"CoinGecko price is stale: "
                f"{age}s old"
            )

    return float(price)


# ============================================================
# PRICE CHANGE
# ============================================================

def calculate_change_bps(
    current_price,
    new_price,
):

    if current_price == 0:

        return float("inf")

    return (
        abs(new_price - current_price)
        / current_price
        * 10_000
    )


def should_update(
    current_price,
    new_price,
):

    change_bps = calculate_change_bps(
        current_price,
        new_price,
    )

    print(
        f"[ORACLE] Change: "
        f"{change_bps:.2f} bps"
    )

    return (
        change_bps
        >= ORACLE_MIN_CHANGE_BPS
    )


# ============================================================
# UPDATE ON-CHAIN ORACLE
# ============================================================

def update_oracle(
    market_price,
):

    current_raw = get_eth_price()

    current_price = (
        current_raw / 1e8
    )

    print(
        f"[ORACLE] On-chain: "
        f"${current_price:.2f}"
    )

    print(
        f"[ORACLE] Market: "
        f"${market_price:.2f}"
    )

    # --------------------------------------------------------
    # Check price movement
    # --------------------------------------------------------

    if not should_update(
        current_price,
        market_price,
    ):

        print(
            "[ORACLE] Change below "
            "threshold. Skipping update."
        )

        return None

    # --------------------------------------------------------
    # Convert USD → 8 decimals
    # --------------------------------------------------------

    new_price_scaled = int(
        market_price * 10**8
    )

    print(
        f"[ORACLE] Updating oracle: "
        f"${current_price:.2f} -> "
        f"${market_price:.2f}"
    )

    # --------------------------------------------------------
    # DRY RUN
    # --------------------------------------------------------

    if DRY_RUN:

        print(
            "[ORACLE] DRY_RUN=true - "
            "transaction skipped"
        )

        return None

    # --------------------------------------------------------
    # Contract function
    # --------------------------------------------------------

    contract_call = (
        price_oracle
        .functions
        .setEthPrice(
            new_price_scaled
        )
    )

    # --------------------------------------------------------
    # ContractFunction → tx dict
    # --------------------------------------------------------

    tx = build_transaction(
        contract_call,
        gas=100_000,
    )

    print(
        f"[ORACLE] Nonce: "
        f"{tx['nonce']}"
    )

    print(
        f"[ORACLE] Gas price: "
        f"{tx['gasPrice']}"
    )

    # --------------------------------------------------------
    # Sign + send
    # --------------------------------------------------------

    try:

        tx_hash = send_transaction(
            tx
        )

        print(
            f"[ORACLE] TX submitted: "
            f"{tx_hash.hex()}"
        )

        # ----------------------------------------------------
        # Wait for confirmation
        # ----------------------------------------------------

        receipt = wait_for_transaction(
            tx_hash,
            timeout=180,
        )

        if receipt["status"] != 1:

            print(
                "[ORACLE] "
                "Transaction reverted."
            )

            return None

        print(
            f"[ORACLE] ✓ Oracle updated | "
            f"block={receipt['blockNumber']} | "
            f"gas={receipt['gasUsed']}"
        )

        return tx_hash

    except Exception as e:

        print(
            f"[ORACLE] Transaction failed: "
            f"{e}"
        )

        return None


# ============================================================
# MAIN ORACLE LOOP
# ============================================================

def run():

    print("=" * 60)
    print("             HedgeFi Oracle Keeper")
    print("=" * 60)

    print(
        f"CoinGecko: "
        f"{COINGECKO_URL}"
    )

    print(
        f"Update interval: "
        f"{ORACLE_UPDATE_INTERVAL}s"
    )

    print(
        f"Minimum change: "
        f"{ORACLE_MIN_CHANGE_BPS} bps"
    )

    print(
        f"Maximum stale age: "
        f"{ORACLE_MAX_STALE_AGE}s"
    )

    print(
        f"DRY_RUN: {DRY_RUN}"
    )

    print("=" * 60)

    while True:

        try:

            # ------------------------------------------------
            # Fetch external price
            # ------------------------------------------------

            market_price = (
                fetch_market_price()
            )

            print(
                f"[ORACLE] CoinGecko ETH: "
                f"${market_price:.2f}"
            )

            # ------------------------------------------------
            # Update on-chain oracle if necessary
            # ------------------------------------------------

            update_oracle(
                market_price
            )

        except Exception as e:

            print(
                f"[ORACLE] ERROR: {e}"
            )

        # ----------------------------------------------------
        # Keep keeper alive even after errors
        # ----------------------------------------------------

        time.sleep(
            ORACLE_UPDATE_INTERVAL
        )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    run()