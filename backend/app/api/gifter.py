# backend/app/api/gifter.py
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field, conint
from typing import Optional, List
from uuid import UUID
from app.db import fetch_one, fetch_all, execute
from datetime import datetime
from app.auth import get_current_user

router = APIRouter(prefix="/api/wishlists/{wishlist_id}/bookings", tags=["gifter"])

class BookingRequest(BaseModel):
    item_id: UUID
    is_anonymous: bool = True
    message: Optional[str] = None

class BookingOut(BaseModel):
    id: str
    wishlist_id: str
    item_id: str
    gifter_user_id: str
    is_anonymous: bool
    message: Optional[str]
    booked_at: datetime

def _row_to_booking(row) -> dict:
    return {
        "id": str(row["id"]),
        "wishlist_id": str(row["wishlist_id"]),
        "item_id": str(row["item_id"]),
        "gifter_user_id": str(row["gifter_user_id"]),
        "is_anonymous": row["is_anonymous"],
        "message": row["message"],
        "booked_at": row["booked_at"],
    }

@router.post("/", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def book_item(
    wishlist_id: UUID,
    data: BookingRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Book an item for a gifter. If gifter_id is not provided, use dummy gifter.
    In a real app, gifter_id comes from auth.
    """
    gifter = current_user["id"]

    # Check wishlist exists
    wishlist = await fetch_one("SELECT id FROM wishlists WHERE id = $1", wishlist_id)
    if not wishlist:
        raise HTTPException(status_code=404, detail="Wishlist not found")

    # Check item exists and is not already booked
    item = await fetch_one(
        "SELECT id FROM items WHERE id = $1 AND wishlist_id = $2", data.item_id, wishlist_id
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in this wishlist")

    # Check if already booked by anyone
    existing_booking = await fetch_one(
        "SELECT id FROM bookings WHERE item_id = $1", data.item_id
    )
    if existing_booking:
        raise HTTPException(status_code=409, detail="Item is already booked by someone else")

    # Check max_items_per_gifter (count distinct items booked by this gifter in this wishlist)
    share = await fetch_one(
        "SELECT max_items_per_gifter FROM share_settings WHERE wishlist_id = $1", wishlist_id
    )
    if share and share["max_items_per_gifter"] is not None:
        count = await fetch_one(
            "SELECT COUNT(*) as cnt FROM bookings WHERE wishlist_id = $1 AND gifter_user_id = $2",
            wishlist_id, gifter
        )
        if count["cnt"] >= share["max_items_per_gifter"]:
            raise HTTPException(
                status_code=400,
                detail=f"You can only book up to {share['max_items_per_gifter']} different items in this list"
            )

    # Insert booking
    row = await fetch_one(
        """INSERT INTO bookings (wishlist_id, item_id, gifter_user_id, is_anonymous, message)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *""",
        wishlist_id, data.item_id, gifter, data.is_anonymous, data.message
    )
    return _row_to_booking(row)

@router.get("/mine", response_model=List[BookingOut])
async def list_my_bookings(
    wishlist_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    gifter = current_user["id"]
    rows = await fetch_all(
        "SELECT * FROM bookings WHERE wishlist_id = $1 AND gifter_user_id = $2",
        wishlist_id, gifter
    )
    return [_row_to_booking(r) for r in rows]

@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_booking(
    wishlist_id: UUID,
    booking_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    gifter = current_user["id"]
    result = await execute(
        "DELETE FROM bookings WHERE id = $1 AND wishlist_id = $2 AND gifter_user_id = $3",
        booking_id, wishlist_id, gifter
    )
    if "0" in result:
        raise HTTPException(status_code=404, detail="Booking not found or not yours")
    return None