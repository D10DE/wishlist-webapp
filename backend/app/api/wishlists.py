# backend/app/api/wishlists.py
from fastapi import APIRouter, HTTPException, status, Depends
from app.db import fetch_one, fetch_all, execute
from app.models import WishlistCreate, WishlistUpdate, WishlistOut
from typing import List
from uuid import UUID
from app.auth import get_current_user

router = APIRouter(prefix="/api/wishlists", tags=["wishlists"])

def _row_to_dict(row) -> dict:
    return {
        "id": str(row["id"]),
        "owner_id": str(row["owner_id"]),
        "title": row["title"],
        "description": row["description"],
        "is_public": row["is_public"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }

@router.post("/", response_model=WishlistOut, status_code=status.HTTP_201_CREATED)
async def create_wishlist(data: WishlistCreate, current_user: dict = Depends(get_current_user)):
    """Create a new wishlist and its associated share_settings."""
    
    row = await fetch_one(
        """INSERT INTO wishlists (owner_id, title, description, is_public)
           VALUES ($1, $2, $3, $4)
           RETURNING id, owner_id, title, description, is_public, created_at, updated_at""",
        current_user["id"], data.title, data.description, data.is_public
    )
    
    await execute("INSERT INTO share_settings (wishlist_id) VALUES ($1)", row["id"])

    return _row_to_dict(row)

@router.get("/", response_model=List[WishlistOut])
async def list_my_wishlists(current_user: dict = Depends(get_current_user)):
    """Return all wishlists belonging to the dummy user."""
    rows = await fetch_all(
        """SELECT id, owner_id, title, description, is_public, created_at, updated_at
           FROM wishlists WHERE owner_id = $1 ORDER BY created_at DESC""",
        current_user["id"]
    )
    return [_row_to_dict(r) for r in rows]

@router.get("/{wishlist_id}", response_model=WishlistOut)
async def get_wishlist(
    wishlist_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    row = await fetch_one(
        """SELECT id, owner_id, title, description, is_public, created_at, updated_at
           FROM wishlists WHERE id = $1 AND owner_id = $2""",
        wishlist_id, current_user["id"]
    )
    if not row:
        raise HTTPException(status_code=404, detail="Wishlist not found")
    return _row_to_dict(row)

@router.put("/{wishlist_id}", response_model=WishlistOut)
async def update_wishlist(
    wishlist_id: UUID,
    data: WishlistUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update wishlist fields (partial update)."""
    # Build dynamic SET clause
    fields = []
    values = []
    idx = 1

    if data.title is not None:
        fields.append(f"title = ${idx}"); values.append(data.title); idx += 1
    if data.description is not None:
        fields.append(f"description = ${idx}"); values.append(data.description); idx += 1
    if data.is_public is not None:
        fields.append(f"is_public = ${idx}"); values.append(data.is_public); idx += 1

    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to update")

    values.append(wishlist_id)
    values.append(current_user["id"])
    query = f"""
        UPDATE wishlists SET {', '.join(fields)}
        WHERE id = ${idx} AND owner_id = ${idx+1}
        RETURNING id, owner_id, title, description, is_public, created_at, updated_at
    """
    row = await fetch_one(query, *values)
    if not row:
        raise HTTPException(status_code=404, detail="Wishlist not found or not yours")
    return _row_to_dict(row)

@router.delete("/{wishlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wishlist(
    wishlist_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    result = await execute(
        "DELETE FROM wishlists WHERE id = $1 AND owner_id = $2",
        wishlist_id, current_user["id"]
    )
    # execute() returns the command tag string, like "DELETE 1"
    if "0" in result:   # Simple check, could parse, but we’ll trust the tag
        raise HTTPException(status_code=404, detail="Wishlist not found or not yours")
    return None