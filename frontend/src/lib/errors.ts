/**
 * ============================================================
 * Revert decoding
 * ============================================================
 *
 * ethers v6 only auto-decodes a custom error when the error is declared in
 * the ABI of the contract you called. That is almost never true here:
 * `LoanManager.repay()` internally calls MockUSDC, LendingPool, SwapEngine,
 * SwapFactory, PositionRegistry and SwapNFT — so a revert thrown by any of
 * those surfaces as the useless string "transaction execution reverted".
 *
 * This module builds one selector -> ErrorFragment table across EVERY ABI in
 * the project (plus the two builtin errors) so any revert raised anywhere in
 * the call tree can be named, and then maps the ones users actually hit onto
 * plain-English, actionable messages.
 */

import { AbiCoder, ErrorFragment, Interface } from "ethers";

import { ABIS } from "./contracts";

// ------------------------------------------------------------
// Builtin errors
// ------------------------------------------------------------

const ERROR_STRING_SELECTOR = "0x08c379a0"; // Error(string)
const PANIC_SELECTOR = "0x4e487b71"; // Panic(uint256)

/** Solidity panic codes — see docs "Panic via assert and require". */
const PANIC_REASONS: Record<string, string> = {
  "0x00": "generic compiler panic",
  "0x01": "assert() failed",
  "0x11": "arithmetic overflow or underflow",
  "0x12": "division or modulo by zero",
  "0x21": "invalid value cast to an enum",
  "0x22": "malformed storage byte array",
  "0x31": "pop() on an empty array",
  "0x32": "array index out of bounds",
  "0x41": "out of memory",
  "0x51": "call to an uninitialised internal function",
};

// ------------------------------------------------------------
// Selector table, built once from every ABI we ship
// ------------------------------------------------------------

export interface DecodedRevert {
  /** Error name as declared in Solidity, e.g. "ERC20InsufficientBalance". */
  name: string;
  /** Contract whose ABI declared it, when known. */
  source?: string;
  /** Decoded arguments, stringified so they are safe to render. */
  args: string[];
  /** 4-byte selector, useful when the name could not be resolved. */
  selector: string;
}

interface TableEntry {
  fragment: ErrorFragment;
  source: string;
}

let selectorTable: Map<string, TableEntry> | null = null;

function buildSelectorTable(): Map<string, TableEntry> {
  const table = new Map<string, TableEntry>();

  for (const [source, abi] of Object.entries(ABIS)) {
    let iface: Interface;
    try {
      iface = new Interface(abi as any);
    } catch {
      continue;
    }

    iface.forEachError((fragment) => {
      // First ABI to claim a selector wins; collisions across contracts are
      // the same error shape anyway (e.g. every OZ contract declares
      // OwnableUnauthorizedAccount identically).
      if (!table.has(fragment.selector)) {
        table.set(fragment.selector, { fragment, source });
      }
    });
  }

  return table;
}

function getSelectorTable(): Map<string, TableEntry> {
  if (!selectorTable) selectorTable = buildSelectorTable();
  return selectorTable;
}

// ------------------------------------------------------------
// Pulling revert data out of whatever ethers/MetaMask handed us
// ------------------------------------------------------------

const HEX_DATA = /^0x[0-9a-fA-F]*$/;

function asRevertData(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!HEX_DATA.test(value)) return null;
  // 0x alone means "reverted with no data" — nothing to decode.
  if (value.length < 10) return null;
  return value;
}

/**
 * Walk the error object looking for the raw revert payload. Providers bury it
 * in wildly different places: ethers puts it on `.data`, MetaMask nests it
 * under `.info.error.data`, some RPCs use `.error.data.originalError.data`,
 * and JSON-RPC batches use `.data.data`.
 */
