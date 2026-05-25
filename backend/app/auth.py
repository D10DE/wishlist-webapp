# backend/app/auth.py
import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
from fastapi import HTTPException, status, Depends, Request
from fastapi.security import OAuth2PasswordBearer
from app.db import fetch_one

# Secret key for signing JWTs. In production, use a strong random value and keep it secret!
SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Password hashing 
def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plaintext password against a stored hash."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

# JWT 
def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Encode a JWT with an optional expiration."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns the payload or None if invalid."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

# FastAPI dependency 
async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    FastAPI dependency: extract and validate JWT from the Authorization header.
    Returns the user record from the database.
    """
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Token missing subject")

    user = await fetch_one(
        "SELECT id, email, phone, username, is_active FROM users WHERE id = $1",
        user_id
    )
    if not user or not user["is_active"]:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return dict(user)  # id, email, phone, username, is_active

async def get_optional_user(request: Request) -> dict | None:
    """Returns the current user if a valid token is present, otherwise None."""
    authorization: str = request.headers.get("Authorization")
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if payload is None:
        return None
    user = await fetch_one("SELECT id, email, phone, username, is_active FROM users WHERE id = $1", payload.get("sub"))
    if user and user["is_active"]:
        return dict(user)
    return None