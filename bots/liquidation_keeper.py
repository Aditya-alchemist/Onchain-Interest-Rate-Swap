import time
from datetime import datetime, timezone

from config import (
    PRIVATE_KEY,
    CHAIN_ID,
    POLL_INTERVAL,
    DRY_RUN,
)

from contracts import (
    w3,
    loan_manager,
    loan_nft,
)


# ============================================================
# KEEPER ACCOUNT
# ============================================================

account = w3.eth.account.from_key(PRIVATE_KEY)
KEEPER = account.address


# ============================================================
# HELPERS
# ============================================================

def now():
    return datetime.now(timezone.utc).isoformat()


def send_transaction(tx):
    signed = account.sign_transaction(tx)

    tx_hash = w3.eth.send_raw_transaction(
        signed.raw_transaction
    )

    print(f"  [TX] Submitted: {tx_hash.hex()}")

    receipt = w3.eth.wait_for_transaction_receipt(
        tx_hash
    )

    return receipt


def build_base_tx():
    return {
        "from": KEEPER,
        "nonce": w3.eth.get_transaction_count(
            KEEPER,
            "pending"
        ),
        "chainId": CHAIN_ID,
        "gasPrice": w3.eth.gas_price,
    }


# ============================================================
# LOAN DISCOVERY
# ============================================================

def get_latest_token_id():
    """
    Read the latest/current LoanNFT token ID.

    IMPORTANT:
    In the currently deployed HedgeFi LoanNFT contract:

        nextTokenId() == 1

    while token ID 1 already exists.

    Therefore this value behaves as the latest minted token ID,
    not the next unused token ID.

    Example:

        nextTokenId() = 1
        valid token IDs = [1]

        nextTokenId() = 5
        valid token IDs = [1, 2, 3, 4, 5]
    """

    try:
        latest_token = (
            loan_nft
            .functions
            .nextTokenId()
            .call()
        )

        return int(latest_token)

    except Exception as e:

        print(
            f"[{now()}] "
            f"[ERROR] Could not read nextTokenId: {e}"
        )

        return 0


def scan_loans():
    """
    Scan LoanNFT IDs directly.

    We deliberately do NOT depend on eth_getLogs because
    the previous Alchemy event-query approach returned HTTP 400.

    Instead we inspect each LoanManager loan directly.
    """

    latest_token = get_latest_token_id()

    if latest_token < 1:
        return []

    loans = []

    print(
        f"[{now()}] "
        f"[SCAN] Checking LoanNFT IDs 1 -> {latest_token}"
    )

    for token_id in range(1, latest_token + 1):

        try:

            borrower, loan = (
                loan_manager
                .functions
                .getLoanByTokenId(token_id)
                .call()
            )

            # Loan struct:
            #
            # 0 collateralEth
            # 1 principalUsdc
            # 2 borrowRateBps
            # 3 startTime
            # 4 tokenId
            # 5 active

            active = bool(loan[5])

            if not active:
                continue

            if borrower.lower() == (
                "0x0000000000000000000000000000000000000000"
            ):
                continue

            loans.append(
                {
                    "token_id": token_id,
                    "borrower": borrower,
                    "loan": loan,
                }
            )

        except Exception as e:

            print(
                f"[{now()}] "
                f"[WARN] Could not read Loan #{token_id}: {e}"
            )

    return loans


# ============================================================
# LIQUIDATION
# ============================================================

