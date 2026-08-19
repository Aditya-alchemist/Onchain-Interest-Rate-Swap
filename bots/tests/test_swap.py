import os
from decimal import Decimal

from config import (
    SWAP_ENGINE_ADDRESS,
    LOAN_NFT_ADDRESS,
    POSITION_REGISTRY_ADDRESS,
)

from contracts import (
    w3,
    swap_engine,
    loan_nft,
    position_registry,
)

from utils import get_account


# ============================================================
# CONFIG
# ============================================================

# Existing LoanNFT owned by your wallet
LOAN_TOKEN_ID = int(
    os.getenv("TEST_LOAN_TOKEN_ID", "1")
)

# USDC has 6 decimals
# 25 USDC = 25,000,000
NOTIONAL_USDC = int(
    os.getenv("TEST_NOTIONAL_USDC", "25000000")
)

# 500 BPS = 5%
FIXED_RATE_BPS = int(
    os.getenv("TEST_FIXED_RATE_BPS", "500")
)

# 1 hour
DURATION = int(
    os.getenv("TEST_DURATION", "3600")
)

# Settlement every 5 minutes
SETTLEMENT_INTERVAL = int(
    os.getenv("TEST_SETTLEMENT_INTERVAL", "300")
)


# ============================================================
# MAIN
# ============================================================

