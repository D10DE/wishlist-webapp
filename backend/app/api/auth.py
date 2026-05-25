# backend/app/api/auth.py
from fastapi import APIRouter, HTTPException, status
from app.models import UserRegister, UserLogin, TokenResponse
from app.db import fetch_one, execute
from app.auth import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister):
    # Check if email already exists
    existing = await fetch_one("SELECT id FROM users WHERE email = $1", data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Hash the password
    hashed = hash_password(data.password)

    # Insert new user
    row = await fetch_one(
        """INSERT INTO users (email, phone, username, hashed_password, is_active)
           VALUES ($1, $2, $3, $4, TRUE)
           RETURNING id, email, phone, username, is_active""",
        data.email, data.phone, data.username, hashed
    )

    # Create JWT
    token = create_access_token({"sub": str(row["id"])})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(row["id"]),
            "email": row["email"],
            "phone": row["phone"],
            "username": row["username"]
        }
    }

@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    # Find user by email
    user = await fetch_one(
        "SELECT id, email, phone, username, hashed_password, is_active FROM users WHERE email = $1",
        data.email
    )
    if not user or not user["is_active"]:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Verify password
    if not verify_password(data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user["id"])})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "phone": user["phone"],
            "username": user["username"]
        }
    }