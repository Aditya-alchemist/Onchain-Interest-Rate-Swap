#!/usr/bin/env python3
"""Generate the four HedgeFi README diagrams as Excalidraw-style SVG.

Run:  python3 diagrams.py <outdir>

Every diagram is deterministic: the jitter is seeded from each shape's own
coordinates, so re-running this produces byte-identical files.
"""

import os
import sys

from rough import (Canvas, group, HAND, MONO,
                   BG, PANEL, INK, DIM, FAINT,
                   BLUE, GREEN, ORANGE, PURPLE, PINK, TEAL, YELLOW, RED,
                   CYAN, VIOLET)


# ===================================================================== 1
def banner(path):
    print("banner.svg")
    W, H = 1280, 340
    cv = Canvas(W, H, BG)

    # A faint hachured wash so the panel does not read as flat black.
    cv.hachure(0, 0, W, H, "#2b3350", gap=26, sw=1.0, op=0.20)

    # ---- left: wordmark ------------------------------------------------
    cv.text(66, 132, "HedgeFi", 78, INK, "start", "bold", HAND)
    # Hand-drawn underline sweep, two colours, like a marker stroke.
    cv.line(70, 152, 392, 149, GREEN, 5.0, 2.4)
    cv.line(74, 160, 300, 158, BLUE, 3.0, 2.0, opacity=0.75)

    cv.text(68, 200, "Borrow at a floating rate.", 21, DIM, "start",
            "normal", HAND)
    cv.text(68, 230, "Swap it for a fixed one.", 21, ORANGE, "start",
            "bold", HAND)
    cv.text(68, 260, "Settle so neither side can walk away.", 21, DIM,
            "start", "normal", HAND)

    chips = [("Sepolia", TEAL), ("Solidity 0.8.24", GREEN),
             ("React + wagmi", BLUE), ("Python keepers", YELLOW)]
    cx = 68
    for label, col in chips:
        w = cv.width(label, 13, MONO) + 26
        cv.rect(cx, 288, w, 30, stroke=col, fill=col, fill_op=0.14,
                sw=1.8, r=15, amp=1.0, passes=1)
        cv.text(cx + w / 2, 308, label, 13, col, "middle", "normal", MONO)
        cx += w + 12

    # ---- right: fixed-vs-floating motif --------------------------------
    px, py, pw, ph = 700, 58, 512, 214
    cv.rect(px, py, pw, ph, stroke="#39415f", fill=PANEL, fill_op=0.85,
            sw=2.0, r=14)

    # gridlines
    for i in range(1, 4):
        y = py + ph * i / 4.0
        cv.line(px + 14, y, px + pw - 14, y, "#39415f", 1.0, 0.8, 1,
                dash="5 7", opacity=0.7)

    x0, x1 = px + 30, px + pw - 92
    base = py + ph - 44

    # FIXED — a deliberately flat line.
    fixed_y = base - 74
    cv.line(x0, fixed_y, x1, fixed_y, ORANGE, 4.0, 1.4)
    cv.text(x1 + 10, fixed_y + 5, "FIXED", 15, ORANGE, "start", "bold", HAND)

    # FLOATING — a jagged walk that spikes through the fixed line.
    walk = [0.30, 0.24, 0.38, 0.33, 0.52, 0.44, 0.78, 0.95, 0.70, 0.58,
            0.86, 1.00, 0.74]
    pts = []
    for i, v in enumerate(walk):
        x = x0 + (x1 - x0) * i / (len(walk) - 1)
        pts.append((x, base - 22 - v * 108))
    for i in range(len(pts) - 1):
        cv.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1],
                BLUE, 3.2, 1.2)
    cv.text(x1 + 10, pts[-1][1] + 5, "FLOATING", 15, BLUE, "start",
            "bold", HAND)

    # Shade the gap the swap pays out: where floating sits above fixed.
    for i, (x, y) in enumerate(pts):
        if y < fixed_y:
            cv.line(x, fixed_y, x, y, GREEN, 2.0, 0.9, 1, opacity=0.55)
    cv.text(px + pw / 2, py + ph + 30,
            "the green gap is what the swap pays you back", 14, GREEN,
            "middle", "normal", HAND, 0.95)
    cv.text(px + 22, py + 26, "borrow rate over time", 13, FAINT, "start",
            "normal", HAND)

    cv.save(path)


