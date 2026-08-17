import time
import traceback
from datetime import datetime, timezone

from contracts import swap_factory, swap_engine, w3
from config import POLL_INTERVAL, DRY_RUN
from utils import get_account


# --------------------------------------------------
# Account
# --------------------------------------------------

account = get_account()


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def now():
    return datetime.now(timezone.utc).isoformat()


def get_active_swaps():
    return swap_factory.functions.getActiveSwapIds().call()


# --------------------------------------------------
# Process Swap
# --------------------------------------------------

def process_swap(swap_id):
    try:
        swap = swap_factory.functions.getSwap(swap_id).call()

        loan_token_id = swap[0]
        notional_usdc = swap[3]
        fixed_rate_bps = swap[4]
        maturity_time = swap[6]
        settlement_interval = swap[7]
        last_settlement_time = swap[8]
        status = swap[9]

        print(
            f"[{now()}] "
            f"Swap #{swap_id} | "
            f"Loan #{loan_token_id} | "
            f"Notional={notional_usdc} | "
            f"FixedRate={fixed_rate_bps}bps"
        )

        # SwapStatus.Active = 1
        if status != 1:
            print(
                f"  [SKIP] Swap #{swap_id} is not active"
            )
            return

        current_time = int(time.time())

        settlement_due_at = (
            last_settlement_time + settlement_interval
        )

        # --------------------------------------------------
        # Maturity
        # --------------------------------------------------

        if current_time >= maturity_time:
            print(
                f"  [MATURITY] Swap #{swap_id} reached maturity"
            )
            due = True

        # --------------------------------------------------
        # Regular settlement
        # --------------------------------------------------

        elif current_time >= settlement_due_at:
            print(
                f"  [DUE] Swap #{swap_id} "
                f"settlement interval reached"
            )
            due = True

        # --------------------------------------------------
        # Not due
        # --------------------------------------------------

        else:
            remaining = settlement_due_at - current_time

            print(
                f"  [WAIT] Swap #{swap_id} "
                f"next settlement in {remaining}s"
            )
            due = False

        if not due:
            return

        # --------------------------------------------------
        # Dry run
        # --------------------------------------------------

        if DRY_RUN:
            print(
                f"  [DRY RUN] Would call "
                f"settleSwap({swap_id})"
            )
            return

        # --------------------------------------------------
        # Execute
        # --------------------------------------------------

        execute_settlement(swap_id)

    except Exception as e:
        print(
            f"  [ERROR] Failed processing "
            f"swap #{swap_id}: {e}"
        )
        traceback.print_exc()


# --------------------------------------------------
# Execute Settlement
# --------------------------------------------------

def execute_settlement(swap_id):
    print(
        f"  [TX] Preparing settleSwap({swap_id})..."
    )

    try:
        # --------------------------------------------------
        # Nonce
        # --------------------------------------------------

        nonce = w3.eth.get_transaction_count(
            account.address,
            "pending"
        )

        # --------------------------------------------------
        # Gas price
        # --------------------------------------------------

        gas_price = w3.eth.gas_price

        print(
            f"  [TX] Sender: {account.address}"
        )

        print(
            f"  [TX] Nonce: {nonce}"
        )

        print(
            f"  [TX] Gas price: {gas_price}"
        )

        # --------------------------------------------------
        # Build transaction
        # --------------------------------------------------

        tx = swap_engine.functions.settleSwap(
            swap_id
        ).build_transaction({
            "from": account.address,
            "nonce": nonce,
            "gas": 1_500_000,
            "gasPrice": gas_price,
            "chainId": w3.eth.chain_id,
        })

        # --------------------------------------------------
        # Sign
        # --------------------------------------------------

        print("  [TX] Signing transaction...")

        signed = account.sign_transaction(tx)

        # --------------------------------------------------
        # Send raw transaction
        # --------------------------------------------------

        print("  [TX] Sending transaction...")

        tx_hash = w3.eth.send_raw_transaction(
            signed.raw_transaction
        )

        print(
            f"  [TX] Submitted: {tx_hash.hex()}"
        )

        # --------------------------------------------------
        # Wait for confirmation
        # --------------------------------------------------

        print(
            "  [TX] Waiting for confirmation..."
        )

        receipt = w3.eth.wait_for_transaction_receipt(
            tx_hash,
            timeout=180
        )

        # --------------------------------------------------
        # Result
        # --------------------------------------------------

        if receipt["status"] == 1:
            print(
                f"  [SUCCESS] Settlement confirmed | "
                f"block={receipt['blockNumber']} | "
                f"gas={receipt['gasUsed']}"
            )

        else:
            print(
                f"  [FAILED] Transaction reverted | "
                f"tx={tx_hash.hex()}"
            )

    except Exception as e:
        print(
            f"  [TX ERROR] settleSwap({swap_id}) failed: {e}"
        )
        traceback.print_exc()


# --------------------------------------------------
# Main Keeper Loop
# --------------------------------------------------

def run():
    print("======================================")
    print("       HedgeFi Settlement Keeper")
    print("======================================")

    print(
        f"Connected: {w3.is_connected()}"
    )

    print(
        f"Chain ID: {w3.eth.chain_id}"
    )

    print(
        f"Keeper address: {account.address}"
    )

    print(
        f"DRY_RUN: {DRY_RUN}"
    )

    print(
        f"POLL_INTERVAL: {POLL_INTERVAL}s"
    )

    print("======================================")

    while True:

        try:

            active_swaps = get_active_swaps()

            print(
                f"\n[{now()}] "
                f"Active swaps: {len(active_swaps)}"
            )

            for swap_id in active_swaps:
                process_swap(swap_id)

        except KeyboardInterrupt:

            print("\nKeeper stopped.")
            break

        except Exception as e:

            print(
                f"[SCAN ERROR] {e}"
            )

            traceback.print_exc()

        time.sleep(POLL_INTERVAL)


# --------------------------------------------------
# Entry Point
# --------------------------------------------------

if __name__ == "__main__":
    run()