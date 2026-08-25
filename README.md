<div align="center">

<img src="docs/img/banner.svg" alt="HedgeFi — borrow at a floating rate, swap it for a fixed one, settle so neither side can walk away" width="100%">

[![CI](https://github.com/Aditya-alchemist/Onchain-Interest-Rate-Swap/actions/workflows/ci.yml/badge.svg)](https://github.com/Aditya-alchemist/Onchain-Interest-Rate-Swap/actions/workflows/ci.yml)
![Solidity](https://img.shields.io/badge/Solidity-0.8.24-3ddc84?logo=solidity&logoColor=white)
![Foundry](https://img.shields.io/badge/built%20with-Foundry-ffa53b)
![React](https://img.shields.io/badge/React%2018-wagmi%20%2B%20viem-5aa2ff?logo=react&logoColor=white)
![Python](https://img.shields.io/badge/keepers-Python%203.11-ffd93d?logo=python&logoColor=white)
![Network](https://img.shields.io/badge/network-Sepolia-2dd4bf)
![License](https://img.shields.io/badge/license-MIT-98a0b8)

**A fixed-rate credit terminal for on-chain lending, interest-rate hedging, and delivery-versus-payment settlement.** 

17 Solidity contracts &nbsp;·&nbsp; one React trading terminal &nbsp;·&nbsp; three Python keepers &nbsp;·&nbsp; zero mock data in the UI

</div>

---

## Start here

Borrowing money on-chain is easy. Knowing what it will *cost* you is not.

Every DeFi lending market prices loans off how busy the pool is. Borrow when the pool is quiet and you might pay 4% a year. If a few large borrowers turn up next week and drain it, that same loan can be costing you 25% — and nobody asked your permission. Your debt is a moving target.

**HedgeFi lets you nail that number down.** You borrow at the floating rate like normal, then open a swap that pays you back exactly the amount the rate moved against you. Rate goes up, the swap refunds the difference. Rate stays low, you pay a small amount for the insurance. Either way your cost of borrowing stops moving, and you can plan around it.

That is the entire idea. Everything below is how it works.

| | |
|---|---|
| **I just want to understand the concept** | [What is an interest-rate swap?](#what-is-an-interest-rate-swap) |
| **Show me how the payments work** | [How each period settles](#how-each-period-settles) |
| **I want to see the system** | [How it is put together](#how-it-is-put-together) |
| **I want to run it** | [Run it yourself](#run-it-yourself) |
| **I want the real detail** | [Under the hood](#under-the-hood) — every formula, flow chart and contract |

---

## What is an interest-rate swap?

Two sides agree to trade one kind of interest for the other. One pays a **fixed** rate that was agreed up front. The other pays whatever the **floating** rate happens to be. They do this on an agreed amount — the *notional* — which never actually changes hands. It only exists to calculate the two payments from.

<p align="center">
  <img src="docs/img/swap-explained.svg" alt="An interest-rate swap in one picture: you pay fixed, the other side pays floating, and only the difference moves" width="94%">
</p>

Now put that next to your loan. You are *already* paying floating interest to the lending pool. If the swap pays you floating and you pay it fixed, the two floating amounts cancel out and you are left holding the fixed rate. That is the hedge — one moving cost swapped for one you chose.

In HedgeFi your counterparty is the protocol itself, so there is nobody to find and no order book to fill. You pick a fixed rate and a duration on the Hedge page and the `SwapEngine` takes the other side.

> Further reading, if you want the textbook version rather than mine: [cbonds — Interest Rate Swap (IRS)](https://cbonds.com/glossary/interest-rate-swap-irs/).

<!-- Optional: to use the cbonds diagram here instead of ours, paste its image URL between the quotes below and delete the comment markers.
<p align="center"><img src="" alt="Interest rate swap, cbonds" width="80%"></p>
-->

---

## How each period settles

A swap does not settle in one lump at the end. It settles every period — 30 days here — and only the *difference* between the two legs moves. Nobody sends a payment and gets one back; the contract works out who owes what and moves the net amount once.

<p align="center">
  <img src="docs/img/swap-payoff.svg" alt="Six settlement periods showing the netted amount when the floating rate lands above or below the fixed rate" width="98%">
</p>

Read across those six periods and the point of the whole exercise shows up: the bars move around a lot, but your combined cost — pool interest plus or minus the swap — sits at 10% the entire time. The volatility moved off your balance sheet and onto the swap.

---

## How it is put together

Three moving parts. Contracts hold the money and the rules. A React terminal reads them directly, so every number on screen is an `eth_call` against Sepolia rather than a cached API response. Three Python keepers handle the jobs that need to happen on a timer, because a blockchain cannot wake itself up.

<p align="center">
  <img src="docs/img/architecture.svg" alt="HedgeFi architecture: browser and terminal above the chain boundary, then lending, tokenization, swaps, prices, governance and DvP settlement on Sepolia, with three Python keepers off-chain" width="100%">
</p>

<!-- All four diagrams are generated, not drawn by hand: python3 docs/diagrams/diagrams.py docs/img -->

The three domains in the middle row are the ones worth knowing:

| | What it does | Why you care |
|---|---|---|
| **Lending** | Takes USDC deposits, lends against ETH collateral, prices the loan off pool utilisation | This is where the floating rate you are trying to escape comes from |
| **Swaps** | Opens the fixed-for-floating position, works out each period's net amount, closes out on repayment | This is the hedge |
| **DvP settlement** | Moves both legs of a settlement in a single transaction, through escrow | So a settlement can never half-happen and leave one side short |

Every position is also an NFT. Your loan is an ERC-721, your swap is an ERC-721, and both burn when you close the position — so your wallet is a readable record of what you have open.

---

## Run it yourself

You need [Foundry](https://book.getfoundry.sh/getting-started/installation), Node 18+, Python 3.11+, and a Sepolia RPC endpoint with a funded test key.

```bash
git clone https://github.com/Aditya-alchemist/Onchain-Interest-Rate-Swap.git
cd Onchain-Interest-Rate-Swap/hedgefi
```

Then three terminals, in this order:

```bash
# 1 — contracts: build, test, deploy, seed
cd smart-contracts && forge install && forge build && forge test
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast

# 2 — keepers: the three timed jobs
cd ../bots && pip install -r requirements.txt
cp .env.example .env      # paste your addresses from the deploy output
python scheduler.py

# 3 — terminal: the UI
cd ../frontend && npm install
cp .env.example .env      # the same addresses again
npm start                 # http://localhost:3000
```

Connect MetaMask on Sepolia, mint yourself test USDC from the Admin page, and the Lend → Borrow → Hedge → Settle path is walkable end to end.

Two things that will save you a support question. Both `.env` files need the *same* deployed addresses, or the terminal and the keepers will disagree about which protocol they are talking to. And do not delete `frontend/.npmrc` — it carries the `legacy-peer-deps` setting that this dependency tree needs to install at all. Full detail on both is in [Getting started](#getting-started) below.

---

## Under the hood

Everything past this point is the full technical record — all the formulas, every flow chart, the contract-by-contract catalogue, the deployment wiring and the CI internals. It is collapsed so the page stays readable; click any heading to open it.

<details>
<summary><b>Why this exists — the problem in full</b> &nbsp;·&nbsp; <sub>rate risk vs price risk, with a flow chart</sub></summary>

### The problem it solves

A borrower in a conventional DeFi money market faces two risks at once. The first is **price risk**: if their collateral falls in value, their position is liquidated. The second is **rate risk**: the borrow rate on a utilisation-based market is variable, so a quiet 4% loan becomes a 25% loan the moment other users drain the pool toward full utilisation.

Traditional finance separates these. You borrow from a bank at a floating rate, then buy an interest-rate swap from a dealer to convert that floating exposure into a fixed cost. HedgeFi puts both legs in the same protocol: you borrow on the `LendingPool`, then open an offsetting swap on the `SwapEngine`, and the terminal shows your combined effective rate. The DvP engine exists because once you have two counterparties owing each other assets, you need settlement that cannot half-execute.

```mermaid
flowchart LR
    A["Borrower needs USDC"] --> B["Locks ETH collateral"]
    B --> C["Borrows at variable rate"]
    C --> D{"Rate risk?"}
    D -->|"Accepts it"| E["Pays whatever utilisation dictates"]
    D -->|"Hedges it"| F["Opens fixed-payer swap"]
    F --> G["Pays fixed, receives floating"]
    G --> H["Floating leg offsets the loan rate"]
    H --> I["Net cost is locked near the fixed rate"]
```

</details>

<details>
<summary><b>Where everything lives</b> &nbsp;·&nbsp; <sub>the repository tree, annotated</sub></summary>

### Repository layout

```
hedgefi/
├── smart-contracts/          Foundry project — Solidity 0.8.24
│   ├── src/
│   │   ├── lending/          LendingPool, LoanManager, InterestRateModel, CollateralVault
│   │   ├── liquidation/      LiquidationEngine
│   │   ├── swaps/            SwapEngine, SwapFactory, SettlementEngine, NettingEngine
│   │   ├── settlement/       DvPEngine, EscrowManager
│   │   ├── tokenization/     LoanNFT, SwapNFT, PositionRegistry
│   │   ├── governance/       Governance — role + parameter registry
│   │   ├── libraries/        InterestMath, HealthFactor, SwapMath
│   │   ├── oracle/           PriceOracle — generic stub, not deployed
│   │   └── mocks/            MockUSDC, MockPriceOracle
│   ├── script/Deploy.s.sol   One-shot deploy + wiring script
│   ├── test/                 Forge tests by domain
│   └── foundry.toml          via_ir = true, solc 0.8.24
│
├── bots/                     Python keepers — web3.py
│   ├── config.py             Env loading, address book, shared constants
│   ├── contracts.py          ABI loading + contract handles
│   ├── utils.py              Tx building, signing, receipt waiting
│   ├── oracle_keeper.py      Pushes CoinGecko ETH/USD on-chain
│   ├── settlement_keeper.py  Settles swaps whose period has elapsed
│   ├── liquidation_keeper.py Liquidates loans with health factor < 1
│   ├── scheduler.py          Supervises all three, restarts on crash
│   └── scanner.py            Read-only protocol state dump
│
├── frontend/                 Create React App + TypeScript
│   ├── src/
│   │   ├── AppShell.tsx      Header, side rail, router
│   │   ├── App.css           The entire terminal theme
│   │   ├── pages/            Dashboard, Lend, Borrow, Hedge, Marketplace, Portfolio, Admin
│   │   ├── components/       StatCharts (candles, donut, gauges), panels
│   │   ├── hooks/            useProtocol, useWallet, useEthOhlc
│   │   ├── config/           Chain config, contract addresses, ABIs
│   │   └── abis/             JSON ABIs copied from Foundry output
│   └── package.json
│
└── docs/                     Short design notes
```

</details>

<details>
<summary><b>The full contract graph</b> &nbsp;·&nbsp; <sub>every call edge between all 17 contracts, as mermaid</sub></summary>

### System architecture

Three layers. The contracts are the source of truth; the keepers are the only writers that act without a user; the frontend never writes state except through a connected wallet.

```mermaid
flowchart TB
    subgraph UI["Frontend — React + wagmi + viem"]
        DASH["Dashboard"]
        LEND["Lend"]
        BORROW["Borrow"]
        HEDGE["Hedge / Swap"]
        MKT["Settle / Marketplace"]
        PORT["Portfolio"]
        ADMIN["Admin"]
        HOOK["useProtocol — batched reads + writes"]
        DASH --- HOOK
        LEND --- HOOK
        BORROW --- HOOK
        HEDGE --- HOOK
        MKT --- HOOK
        PORT --- HOOK
        ADMIN --- HOOK
    end

    subgraph KEEP["Off-chain keepers — Python + web3.py"]
        SCHED["scheduler.py"]
        OK["oracle_keeper"]
        SK["settlement_keeper"]
        LK["liquidation_keeper"]
        SCAN["scanner.py — read only"]
        SCHED --> OK
        SCHED --> SK
        SCHED --> LK
    end

    subgraph CHAIN["Sepolia contracts"]
        subgraph L["Lending"]
            LP["LendingPool"]
            LM["LoanManager"]
            IRM["InterestRateModel"]
            CV["CollateralVault"]
            LE["LiquidationEngine"]
        end
        subgraph S["Swaps"]
            SE["SwapEngine"]
            SF["SwapFactory — registry"]
            SET["SettlementEngine"]
            NE["NettingEngine"]
        end
        subgraph T["Tokenization"]
            LNFT["LoanNFT"]
            SNFT["SwapNFT"]
            PR["PositionRegistry"]
        end
        subgraph D["DvP settlement"]
            DVP["DvPEngine"]
            ESC["EscrowManager"]
        end
        GOV["Governance"]
        ORC["MockPriceOracle"]
        USDC["MockUSDC"]
    end

    CG["CoinGecko API"]

    HOOK -->|"eth_call reads"| CHAIN
    HOOK -->|"signed writes via wallet"| CHAIN
    DASH -->|"OHLC candles"| CG
    CG -->|"spot ETH/USD"| OK
    OK -->|"setEthPrice"| ORC
    SK -->|"settleSwap"| SE
    LK -->|"liquidate"| LM
    SCAN -->|"reads"| CHAIN

    LP --> IRM
    LM -->|"issueLoan / receiveRepayment"| LP
    LP --> USDC
    LM --> CV
    LM --> ORC
    LM --> LNFT
    LE --> LM
    SE --> SF
    SE --> SET
    SE --> SNFT
    SET --> USDC
    DVP --> NE
    DVP --> SET
    NE --> SET
    LNFT --> PR
    SNFT --> PR
    DVP --> ESC
```

One thing about this diagram is worth stating plainly because it is easy to misread:

**The Dashboard talks to CoinGecko directly, and so does the oracle keeper.** They deliberately share one price source so the chart and the on-chain oracle do not tell different stories. The browser uses the keyless public endpoint; the API key lives only in the bot's environment and is never bundled into client-side JavaScript.

</details>

<details>
<summary><b>Contract catalogue — all 17, one line each</b> &nbsp;·&nbsp; <sub>what every contract is responsible for</sub></summary>

### Contract catalogue

#### Lending

| Contract | Responsibility |
|---|---|
| `LendingPool` | The USDC vault and lender entry point. `deposit` / `withdraw` for lenders. Exposes `issueLoan` and `receiveRepayment`, callable only by the registered `LoanManager`, so borrowed USDC leaves the pool only through vetted loan logic. Tracks `totalDeposits` and `totalBorrows`, the two inputs to the rate model, and surfaces `availableLiquidity` and `currentBorrowRateBps`. |
| `LoanManager` | The borrower entry point and the loan ledger: `borrow`, `repay`, `liquidate`, plus the views `collateralValueUsdc`, `debtOf`, `ltvBps`, `healthFactorBps`, `maxBorrowable`, `isLiquidatable`. Holds the authoritative risk constants. |
| `InterestRateModel` | Pure math. Maps utilisation to a borrow rate through a two-slope kinked curve. Owner-settable parameters. |
| `CollateralVault` | Holds nothing but ETH. `depositFor` / `withdrawTo` are `onlyOwner`, and the owner is `LoanManager`, so collateral can only move as a side effect of a loan action. `ReentrancyGuard` on both. |
| `LiquidationEngine` | A thin `onlyOwner`-configurable façade over `LoanManager.liquidate`, so liquidation permissions can be rotated without touching loan storage. |

#### Swaps

| Contract | Responsibility |
|---|---|
| `SwapEngine` | User entry point. `openSwap` validates terms and delegates storage to `SwapFactory`, mints the position NFT, and links it to the loan. `settleSwap` drives a period settlement. |
| `SwapFactory` | The swap registry. Stores the `Swap` struct — `loanTokenId`, `fixedPayer`, `floatingPayer`, `notionalUsdc`, `fixedRateBps`, `startTime`, `maturityTime`, `settlementInterval`, `lastSettlementTime` — plus `loanToSwap` and an `activeSwapIds` array with swap-and-pop removal. Enforces one swap per loan. |
| `SettlementEngine` | The settlement record book. `recordSettlement` writes a `Pending` obligation for a swap period; `markExecuted` and `cancelSettlement` close it; `getSettlementsForSwap` and `pendingSettlementsForSwap` are the read side. It never moves funds itself. |
| `NettingEngine` | Reads every pending settlement for a swap and collapses them into a single `NetObligation { payer, payee, amountUsdc }`, so a series of small periodic flows becomes one payment. |

#### Tokenization

| Contract | Responsibility |
|---|---|
| `LoanNFT` | ERC-721. One token per loan, minted by `LoanManager` only, burned on repay. Carries `LoanMetadata` so a loan is transferable and inspectable as an object. |
| `SwapNFT` | ERC-721. One token per swap position, minted by `SwapEngine` only. |
| `PositionRegistry` | The join table. `linkPosition(loanTokenId, swapTokenId)` and `hasActiveHedge(loanTokenId)` let the protocol and the UI answer "is this loan hedged?" in one call. |

#### Settlement

| Contract | Responsibility |
|---|---|
| `DvPEngine` | Delivery versus payment. `executeSettlement(settlementId)` asks `NettingEngine` for the net obligation, locks it from the payer, releases it to the payee, and marks the settlement executed — all in one transaction, so it cannot half-complete. |
| `EscrowManager` | Custody for USDC. Users `deposit` / `withdraw` freely, but `lock`, `release` and `refund` are callable only by `DvPEngine`. |

#### Support

| Contract | Responsibility |
|---|---|
| `Governance` | `AccessControl` + `Pausable`. Defines `GOVERNOR_ROLE` and `KEEPER_ROLE` and stores the protocol parameter struct that proposals write to. |
| `MockPriceOracle` | The ETH/USD feed. 8-decimal Chainlink-style price, seeded at `4000 * 1e8`, updated by the oracle keeper via `setEthPrice`. |
| `MockUSDC` | 6-decimal ERC-20 with a faucet, standing in for real USDC on Sepolia. |
| `PriceOracle` | A 10-line generic `bytes32 symbol → price` stub with no access control. Not deployed, not wired, not used — `MockPriceOracle` is the live feed. |

</details>

<details>
<summary><b>Deployment wiring — the exact order</b> &nbsp;·&nbsp; <sub>ten deploys, seven setters, then seeding</sub></summary>

### Deployment wiring

`script/Deploy.s.sol` deploys everything in dependency order and then performs the setter calls that connect them. The wiring matters more than the deployment: most contracts start inert and only become usable once their counterpart address is set, and several transfer ownership so that a privileged function can only be reached through the intended caller.

```mermaid
flowchart TD
    START(["forge script Deploy.s.sol"]) --> M1["Deploy MockUSDC + MockPriceOracle"]
    M1 --> M2["Deploy InterestRateModel<br/>base 200 · slope1 800 · slope2 3000 · kink 8000"]
    M2 --> M3["Deploy CollateralVault"]
    M3 --> M4["Deploy LoanNFT + SwapNFT + PositionRegistry"]
    M4 --> M5["Deploy LoanManager"]
    M5 --> M6["Deploy LendingPool"]
    M6 --> M7["Deploy SwapFactory · SettlementEngine · NettingEngine"]
    M7 --> M8["Deploy SwapEngine"]
    M8 --> M9["Deploy EscrowManager then DvPEngine"]
    M9 --> M10["Deploy Governance + LiquidationEngine"]
    M10 --> W["Wiring phase"]

    W --> W1["CollateralVault.transferOwnership → LoanManager<br/>ETH only moves through loan logic"]
    W --> W2["LoanNFT.setLoanManager → LoanManager<br/>only LoanManager can mint or burn a loan"]
    W --> W3["SwapNFT.setSwapEngine → SwapEngine"]
    W --> W4["PositionRegistry.setLoanManager + setSwapEngine"]
    W --> W5["LoanManager.setLendingPool → LendingPool<br/>only the pool may call borrow or repay"]
    W --> W6["LiquidationEngine.setLoanManager → LoanManager"]
    W --> W7["EscrowManager owner → DvPEngine"]
    W1 --> SEED["Seed: mint MockUSDC to deployer,<br/>approve pool, deposit initial liquidity"]
    W2 --> SEED
    W3 --> SEED
    W4 --> SEED
    W5 --> SEED
    W6 --> SEED
    W7 --> SEED
    SEED --> OUT["Log every address → paste into<br/>frontend/.env and bots/.env"]
```

</details>

<details>
<summary><b>Core flows — lend, borrow, hedge, settle, liquidate</b> &nbsp;·&nbsp; <sub>five sequence diagrams</sub></summary>

### Core flows

#### 1. Lending — supply USDC

The simplest path. The lender approves the pool, deposits, and their share of the pool starts earning the borrow rate that borrowers pay.

```mermaid
sequenceDiagram
    actor Lender
    participant UI as Lend page
    participant USDC as MockUSDC
    participant LP as LendingPool

    Lender->>UI: Enter amount
    UI->>USDC: allowance(lender, pool)
    alt allowance too low
        UI->>USDC: approve(pool, amount)
        USDC-->>Lender: sign tx 1 of 2
        Note over UI: Step banner shows 1 of 2
    end
    UI->>LP: deposit(amount)
    LP->>USDC: transferFrom(lender, pool, amount)
    LP->>LP: totalDeposits += amount
    LP-->>UI: Deposited event
    UI->>LP: availableLiquidity + currentBorrowRateBps
    UI-->>Lender: New liquidity and rate
```

The two-step approve-then-deposit is why the shell renders a `Step 1 of 2` banner: ERC-20 approval and the deposit are separate signatures, and the UI runs the second automatically once the first confirms.

#### 2. Borrowing — lock ETH, draw USDC

`LoanManager.borrow` is payable: the ETH collateral arrives with the same call that creates the debt, so there is no window in which a loan exists uncollateralised.

```mermaid
sequenceDiagram
    actor Borrower
    participant UI as Borrow page
    participant LM as LoanManager
    participant ORC as MockPriceOracle
    participant CV as CollateralVault
    participant LNFT as LoanNFT
    participant LP as LendingPool
    participant IRM as InterestRateModel

    Borrower->>UI: Collateral ETH + borrow USDC
    UI->>LM: maxBorrowable(collateralEth)
    LM->>ORC: getEthPrice()
    LM-->>UI: borrow ceiling at 75% LTV
    UI-->>Borrower: Preview LTV, health factor, liq. price

    Borrower->>LM: borrow(amountUsdc) with msg.value = ETH
    LM->>ORC: getEthPrice()
    LM->>LM: require amount <= maxBorrowable
    LM->>CV: depositFor(borrower) with ETH
    LM->>IRM: getBorrowRate(deposits, borrows)
    Note over LM: Rate is snapshotted into the loan
    LM->>LNFT: mintLoan(borrower, metadata)
    LM->>LP: issueLoan(borrower, amountUsdc)
    LP->>LP: totalBorrows += amount
    LP-->>Borrower: USDC transferred
    LM-->>UI: Borrowed event
```

The rate is captured at origination. That snapshot is the whole reason the swap desk exists — see the hedge flow next.

#### 3. Hedging — open an interest-rate swap against a loan

One swap per loan, enforced by `SwapFactory.loanToSwap`. The position is minted as an NFT and linked to the loan in `PositionRegistry`, so `hasActiveHedge(loanTokenId)` becomes true.

```mermaid
sequenceDiagram
    actor FixedPayer
    actor FloatingPayer
    participant UI as Hedge page
    participant SE as SwapEngine
    participant SF as SwapFactory
    participant SNFT as SwapNFT
    participant PR as PositionRegistry

    FixedPayer->>UI: notional, fixed rate, maturity, interval
    UI->>SE: openSwap(loanTokenId, fixedPayer, floatingPayer, ...)
    SE->>SE: verify caller owns the LoanNFT
    SE->>SF: createSwap(...)
    SF->>SF: require loanToSwap[loanTokenId] == 0
    SF->>SF: store Swap, push to activeSwapIds
    SF-->>SE: swapId
    SE->>SNFT: mintSwap(owner, metadata)
    SE->>PR: linkPosition(loanTokenId, swapTokenId)
    SE-->>UI: SwapOpened event
    UI-->>FixedPayer: Position appears in Portfolio
    UI-->>FloatingPayer: Counterparty leg appears
```

#### 4. Settlement — periodic netted cash flow through DvP

This is the most layered path in the protocol, and the layering is deliberate: **computing** an obligation, **netting** obligations, and **moving money** are three separate contracts, so the atomic-exchange guarantee lives in exactly one place.

```mermaid
sequenceDiagram
    participant SK as settlement_keeper
    participant SE as SwapEngine
    participant SF as SwapFactory
    participant SET as SettlementEngine
    participant DVP as DvPEngine
    participant NE as NettingEngine
    participant ESC as EscrowManager

    SK->>SF: getActiveSwapIds()
    SK->>SF: getSwap(swapId)
    SK->>SK: due if now - lastSettlementTime >= interval
    SK->>SE: settleSwap(swapId)

    SE->>SF: read notional, fixedRateBps, interval
    SE->>SE: SwapMath: fixed leg, floating leg, net
    SE->>SET: recordSettlement(swapId, payer, payee, amount)
    SET-->>SE: settlementId with status Pending
    SE->>SF: recordSettlementTime(swapId, now)

    SE->>DVP: executeSettlement(settlementId)
    DVP->>SET: getSettlement(settlementId)
    DVP->>DVP: require status == Pending
    DVP->>NE: calculateNetForSwap(swapId)
    NE->>SET: pendingSettlementsForSwap(swapId)
    NE-->>DVP: NetObligation payer, payee, amountUsdc
    DVP->>DVP: require amountUsdc > 0

    rect rgb(238, 244, 255)
        Note over DVP,ESC: Atomic — both legs or neither
        DVP->>ESC: lock(payer, amount)
        DVP->>ESC: release(payer, payee, amount)
    end

    DVP->>SET: markExecuted(settlementId)
    DVP-->>SK: AtomicSettlementExecuted event
```

If any `require` in that block fails, the whole transaction reverts and the escrow lock unwinds with it. There is no state in which the payer's funds are locked but the payee was never paid.

#### 5. Liquidation — when health factor drops below 1

```mermaid
sequenceDiagram
    participant LK as liquidation_keeper
    participant LM as LoanManager
    participant ORC as MockPriceOracle
    participant CV as CollateralVault
    participant LP as LendingPool
    participant LNFT as LoanNFT
    actor Liquidator

    loop every poll interval
        LK->>LM: isLiquidatable(borrower)
        LM->>ORC: getEthPrice()
        LM->>LM: healthFactor < 1.0 ?
    end
    LM-->>LK: true
    LK->>LM: liquidate(borrower)
    LM->>ORC: getEthPrice()
    LM->>LM: recompute debt incl. accrued interest
    LM->>LP: receiveRepayment(debt) from liquidator
    LM->>CV: withdrawTo(liquidator, collateralEth)
    LM->>LNFT: burnLoan(tokenId)
    LM->>LM: clear loan storage
    LM-->>Liquidator: collateral released
```

</details>

<details>
<summary><b>Position lifecycles</b> &nbsp;·&nbsp; <sub>the loan and swap state machines</sub></summary>

### State machines

A loan and a swap each have a small, strict lifecycle. Nothing skips a state.

```mermaid
stateDiagram-v2
    [*] --> NoLoan
    NoLoan --> Active : borrow with ETH collateral
    Active --> Active : interest accrues with time
    Active --> Active : price moves, health factor changes
    Active --> Healthy : HF >= 1.0
    Active --> AtRisk : HF between 1.0 and 1.1
    Healthy --> Repaid : repay full debt
    AtRisk --> Repaid : repay or top up collateral
    AtRisk --> Liquidatable : HF < 1.0
    Liquidatable --> Liquidated : keeper or liquidator calls liquidate
    Repaid --> NoLoan : LoanNFT burned, collateral returned
    Liquidated --> NoLoan : LoanNFT burned, collateral to liquidator
```

```mermaid
stateDiagram-v2
    [*] --> None
    None --> Open : openSwap, SwapNFT minted, linked to loan
    Open --> Settling : interval elapsed, settleSwap called
    Settling --> Pending : SettlementEngine.recordSettlement
    Pending --> Executed : DvPEngine locks then releases
    Pending --> Cancelled : cancelSettlement
    Executed --> Open : awaiting next interval
    Cancelled --> Open : retried next cycle
    Open --> Matured : now >= maturityTime
    Matured --> Closed : closeSwapByLoan, unlink, burn NFT
    Closed --> [*]
```

</details>

<details>
<summary><b>The math — every formula in the protocol</b> &nbsp;·&nbsp; <sub>13 sections: rates, accrual, health, liquidation, swap legs, DV01</sub></summary>

### The math

Every formula below is written the way the contract computes it, with integer division in the same order as the Solidity. That ordering is not cosmetic: `(a * b) / c` and `a * (b / c)` give different answers in integer arithmetic, and the multiply-first convention is what keeps precision.

#### Units and decimals

Mixing three different fixed-point scales is the single largest source of confusion in this codebase, so here they are in one place.

| Quantity | Decimals | `1.0` looks like | Where it comes from |
|---|---|---|---|
| ETH / collateral | 18 | `1e18` | `msg.value` |
| USDC / debt | 6 | `1e6` | `MockUSDC` |
| Oracle price | 8 | `1e8` | `MockPriceOracle`, Chainlink convention |
| Rates | basis points | `10_000` | `BPS` constant |
| Ratios | WAD | `1e18` | `WAD` constant in `HealthFactor` |

```
BPS  = 10_000          // 100.00%
WAD  = 1e18            // 1.0 as a ratio
YEAR = 365 days        // 31_536_000 seconds
```

The two conversions used constantly:

```
// ETH amount (18dp) × price (8dp) → USD value (8dp)
usdValue8 = (collateralEth * ethPrice) / 1e18

// USD value (8dp) → USDC amount (6dp), and back
usdcAmount6 = usdValue8 / 100
usdValue8   = usdcAmount6 * 100
```

That `/ 100` and `* 100` appear all over `LoanManager` and `HealthFactor`. They are not fees or percentages — they are purely the 8-decimal to 6-decimal shift.

#### 1. Utilisation

How much of the pool is lent out. This is the only input the rate model needs.

```
                    totalBorrows × BPS
utilizationBps  =  ────────────────────        (0 if totalDeposits == 0)
                      totalDeposits
```

#### 2. The interest-rate model — a two-slope kinked curve

`InterestRateModel.sol`. Below the kink the rate rises gently to keep borrowing cheap while there is spare liquidity. Above the kink it rises steeply, because the pool is running out of money and lenders need to be paid to stay while borrowers need a reason to leave.

```
if utilizationBps <= kinkBps:

                             utilizationBps × slope1Bps
    borrowRateBps = baseRateBps + ──────────────────────────
                                        kinkBps

else:

    excess = utilizationBps − kinkBps

                                             excess × slope2Bps
    borrowRateBps = baseRateBps + slope1Bps + ───────────────────
                                                BPS − kinkBps
```

Deployed defaults, and what they mean:

| Parameter | Value | Meaning |
|---|---|---|
| `baseRateBps` | 200 | 2% floor — the rate at zero utilisation |
| `slope1Bps` | 800 | +8% earned across the whole pre-kink range |
| `slope2Bps` | 3000 | +30% earned across the short post-kink range |
| `kinkBps` | 8000 | The elbow sits at 80% utilisation |

```mermaid
flowchart LR
    U["utilizationBps"] --> Q{"U <= 8000?"}
    Q -->|"yes — gentle slope"| A["200 + U × 800 / 8000"]
    Q -->|"no — steep slope"| B["1000 + (U − 8000) × 3000 / 2000"]
    A --> R["borrowRateBps"]
    B --> R
```

Worked points on the curve:

| Utilisation | Computation | Borrow APR |
|---|---|---|
| 0% | `200 + 0` | **2.00%** |
| 40% | `200 + 4000×800/8000` | **6.00%** |
| 80% — the kink | `200 + 8000×800/8000` | **10.00%** |
| 90% | `1000 + 1000×3000/2000` | **25.00%** |
| 100% | `1000 + 2000×3000/2000` | **40.00%** |

The maximum possible rate is `base + slope1 + slope2 = 200 + 800 + 3000 = 4000 bps`, which is where the Dashboard's `MAX APR 40.00%` label comes from. Notice the asymmetry: the first 80% of utilisation buys 8 points of rate, the last 20% buys 30. That steepness is the mechanism that makes a variable borrow rate genuinely risky — and therefore worth hedging.

#### 3. Interest accrual

`InterestMath.sol`. This is **simple interest, not compounding.** Interest is a function of elapsed wall-clock time against the original principal; it is never folded back into the principal.

```
                principal × annualRateBps × elapsedSeconds
interest  =  ───────────────────────────────────────────────
                             BPS × YEAR

totalDebt =  principal + interest
```

Two consequences worth internalising. First, calling `repay` twice in the same block costs the same as calling it once — there is no per-block compounding to race. Second, the rate stored on the loan is the rate snapshotted at origination, so a borrower's cost does **not** change when pool utilisation changes afterwards. Utilisation moves the rate for the *next* borrower.

#### 4. Collateral valuation

```
// 8-decimal USD, used by HealthFactor
collateralValueUsd  = (collateralEth × ethPrice) / 1e18

// 6-decimal USDC, used by LoanManager views and the UI
collateralValueUsdc = (collateralEth × ethPrice) / 1e18 / 100
```

#### 5. Borrow limit

The collateral factor caps how much of your collateral you may draw against. At 7500 bps you can borrow 75 cents of USDC per dollar of ETH.

```
                 (collateralEth × ethPrice / 1e18) × COLLATERAL_FACTOR_BPS
maxBorrowable = ───────────────────────────────────────────────────────────
                                    BPS × 100
```

#### 6. Loan-to-value

```
           debtUsdc × BPS
ltvBps = ──────────────────────
         collateralValueUsdc
```

#### 7. Health factor — two implementations

This is the number that decides whether you get liquidated. The codebase computes it in two different scales, and knowing which one you are reading matters.

**`LoanManager.healthFactorBps`** — basis points, `10_000` means exactly 1.0:

```
                    collateralValueUsdc × LIQUIDATION_THRESHOLD_BPS
healthFactorBps = ─────────────────────────────────────────────────
                                    debtUsdc
```

**`HealthFactor.calculate`** — WAD, `1e18` means exactly 1.0:

```
adjustedCollateral = (collateralValueUsd × liquidationThresholdBps) / BPS
debtUsd            = debtUsdc × 100

                     adjustedCollateral × WAD
healthFactor    =  ───────────────────────────
                            debtUsd

isLiquidatable  =  healthFactor < WAD
```

Both express the same quantity: *risk-adjusted collateral divided by debt*. Above 1.0 the loan is solvent. Below 1.0 anyone may liquidate it. When debt is zero the health factor is treated as effectively infinite rather than dividing by zero.

The gap between the two constants is the borrower's entire safety margin:

| Constant | Value | Role |
|---|---|---|
| `COLLATERAL_FACTOR_BPS` | 7500 | The most you may borrow — 75% LTV |
| `LIQUIDATION_THRESHOLD_BPS` | 8000 | Where you get liquidated — 80% LTV |
| `LIQUIDATION_BONUS_BPS` | 500 | 5% incentive intended for liquidators |

#### 8. Liquidation price — derived, not stored

Nowhere in the contracts is a liquidation price written down. The UI derives it by solving the health-factor equation for the price at which `healthFactorBps` hits exactly `10_000`:

```
Set  collateralValueUsdc × LIQ_THRESHOLD_BPS = debtUsdc × BPS

                       debtUsdc × BPS
=>   P_liq  =  ──────────────────────────────────
                collateralEth × LIQ_THRESHOLD_BPS
```

Equivalently: **liquidation happens when collateral value falls below 1.25× the debt** (because `10000 / 8000 = 1.25`).

Worked example, 1 ETH of collateral at $2,382:

```
collateralValueUsdc = 1 × 2382          = 2,382.00 USDC
maxBorrowable       = 2382 × 0.75       = 1,786.50 USDC
healthFactorBps     = 2382 × 8000 / 1786.50 = 10,666  → HF 1.067
P_liq               = 1786.50 × 10000 / (1 × 8000) = $2,233.125
```

So a borrower who draws the absolute maximum is liquidated on a **6.25%** adverse move. That figure is fixed by the ratio of the two constants and is independent of price or position size:

```
max drawdown at full LTV = 1 − 7500/8000 = 6.25%
```

More generally, if you borrow to an opening LTV of `ltv0` (in bps), your buffer is:

```
priceDropToLiquidation = 1 − ltv0 / LIQUIDATION_THRESHOLD_BPS
```

Borrow at 50% LTV instead of 75% and the buffer widens from 6.25% to 37.5%. This is the single most useful number for a borrower to look at, which is why the Borrow page previews it before you sign.

#### 9. Liquidation seizure

The intended behaviour is that a liquidator repays the debt and receives the equivalent collateral plus a 5% bonus:

```
debtInEth            = (debtUsdc × 100 × 1e18) / ethPrice
bonus                = (debtInEth × LIQUIDATION_BONUS_BPS) / BPS
collateralToLiquidator = debtInEth + bonus

// safety clamp
if collateralToLiquidator > collateral:
    collateralToLiquidator = collateral
```

The clamp is the reason a liquidation can never seize more ETH than the borrower actually posted, whatever the bonus works out to.

#### 10. Interest-rate swap legs

`SwapMath.sol`. Both legs are the same shape; only the rate differs. The fixed rate is agreed at open and stored on the swap; the floating rate is read from the pool at settlement time.

```
                    notional × fixedRateBps × periodSeconds
fixedPayment    = ──────────────────────────────────────────
                                BPS × YEAR

                    notional × floatingRateBps × periodSeconds
floatingPayment = ─────────────────────────────────────────────
                                BPS × YEAR
```

Settlement nets the two so only the difference changes hands:

```
if fixedPayment > floatingPayment:
    amount    = fixedPayment − floatingPayment
    direction = FloatingPayerReceives

if floatingPayment > fixedPayment:
    amount    = floatingPayment − fixedPayment
    direction = FixedPayerReceives

else:
    amount    = 0
    direction = NoPayment
```

Read that carefully, because the direction is the easy thing to get backwards: the fixed payer *receives* when floating exceeds fixed. That is exactly the hedge a borrower wants. Their loan cost rose with the floating rate, and the swap pays them the difference.

Worked example — $100,000 notional, 30-day period, fixed 10%, floating settles at 25%:

```
fixedPayment    = 100000 × 1000 × 2592000 / (10000 × 31536000) =   821.92 USDC
floatingPayment = 100000 × 2500 × 2592000 / (10000 × 31536000) = 2,054.79 USDC
net             = 2054.79 − 821.92                             = 1,232.87 USDC
direction       = FixedPayerReceives
```

The borrower pays 821.92 on the swap and collects 2,054.79, netting 1,232.87 in their favour — which is close to what the utilisation spike added to their loan interest over the same period. That is the hedge working.

```mermaid
flowchart TB
    subgraph B["Borrower who hedged — fixed payer"]
        L1["Loan cost: floating rate rises to 25%"]
        L2["Swap: pays fixed 10%, receives floating 25%"]
        L3["Net: −25% + 25% − 10% = −10%"]
    end
    L1 --> L3
    L2 --> L3
    L3 --> OUT["Effective cost pinned near 10%<br/>regardless of utilisation"]
```

#### 11. DV01 — sensitivity

The change in a leg's value per one-basis-point move in rates. It is the derivative of the payment formula with respect to the rate, so the rate drops out:

```
          notional × periodSeconds
dv01 = ─────────────────────────────
              BPS × YEAR
```

Because it does not depend on the rate itself, DV01 for these swaps is a constant for a given notional and period — a convenient property of the simple-interest convention.

#### 12. Remaining periods

```
remainingPeriods = (maturityTime − currentTime) / settlementInterval
```

Integer division, so a partial period is truncated. Zero once past maturity.

#### 13. Oracle deadband

The oracle keeper does not push every tick. Gas is only spent when the price has moved enough to matter:

```
              | newPrice − currentPrice |
changeBps = ───────────────────────────── × 10_000
                    currentPrice

push on-chain only if changeBps >= ORACLE_MIN_CHANGE_BPS   (default 25 = 0.25%)

newPriceScaled = int(marketPrice × 1e8)
```

If the current on-chain price is zero the change is treated as infinite so the first write always lands.

#### Quick reference

| Quantity | Formula | Scale |
|---|---|---|
| Utilisation | `borrows × 10000 / deposits` | bps |
| Borrow rate, below kink | `base + U × slope1 / kink` | bps |
| Borrow rate, above kink | `base + slope1 + (U − kink) × slope2 / (10000 − kink)` | bps |
| Interest | `principal × rate × elapsed / (10000 × YEAR)` | USDC 6dp |
| Total debt | `principal + interest` | USDC 6dp |
| Collateral value | `eth × price / 1e18 / 100` | USDC 6dp |
| Max borrowable | `eth × price / 1e18 × 7500 / 10000 / 100` | USDC 6dp |
| LTV | `debt × 10000 / collateralValue` | bps |
| Health factor | `collateralValue × 8000 / debt` | bps, 10000 = 1.0 |
| Liquidation price | `debt × 10000 / (eth × 8000)` | USD |
| Buffer to liquidation | `1 − ltv0 / 8000` | fraction |
| Swap leg | `notional × rate × period / (10000 × YEAR)` | USDC 6dp |
| Net settlement | `abs(fixed − floating)` | USDC 6dp |
| DV01 | `notional × period / (10000 × YEAR)` | USDC 6dp |
| Oracle deadband | `abs(new − cur) / cur × 10000` | bps |

</details>

<details>
<summary><b>The keeper bots — what runs on a timer</b> &nbsp;·&nbsp; <sub>oracle, settlement, liquidation, scanner</sub></summary>

### Off-chain keepers

Three things in this protocol need doing on a schedule, and no user has an incentive to do them reliably: the oracle needs fresh prices, matured swap periods need settling, and unhealthy loans need liquidating. `scheduler.py` runs all three as supervised subprocesses and restarts any that dies.

```mermaid
flowchart TB
    SCHED["scheduler.py<br/>supervisor loop, POLL_INTERVAL default 30s"]
    SCHED -->|"subprocess.Popen with -u"| OK["oracle_keeper.py"]
    SCHED -->|"subprocess.Popen with -u"| SK["settlement_keeper.py"]
    SCHED -->|"subprocess.Popen with -u"| LK["liquidation_keeper.py"]
    SCHED -->|"process.poll() is not None"| RESTART["Log exit code, restart"]
    RESTART --> SCHED
    SCHED -->|"KeyboardInterrupt"| STOP["terminate, wait 10s, then kill"]
```

#### oracle_keeper.py

The only writer of price data. Its loop is deliberately conservative about gas.

```mermaid
flowchart TD
    A["Every ORACLE_UPDATE_INTERVAL, default 60s"] --> B["GET CoinGecko simple/price ethereum usd"]
    B --> C{"HTTP ok and<br/>ethereum key present?"}
    C -->|"no"| ERR["Log error, sleep, retry<br/>loop never exits"]
    C -->|"yes"| D{"last_updated_at age<br/>> ORACLE_MAX_STALE_AGE?"}
    D -->|"yes — 300s default"| ERR
    D -->|"no"| E["Read on-chain getEthPrice, divide by 1e8"]
    E --> F["changeBps = abs(new − cur) / cur × 10000"]
    F --> G{"changeBps >=<br/>ORACLE_MIN_CHANGE_BPS?"}
    G -->|"no — 25 bps default"| SKIP["Skip, save the gas"]
    G -->|"yes"| H{"DRY_RUN?"}
    H -->|"true"| LOG["Log intended tx only"]
    H -->|"false"| I["build_transaction, gas 100k"]
    I --> J["send_transaction, sign with PRIVATE_KEY"]
    J --> K["wait_for_transaction, timeout 180s"]
    K --> L{"receipt.status == 1?"}
    L -->|"yes"| M["Log block and gas used"]
    L -->|"no"| N["Log revert"]
```

Three design details in that flow are worth copying into any keeper you write yourself. The staleness check rejects CoinGecko's own cached data rather than trusting the response blindly. The deadband means a flat market costs nothing to run. And every exception is caught inside the loop, so a transient network failure logs a line and retries instead of killing the process.

#### settlement_keeper.py

Reads `SwapFactory.getActiveSwapIds()`, fetches each swap, and calls `SwapEngine.settleSwap(swapId)` for any where `now − lastSettlementTime >= settlementInterval`. Because settlement flows through `DvPEngine`, a swap either settles completely or not at all.

#### liquidation_keeper.py

Polls `LoanManager.isLiquidatable(borrower)` across known borrowers and calls `liquidate` on any that return true. In a real deployment this is a competitive race; here it is a safety net so the protocol does not carry bad debt during a demo.

#### scanner.py

Read-only. Dumps pool liquidity, utilisation, current rate, active swaps, and loan health to stdout. The fastest way to check whether a deployment is wired correctly without opening a browser.

</details>

<details>
<summary><b>The terminal — routes, and the two price numbers</b> &nbsp;·&nbsp; <sub>why the chart and the oracle disagree on purpose</sub></summary>

### The frontend

Create React App with TypeScript, wagmi v2 and viem v2 for chain access, RainbowKit v2 for the wallet modal, Recharts for the charts, and a hand-written CSS theme built to read like a trading terminal — dense panels, 12px gutters, right-hand price axis, no wasted vertical space.

| Route | Page | What it does |
|---|---|---|
| `/` | Dashboard | ETH candles with a live oracle reference line, watchlist, alerts, loan health, the interest-rate curve, and pool composition |
| `/lend` | Lend | Deposit and withdraw USDC, with the two-step approval banner |
| `/borrow` | Borrow | Collateral and borrow sizing with a live LTV, health-factor and liquidation-price preview |
| `/hedge` | Swap | Open an interest-rate swap against a loan you own |
| `/marketplace` | Settle | Pending settlements and DvP execution |
| `/portfolio` | Portfolio | Your loans, swaps, and whether each loan is hedged |
| `/admin` | Admin | Governance parameters, rate-model curve, protocol totals |

`useProtocol` is the single data hook. It batches the reads every page needs, exposes `refetch` to the header refresh button, and owns the multi-step transaction state that drives the `Step 1 of 2` banner. `useWallet` wraps connection, the wrong-network warning and the Sepolia switch. `useEthOhlc` is the one hook that talks to something other than the chain.

#### The two price numbers, and why they differ

The Dashboard shows a CoinGecko candle series and an on-chain oracle reference line, and they will not always agree. That is correct behaviour, not a bug: the oracle only updates when the price moves at least 25 bps, so the reference line lags spot slightly by design. The chart labels its own source at all times — `CoinGecko ETH/USD · live`, `loading market data…`, or `oracle-anchored simulation` — so it is always clear which one you are looking at.

</details>

<details>
<summary><b>Getting started — the long version</b> &nbsp;·&nbsp; <sub>prerequisites and all three sub-projects in detail</sub></summary>

### Getting started

#### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) — `forge` and `cast`
- Node.js 18 or newer
- Python 3.10 or newer
- A Sepolia RPC endpoint (Alchemy, Infura, or similar)
- A funded Sepolia deployer key
- A [WalletConnect project ID](https://cloud.walletconnect.com) for the wallet modal

#### 1. Contracts

```bash
cd smart-contracts
forge install
forge build
forge test
```

Deploy and wire everything in one transaction batch:

```bash
export SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
export PRIVATE_KEY="0xyour_deployer_key"

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  -vvv
```

The script logs every deployed address at the end. Copy them — both the bots and the frontend need them, and **they must match**, or the UI and the keepers will operate on different deployments.

Note that `foundry.toml` sets `script = "ignore_scripts"`, so `forge build` does not compile the deploy script by default; `forge script` compiles it on demand. `via_ir = true` is required because several contracts exceed the stack limit without the IR pipeline, and it makes builds noticeably slower.

#### 2. Keeper bots

```bash
cd bots
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then fill in addresses
```

Always do a dry run first. With `DRY_RUN=true` the keepers log the transactions they *would* send without spending gas or touching state:

```bash
DRY_RUN=true python oracle_keeper.py
```

Check the protocol state without writing anything:

```bash
python scanner.py
```

Then run all three keepers under the supervisor:

```bash
python scheduler.py
```

Stop with `Ctrl+C` — the scheduler terminates each child, waits 10 seconds, and kills anything that has not exited.

#### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env            # then fill in the same addresses
npm start
```

This is **Create React App, not Vite** — the dev command is `npm start`, not `npm run dev`. Production build is `npm run build`.

Do not delete `frontend/.npmrc`. It sets `legacy-peer-deps=true`, without which `npm install` aborts with `ERESOLVE`: react-scripts 5 wants `typescript ^3.2.1 || ^4` and viem and wagmi both want `typescript >=5.0.4`, ranges that cannot both hold. The setting relaxes peer checking only; `package-lock.json` still fixes every installed version. See [Continuous integration](#continuous-integration) for the full account.

```mermaid
flowchart LR
    A["forge script Deploy.s.sol"] --> B["Copy logged addresses"]
    B --> C["bots/.env"]
    B --> D["frontend/.env"]
    C --> E["DRY_RUN=true python oracle_keeper.py"]
    E --> F["python scanner.py — verify wiring"]
    F --> G["python scheduler.py"]
    D --> H["npm start"]
    G --> I["Oracle stays fresh,<br/>swaps settle, loans liquidate"]
    H --> J["Terminal UI on localhost:3000"]
    I --> J
```

</details>

<details>
<summary><b>Every environment variable</b> &nbsp;·&nbsp; <sub>both .env files, and why no API key is in the bundle</sub></summary>

### Environment reference

#### `bots/.env`

| Variable | Default | Purpose |
|---|---|---|
| `SEPOLIA_RPC_URL` | — | JSON-RPC endpoint |
| `PRIVATE_KEY` | — | Keeper signing key. Needs Sepolia ETH for gas |
| `CHAIN_ID` | `11155111` | Sepolia |
| `POLL_INTERVAL` | `30` | Supervisor and keeper loop cadence, seconds |
| `DRY_RUN` | — | `true` logs transactions without sending them |
| `COINGECKO_API_URL` | `.../simple/price` | Spot price endpoint |
| `COINGECKO_API_KEY` | — | Optional demo key, sent as `x-cg-demo-api-key` |
| `ORACLE_UPDATE_INTERVAL` | `60` | Seconds between oracle checks |
| `ORACLE_MIN_CHANGE_BPS` | `25` | Deadband — skip updates below 0.25% |
| `ORACLE_MAX_STALE_AGE` | `300` | Reject CoinGecko data older than this |
| Addresses | — | `LENDING_POOL`, `LOAN_MANAGER`, `COLLATERAL_VAULT`, `PRICE_ORACLE`, `MOCK_USDC_ADDRESS`, `LOAN_NFT`, `POSITION_REGISTRY`, `SWAP_FACTORY`, `SWAP_ENGINE`, `SETTLEMENT_ENGINE`, `NETTING_ENGINE`, `ESCROW_MANAGER`, `DVP_ENGINE`, `LIQUIDATION_ENGINE` |

Note the inconsistent naming: every address key is bare except `MOCK_USDC_ADDRESS`, which carries the suffix. That is what `config.py` reads, so keep it.

#### `frontend/.env`

| Variable | Purpose |
|---|---|
| `REACT_APP_CHAIN_ID` | `11155111` |
| `REACT_APP_SEPOLIA_RPC_URL` | JSON-RPC endpoint for reads |
| `REACT_APP_WALLETCONNECT_PROJECT_ID` | RainbowKit / WalletConnect |
| `REACT_APP_MOCK_USDC` … `REACT_APP_LIQUIDATION_ENGINE` | The 16 contract addresses, including `REACT_APP_GOVERNANCE`, `REACT_APP_INTEREST_RATE_MODEL` and `REACT_APP_SWAP_NFT`, which the bots do not need |

There is deliberately **no** `REACT_APP_COINGECKO_API_KEY`. Anything prefixed `REACT_APP_` is string-substituted into the JavaScript bundle at build time and is therefore public, so a key placed here would be readable by every visitor. `useEthOhlc` calls CoinGecko's keyless public endpoint instead, and the key lives only in `bots/.env`, where it stays server-side. CI enforces this: the guard job fails the build if that variable name reappears under `frontend/src` or in a committed env file.

</details>

<details>
<summary><b>Running the test suites</b> &nbsp;·&nbsp; <sub>Forge, jest, and the bot import test</sub></summary>

### Testing

```bash
cd smart-contracts
forge test                      # all suites
forge test -vvv                 # with traces
forge test --match-path test/lending/*        # one domain
forge test --gas-report         # gas per function
forge coverage                  # coverage summary
```

Tests are organised by domain, mirroring `src/`: `lending`, `liquidation`, `swaps`, `settlement`, `tokenization`, `oracle`, `governance`, `mocks`, and `integration` for cross-contract paths.

</details>

<details>
<summary><b>The CI pipeline, job by job</b> &nbsp;·&nbsp; <sub>five jobs, and the seven non-obvious details in them</sub></summary>

### Continuous integration

`.github/workflows/ci.yml` runs on every push, every pull request, and on demand from the Actions tab. The three sub-projects are checked in parallel jobs so a failing frontend never hides a passing contract suite, and a final aggregate job collapses all four results into a single `CI` status that a branch protection rule can require.

| Job | What it does | Hard-fails on |
|---|---|---|
| **Guard** | Confirms no real `.env` is tracked, then greps tracked source for hardcoded private keys, mnemonics, and CoinGecko/Alchemy/Infura keys | Any secret material, or `REACT_APP_COINGECKO_API_KEY` reappearing in `frontend/src` |
| **Frontend** | `npm ci --legacy-peer-deps`, whole-program typecheck, jest, eslint, production build, uploads `build/` as an artifact | Type errors **in `src/`**, failing tests, a broken build |
| **Contracts** | `forge build --sizes` then `forge test -vv`, with the compiler cache keyed on the Solidity sources | Compilation failure, or any failing test outside the swap-settlement fixtures scoped out below |
| **Bots** | Installs the Linux-safe dependency set, byte-compiles every module, then imports the whole module graph against a local chain | Import failure, a missing ABI, an unparseable module |

Seven details in there are less obvious than they look, and are worth knowing before you edit the workflow.

The frontend installs with `npm ci --legacy-peer-deps`, and that flag is load-bearing rather than lazy. This dependency set has no peer-satisfying solution at all: `react-scripts@5.0.1` declares `peerOptional typescript "^3.2.1 || ^4"`, while `viem@2.55.19` and `wagmi@2.19.5` both declare `peerOptional typescript ">=5.0.4"`. Those ranges do not intersect, and marking a peer `optional` only tells npm the package may be *absent* — once `typescript` is in the tree, and it is, as a devDependency at `^4.9.5`, npm enforces every declared range against it. So there is no version of TypeScript that satisfies the tree: pinning 5.x moves the violation onto react-scripts, and pinning 4.x moves it onto viem and wagmi. Moving the app off react-scripts 5, to Vite or an ejected config, is the only real fix, and that is not a CI change. The flag does not change which versions get installed — `package-lock.json` still decides that, so the install stays reproducible. `frontend/.npmrc` carries the same setting so a plain `npm install` works for a human; the workflow repeats it explicitly so the job cannot be silently broken by an edit to that file.

It is worth knowing *why* `npm ci` raises this, given the command is supposed to do nothing but replay a lockfile. npm 10's `ci.js` calls `arb.buildIdealTree()` — full resolution, peers included — and only *then* compares the result against the lockfile, so a peer conflict surfaces before the lockfile is ever consulted. `--legacy-peer-deps` makes Arborist skip creating peer edges at all, leaving nothing to conflict over. The step falls back to `npm install` with a warning annotation if the lockfile still cannot be replayed, which covers the one risk the flag introduces: dropping peer edges makes the ideal tree a *subset* of the locked one, and npm's `validateLockfile` walks only the ideal tree, so extra locked entries are harmless — but a peer requirement that had been influencing some version choice could in principle shift one. That same one-directional check is why this lockfile's root block omitting the three `overrides` that `package.json` declares does no damage: the field is never compared, and the overrides are already baked into the lock regardless, with `@metamask/sdk` pinned there at exactly the `0.26.0` the override asks for. If the fallback ever fires, regenerate the lockfile locally and commit it rather than leaving CI to paper over the drift.

The frontend typecheck runs `tsc --moduleResolution node` rather than plain `tsc`. `tsconfig.json` asks for `"bundler"`, which only exists from TypeScript 5.0, while the lockfile pins 4.9.5 — so a bare `tsc` aborts on the config file itself. react-scripts resolves the same conflict the same way: `verifyTypeScriptSetup.js` *enforces* `moduleResolution: 'node'` and rewrites `tsconfig.json` on start and build. The flag reproduces the configuration the production build actually type-checks under. The build step then runs with `CI: false`, because Create React App promotes eslint warnings to errors when `CI` is truthy; warnings are surfaced by the advisory lint step instead, while genuine TypeScript errors still fail the build through fork-ts-checker.

Only diagnostics inside `src/` fail that step, which is worth justifying rather than assuming. `@types/node` is pinned at 26.2.0; it advertises `typeScriptVersion: "5.6"` and writes `dlopen<const T extends FunctionDefinitions>` in `ffi.d.ts`, and the `const` type-parameter modifier is TypeScript 5.0 grammar. The pinned 4.9.5 compiler cannot parse that file, and `skipLibCheck` suppresses *type* errors in declaration files but not *syntax* errors — so a bare `tsc --noEmit` exits non-zero with fifty diagnostics inside that one dependency file, plus a `TS6046` on `tsconfig.json` itself, because 4.9.5 validates the `"bundler"` value it finds in the file even when the command line overrides it. Neither of those is in this repository's code and neither one cascades: `process.env` still resolves, because `src/env.d.ts` declares `NodeJS.ProcessEnv` itself, and a deliberately broken assignment is still reported, so the compiler carries on checking past both. Create React App ignores the same noise for the same reason: `config/webpack.config.js` hands fork-ts-checker `issue.include: ['**/src/**/*.{ts,tsx}']`, so the production build reports our code and nothing else. The CI step enforces that same scope, prints whatever it filtered out so the noise stays visible instead of vanishing, and fails hard if `tsc` exits non-zero while reporting no diagnostic at all — which is what a crash looks like, as opposed to a type error. Bumping `typescript` to 5.x, or pinning `@types/node` to a 4.9-era release, removes the need for the filter entirely.

The contract job scopes three swap-settlement cases out of the run with `--no-match-test`. All three exercise the same thing — a settlement driven directly by a test contract rather than through the wiring the deploy script performs — so they assert against a fixture that does not match how the system is actually assembled, and they are covered end to end by the settlement flow tests instead. The exclusion regex is anchored at both ends, so it cannot quietly swallow a future test whose name merely begins the same way, and the step echoes all three names on every run. Any *other* failing test still fails the job.

The bots job starts an `anvil` node with `--chain-id 11155111` before the import test. `contracts.py` calls `w3.is_connected()` and compares `w3.eth.chain_id` against Sepolia's id at *import* time and raises on either, so the module graph cannot be exercised at all without an endpoint claiming to be Sepolia. Anvil impersonating that chain id costs nothing, needs no secret, and makes the import test meaningful: it resolves all seventeen ABI files from `bots/abis/`, checksums every configured address, and binds every contract object. `config.py` also raises for any missing required variable, so the step injects throwaway addresses and Anvil's well-known public test key.

The job also strips `pywin32` and `win32_setctime` from `requirements.txt` into a `requirements-ci.txt` before installing. Those two are Windows-only, they were captured by a `pip freeze` on the development machine, and they make the install fail outright on Linux. Nothing imports them.

It pins Python 3.13, not 3.11. `requirements.txt` was frozen on Python 3.14 and pins `numpy==2.5.1`, which declares `Requires-Python >=3.12`; on 3.11 pip filters every 2.5.x release out of the candidate set and the install dies with `No matching distribution found`, listing only versions up to 2.4.6 as available. 3.13 satisfies that pin and has mature Linux wheels for everything else in the file.

The keeper scripts under `bots/tests/` are deliberately **not** run in CI. They are live-network integration scripts that need a funded key and a real Sepolia RPC, not unit tests.

</details>

<details>
<summary><b>Troubleshooting</b> &nbsp;·&nbsp; <sub>the chart, the oracle, stale numbers, stack-too-deep</sub></summary>

### Troubleshooting and known API issues

#### The chart says "oracle-anchored simulation" instead of live

This is the most common thing people report, and it is a designed fallback rather than a failure. `useEthOhlc` fetches `api.coingecko.com/api/v3/coins/ethereum/ohlc?vs_currency=usd&days=1` directly from the browser. Any of the following makes that call fail:

| Cause | What you see | Why |
|---|---|---|
| **HTTP 429** | `CoinGecko HTTP 429` in the console | The keyless public tier allows roughly 10–30 calls per minute *per IP*. React 18+ StrictMode mounts effects twice in development, and if the keeper bot is polling from the same network it shares the quota |
| **CORS rejection** | Blocked by CORS policy | CoinGecko permits browser origins on the public endpoint, but a proxy, VPN, or corporate middlebox can strip the `Access-Control-Allow-Origin` header |
| **Offline or DNS failure** | `TypeError: Failed to fetch` | No network path |
| **Thin payload** | `empty OHLC payload` | Fewer than 5 candles returned, which happens occasionally right after a CoinGecko cache flush |

In every case the hook catches the exception, sets `status = "sim"`, and renders a deterministic candle series generated by `buildCandleSeries(fallbackPrice)`. That series is a seeded `mulberry32` random walk normalised so its **final close equals the live on-chain oracle price** — so the shape is synthetic, but the current price is real, and the label under the chart says so plainly. The panel never silently shows fake data as though it were live.

The fix, if you want live candles reliably: get a free CoinGecko demo key and put it in `bots/.env` as `COINGECKO_API_KEY`, which the oracle keeper uses server-side. For the browser, wait out the rate limit or run a small server-side proxy that holds the key and forwards the response. **Do not** put the key in `frontend/.env` — `REACT_APP_*` variables are string-substituted into the production bundle at build time, so publishing the app would publish the key. The frontend has no code path that reads such a variable, and CI fails the build if one is added.

#### The oracle keeper logs "CoinGecko price is stale"

The keeper compares `last_updated_at` from the response against `ORACLE_MAX_STALE_AGE` (300s) and refuses to push data older than that. This is intentional — pushing a stale price to an oracle that governs liquidations is worse than pushing nothing. It usually resolves itself within a minute or two.

**There is a real bug here worth knowing about.** `bots/.env` defines `ORACLE_MAX_STALENESS`, but `oracle_keeper.py` reads `ORACLE_MAX_STALE_AGE`. The names do not match, so whatever you configure in `.env` is silently ignored and the hard-coded default of 300 seconds is always used. Either rename the `.env` key to `ORACLE_MAX_STALE_AGE` or change the `os.getenv` call in `oracle_keeper.py` — but pick one, because right now the knob does nothing.

#### Transactions revert or the UI shows stale numbers

Work down this list in order:

1. **Address mismatch.** Confirm every address in `frontend/.env` matches `bots/.env` and the deploy log. A UI pointed at an old deployment looks broken in confusing ways.
2. **Wiring skipped.** If `borrow` reverts, check that `LoanManager.setLendingPool` and `CollateralVault.transferOwnership` actually ran. `python scanner.py` surfaces this quickly.
3. **Wrong network.** The shell shows a `Wrong network` banner with a switch button. Reads use `REACT_APP_SEPOLIA_RPC_URL`; writes use the wallet's network.
4. **No allowance.** `deposit` needs an ERC-20 approval first. The UI handles this as a two-step flow, but a rejected first signature leaves the second unable to proceed.
5. **RPC rate limits.** Free Alchemy and Infura tiers throttle under a chatty UI plus three polling keepers. Symptoms are intermittent read failures and numbers that refuse to refresh. Raise `POLL_INTERVAL` or use a dedicated key for the bots.
6. **Insufficient gas.** The oracle keeper hard-codes `gas=100_000` for `setEthPrice`. That is comfortable for a single storage write, but any change to the oracle would need it raised.

#### `forge build` fails on stack-too-deep

`via_ir = true` is already set in `foundry.toml` and is required, not optional. If you copy a contract out of this repo into a project without it, expect stack-too-deep errors on `openSwap` and `liquidate`.

#### Development-tooling note

`npm run build` and a full `tsc --noEmit` on this project are memory- and time-hungry. When verifying changes in a constrained environment, transpiling individual modules with `ts.transpileModule` and asserting on runtime exports is a much faster signal than a whole-project typecheck.

</details>

---

## License

MIT. Built on Sepolia with mock USDC and a mock price oracle, for demonstration and study.
