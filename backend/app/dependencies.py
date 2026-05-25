# backend/app/dependencies.py
from uuid import UUID
from fastapi import HTTPException, Depends, status
from app.db import fetch_one
from app.auth import get_current_user

async def get_wishlist_owner(
    wishlist_id: UUID,
    current_user: dict = Depends(get_current_user)
) -> str:
    """
    Dependency that verifies the wishlist exists and belongs to the current user.
    Returns the owner's user ID (string).
    """
    row = await fetch_one(
        "SELECT owner_id FROM wishlists WHERE id = $1", wishlist_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Wishlist not found")
    if str(row["owner_id"]) != str(current_user["id"]):
        raise HTTPException(status_code=403, detail="Not your wishlist")
    return str(row["owner_id"])   # return the owner ID just in case