from contracts import w3, mock_usdc, escrow_manager
from utils import get_account

account = get_account()

amount = 100 * 10**6  # 100 USDC

print("=" * 55)
print("       HedgeFi Escrow Funding")
print("=" * 55)
print("Depositor:", account.address)
print("EscrowManager:", escrow_manager.address)
print("Amount:", amount / 10**6, "USDC")

balance = mock_usdc.functions.balanceOf(account.address).call()
print("Wallet USDC:", balance / 10**6)

if balance < amount:
    raise Exception("Insufficient USDC balance")

# --------------------------------------------------
# Approve EscrowManager
# --------------------------------------------------

print("\nApproving EscrowManager...")

tx = mock_usdc.functions.approve(
    escrow_manager.address,
    amount
).build_transaction({
    "from": account.address,
    "nonce": w3.eth.get_transaction_count(account.address),
    "gas": 100000,
    "gasPrice": w3.eth.gas_price,
})

signed = account.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)

print("Approval TX:", tx_hash.hex())

receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

if receipt.status != 1:
    raise Exception("Approval failed")

print("Approval successful.")

# --------------------------------------------------
# Deposit into EscrowManager
# --------------------------------------------------

print("\nDepositing into EscrowManager...")

tx = escrow_manager.functions.deposit(
    amount
).build_transaction({
    "from": account.address,
    "nonce": w3.eth.get_transaction_count(account.address),
    "gas": 200000,
    "gasPrice": w3.eth.gas_price,
})

signed = account.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)

print("Deposit TX:", tx_hash.hex())

receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

print("Status:", receipt.status)

if receipt.status != 1:
    raise Exception("Escrow deposit failed")

# --------------------------------------------------
# Verify
# --------------------------------------------------

available = escrow_manager.functions.availableBalance(
    account.address
).call()

locked = escrow_manager.functions.lockedBalance(
    account.address
).call()

print("\n" + "=" * 55)
print("       ESCROW FUNDED SUCCESSFULLY")
print("=" * 55)

print("Available:", available / 10**6, "USDC")
print("Locked:", locked / 10**6, "USDC")
print("Total:", (available + locked) / 10**6, "USDC")
print("=" * 55)