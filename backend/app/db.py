# backend/app/db.py
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

db_pool: asyncpg.Pool | None = None

async def init_db_pool():
    global db_pool
    db_pool = await asyncpg.create_pool(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        min_size=5,
        max_size=20,
        command_timeout=60
    )

async def close_db_pool():
    global db_pool
    if db_pool:
        await db_pool.close()

async def fetch_one(query: str, *args):
    async with db_pool.acquire() as conn:
        return await conn.fetchrow(query, *args)

async def fetch_all(query: str, *args):
    async with db_pool.acquire() as conn:
        return await conn.fetch(query, *args)

async def execute(query: str, *args):
    async with db_pool.acquire() as conn:
        return await conn.execute(query, *args)