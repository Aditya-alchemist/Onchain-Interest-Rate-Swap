declare namespace NodeJS {
  interface ProcessEnv {
    readonly REACT_APP_CHAIN_ID: string;
    readonly REACT_APP_SEPOLIA_RPC_URL: string;

    readonly REACT_APP_MOCK_USDC: string;
    readonly REACT_APP_PRICE_ORACLE: string;
    readonly REACT_APP_GOVERNANCE: string;
    readonly REACT_APP_INTEREST_RATE_MODEL: string;
    readonly REACT_APP_COLLATERAL_VAULT: string;
    readonly REACT_APP_LENDING_POOL: string;
    readonly REACT_APP_LOAN_MANAGER: string;
    readonly REACT_APP_LOAN_NFT: string;
    readonly REACT_APP_POSITION_REGISTRY: string;

    readonly REACT_APP_SWAP_NFT: string;
    readonly REACT_APP_SWAP_FACTORY: string;
    readonly REACT_APP_SWAP_ENGINE: string;

    readonly REACT_APP_SETTLEMENT_ENGINE: string;
    readonly REACT_APP_NETTING_ENGINE: string;
    readonly REACT_APP_ESCROW_MANAGER: string;
    readonly REACT_APP_DVP_ENGINE: string;

    readonly REACT_APP_LIQUIDATION_ENGINE: string;
  }
}