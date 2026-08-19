from web3 import Web3

from config import (
    PRIVATE_KEY,
    CHAIN_ID,
)

from contracts import w3


# ============================================================
# ACCOUNT
# ============================================================

account = w3.eth.account.from_key(PRIVATE_KEY)

KEEPER_ADDRESS = account.address


print(
    f"[TX] Keeper address: {KEEPER_ADDRESS}"
)


# ============================================================
# TRANSACTION SENDER
# ============================================================

def send_transaction(contract_function):

    nonce = w3.eth.get_transaction_count(
        KEEPER_ADDRESS,
        "pending"
    )

    gas_price = w3.eth.gas_price

    tx = contract_function.build_transaction({
        "from": KEEPER_ADDRESS,
        "nonce": nonce,
        "chainId": CHAIN_ID,
        "gas": 500_000,
        "gasPrice": gas_price,
    })

    signed = w3.eth.account.sign_transaction(
        tx,
        PRIVATE_KEY
    )

    tx_hash = w3.eth.send_raw_transaction(
        signed.raw_transaction
    )

    print(
        f"[TX] Submitted: "
        f"{tx_hash.hex()}"
    )

    receipt = w3.eth.wait_for_transaction_receipt(
        tx_hash
    )

    if receipt.status != 1:
        raise RuntimeError(
            f"Transaction reverted: {tx_hash.hex()}"
        )

    print(
        f"[TX] Confirmed in block "
        f"{receipt.blockNumber}"
    )

    return tx_hash.hex()