# ===================================================================== 2
def swap_explained(path):
    """The plain-English 'what is an interest rate swap' picture."""
    print("swap-explained.svg")
    W, H = 1240, 620
    cv = Canvas(W, H, BG)

    cv.text(W / 2, 52, "An interest-rate swap, in one picture", 30, INK,
            "middle", "bold", HAND)
    cv.text(W / 2, 82,
            "two sides agree to trade one kind of interest for the other",
            16, DIM, "middle", "normal", HAND)

    # ---- the two counterparties ---------------------------------------
    bw, bh = 330, 148
    ly, ry = 132, 132
    lx, rx = 74, W - 74 - bw

    cv.rect(lx, ly, bw, bh, stroke=BLUE, fill=BLUE, fill_op=0.12, sw=2.8,
            r=16, hachure_gap=10)
    cv.text(lx + bw / 2, ly + 34, "YOU", 22, BLUE, "middle", "bold")
    cv.text(lx + bw / 2, ly + 62, "the borrower", 14, DIM, "middle")
    cv.text(lx + bw / 2, ly + 92, "wants a bill that", 15, INK, "middle")
    cv.text(lx + bw / 2, ly + 114, "does not move", 15, INK, "middle",
            "bold")

    cv.rect(rx, ry, bw, bh, stroke=ORANGE, fill=ORANGE, fill_op=0.12,
            sw=2.8, r=16, hachure_gap=10)
    cv.text(rx + bw / 2, ry + 34, "THE OTHER SIDE", 22, ORANGE, "middle",
            "bold")
    cv.text(rx + bw / 2, ry + 62, "in HedgeFi: the protocol itself", 14,
            DIM, "middle")
    cv.text(rx + bw / 2, ry + 92, "takes the moving rate", 15, INK,
            "middle")
    cv.text(rx + bw / 2, ry + 114, "off your hands", 15, INK, "middle",
            "bold")

    # ---- the two legs --------------------------------------------------
    mid = W / 2
    # top leg: you -> them, fixed
    cv.arrow([(lx + bw + 12, ly + 52), (mid - 40, ly + 22),
              (rx - 12, ly + 52)], ORANGE, 3.0, 1.4, 13)
    cv.text(mid, ly + 6, "you pay FIXED  ·  10% a year, agreed today",
            16, ORANGE, "middle", "bold")

    # bottom leg: them -> you, floating
    cv.arrow([(rx - 12, ry + 104), (mid + 40, ry + 138),
              (lx + bw + 12, ry + 104)], BLUE, 3.0, 1.4, 13)
    cv.text(mid, ry + 162, "they pay FLOATING  ·  whatever the pool "
            "charges that month", 16, BLUE, "middle", "bold")

    # ---- notional note -------------------------------------------------
    ny, nh = 336, 74
    cv.rect(180, ny, W - 360, nh, stroke=FAINT, fill=PANEL, fill_op=0.8,
            sw=2.0, r=12, dash="9 6")
    cv.text(W / 2, ny + 30, "The $100,000 \"notional\" never changes hands",
            17, INK, "middle", "bold")
    cv.text(W / 2, ny + 55,
            "it is only the number both payments are calculated from",
            14, DIM, "middle")

    # ---- netting -------------------------------------------------------
    cv.text(W / 2, 450, "and only the difference actually moves", 20, GREEN,
            "middle", "bold")

    boxes = [
        (74, GREEN, "fixed  >  floating",
         ["rates stayed calm", "you pay the difference"]),
        (466, PINK, "floating  >  fixed",
         ["rates spiked", "they owe you the difference"]),
        (858, FAINT, "fixed  =  floating",
         ["dead heat", "nobody pays anything"]),
    ]
    for bx, col, head, rows in boxes:
        cv.rect(bx, 476, 308, 112, stroke=col, fill=col, fill_op=0.10,
                sw=2.4, r=14)
        cv.text(bx + 154, 506, head, 17, col, "middle", "bold", MONO)
        cv.text(bx + 154, 534, rows[0], 14, DIM, "middle")
        cv.text(bx + 154, 560, rows[1], 15, INK, "middle", "bold")

    cv.save(path)


