from contracts import w3, mock_usdc, lending_pool
from utils import get_account

account = get_account()

amount = 5_000 * 10**6  # 5,000 USDC

print("=" * 50)
print("       HedgeFi LendingPool Funding")
print("=" * 50)
print("Depositor:", account.address)
print("Amount:", amount / 10**6, "USDC")

balance = mock_usdc.functions.balanceOf(account.address).call()
print("Wallet USDC:", balance / 10**6)

if balance < amount:
    raise Exception("Insufficient USDC balance")

# --------------------------------------------------
# Approve LendingPool
# --------------------------------------------------

print("\nApproving LendingPool...")

tx = mock_usdc.functions.approve(
    lending_pool.address,
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
# Deposit into LendingPool
# --------------------------------------------------

print("\nDepositing into LendingPool...")

tx = lending_pool.functions.deposit(
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
    raise Exception("Deposit failed")

# --------------------------------------------------
# Verify
# --------------------------------------------------

liquidity = lending_pool.functions.availableLiquidity().call()
total_deposits = lending_pool.functions.totalDeposits().call()

print("\n" + "=" * 50)
print("LendingPool funded successfully")
print("=" * 50)
print("Available liquidity:", liquidity / 10**6, "USDC")
print("Total deposits:", total_deposits / 10**6, "USDC")