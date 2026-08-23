/**
 * Environment-contract tests.
 *
 * These are deliberately written in plain JavaScript, not TypeScript: the
 * project has no `@types/jest`, and tsconfig.json pins
 * `types: ["node", "react", "react-dom"]`, so a .ts test file would fail
 * `tsc --noEmit` on the `describe`/`it`/`expect` globals. `allowJs` is on
 * with `checkJs` off, so a .js test is included in the program but not
 * type-checked — exactly what we want.
 *
 * Nothing here renders a component. Importing <App /> would pull in wagmi,
 * viem and RainbowKit, which ship ESM that CRA's jest transform does not
 * process, so a render test would fail for reasons unrelated to the code
 * under test. What IS worth testing without a browser is the wiring between
 * the deployed contract addresses, .env.example, and the code that reads
 * them — a mismatch there is silent (an address just becomes `undefined`)
 * and has already bitten this repo once, in the bots' ORACLE_MAX_STALENESS
 * vs ORACLE_MAX_STALE_AGE drift.
 */

const fs = require("fs");
const path = require("path");

const LIB_DIR = __dirname; // frontend/src/lib
const SRC_DIR = path.join(LIB_DIR, "..");
const FRONTEND_DIR = path.join(SRC_DIR, "..");

/** The contracts the protocol cannot run without. */
const EXPECTED_ADDRESS_KEYS = [
  // core lending
  "MOCK_USDC",
  "PRICE_ORACLE",
  "GOVERNANCE",
  "INTEREST_RATE_MODEL",
  "COLLATERAL_VAULT",
  "LENDING_POOL",
  "LOAN_MANAGER",
  "LOAN_NFT",
  "POSITION_REGISTRY",
  // swaps
  "SWAP_NFT",
  "SWAP_FACTORY",
  "SWAP_ENGINE",
  // settlement
  "SETTLEMENT_ENGINE",
  "NETTING_ENGINE",
  "ESCROW_MANAGER",
  "DVP_ENGINE",
  // liquidation
  "LIQUIDATION_ENGINE",
];

/** Every REACT_APP_* name appearing anywhere under src/. */
function collectReferencedEnvNames(dir) {
  const found = new Set();
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") stack.push(full);
        continue;
      }
      if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
      // Skip test files. They are not app code that reads configuration, and
      // this very file names a deliberately-wrong variable in a comment to
      // explain the check below — scanning it would report that as a real
      // reference and fail on nothing.
      if (/\.(test|spec)\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;

      const text = fs.readFileSync(full, "utf8");
      for (const match of text.match(/REACT_APP_[A-Z0-9_]+/g) || []) {
        found.add(match);
      }
    }
  }
  return found;
}

/** Every REACT_APP_* name assigned in .env.example. */
function collectDocumentedEnvNames() {
  const text = fs.readFileSync(path.join(FRONTEND_DIR, ".env.example"), "utf8");
  const found = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(REACT_APP_[A-Z0-9_]+)\s*=/.exec(line);
    if (match) found.add(match[1]);
  }
  return found;
}

/** Swap in env vars, re-import the module fresh, restore. */
function withEnv(overrides, assertion) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    jest.resetModules();
    // eslint-disable-next-line global-require
    assertion(require("./addresses"));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.resetModules();
  }
}

describe("lib/addresses", () => {
  it("exposes exactly the contracts the protocol needs", () => {
    // eslint-disable-next-line global-require
    const { ADDRESSES } = require("./addresses");
    expect(Object.keys(ADDRESSES).sort()).toEqual(
      [...EXPECTED_ADDRESS_KEYS].sort()
    );
  });

  it("maps every key to the identically named REACT_APP_ variable", () => {
    // A typo like `LOAN_NFT: process.env.REACT_APP_LOAN_NFT_ADDRESS` produces
    // `undefined`, and every call against that contract then fails at runtime
    // with no clue as to why. Reading the source is the only way to catch it,
    // because both the correct and the mistyped version type-check.
    const source = fs.readFileSync(path.join(LIB_DIR, "addresses.ts"), "utf8");
    const mismatched = [];

    for (const key of EXPECTED_ADDRESS_KEYS) {
      const pattern = new RegExp(
        `\\b${key}\\s*:\\s*process\\.env\\.(REACT_APP_[A-Z0-9_]+)`
      );
      const match = pattern.exec(source);
      if (!match) {
        mismatched.push(`${key}: not assigned from process.env at all`);
      } else if (match[1] !== `REACT_APP_${key}`) {
        mismatched.push(`${key}: reads ${match[1]}, expected REACT_APP_${key}`);
      }
    }

    expect(mismatched).toEqual([]);
  });

  it("defaults CHAIN_ID to Sepolia when the variable is absent", () => {
    withEnv({ REACT_APP_CHAIN_ID: undefined }, ({ CHAIN_ID }) => {
      expect(CHAIN_ID).toBe(11155111);
    });
  });

  it("honours an explicit CHAIN_ID override", () => {
    withEnv({ REACT_APP_CHAIN_ID: "84532" }, ({ CHAIN_ID }) => {
      expect(CHAIN_ID).toBe(84532);
    });
  });

  it("never yields NaN for CHAIN_ID on an empty variable", () => {
    // `Number("")` is 0, not NaN — `""` is falsy so the `||` fallback fires.
    // Worth pinning: an empty line in .env is the most likely way this breaks.
    withEnv({ REACT_APP_CHAIN_ID: "" }, ({ CHAIN_ID }) => {
      expect(CHAIN_ID).toBe(11155111);
    });
  });
});

describe(".env.example", () => {
  it("documents every REACT_APP_ variable the app reads", () => {
    const referenced = collectReferencedEnvNames(SRC_DIR);
    const documented = collectDocumentedEnvNames();
    const undocumented = [...referenced].filter((n) => !documented.has(n));

    expect(undocumented.sort()).toEqual([]);
  });

  it("does not document variables nothing reads", () => {
    const referenced = collectReferencedEnvNames(SRC_DIR);
    const documented = collectDocumentedEnvNames();
    const unused = [...documented].filter((n) => !referenced.has(n));

    expect(unused.sort()).toEqual([]);
  });
});