def liquidate_loan(
    token_id,
    borrower,
    health,
):
    """
    Execute:

        LoanManager.liquidate(
            tokenId,
            liquidator
        )
    """

    print()
    print(
        "  ============================================"
    )

    print(
        f"  [LIQUIDATION] Loan #{token_id}"
    )

    print(
        f"  [LIQUIDATION] Borrower: {borrower}"
    )

    print(
        f"  [LIQUIDATION] Health: "
        f"{health} bps "
        f"({health / 100:.2f}%)"
    )

    print(
        f"  [LIQUIDATION] Liquidator: {KEEPER}"
    )

    print(
        "  ============================================"
    )

    # --------------------------------------------------------
    # DRY RUN
    # --------------------------------------------------------

    if DRY_RUN:

        print(
            f"  [DRY RUN] Would liquidate "
            f"Loan #{token_id}"
        )

        return

    try:

        # ----------------------------------------------------
        # SIMULATION
        # ----------------------------------------------------

        print(
            "  [TX] Simulating liquidate()..."
        )

        loan_manager.functions.liquidate(
            token_id,
            KEEPER,
        ).call(
            {
                "from": KEEPER
            }
        )

        print(
            "  [TX] Simulation successful."
        )

        # ----------------------------------------------------
        # GAS ESTIMATION
        # ----------------------------------------------------

        gas_estimate = (
            loan_manager
            .functions
            .liquidate(
                token_id,
                KEEPER,
            )
            .estimate_gas(
                {
                    "from": KEEPER
                }
            )
        )

        print(
            f"  [TX] Estimated gas: {gas_estimate}"
        )

        gas_limit = int(
            gas_estimate * 1.20
        )

        # ----------------------------------------------------
        # BUILD TRANSACTION
        # ----------------------------------------------------

        tx = build_base_tx()

        tx["gas"] = gas_limit

        tx.update(
            loan_manager
            .functions
            .liquidate(
                token_id,
                KEEPER,
            )
            .build_transaction(tx)
        )

        print(
            f"  [TX] Nonce: {tx['nonce']}"
        )

        print(
            f"  [TX] Gas limit: {tx['gas']}"
        )

        print(
            f"  [TX] Gas price: {tx['gasPrice']}"
        )

        # ----------------------------------------------------
        # SEND
        # ----------------------------------------------------

        receipt = send_transaction(tx)

        if receipt.status == 1:

            print()
            print(
                "  ========================================"
            )

            print(
                "  [SUCCESS] LIQUIDATION CONFIRMED"
            )

            print(
                f"  [SUCCESS] Loan #{token_id}"
            )

            print(
                f"  [SUCCESS] Block: "
                f"{receipt.blockNumber}"
            )

            print(
                f"  [SUCCESS] Gas used: "
                f"{receipt.gasUsed}"
            )

            print(
                "  ========================================"
            )

        else:

            print(
                "  [FAILED] "
                "Liquidation transaction reverted."
            )

    except Exception as e:

        print(
            f"  [ERROR] Liquidation failed: {e}"
        )


# ============================================================
# SINGLE SCAN
# ============================================================

def run_once():

    print()
    print(
        f"[{now()}] "
        "Scanning active loans..."
    )

    loans = scan_loans()

    print(
        f"[{now()}] "
        f"Active loans found: {len(loans)}"
    )

    if not loans:

        print(
            f"[{now()}] "
            "[SCAN] No active loans."
        )

        return

    # --------------------------------------------------------
    # PROCESS EACH ACTIVE LOAN
    # --------------------------------------------------------

    for item in loans:

        token_id = item["token_id"]
        borrower = item["borrower"]

        try:

            health = (
                loan_manager
                .functions
                .healthFactorBps(
                    borrower
                )
                .call()
            )

            liquidatable = (
                loan_manager
                .functions
                .isLiquidatable(
                    token_id
                )
                .call()
            )

            print()
            print(
                f"[{now()}] "
                f"Loan #{token_id}"
            )

            print(
                f"  Borrower: {borrower}"
            )

            print(
                f"  Health: "
                f"{health} bps "
                f"({health / 100:.2f}%)"
            )

            print(
                f"  Liquidatable: "
                f"{liquidatable}"
            )

            # ------------------------------------------------
            # LIQUIDATE
            # ------------------------------------------------

            if liquidatable:

                liquidate_loan(
                    token_id,
                    borrower,
                    health,
                )

            else:

                print(
                    f"  [SAFE] "
                    f"Loan #{token_id} is healthy."
                )

        except Exception as e:

            print(
                f"[{now()}] "
                f"[ERROR] Loan #{token_id}: {e}"
            )


# ============================================================
# STARTUP
# ============================================================

print(
    "[TX] Keeper address:",
    KEEPER
)

print(
    "============================================================"
)

print(
    "          HedgeFi Liquidation Keeper"
)

print(
    "============================================================"
)


# ============================================================
# LIQUIDATION PARAMETERS
# ============================================================

try:

    threshold = (
        loan_manager
        .functions
        .LIQUIDATION_THRESHOLD_BPS()
        .call()
    )

    bonus = (
        loan_manager
        .functions
        .LIQUIDATION_BONUS_BPS()
        .call()
    )

    print(
        f"[LIQUIDATION] "
        f"Threshold: {threshold} bps "
        f"({threshold / 100:.2f}%)"
    )

    print(
        f"[LIQUIDATION] "
        f"Bonus: {bonus} bps "
        f"({bonus / 100:.2f}%)"
    )

except Exception as e:

    print(
        "[WARN] "
        "Could not read liquidation parameters:",
        e
    )


# ============================================================
# CONFIG
# ============================================================

print(
    f"[KEEPER] DRY_RUN: {DRY_RUN}"
)

print(
    f"[KEEPER] POLL_INTERVAL: {POLL_INTERVAL}s"
)

print(
    "============================================================"
)


# ============================================================
# MAIN LOOP
# ============================================================

while True:

    try:

        run_once()

    except KeyboardInterrupt:

        print()
        print(
            "[KEEPER] Shutdown requested."
        )

        break

    except Exception as e:

        print()
        print(
            f"[KEEPER] Unexpected error: {e}"
        )

    time.sleep(POLL_INTERVAL)