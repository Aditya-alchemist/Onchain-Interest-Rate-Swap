# Delivery vs Payment (DvP)

DvP settlement ensures atomic exchange of tokenized positions and payment.

- Design: escrow-based two-phase commit for asset transfer and payment.
- Failure modes: partial settlement, re-entrancy, stale price oracles.
- Recommended practices: use Oracle on-chain proofs, timeouts, and dispute windows.
