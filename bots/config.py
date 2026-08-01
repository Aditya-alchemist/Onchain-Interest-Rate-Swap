import os

from dotenv import load_dotenv

load_dotenv()

RPC_URL = os.getenv('RPC_URL', '')
PRIVATE_KEY = os.getenv('PRIVATE_KEY', '')
