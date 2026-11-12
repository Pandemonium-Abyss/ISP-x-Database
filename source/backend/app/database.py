import asyncio
import os
from collections.abc import AsyncIterator

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.model import Base

load_dotenv()

cn: str | None = os.environ.get("DATABASE_URL")
if not cn:
    raise ValueError("DATABASE_URL is missing from .env")

engine = create_async_engine(
    cn,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

async def getSession() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session

async def create_tables() -> None:
    async with engine.begin() as conn:
        # auth.users is ours now rather than Supabase's, so the schema that
        # holds it has to exist before create_all can put it there.
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS auth"))
        await conn.run_sync(Base.metadata.create_all)

async def setup() -> None:
    await create_tables()

if __name__ == "__main__":
    asyncio.run(setup())
