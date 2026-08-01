# HedgeFi

HedgeFi is an on-chain fixed-income infrastructure protocol for collateralized lending, interest-rate hedging, tokenized debt trading, and atomic Delivery-versus-Payment settlement.

## Stack

- Smart contracts: Solidity + Foundry
- Frontend: React + Vite + TypeScript + ethers.js
- Wallet: MetaMask via ethers BrowserProvider
- Bots: Python + Web3.py
- Oracle: Chainlink Price Feeds
- Network: Base Sepolia or Ethereum Sepolia

## Structure

```text
hedgefi/
├── contracts/
│   ├── src/
│   ├── script/
│   ├── test/
│   └── lib/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   └── package.json
└── bots/
    ├── oracle_keeper.py
    ├── settlement_keeper.py
    ├── liquidation_keeper.py
    ├── scheduler.py
    ├── utils.py
    ├── config.py
    └── requirements.txt
```

## Local Setup

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts
forge install smartcontractkit/chainlink
forge install transmissions11/solmate

cd ../frontend
npm install

cd ../bots
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```