# ===================================================================== 3
def architecture(path):
    print("architecture.svg")
    W, H = 1420, 1180
    cv = Canvas(W, H, BG)

    # Columns are ordered LENDING | TOKENIZATION | SWAPS on purpose: it puts
    # the NFT registry between the two contracts that mint into it, so every
    # cross-domain arrow is between neighbours and nothing has to cut through
    # a box to reach its target.
    c1, c2, c3, bw = 40, 525, 1010, 370
    m1, m2, m3 = c1 + bw / 2, c2 + bw / 2, c3 + bw / 2   # 225, 710, 1195

    cv.text(W / 2, 50, "HedgeFi — how the pieces fit together", 30, INK,
            "middle", "bold", HAND)
    cv.text(W / 2, 80, "17 contracts on Sepolia, one React terminal, "
            "three Python keepers", 15, DIM, "middle")

    # ---- row A: you, and the one outside data source -------------------
    group(cv, 400, 112, 400, 92, BLUE, "YOU  ·  wallet + browser",
          [], sub="lender  ·  borrower  ·  hedger", gap=11)
    group(cv, c3, 112, bw, 92, CYAN, "CoinGecko API",
          [], sub="public keyless endpoint", gap=11)

    # ---- row B: the terminal -------------------------------------------
    fx, fy, fw, fh = 300, 250, 600, 132
    group(cv, fx, fy, fw, fh, BLUE, "HedgeFi terminal  ·  React + wagmi",
          ["useProtocol — one shared store",
           "Dashboard Lend Borrow Hedge Settle Portfolio Admin"],
          gap=13, row_size=13)

    cv.arrow([(600, 208), (600, 246)], BLUE, 2.4)
    cv.arrow([(1100, 208), (1100, 250), (906, 300)], CYAN, 2.0, dash="7 5")
    cv.text(1120, 268, "OHLC candles", 12, CYAN, "start")
    cv.text(W - 40, 236, "spot ETH/USD  →  the oracle keeper", 12, CYAN,
            "end")

    # ---- the chain boundary --------------------------------------------
    cv.arrow([(430, 384), (430, 420), (m1, 420), (m1, 486)], BLUE, 2.4)
    cv.arrow([(770, 384), (770, 420), (m3, 420), (m3, 486)], BLUE, 2.4)
    cv.text(600, 412, "eth_call reads  ·  wallet-signed writes", 12, BLUE,
            "middle")
    cv.line(40, 442, W - 40, 442, FAINT, 1.6, 0.8, 1, dash="12 8")
    cv.text(710, 464, "below this line: Sepolia  ·  chain id 11155111", 13,
            FAINT, "middle")

    # ---- row C: the three core domains ---------------------------------
    cy, ch = 490, 195
    group(cv, c1, cy, bw, ch, GREEN, "LENDING",
          ["LendingPool", "LoanManager", "InterestRateModel",
           "CollateralVault", "LiquidationEngine"],
          sub="the money market", gap=10)
    group(cv, c2, cy, bw, ch, PURPLE, "TOKENIZATION",
          ["LoanNFT", "SwapNFT", "PositionRegistry"],
          sub="positions as ERC-721s", gap=10)
    group(cv, c3, cy, bw, ch, ORANGE, "SWAPS",
          ["SwapEngine", "SwapFactory", "SettlementEngine",
           "NettingEngine"],
          sub="the rate-hedging desk", gap=10)

    # neighbours only, so the gutters stay legible
    cv.arrow([(c1 + bw - 4, 570), (c2 + 4, 570)], GREEN, 2.2)
    cv.text(466, 554, "mintLoan", 11, GREEN, "middle", "normal", MONO)
    cv.text(466, 592, "burnLoan", 11, GREEN, "middle", "normal", MONO)
    cv.arrow([(c3 + 4, 570), (c2 + bw - 4, 570)], ORANGE, 2.2)
    cv.text(951, 554, "mintSwap", 11, ORANGE, "middle", "normal", MONO)
    cv.text(951, 592, "linkPosition", 11, ORANGE, "middle", "normal", MONO)

    # ---- row D: support domains ----------------------------------------
    dy, dh = 764, 130
    group(cv, c1, dy, bw, dh, TEAL, "PRICES + MONEY",
          ["MockPriceOracle  8dp", "MockUSDC  6dp"],
          sub="the only external inputs", gap=10)
    group(cv, c2, dy, bw, dh, VIOLET, "GOVERNANCE",
          ["Governance", "proposals + parameters"],
          sub="protocol settings live here", gap=10)
    group(cv, c3, dy, bw, dh, PINK, "DvP SETTLEMENT",
          ["DvPEngine", "EscrowManager"],
          sub="both legs, or neither", gap=10)

    cv.arrow([(m1, cy + ch + 4), (m1, dy - 4)], TEAL, 2.2)
    cv.text(m1 + 16, 706, "getEthPrice", 12, TEAL, "start")
    cv.arrow([(m3, cy + ch + 4), (m3, dy - 4)], PINK, 2.4)
    cv.text(m3 - 16, 706, "executeSettlement", 12, PINK, "end")

    # Repay unwinds the hedge. Routed wide of both vertical arrows above.
    cv.arrow([(140, cy + ch + 4), (140, 722), (1280, 722), (1280, cy + ch + 6)],
             GREEN, 2.0, dash="8 5")
    cv.text(710, 744, "repaying the loan calls closeSwapByLoan, which "
            "unwinds the hedge in the same transaction", 12, GREEN,
            "middle")

    # ---- row E: keepers, deliberately unattached ------------------------
    ky, kh = 934, 158
    cv.text(710, 920, "back off-chain — these run on a server, on a timer, "
            "with no user involved", 12, FAINT, "middle")
    cv.rect(c1, ky, 1340, kh, stroke=YELLOW, fill=YELLOW, fill_op=0.09,
            sw=2.8, r=16, hachure_gap=13)
    cv.text(710, ky + 32, "PYTHON KEEPERS  ·  scheduler.py supervises three "
            "loops and restarts any that dies", 17, YELLOW, "middle",
            "bold")
    for x, name, cadence, call, col in [
            (270, "oracle_keeper", "every 60s",
             "MockPriceOracle.setEthPrice", TEAL),
            (710, "settlement_keeper", "every 30s",
             "SwapEngine.settleSwap", ORANGE),
            (1150, "liquidation_keeper", "every 30s",
             "LoanManager.liquidate", GREEN)]:
        cv.text(x, ky + 68, name, 15, INK, "middle", "bold", MONO)
        cv.text(x, ky + 92, cadence, 13, DIM, "middle")
        cv.text(x, ky + 116, "→ " + call, 12, col, "middle", "bold", MONO)

    # ---- footer ---------------------------------------------------------
    cv.text(710, 1132, "Reads are free and instant. Writes need your "
            "signature. Nothing in the interface is mock data.", 15, DIM,
            "middle")
    cv.text(710, 1158, "Colour = domain. Solid arrows are on-chain calls; "
            "dashed arrows cross the boundary between chain and outside world.",
            13, FAINT, "middle", "normal", HAND, 0.95)

    cv.save(path)


