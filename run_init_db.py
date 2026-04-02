import os
import sys

# Add current directory to path
sys.path.append(os.getcwd())

# Set connection string (Direct)
os.environ["DATABASE_URL"] = "postgresql+asyncpg://postgres:MasterGPT_2026_Secure!@#@db.twxrhonaggstumvbrdpp.supabase.co:5432/postgres"

from backend.database.init_db import init_db
import asyncio

if __name__ == "__main__":
    asyncio.run(init_db())
