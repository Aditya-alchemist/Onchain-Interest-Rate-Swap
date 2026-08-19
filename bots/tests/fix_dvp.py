from web3 import Web3

from config import (
    SEPOLIA_RPC_URL,
    PRIVATE_KEY,
    DVP_ENGINE_ADDRESS,
    SWAP_ENGINE_ADDRESS,
    CHAIN_ID,
)
from contracts import w3, dvp_engine


def main():
    account = w3.eth.account.from_key(PRIVATE_KEY)
    sender = account.address

    print("=" * 55)
    print("        Fix DvPEngine SwapEngine Authorization")
    print("=" * 55)

    print("Sender:", sender)
    print("Chain:", w3.eth.chain_id)

    if w3.eth.chain_id != CHAIN_ID:
        raise RuntimeError("Wrong chain")

    owner = dvp_engine.functions.owner().call()
    current = dvp_engine.functions.swapEngine().call()

    print("DvPEngine:", dvp_engine.address)
    print("Owner:", owner)
    print("Current SwapEngine:", current)
    print("Expected SwapEngine:", SWAP_ENGINE_ADDRESS)

    if Web3.to_checksum_address(owner) != sender:
        raise RuntimeError(
            f"Sender is not DvPEngine owner: {owner}"
        )

    if Web3.to_checksum_address(current) == Web3.to_checksum_address(
        SWAP_ENGINE_ADDRESS
    ):
        print("\nAlready configured correctly.")
        return

    print("\nSetting SwapEngine...")

    nonce = w3.eth.get_transaction_count(sender)

    tx = dvp_engine.functions.setSwapEngine(
        Web3.to_checksum_address(SWAP_ENGINE_ADDRESS)
    ).build_transaction({
        "from": sender,
        "nonce": nonce,
        "chainId": CHAIN_ID,
        "gas": 100000,
        "gasPrice": w3.eth.gas_price,
    })

    signed = w3.eth.account.sign_transaction(
        tx,
        PRIVATE_KEY
    )

    tx_hash = w3.eth.send_raw_transaction(
        signed.raw_transaction
    )

    print("TX:", tx_hash.hex())

    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    print("Status:", receipt.status)

    if receipt.status != 1:
        raise RuntimeError("Transaction failed")

    updated = dvp_engine.functions.swapEngine().call()

    print("\nUpdated SwapEngine:", updated)

    if Web3.to_checksum_address(updated) != Web3.to_checksum_address(
        SWAP_ENGINE_ADDRESS
    ):
        raise RuntimeError("SwapEngine was not configured correctly")

    print("\nSUCCESS.")
    print("=" * 55)


if __name__ == "__main__":
    main()