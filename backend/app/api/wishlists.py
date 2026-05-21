# backend/app/api/wishlists.py
from fastapi import APIRouter, HTTPException, status
from app.db import fetch_one, fetch_all, execute
from app.models import WishlistCreate, WishlistUpdate, WishlistOut
from typing import List
from uuid import UUID

router = APIRouter(prefix="/api/wishlists", tags=["wishlists"])

# Dummy user – will be replaced by authenticated user ID later
DUMMY_USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

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
async def create_wishlist(data: WishlistCreate):
    """Create a new wishlist and its associated share_settings."""
    # 1. Insert wishlist, get its public UUID
    row = await fetch_one(
        """
        INSERT INTO wishlists (owner_id, title, description, is_public)
        VALUES ($1, $2, $3, $4)
        RETURNING id, owner_id, title, description, is_public,
                  created_at, updated_at
        """,
        DUMMY_USER_ID, data.title, data.description, data.is_public
    )

    # 2. Create the default share_settings row (all defaults)
    await execute(
        "INSERT INTO share_settings (wishlist_id) VALUES ($1)",
        row["id"]
    )

    return _row_to_dict(row)

@router.get("/", response_model=List[WishlistOut])
async def list_my_wishlists():
    """Return all wishlists belonging to the dummy user."""
    rows = await fetch_all(
        """SELECT id, owner_id, title, description, is_public,
                  created_at, updated_at
           FROM wishlists
           WHERE owner_id = $1
           ORDER BY created_at DESC""",
        DUMMY_USER_ID
    )
    return [
        _row_to_dict(r)
        for r in rows
    ]

@router.get("/{wishlist_id}", response_model=WishlistOut)
async def get_wishlist(wishlist_id: UUID):
    """Get a single wishlist by its id (only if owned by dummy user)."""
    row = await fetch_one(
        """SELECT id, owner_id, title, description, is_public,
                  created_at, updated_at
           FROM wishlists
           WHERE id = $1 AND owner_id = $2""",
        str(wishlist_id), DUMMY_USER_ID
    )
    if not row:
        raise HTTPException(status_code=404, detail="Wishlist not found")
    return _row_to_dict(row)

@router.put("/{wishlist_id}", response_model=WishlistOut)
async def update_wishlist(wishlist_id: UUID, data: WishlistUpdate):
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

    values.append(str(wishlist_id))
    values.append(DUMMY_USER_ID)

    query = f"""
        UPDATE wishlists
        SET {', '.join(fields)}
        WHERE id = ${idx} AND owner_id = ${idx+1}
        RETURNING id, owner_id, title, description, is_public,
                  created_at, updated_at
    """
    row = await fetch_one(query, *values)
    if not row:
        raise HTTPException(status_code=404, detail="Wishlist not found or not yours")
    return _row_to_dict(row)

@router.delete("/{wishlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wishlist(wishlist_id: UUID):
    """Delete a wishlist (cascade will delete items, bookings, share_settings)."""
    result = await execute(
        "DELETE FROM wishlists WHERE id = $1 AND owner_id = $2",
        str(wishlist_id), DUMMY_USER_ID
    )
    # execute() returns the command tag string, like "DELETE 1"
    if "0" in result:   # Simple check, could parse, but we’ll trust the tag
        raise HTTPException(status_code=404, detail="Wishlist not found or not yours")
    return None