import os

from dotenv import load_dotenv

load_dotenv()

PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")
RPC_URL = os.getenv("RPC_URL", "")
LENDING_POOL = os.getenv("LENDING_POOL", "")
LOAN_MANAGER = os.getenv("LOAN_MANAGER", "")
SWAP_ENGINE = os.getenv("SWAP_ENGINE", "")
SETTLEMENT_ENGINE = os.getenv("SETTLEMENT_ENGINE", "")
DVP_ENGINE = os.getenv("DVP_ENGINE", "")
ORACLE = os.getenv("ORACLE", "")