export function extractRevertData(error: unknown, depth = 0): string | null {
  if (!error || typeof error !== "object" || depth > 6) return null;

  const node = error as Record<string, any>;

  const direct =
    asRevertData(node.data) ||
    asRevertData(node.returnData) ||
    asRevertData(node.result);
  if (direct) return direct;

  for (const key of ["info", "error", "cause", "originalError", "data", "value"]) {
    const child = node[key];
    if (child && typeof child === "object") {
      const found = extractRevertData(child, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

// ------------------------------------------------------------
// Decoding
// ------------------------------------------------------------

function stringifyArg(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(stringifyArg).join(", ");
  return String(value);
}

export function decodeRevertData(data: string | null): DecodedRevert | null {
  if (!data) return null;

  const selector = data.slice(0, 10).toLowerCase();
  const coder = AbiCoder.defaultAbiCoder();

  if (selector === ERROR_STRING_SELECTOR) {
    try {
      const [reason] = coder.decode(["string"], "0x" + data.slice(10));
      return { name: "Error", args: [String(reason)], selector };
    } catch {
      return { name: "Error", args: [], selector };
    }
  }

  if (selector === PANIC_SELECTOR) {
    try {
      const [code] = coder.decode(["uint256"], "0x" + data.slice(10));
      const hex = "0x" + BigInt(code).toString(16).padStart(2, "0");
      return { name: "Panic", args: [hex, PANIC_REASONS[hex] || "unknown panic"], selector };
    } catch {
      return { name: "Panic", args: [], selector };
    }
  }

  const entry = getSelectorTable().get(selector);
  if (!entry) return null;

  let args: string[] = [];
  try {
    const decoded = coder.decode(entry.fragment.inputs, "0x" + data.slice(10));
    args = decoded.map(stringifyArg);
  } catch {
    args = [];
  }

  return { name: entry.fragment.name, source: entry.source, args, selector };
}

// ------------------------------------------------------------
// Friendly messages
// ------------------------------------------------------------

const USDC = (raw?: string) => {
  if (!raw) return "";
  try {
    const n = Number(BigInt(raw)) / 1e6;
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return raw;
  }
};

/**
 * Every error a user can realistically trigger, phrased as "what happened and
 * what to do about it". Anything not listed still gets its Solidity name,
 * which is far better than "transaction execution reverted".
 */
const FRIENDLY: Record<string, (args: string[]) => string> = {
  // ---- ERC-20 (MockUSDC) --------------------------------------------------
  ERC20InsufficientBalance: (a) =>
    `Not enough USDC. This transaction needs ${USDC(a[2])} USDC but that wallet only holds ${USDC(
      a[1]
    )} USDC. Withdraw from the lending pool or escrow first, or mint test USDC on the Admin page.`,
  ERC20InsufficientAllowance: (a) =>
    `The USDC approval is too small — approved ${USDC(a[1])} USDC, needs ${USDC(
      a[2]
    )} USDC. Re-run the action so the approval step runs again.`,
  ERC20InvalidReceiver: () => "That recipient address cannot receive USDC.",
  ERC20InvalidSender: () => "That sender address cannot send USDC.",

  // ---- Access control ----------------------------------------------------
  OwnableUnauthorizedAccount: () =>
    "Owner-only action. Your wallet is not the contract owner, so this call is rejected on-chain.",
  Unauthorized: () =>
    "This contract only accepts that call from another HedgeFi contract, not directly from a wallet. Use the matching action in the UI instead.",
  UnauthorizedLiquidationEngine: () =>
    "Liquidations must go through the LiquidationEngine, not LoanManager directly.",
  AccessControlUnauthorizedAccount: () => "Your wallet does not hold the role this action requires.",

  // ---- Lending -----------------------------------------------------------
  NoActiveLoan: () => "There is no active loan for this wallet, so there is nothing to repay.",
  LoanAlreadyExists: () =>
    "You already have an open loan. HedgeFi allows one loan per wallet — repay it before opening another.",
  ZeroCollateral: () => "Send some ETH as collateral to open a loan.",
  ZeroBorrow: () => "Enter a borrow amount greater than zero.",
  ExceedsBorrowLimit: () =>
    "That borrow exceeds the 75% collateral factor. Lower the amount or add more ETH collateral.",
  LoanHealthy: () => "That position is healthy (health factor ≥ 100%) and cannot be liquidated.",
  InsufficientLiquidatorFunds: () => "A liquidator needs enough USDC to cover the full debt.",
  InsufficientLiquidity: () =>
    "The pool does not have enough free USDC right now — borrowers are using it. Try a smaller amount.",
  InsufficientBalance: () => "That exceeds your balance in this contract.",
  ZeroAmount: () => "Enter an amount greater than zero.",
  InvalidAddress: () => "One of the configured contract addresses is the zero address.",

  // ---- Swaps -------------------------------------------------------------
  ActiveSwapExists: () =>
    "This loan already has an open hedge. Close the existing swap before opening a new one.",
  SwapNotActive: () =>
    "That swap is no longer active — it has already matured or been closed, so it cannot be settled.",
  SettlementNotDue: () =>
    "Too early to settle. The settlement interval you chose has not elapsed yet — wait for the next window (the keeper bot settles automatically once it is due).",
  NotDue: () =>
    "Too early to settle. The settlement interval has not elapsed yet since the last settlement.",
  SwapMatured: () => "This swap has reached maturity and can no longer be settled.",
  InvalidNotional: () => "Enter a hedge notional greater than zero.",
  InvalidRate: () => "The fixed rate must be between 0% and 100%.",
  InvalidMaturity: () => "The hedge duration must end in the future.",
  InvalidSettlementInterval: () => "Pick a settlement interval greater than zero.",
  NoSwapForLoan: () => "This loan has no hedge attached.",
  PositionAlreadyLinked: () => "That loan is already linked to a swap position.",
  PositionNotLinked: () =>
    "The loan/swap link is missing on-chain, so the hedge cannot be closed automatically.",

  // ---- Escrow / DvP ------------------------------------------------------
  InsufficientAvailable: () =>
    "Not enough free escrow balance. Some of it is locked against a pending settlement.",
  InsufficientLocked: () => "The escrow does not have that much locked.",
  SettlementAlreadyExecuted: () => "That settlement has already been executed.",
  SettlementNotFound: () => "No settlement exists with that id.",

  // ---- Builtins ----------------------------------------------------------
  Error: (a) => a[0] || "The transaction reverted.",
  Panic: (a) =>
    a[1] === "arithmetic overflow or underflow"
      ? "On-chain arithmetic overflowed (Panic 0x11). This is a contract bug, not a wallet problem — see the known-issues section of the README."
      : `Solidity panic ${a[0] || ""}: ${a[1] || "unknown"}.`,
};

/** Errors where the raw ethers text is more useful than our generic fallback. */
const WALLET_HINTS: Array<[RegExp, string]> = [
  [/user rejected|user denied|action_rejected/i, "You rejected the transaction in your wallet."],
  [
    /insufficient funds for (intrinsic transaction cost|gas)/i,
    "Not enough Sepolia ETH to pay gas. Top up from a Sepolia faucet.",
  ],
  [/nonce too low|replacement transaction underpriced/i, "A pending transaction is in the way. Wait for it to confirm (or speed it up in your wallet) and retry."],
  [/network changed|underlying network changed|chain.?id/i, "Your wallet switched networks mid-transaction. Switch back to Sepolia and retry."],
  [/could not coalesce|missing revert data/i, "The RPC could not simulate this call. Check your Sepolia RPC URL and retry."],
  [/invalid bignumberish/i, "One of the numeric fields was blank or not a number. Fill in every field and retry."],
  [/timeout|timed out|econnreset|failed to fetch|networkerror/i, "The Sepolia RPC did not respond. Check your connection and retry."],
];

/**
 * Turn any thrown value into a message worth showing a user.
 *
 * @param error    whatever was caught
 * @param fallback message when nothing better can be derived
 */
export function describeError(error: unknown, fallback = "Transaction failed."): string {
  if (!error) return fallback;

  if (typeof error === "string") return error;

  const err = error as { shortMessage?: string; reason?: string; message?: string; code?: string };

  // 1. A decoded revert beats every generic string.
  const decoded = decodeRevertData(extractRevertData(error));
  if (decoded) {
    const friendly = FRIENDLY[decoded.name];
    if (friendly) return friendly(decoded.args);

    const detail = decoded.args.filter(Boolean).join(", ");
    const where = decoded.source ? ` (${decoded.source})` : "";
    return `Reverted with ${decoded.name}${detail ? `(${detail})` : ""}${where}.`;
  }

  // 2. ethers already decoded it for us via the called contract's own ABI.
  const revert = (error as any)?.revert;
  if (revert?.name) {
    const friendly = FRIENDLY[revert.name];
    if (friendly) {
      const args = Array.from(revert.args ?? []).map(stringifyArg);
      return friendly(args);
    }
    return `Reverted with ${revert.name}.`;
  }

  const raw = err.shortMessage || err.reason || err.message || "";

  // 3. Known wallet / RPC conditions.
  for (const [pattern, message] of WALLET_HINTS) {
    if (pattern.test(raw) || pattern.test(String(err.code ?? ""))) return message;
  }

  // 4. A bare "execution reverted" tells the user nothing — say so honestly.
  if (/execution reverted/i.test(raw) && raw.length < 60) {
    return "The transaction reverted and the node returned no reason. The most common causes are an insufficient USDC balance, a settlement window that has not opened yet, or a position that changed since the page loaded — hit refresh and check the numbers.";
  }

  return raw || fallback;
}

/** Same as describeError but returns an Error so it can be thrown/stored. */
export function toDisplayError(error: unknown, fallback = "Transaction failed."): Error {
  if (error instanceof Error && (error as any).__hedgefiDisplay) return error;
  const wrapped = new Error(describeError(error, fallback));
  (wrapped as any).__hedgefiDisplay = true;
  (wrapped as any).cause = error;
  return wrapped;
}

/** True when the user simply clicked "Reject" — not worth a scary red toast. */
export function isUserRejection(error: unknown): boolean {
  const err = error as { code?: string | number; message?: string; shortMessage?: string };
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001) return true;
  const raw = `${err?.shortMessage ?? ""} ${err?.message ?? ""}`;
  return /user rejected|user denied|action_rejected/i.test(raw);
}

export default describeError;
