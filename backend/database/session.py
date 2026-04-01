from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# Database URL for SQLite (async)
# Note: On Vercel, we use /tmp/ because the root filesystem is read-only.
# This makes the database ephemeral (cleared on cold starts).
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:////tmp/sql_app.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
