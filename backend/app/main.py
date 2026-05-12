# backend/app/main.py
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from contextlib import asynccontextmanager

from app.db import init_db_pool, close_db_pool, fetch_one

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db_pool()
    print("✅ Database pool connected")
    yield
    # Shutdown
    await close_db_pool()
    print("🔌 Database pool closed")

app = FastAPI(title="Wishlist WebApp", version="0.1.0", lifespan=lifespan)

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Serve static files
static_dir = BASE_DIR / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Serve uploaded images
uploads_dir = BASE_DIR / "uploads" / "items"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Optional: serve frontend
frontend_dir = BASE_DIR / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

@app.get("/")
async def root():
    return {"message": "Wishlist API is running"}

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.get("/api/db-test")
async def db_test():
    result = await fetch_one("SELECT COUNT(*) FROM users")
    return {
        "success": True,
        "user_count": result["count"],
        "db": "PostgreSQL (asyncpg)",
        "tables": ["users", "wishlists", "items", "bookings", "share_settings"]
    }