def main():

    print("======================================")
    print("       HedgeFi Swap Test")
    print("======================================")

    # --------------------------------------------------------
    # ACCOUNT
    # --------------------------------------------------------

    account = get_account()

    print("Sender:", account.address)
    print("Connected:", w3.is_connected())

    if not w3.is_connected():
        raise RuntimeError("RPC connection failed")

    chain_id = w3.eth.chain_id

    print("Chain ID:", chain_id)

    balance = w3.eth.get_balance(
        account.address
    )

    print(
        "Balance:",
        Decimal(balance) / Decimal(10**18)
    )

    # --------------------------------------------------------
    # CONTRACT ADDRESSES
    # --------------------------------------------------------

    print()
    print("SwapEngine:", SWAP_ENGINE_ADDRESS)
    print("LoanNFT:", LOAN_NFT_ADDRESS)
    print(
        "PositionRegistry:",
        POSITION_REGISTRY_ADDRESS
    )

    # --------------------------------------------------------
    # CHECK LOAN NFT
    # --------------------------------------------------------

    print()
    print("Checking Loan NFT...")

    try:

        loan_owner = (
            loan_nft
            .functions
            .ownerOf(LOAN_TOKEN_ID)
            .call()
        )

        print(
            "Loan token:",
            LOAN_TOKEN_ID
        )

        print(
            "Loan owner:",
            loan_owner
        )

        print(
            "Sender:",
            account.address
        )

        if (
            loan_owner.lower()
            != account.address.lower()
        ):

            print()
            print("ERROR:")
            print(
                "This wallet does NOT own this LoanNFT."
            )

            print()
            print(
                "Use a loanTokenId owned by this wallet."
            )

            return

    except Exception as e:

        print()
        print(
            "Could not read LoanNFT.ownerOf()."
        )

        print(
            "The loan token may not exist."
        )

        print(
            "Error:",
            e
        )

        return

    # --------------------------------------------------------
    # CHECK EXISTING HEDGE
    # --------------------------------------------------------

    print()
    print("Checking existing hedge...")

    try:

        active = (
            position_registry
            .functions
            .hasActiveHedge(
                LOAN_TOKEN_ID
            )
            .call()
        )

        print(
            "Active hedge:",
            active
        )

        if active:

            print()
            print("ERROR:")
            print(
                "This loan already has an active hedge."
            )

            return

    except Exception as e:

        print()
        print(
            "Could not check active hedge:"
        )

        print(e)

        return

    # --------------------------------------------------------
    # SWAP PARAMETERS
    # --------------------------------------------------------

    print()
    print("Swap parameters")
    print("----------------")

    print(
        "Loan Token ID:",
        LOAN_TOKEN_ID
    )

    print(
        "Notional USDC:",
        Decimal(NOTIONAL_USDC)
        / Decimal(10**6)
    )

    print(
        "Fixed Rate BPS:",
        FIXED_RATE_BPS
    )

    print(
        "Fixed Rate:",
        Decimal(FIXED_RATE_BPS)
        / Decimal(100),
        "%"
    )

    print(
        "Duration:",
        DURATION,
        "seconds"
    )

    print(
        "Settlement Interval:",
        SETTLEMENT_INTERVAL,
        "seconds"
    )

    # --------------------------------------------------------
    # SIMULATION
    # --------------------------------------------------------

    print()
    print("Simulating openSwap()...")

    try:

        result = (
            swap_engine
            .functions
            .openSwap(
                LOAN_TOKEN_ID,
                NOTIONAL_USDC,
                FIXED_RATE_BPS,
                DURATION,
                SETTLEMENT_INTERVAL,
            )
            .call({
                "from": account.address
            })
        )

        print()
        print("Simulation SUCCESS")
        print(
            "Returned swap ID:",
            result
        )

    except Exception as e:

        print()
        print("======================================")
        print("       SIMULATION REVERTED")
        print("======================================")

        print()
        print(e)

        print()
        print("NO TRANSACTION WAS SENT.")

        return

    # --------------------------------------------------------
    # GAS ESTIMATION
    # --------------------------------------------------------

    print()
    print("Estimating gas...")

    try:

        estimated_gas = (
            swap_engine
            .functions
            .openSwap(
                LOAN_TOKEN_ID,
                NOTIONAL_USDC,
                FIXED_RATE_BPS,
                DURATION,
                SETTLEMENT_INTERVAL,
            )
            .estimate_gas({
                "from": account.address
            })
        )

        print(
            "Estimated gas:",
            estimated_gas
        )

    except Exception as e:

        print()
        print("======================================")
        print("       GAS ESTIMATION FAILED")
        print("======================================")

        print()
        print(e)

        return

    # --------------------------------------------------------
    # BUILD TRANSACTION
    # --------------------------------------------------------

    print()
    print("Simulation passed.")
    print("Building transaction...")

    try:

        nonce = w3.eth.get_transaction_count(
            account.address,
            "pending"
        )

        gas_price = w3.eth.gas_price

        # Add safety margin to estimated gas
        gas_limit = estimated_gas + 100000

        print(
            "Nonce:",
            nonce
        )

        print(
            "Gas price:",
            gas_price
        )

        print(
            "Gas limit:",
            gas_limit
        )

        tx = (
            swap_engine
            .functions
            .openSwap(
                LOAN_TOKEN_ID,
                NOTIONAL_USDC,
                FIXED_RATE_BPS,
                DURATION,
                SETTLEMENT_INTERVAL,
            )
            .build_transaction({
                "from": account.address,
                "nonce": nonce,
                "chainId": chain_id,
                "gas": gas_limit,
                "gasPrice": gas_price,
                "value": 0,
            })
        )

    except Exception as e:

        print()
        print("======================================")
        print("       TRANSACTION BUILD FAILED")
        print("======================================")

        print()
        print(e)

        return

    # --------------------------------------------------------
    # SIGN
    # --------------------------------------------------------

    print()
    print("Signing transaction...")

    try:

        signed_tx = account.sign_transaction(
            tx
        )

    except Exception as e:

        print()
        print("======================================")
        print("       SIGNING FAILED")
        print("======================================")

        print()
        print(e)

        return

    # --------------------------------------------------------
    # SEND
    # --------------------------------------------------------

    print()
    print("Sending transaction...")

    try:

        tx_hash = (
            w3.eth
            .send_raw_transaction(
                signed_tx.raw_transaction
            )
        )

        print(
            "TX:",
            tx_hash.hex()
        )

    except Exception as e:

        print()
        print("======================================")
        print("       TRANSACTION SEND FAILED")
        print("======================================")

        print()
        print(e)

        return

    # --------------------------------------------------------
    # WAIT
    # --------------------------------------------------------

    print()
    print("Waiting for confirmation...")

    try:

        receipt = (
            w3.eth
            .wait_for_transaction_receipt(
                tx_hash
            )
        )

    except Exception as e:

        print()
        print("Could not get transaction receipt.")
        print(e)

        return

    # --------------------------------------------------------
    # RECEIPT
    # --------------------------------------------------------

    print()
    print("Status:", receipt.status)
    print(
        "Block:",
        receipt.blockNumber
    )

    # --------------------------------------------------------
    # SUCCESS
    # --------------------------------------------------------

    if receipt.status == 1:

        print()
        print("======================================")
        print("       SWAP OPENED SUCCESSFULLY")
        print("======================================")

        # ----------------------------------------------------
        # READ SWAP ID
        # ----------------------------------------------------

        try:

            swap_id = (
                swap_engine
                .functions
                .loanToSwapId(
                    LOAN_TOKEN_ID
                )
                .call()
            )

            print()
            print(
                "Swap ID:",
                swap_id
            )

        except Exception as e:

            print()
            print(
                "Could not read Swap ID:"
            )

            print(e)

        # ----------------------------------------------------
        # READ SWAP NFT
        # ----------------------------------------------------

        try:

            swap_token_id = (
                swap_engine
                .functions
                .swapToTokenId(
                    swap_id
                )
                .call()
            )

            print(
                "Swap NFT ID:",
                swap_token_id
            )

        except Exception as e:

            print()
            print(
                "Could not read Swap NFT ID:"
            )

            print(e)

        # ----------------------------------------------------
        # VERIFY HEDGE
        # ----------------------------------------------------

        try:

            active_after = (
                position_registry
                .functions
                .hasActiveHedge(
                    LOAN_TOKEN_ID
                )
                .call()
            )

            print(
                "Active hedge:",
                active_after
            )

        except Exception as e:

            print()
            print(
                "Could not verify active hedge:"
            )

            print(e)

        print()
        print("Swap test complete.")

    # --------------------------------------------------------
    # FAILURE
    # --------------------------------------------------------

    else:

        print()
        print("======================================")
        print("       TRANSACTION REVERTED")
        print("======================================")

        print()
        print(
            "The transaction was mined but reverted."
        )

        print(
            "TX:",
            tx_hash.hex()
        )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    main()