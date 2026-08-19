import time
from datetime import datetime, timezone

from web3 import Web3

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
    liquidation_engine,
    mock_usdc,
)


# ============================================================
# KEEPER ACCOUNT
# ============================================================

account = w3.eth.account.from_key(PRIVATE_KEY)
KEEPER = account.address


# ============================================================
# CONSTANTS
# ============================================================

MAX_UINT256 = 2**256 - 1

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


# ============================================================
# HELPERS
# ============================================================

def now():
    return datetime.now(timezone.utc).isoformat()


def send_transaction(tx):
    """
    Sign, send and wait for a transaction.
    """

    signed = account.sign_transaction(tx)

    tx_hash = w3.eth.send_raw_transaction(
        signed.raw_transaction
    )

    print(
        f"  [TX] Submitted: {tx_hash.hex()}"
    )

    receipt = w3.eth.wait_for_transaction_receipt(
        tx_hash
    )

    return receipt


def build_base_tx():
    """
    Common transaction parameters.
    """

    return {
        "from": KEEPER,
        "nonce": w3.eth.get_transaction_count(
            KEEPER,
            "pending",
        ),
        "chainId": CHAIN_ID,
        "gasPrice": w3.eth.gas_price,
    }


def format_usdc(amount):
    return f"{amount / 1e6:.6f} USDC"


# ============================================================
# CONTRACT CONFIGURATION CHECK
# ============================================================

def verify_configuration():
    """
    Verify that LiquidationEngine points to the same
    LoanManager that the keeper is using.

    This is important because:

        keeper
          -> LiquidationEngine
          -> LoanManager

    must all reference the correct deployed contracts.
    """

    print()
    print("[CONFIG] Verifying liquidation configuration...")

    engine_loan_manager = (
        liquidation_engine
        .functions
        .loanManager()
        .call()
    )

    configured_engine = (
        loan_manager
        .functions
        .liquidationEngine()
        .call()
    )

    print(
        f"[CONFIG] LiquidationEngine: "
        f"{liquidation_engine.address}"
    )

    print(
        f"[CONFIG] Engine -> LoanManager: "
        f"{engine_loan_manager}"
    )

    print(
        f"[CONFIG] LoanManager -> Engine: "
        f"{configured_engine}"
    )

    if (
        Web3.to_checksum_address(
            engine_loan_manager
        )
        != Web3.to_checksum_address(
            loan_manager.address
        )
    ):
        raise Exception(
            "LiquidationEngine points to the wrong LoanManager."
        )

    if (
        Web3.to_checksum_address(
            configured_engine
        )
        != Web3.to_checksum_address(
            liquidation_engine.address
        )
    ):
        raise Exception(
            "LoanManager points to the wrong LiquidationEngine."
        )

    print(
        "[CONFIG] ✓ LiquidationEngine <-> LoanManager "
        "configuration is correct."
    )


# ============================================================
# LOAN DISCOVERY
# ============================================================

def get_loan_count():
    """
    Read LoanNFT.nextTokenId().

    Your current deployment has Loan #1, and the observed
    nextTokenId() behavior indicates token #1 must be checked.

    We therefore scan inclusively and simply ignore IDs that
    do not contain an active loan.
    """

    try:

        next_token = (
            loan_nft
            .functions
            .nextTokenId()
            .call()
        )

        next_token = int(next_token)

        print(
            f"[{now()}] "
            f"[SCAN] Checking LoanNFT IDs "
            f"1 -> {next_token}"
        )

        return next_token

    except Exception as e:

        print(
            f"[{now()}] "
            f"[ERROR] Could not read nextTokenId: {e}"
        )

        return 0


