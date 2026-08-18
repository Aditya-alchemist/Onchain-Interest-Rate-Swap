import time

from config import POLL_INTERVAL, DRY_RUN
from contracts import price_oracle


def get_eth_price():
    return price_oracle.functions.getEthPrice().call()


def update_eth_price(new_price_usd):
    """
    new_price_usd: human-readable USD price.
    Example: 4000 -> 4000 * 1e8
    """

    new_price = int(new_price_usd * 10**8)

    current_price = get_eth_price()

    if current_price == new_price:
        print(
            f"[ORACLE] Price unchanged: "
            f"${current_price / 1e8:.2f}"
        )
        return None

    print(
        f"[ORACLE] Updating ETH price: "
        f"${current_price / 1e8:.2f} -> ${new_price_usd:.2f}"
    )

    if DRY_RUN:
        print("[ORACLE] DRY_RUN=true - transaction skipped")
        return None

    from transactions import send_transaction

    tx = price_oracle.functions.setEthPrice(
        new_price
    )

    tx_hash = send_transaction(tx)

    print(
        f"[ORACLE] Price update submitted: "
        f"{tx_hash}"
    )

    return tx_hash


def run():
    print("[ORACLE] Keeper started")

    while True:
        try:
            price = get_eth_price()

            print(
                f"[ORACLE] Current ETH price: "
                f"${price / 1e8:.2f}"
            )

        except Exception as e:
            print(f"[ORACLE] Error: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run()