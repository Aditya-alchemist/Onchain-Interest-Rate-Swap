from contracts import w3, mock_usdc
from utils import get_account

account = get_account()

amount = 10_000 * 10**6

print("=" * 50)
print("       HedgeFi MockUSDC Faucet")
print("=" * 50)
print("Wallet:", account.address)
print("Mint amount:", amount / 10**6, "USDC")

tx = mock_usdc.functions.mint(
    account.address,
    amount
).build_transaction({
    "from": account.address,
    "nonce": w3.eth.get_transaction_count(account.address),
    "gas": 200000,
    "gasPrice": w3.eth.gas_price,
})

signed = account.sign_transaction(tx)

tx_hash = w3.eth.send_raw_transaction(
    signed.raw_transaction
)

print("TX:", tx_hash.hex())

receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

print("Status:", receipt.status)

if receipt.status == 1:
    balance = mock_usdc.functions.balanceOf(
        account.address
    ).call()

    print("USDC balance:", balance / 10**6)
else:
    print("Mint transaction reverted.")