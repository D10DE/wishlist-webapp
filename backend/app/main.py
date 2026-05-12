from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI(title="Wishlist WebApp", version="0.1.0")

# Serve frontend & static files
BASE_DIR = Path(__file__).resolve().parent.parent
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

@app.get("/")
async def root():
    return {"message": "Wishlist API is running. Open frontend/index.html in browser or mount via reverse proxy."}

@app.get("/api/health")
async def health():
    return {"status": "ok"}