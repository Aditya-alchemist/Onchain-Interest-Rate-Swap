import time

from eth_account import Account

from config import PRIVATE_KEY, CHAIN_ID
from contracts import w3


def get_account():
    """
    Return the account derived from PRIVATE_KEY.
    """
    return Account.from_key(PRIVATE_KEY)


def get_sender():
    """
    Return the checksum address of the bot wallet.
    """
    return get_account().address


def get_nonce():
    """
    Get the next pending nonce for the bot wallet.
    """
    return w3.eth.get_transaction_count(
        get_sender(),
        "pending"
    )


def get_balance():
    """
    Return native ETH balance in Wei.
    """
    return w3.eth.get_balance(
        get_sender()
    )


def get_balance_eth():
    """
    Return native ETH balance in ETH.
    """
    return w3.from_wei(
        get_balance(),
        "ether"
    )


def build_transaction(function, value=0):
    """
    Build a transaction for a contract function.
    """

    account = get_account()

    return function.build_transaction({
        "from": account.address,
        "nonce": get_nonce(),
        "chainId": CHAIN_ID,
        "gas": 500000,
        "gasPrice": w3.eth.gas_price,
        "value": value,
    })


def sign_transaction(transaction):
    """
    Sign a transaction using the bot private key.
    """

    account = get_account()

    return account.sign_transaction(
        transaction
    )


def send_transaction(transaction):
    """
    Sign and broadcast a transaction.
    """

    signed = sign_transaction(
        transaction
    )

    tx_hash = w3.eth.send_raw_transaction(
        signed.raw_transaction
    )

    return tx_hash


def wait_for_transaction(tx_hash, timeout=300):
    """
    Wait for transaction confirmation.
    """

    return w3.eth.wait_for_transaction_receipt(
        tx_hash,
        timeout=timeout
    )


def send_and_wait(transaction):
    """
    Sign, send and wait for confirmation.
    """

    tx_hash = send_transaction(
        transaction
    )

    print(
        "TX:",
        tx_hash.hex()
    )

    receipt = wait_for_transaction(
        tx_hash
    )

    print(
        "Status:",
        receipt.status
    )

    print(
        "Block:",
        receipt.blockNumber
    )

    return receipt


def sleep(seconds):
    """
    Sleep helper for keepers.
    """

    time.sleep(seconds)