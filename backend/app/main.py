# backend/app/main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI(title="Wishlist WebApp", version="0.1.0")

# BASE_DIR = project root (/opt/wishlist-webapp)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Serve static files from project root /static
static_dir = BASE_DIR / "static"
static_dir.mkdir(exist_ok=True)  # Auto-create if missing (dev convenience)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Optional: serve frontend directly (for dev; prod should use reverse proxy)
frontend_dir = BASE_DIR / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

@app.get("/")
async def root():
    return {"message": "Wishlist API is running. Visit /docs for API docs."}

@app.get("/api/health")
async def health():
    return {"status": "ok"}