def scan_loans():
    """
    Discover active loans directly through LoanManager.

    We deliberately do NOT depend on eth_getLogs / event
    scanning because your Alchemy endpoint previously returned
    a 400 error for that approach.
    """

    max_token = get_loan_count()

    if max_token <= 0:
        return []

    loans = []

    for token_id in range(1, max_token + 1):

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

            if (
                borrower.lower()
                == ZERO_ADDRESS.lower()
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

            # Non-existent token IDs are harmless.
            print(
                f"[{now()}] "
                f"[SCAN] Loan #{token_id} unavailable: "
                f"{e}"
            )

    return loans


# ============================================================
# USDC / LIQUIDATOR PREPARATION
# ============================================================

def get_usdc_balance():
    return (
        mock_usdc
        .functions
        .balanceOf(KEEPER)
        .call()
    )


def get_usdc_allowance():
    return (
        mock_usdc
        .functions
        .allowance(
            KEEPER,
            loan_manager.address,
        )
        .call()
    )


def ensure_liquidator_approval(required_amount):
    """
    LoanManager.liquidate() executes:

        usdc.transferFrom(
            liquidator,
            address(this),
            debt
        );

    Therefore the keeper must approve LoanManager.

    We approve MAX_UINT256 once rather than sending an approval
    transaction for every liquidation.
    """

    balance = get_usdc_balance()
    allowance = get_usdc_allowance()

    print(
        f"  [USDC] Keeper balance: "
        f"{format_usdc(balance)}"
    )

    print(
        f"  [USDC] LoanManager allowance: "
        f"{format_usdc(allowance)}"
    )

    if balance < required_amount:

        raise Exception(
            "Insufficient USDC for liquidation. "
            f"Required={format_usdc(required_amount)}, "
            f"Balance={format_usdc(balance)}"
        )

    if allowance >= required_amount:

        print(
            "  [USDC] ✓ Existing allowance is sufficient."
        )

        return

    print()
    print(
        "  [USDC] Approving LoanManager for liquidation..."
    )

    approve_contract = (
        mock_usdc
        .functions
        .approve(
            loan_manager.address,
            MAX_UINT256,
        )
    )

    # Simulation
    approve_contract.call(
        {
            "from": KEEPER
        }
    )

    gas_estimate = (
        approve_contract
        .estimate_gas(
            {
                "from": KEEPER
            }
        )
    )

    tx = build_base_tx()

    tx["gas"] = int(
        gas_estimate * 1.20
    )

    tx.update(
        approve_contract
        .build_transaction(tx)
    )

    print(
        f"  [USDC] Approval gas: {gas_estimate}"
    )

    receipt = send_transaction(tx)

    if receipt.status != 1:

        raise Exception(
            "USDC approval transaction failed."
        )

    print(
        f"  [USDC] ✓ Approval confirmed "
        f"| block={receipt.blockNumber} "
        f"| gas={receipt.gasUsed}"
    )


# ============================================================
# LIQUIDATION
# ============================================================

def liquidate_loan(
    token_id,
    borrower,
    health,
):
    """
    Correct liquidation path:

        LiquidationKeeper
            |
            v
        LiquidationEngine.liquidate(tokenId)
            |
            v
        LoanManager.liquidate(tokenId, msg.sender)

    IMPORTANT:

    Do NOT call:

        LoanManager.liquidate(...)

    directly.

    LoanManager has:

        onlyLiquidationEngine

    and would revert with:

        UnauthorizedLiquidationEngine()
    """

    print()
    print(
        "  ============================================"
    )

    print(
        f"  [LIQUIDATION] Loan #{token_id}"
    )

    print(
        f"  [LIQUIDATION] Borrower: "
        f"{borrower}"
    )

    print(
        f"  [LIQUIDATION] Health: "
        f"{health} bps "
        f"({health / 100:.2f}%)"
    )

    print(
        f"  [LIQUIDATION] Liquidator: "
        f"{KEEPER}"
    )

    print(
        f"  [LIQUIDATION] Engine: "
        f"{liquidation_engine.address}"
    )

    print(
        "  ============================================"
    )

    # --------------------------------------------------------
    # DRY RUN
    # --------------------------------------------------------

    if DRY_RUN:

        print(
            f"  [DRY RUN] Would call:"
        )

        print(
            f"  [DRY RUN] "
            f"LiquidationEngine.liquidate({token_id})"
        )

        print(
            "  [DRY RUN] "
            "No transaction will be sent."
        )

        return

    try:

        # ----------------------------------------------------
        # IMPORTANT:
        # We need an estimate of debt because LoanManager
        # requires the liquidator to have enough USDC.
        #
        # The easiest safe check here is to use the current
        # loan principal plus a small balance requirement.
        #
        # LoanManager itself calculates:
        #
        #   debt = principal + interest
        #
        # We therefore require the keeper to have at least the
        # principal. The actual simulation below will catch
        # insufficient balance/allowance for accrued interest.
        # ----------------------------------------------------

        loan_data = (
            loan_manager
            .functions
            .getLoanByTokenId(token_id)
            .call()
        )

        borrower_from_chain, loan = loan_data

        principal = int(
            loan[1]
        )

        print(
            f"  [LIQUIDATION] Principal: "
            f"{format_usdc(principal)}"
        )

        # ----------------------------------------------------
        # Ensure USDC approval
        # ----------------------------------------------------

        ensure_liquidator_approval(
            principal
        )

        # ----------------------------------------------------
        # Simulation
        #
        # THIS IS THE CRITICAL FIX.
        #
        # Call LiquidationEngine, not LoanManager.
        # ----------------------------------------------------

        print(
            "  [TX] Simulating "
            "LiquidationEngine.liquidate()..."
        )

        liquidation_call = (
            liquidation_engine
            .functions
            .liquidate(
                token_id
            )
        )

        liquidation_call.call(
            {
                "from": KEEPER
            }
        )

        print(
            "  [TX] ✓ Liquidation simulation successful."
        )

        # ----------------------------------------------------
        # Gas estimation
        # ----------------------------------------------------

        print(
            "  [TX] Estimating gas..."
        )

        gas_estimate = (
            liquidation_engine
            .functions
            .liquidate(
                token_id
            )
            .estimate_gas(
                {
                    "from": KEEPER
                }
            )
        )

        print(
            f"  [TX] Estimated gas: "
            f"{gas_estimate}"
        )

        gas_limit = int(
            gas_estimate * 1.20
        )

        # ----------------------------------------------------
        # Build transaction
        # ----------------------------------------------------

        tx = build_base_tx()

        tx["gas"] = gas_limit

        tx.update(
            liquidation_engine
            .functions
            .liquidate(
                token_id
            )
            .build_transaction(
                tx
            )
        )

        print(
            f"  [TX] Nonce: "
            f"{tx['nonce']}"
        )

        print(
            f"  [TX] Gas limit: "
            f"{tx['gas']}"
        )

        print(
            f"  [TX] Gas price: "
            f"{tx['gasPrice']}"
        )

        # ----------------------------------------------------
        # Send transaction
        # ----------------------------------------------------

        print(
            "  [TX] Signing transaction..."
        )

        receipt = send_transaction(
            tx
        )

        # ----------------------------------------------------
        # Result
        # ----------------------------------------------------

        if receipt.status == 1:

            print()
            print(
                "  ============================================"
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
                "  ============================================"
            )

        else:

            print(
                "  [FAILED] Liquidation transaction reverted."
            )

    except Exception as e:

        print()
        print(
            f"  [ERROR] Liquidation failed: {e}"
        )

        # ----------------------------------------------------
        # Helpful error decoding
        # ----------------------------------------------------

        error_text = str(e)

        if "0x3d3be2a5" in error_text:

            print()
            print(
                "  [DECODED ERROR]"
            )

            print(
                "  UnauthorizedLiquidationEngine()"
            )

            print(
                "  This means the keeper called "
                "LoanManager.liquidate() directly."
            )

            print(
                "  The keeper must call "
                "LiquidationEngine.liquidate()."
            )

        elif "0xeb16e2ad" in error_text:

            print()
            print(
                "  [DECODED ERROR]"
            )

            print(
                "  InsufficientLiquidatorFunds()"
            )

            print(
                "  The keeper does not have enough USDC "
                "to repay the loan."
            )

        elif "LoanHealthy" in error_text:

            print()
            print(
                "  [DECODED ERROR]"
            )

            print(
                "  Loan is no longer liquidatable."
            )

        elif "NotLiquidatable" in error_text:

            print()
            print(
                "  [DECODED ERROR]"
            )

            print(
                "  LiquidationEngine rejected the loan."
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

    for item in loans:

        token_id = item["token_id"]
        borrower = item["borrower"]

        try:

            # ------------------------------------------------
            # Health
            # ------------------------------------------------

            health = (
                loan_manager
                .functions
                .healthFactorBps(
                    borrower
                )
                .call()
            )

            # ------------------------------------------------
            # Liquidation status
            # ------------------------------------------------

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
                f"  Borrower: "
                f"{borrower}"
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
                f"[ERROR] Loan #{token_id}: "
                f"{e}"
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


# ------------------------------------------------------------
# Read liquidation parameters
# ------------------------------------------------------------

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
        "[WARN] Could not read liquidation parameters:",
        e
    )


# ------------------------------------------------------------
# Configuration verification
# ------------------------------------------------------------

try:

    verify_configuration()

except Exception as e:

    print()
    print(
        "[FATAL] Liquidation configuration is invalid."
    )

    print(
        f"[FATAL] {e}"
    )

    raise


# ------------------------------------------------------------
# Keeper configuration
# ------------------------------------------------------------

print(
    f"[KEEPER] DRY_RUN: {DRY_RUN}"
)

print(
    f"[KEEPER] POLL_INTERVAL: "
    f"{POLL_INTERVAL}s"
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
            f"[KEEPER] Unexpected error: "
            f"{e}"
        )

    time.sleep(
        POLL_INTERVAL
    )