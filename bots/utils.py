import time

from eth_account import Account

from config import PRIVATE_KEY, CHAIN_ID
from contracts import w3


# ============================================================
# ACCOUNT
# ============================================================

def get_account():
    """
    Return the account derived from PRIVATE_KEY.
    """

    if not PRIVATE_KEY:
        raise RuntimeError(
            "PRIVATE_KEY is not configured"
        )

    return Account.from_key(PRIVATE_KEY)


def get_sender():
    """
    Return the checksum address of the keeper wallet.
    """

    return get_account().address


# ============================================================
# NONCE
# ============================================================

def get_nonce():
    """
    Get the next pending nonce.

    'pending' is important because the wallet may already
    have an unconfirmed transaction in the mempool.
    """

    return w3.eth.get_transaction_count(
        get_sender(),
        "pending"
    )


# ============================================================
# BALANCE
# ============================================================

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


# ============================================================
# GAS
# ============================================================

def get_gas_price():
    """
    Return current network gas price.
    """

    return w3.eth.gas_price


# ============================================================
# TRANSACTION BUILDING
# ============================================================

def build_transaction(
    function,
    value=0,
    gas=500_000,
):
    """
    Convert a Web3 ContractFunction into a transaction dict.

    Example:

        call = contract.functions.someFunction(...)
        tx = build_transaction(call)
    """

    account = get_account()

    nonce = get_nonce()

    tx = function.build_transaction({
        "from": account.address,
        "nonce": nonce,
        "chainId": CHAIN_ID,
        "gas": gas,
        "gasPrice": get_gas_price(),
        "value": value,
    })

    return tx


# ============================================================
# SIGNING
# ============================================================

def sign_transaction(transaction):
    """
    Sign a transaction dictionary.
    """

    account = get_account()

    return account.sign_transaction(
        transaction
    )


# ============================================================
# SEND
# ============================================================

def send_transaction(transaction):
    """
    Sign and broadcast a transaction.

    IMPORTANT:
    transaction must be a transaction dictionary,
    NOT a ContractFunction.
    """

    signed = sign_transaction(
        transaction
    )

    tx_hash = w3.eth.send_raw_transaction(
        signed.raw_transaction
    )

    return tx_hash


# ============================================================
# WAIT
# ============================================================

def wait_for_transaction(
    tx_hash,
    timeout=300,
):
    """
    Wait for a transaction to be mined.
    """

    return w3.eth.wait_for_transaction_receipt(
        tx_hash,
        timeout=timeout,
    )


# ============================================================
# SEND + WAIT
# ============================================================

def send_and_wait(
    transaction,
    timeout=300,
):
    """
    Sign, broadcast and wait for confirmation.
    """

    tx_hash = send_transaction(
        transaction
    )

    print(
        f"[TX] Submitted: {tx_hash.hex()}"
    )

    print(
        "[TX] Waiting for confirmation..."
    )

    receipt = wait_for_transaction(
        tx_hash,
        timeout=timeout,
    )

    if receipt["status"] == 1:

        print(
            f"[TX] SUCCESS | "
            f"block={receipt['blockNumber']} | "
            f"gas={receipt['gasUsed']}"
        )

    else:

        print(
            f"[TX] FAILED | "
            f"tx={tx_hash.hex()}"
        )

        raise RuntimeError(
            f"Transaction reverted: "
            f"{tx_hash.hex()}"
        )

    return receipt


# ============================================================
# SAFE CONTRACT TRANSACTION
# ============================================================

def execute_contract(
    function,
    gas=500_000,
    value=0,
    timeout=300,
):
    """
    Convenience helper:

        ContractFunction
              ↓
        build transaction
              ↓
            sign
              ↓
           broadcast
              ↓
          confirmation

    """

    tx = build_transaction(
        function,
        value=value,
        gas=gas,
    )

    return send_and_wait(
        tx,
        timeout=timeout,
    )


# ============================================================
# SLEEP
# ============================================================

def sleep(seconds):
    """
    Sleep helper.
    """

    time.sleep(seconds)