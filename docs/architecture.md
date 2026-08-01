# Architecture

Overview of HedgeFi architecture.

- Modular Foundry project under `smart-contracts/`.
- Frontend in `frontend/` (React + Vite).
- Bots in `bots/` for off-chain automation.

System components:
- Lending module (collateral management, loans)
- Swaps module (interest-rate swap lifecycle)
- Settlement (DvP, escrow)
- Tokenization (NFTs for positions)
- Oracles (price feeds)
- Liquidation engine

Interactions and data flows should be detailed per module in other docs.