# ===================================================================== 4
def payoff(path):
    print("swap-payoff.svg")
    W, H = 1300, 760
    cv = Canvas(W, H, BG)

    cv.text(W / 2, 50, "How one swap period is netted",
            29, INK, "middle", "bold", HAND)
    cv.text(W / 2, 80, "$100,000 notional  ·  30-day periods  ·  you pay "
            "fixed 10%", 15, DIM, "middle")

    # ---- chart ---------------------------------------------------------
    px, py, pw, ph = 70, 112, W - 140, 380
    cv.rect(px, py, pw, ph, stroke="#39415f", fill=PANEL, fill_op=0.8,
            sw=2.0, r=14)

    zero = py + ph * 0.56
    cv.line(px + 60, zero, px + pw - 24, zero, DIM, 2.0, 1.0, 1)
    cv.text(px + 44, zero + 5, "0", 14, DIM, "end", "normal", MONO)
    cv.text(px + 18, py + 96, "you", 12, GREEN, "middle")
    cv.text(px + 18, py + 114, "gain", 12, GREEN, "middle")
    cv.text(px + 18, py + ph - 96, "you", 12, PINK, "middle")
    cv.text(px + 18, py + ph - 78, "pay", 12, PINK, "middle")

    # floating rate per period, and the resulting net flow.
    periods = [
        ("P1", 6.0, "6%"), ("P2", 8.0, "8%"), ("P3", 10.0, "10%"),
        ("P4", 14.0, "14%"), ("P5", 25.0, "25%"), ("P6", 18.0, "18%"),
    ]
    n = len(periods)
    span = pw - 120
    bw = 62
    for i, (name, floating, label) in enumerate(periods):
        cx = px + 84 + span * (i + 0.5) / n
        # net = (floating - fixed) as a fraction of a full 10-point move
        net = (floating - 10.0) / 15.0
        hgt = abs(net) * 150.0
        usd = abs(floating - 10.0) / 100.0 * 100000 * 30 / 365.0

        if abs(floating - 10.0) < 0.01:
            cv.text(cx, zero - 18, "nothing to pay", 13, DIM, "middle",
                    "bold")
            cv.text(cx, zero + 26, "the legs cancel", 12, FAINT, "middle")
        elif net > 0:
            cv.rect(cx - bw / 2, zero - hgt, bw, hgt, stroke=GREEN,
                    fill=GREEN, fill_op=0.20, sw=2.2, r=6, amp=1.1,
                    hachure_gap=8)
            cv.text(cx, zero - hgt - 12, "+%.0f" % usd, 14, GREEN,
                    "middle", "bold", MONO)
        else:
            cv.rect(cx - bw / 2, zero, bw, hgt, stroke=PINK, fill=PINK,
                    fill_op=0.20, sw=2.2, r=6, amp=1.1, hachure_gap=8)
            cv.text(cx, zero + hgt + 22, "−%.0f" % usd, 14, PINK,
                    "middle", "bold", MONO)

        cv.text(cx, py + ph - 20, name, 14, INK, "middle", "bold", MONO)
        cv.text(cx, py + ph - 40, "float " + label, 12, DIM, "middle")

    cv.text(px + pw - 30, py + 30, "fixed leg = 10%  (flat, by "
            "definition)", 13, ORANGE, "end")

    # ---- how to read it -------------------------------------------------
    wy, wh = 528, 196
    cv.rect(70, wy, W - 140, wh, stroke=YELLOW, fill=YELLOW, fill_op=0.09,
            sw=2.6, r=16, hachure_gap=14)
    cv.text(W / 2, wy + 34, "How to read this chart", 20, YELLOW, "middle",
            "bold")
    rows = [
        "One bar per period. NettingEngine works out both legs and only the "
        "difference between them moves.",
        "Pink — floating came in under 10%, so the fixed leg was the pricey "
        "one and you top up the gap.",
        "Green — floating overshot 10%, so the swap hands the excess back "
        "and your borrowing cost stays put.",
        "That is the whole point of the hedge: 10% a year, whichever way the "
        "market decides to move.",
    ]
    for i, row in enumerate(rows):
        col = INK if i != 3 else GREEN
        cv.text(W / 2, wy + 68 + i * 30, row, 14.5, col, "middle",
                "bold" if i == 3 else "normal")

    cv.save(path)


# ===================================================================== go
if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    banner(os.path.join(out, "banner.svg"))
    swap_explained(os.path.join(out, "swap-explained.svg"))
    architecture(os.path.join(out, "architecture.svg"))
    payoff(os.path.join(out, "swap-payoff.svg"))
    print("done")
