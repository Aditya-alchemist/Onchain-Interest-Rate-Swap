import time
from datetime import datetime, timezone

from contracts import swap_factory, w3


SCAN_INTERVAL = 30


def get_active_swaps():
    return swap_factory.functions.getActiveSwapIds().call()


def get_swap(swap_id):
    return swap_factory.functions.getSwap(swap_id).call()


def needs_settlement(swap):
    (
        loan_token_id,
        fixed_payer,
        floating_payer,
        notional_usdc,
        fixed_rate_bps,
        start_time,
        maturity_time,
        settlement_interval,
        last_settlement_time,
        status,
    ) = swap

    if status != 1:
        return False

    now = int(time.time())

    return now >= last_settlement_time + settlement_interval


def scan():
    active_swap_ids = get_active_swaps()

    print(
        f"\n[{datetime.now(timezone.utc).isoformat()}] "
        f"Active swaps: {len(active_swap_ids)}"
    )

    for swap_id in active_swap_ids:
        try:
            swap = get_swap(swap_id)

            if needs_settlement(swap):
                print(
                    f"[SETTLE] Swap #{swap_id} requires settlement"
                )
            else:
                print(
                    f"[WAIT] Swap #{swap_id} does not require settlement"
                )

        except Exception as e:
            print(f"[ERROR] Swap #{swap_id}: {e}")


def main():
    print("HedgeFi Keeper Scanner")
    print(f"Connected: {w3.is_connected()}")
    print(f"Chain ID: {w3.eth.chain_id}")

    while True:
        try:
            scan()
        except Exception as e:
            print(f"[SCAN ERROR] {e}")

        time.sleep(SCAN_INTERVAL)


if __name__ == "__main__":
    main()