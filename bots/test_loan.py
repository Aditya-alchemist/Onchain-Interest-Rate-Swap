from web3 import Web3

from contracts import (
    w3,
    loan_manager,
    loan_nft,
    lending_pool,
)

from utils import (
    get_account,
    send_transaction,
)


def main():
    print("=" * 50)
    print("          HedgeFi Loan Test")
    print("=" * 50)

    account = get_account()

    print("Borrower:", account.address)
    print("Connected:", w3.is_connected())
    print("Chain ID:", w3.eth.chain_id)

    balance = w3.eth.get_balance(account.address)

    print(
        "ETH Balance:",
        w3.from_wei(balance, "ether")
    )

    # --------------------------------------------------
    # Check existing loan
    # --------------------------------------------------

    active = loan_manager.functions.hasActiveLoan(
        account.address
    ).call()

    print("\nExisting active loan:", active)

    if active:
        print("Borrower already has an active loan.")
        return

    # --------------------------------------------------
    # Loan parameters
    # --------------------------------------------------

    collateral_eth = w3.to_wei(
        0.01,
        "ether"
    )

    max_borrow = loan_manager.functions.maxBorrowable(
        collateral_eth
    ).call()

    print("\nCollateral:", w3.from_wei(
        collateral_eth,
        "ether"
    ), "ETH")

    print("Maximum borrow:", max_borrow, "USDC")

    # Borrow slightly below maximum
    borrow_amount = 25_000_000  # 25 USDC

    if borrow_amount > max_borrow:
        print("Borrow amount exceeds maximum.")
        return

    print("Borrow amount:", borrow_amount / 1e6, "USDC")

    # --------------------------------------------------
    # Check lending pool liquidity
    # --------------------------------------------------

    try:
        liquidity = lending_pool.functions.availableLiquidity().call()

        print(
            "LendingPool liquidity:",
            liquidity / 1e6,
            "USDC"
        )

        if liquidity < borrow_amount:
            print("ERROR: insufficient LendingPool liquidity.")
            return

    except Exception as e:
        print("Could not read LendingPool liquidity:", e)

    # --------------------------------------------------
    # Build transaction
    # --------------------------------------------------

    print("\nSending borrow transaction...")

    nonce = w3.eth.get_transaction_count(
        account.address
    )

    gas_price = w3.eth.gas_price

    tx = loan_manager.functions.borrow(
        borrow_amount
    ).build_transaction({
        "from": account.address,
        "value": collateral_eth,
        "nonce": nonce,
        "chainId": w3.eth.chain_id,
        "gas": 700_000,
        "gasPrice": gas_price,
    })

    signed = account.sign_transaction(tx)

    tx_hash = w3.eth.send_raw_transaction(
        signed.raw_transaction
    )

    print("TX:", tx_hash.hex())

    receipt = w3.eth.wait_for_transaction_receipt(
        tx_hash
    )

    print("Status:", receipt.status)
    print("Block:", receipt.blockNumber)

    if receipt.status != 1:
        print("\nTransaction reverted.")
        return

    print("\nLoan created successfully!")

    # --------------------------------------------------
    # Read loan
    # --------------------------------------------------

    loan = loan_manager.functions.loans(
        account.address
    ).call()

    print("\nLoan data:")
    print("--------------------------------")

    print("Collateral ETH:",
          w3.from_wei(loan[0], "ether"))

    print("Principal USDC:",
          loan[1] / 1e6)

    print("Borrow rate BPS:",
          loan[2])

    print("Start time:",
          loan[3])

    print("Loan NFT ID:",
          loan[4])

    print("Active:",
          loan[5])

    # --------------------------------------------------
    # Check NFT owner
    # --------------------------------------------------

    token_id = loan[4]

    if token_id != 0:
        try:
            nft_owner = loan_nft.functions.ownerOf(
                token_id
            ).call()

            print("\nLoanNFT:")
            print("Token ID:", token_id)
            print("Owner:", nft_owner)

        except Exception as e:
            print(
                "Could not read LoanNFT owner:",
                e
            )

    print("\nLoan test complete.")


if __name__ == "__main__":
    main()