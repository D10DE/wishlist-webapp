# backend/app/api/bookings.py
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from uuid import UUID

from app.db import fetch_one, fetch_all, execute
from app.models import BookingRequest, BookingOut, BookingWithDetailsOut, BookingStatusUpdate
from app.auth import get_current_user

# ROUTER 1 – Wishlist‑scoped bookings

wishlist_bookings_router = APIRouter(
    prefix="/api/wishlists/{wishlist_id}/bookings",
    tags=["bookings"]
)

def _row_to_booking(row) -> dict:
    return {
        "id": str(row["id"]),
        "wishlist_id": str(row["wishlist_id"]),
        "item_id": str(row["item_id"]),
        "gifter_user_id": str(row["gifter_user_id"]),
        "quantity": row.get("quantity", 1),    # not used anymore, kept for backward compat if needed
        "is_anonymous": row["is_anonymous"],
        "message": row["message"],
        "booked_at": row["booked_at"],
    }


@wishlist_bookings_router.post("/", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def book_item(
    wishlist_id: UUID,
    data: BookingRequest,
    current_user: dict = Depends(get_current_user)
):
    gifter = current_user["id"]

    # Check wishlist exists
    wishlist = await fetch_one("SELECT id FROM wishlists WHERE id = $1", wishlist_id)
    if not wishlist:
        raise HTTPException(status_code=404, detail="Wishlist not found")

    # Check item exists and is not already booked
    item = await fetch_one(
        "SELECT id FROM items WHERE id = $1 AND wishlist_id = $2",
        data.item_id, wishlist_id
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in this wishlist")

    existing_booking = await fetch_one(
        "SELECT id FROM bookings WHERE item_id = $1", data.item_id
    )
    if existing_booking:
        raise HTTPException(status_code=409, detail="Item is already booked by someone else")

    # Check max_items_per_gifter
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


@wishlist_bookings_router.get("/mine", response_model=List[BookingOut])
async def list_my_bookings_for_wishlist(
    wishlist_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    rows = await fetch_all(
        "SELECT * FROM bookings WHERE wishlist_id = $1 AND gifter_user_id = $2",
        wishlist_id, current_user["id"]
    )
    return [_row_to_booking(r) for r in rows]


@wishlist_bookings_router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_booking(
    wishlist_id: UUID,
    booking_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    result = await execute(
        "DELETE FROM bookings WHERE id = $1 AND wishlist_id = $2 AND gifter_user_id = $3",
        booking_id, wishlist_id, current_user["id"]
    )
    if "0" in result:
        raise HTTPException(status_code=404, detail="Booking not found or not yours")
    return None

# ROUTER 2 – User‑level bookings (across all wishlists)

user_bookings_router = APIRouter(
    prefix="/api/bookings",
    tags=["user-bookings"]
)

def _booking_with_details(row) -> dict:
    return {
        "id": str(row["id"]),
        "wishlist_id": str(row["wishlist_id"]),
        "wishlist_title": row["wishlist_title"],
        "item_id": str(row["item_id"]),
        "item_name": row["item_name"],
        "gifter_user_id": str(row["gifter_user_id"]),
        "is_anonymous": row["is_anonymous"],
        "message": row["message"],
        "status": row["status"],
        "booked_at": row["booked_at"],
    }


@user_bookings_router.get("/mine", response_model=List[BookingWithDetailsOut])
async def get_my_bookings(
    current_user: dict = Depends(get_current_user)
):
    rows = await fetch_all(
        """
        SELECT b.id, b.wishlist_id, w.title AS wishlist_title,
               b.item_id, i.name AS item_name,
               b.gifter_user_id, b.is_anonymous, b.message,
               b.status, b.booked_at
        FROM bookings b
        JOIN wishlists w ON w.id = b.wishlist_id
        JOIN items i ON i.id = b.item_id
        WHERE b.gifter_user_id = $1
        ORDER BY b.booked_at DESC
        """,
        current_user["id"]
    )
    return [_booking_with_details(r) for r in rows]


@user_bookings_router.patch("/{booking_id}/status", response_model=BookingWithDetailsOut)
async def update_booking_status(
    booking_id: UUID,
    data: BookingStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    if data.status not in ('booked', 'gifted'):
        raise HTTPException(status_code=400, detail="Status must be 'booked' or 'gifted'")

    booking = await fetch_one(
        "SELECT * FROM bookings WHERE id = $1 AND gifter_user_id = $2",
        booking_id, current_user["id"]
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found or not yours")

    await execute(
        "UPDATE bookings SET status = $3 WHERE id = $1 AND gifter_user_id = $2",
        booking_id, current_user["id"], data.status
    )

    row = await fetch_one(
        """
        SELECT b.id, b.wishlist_id, w.title AS wishlist_title,
               b.item_id, i.name AS item_name,
               b.gifter_user_id, b.is_anonymous, b.message,
               b.status, b.booked_at
        FROM bookings b
        JOIN wishlists w ON w.id = b.wishlist_id
        JOIN items i ON i.id = b.item_id
        WHERE b.id = $1
        """,
        booking_id
    )
    return _booking_with_details(row)


@user_bookings_router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_booking(
    booking_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    result = await execute(
        "DELETE FROM bookings WHERE id = $1 AND gifter_user_id = $2",
        booking_id, current_user["id"]
    )
    if "0" in result:
        raise HTTPException(status_code=404, detail="Booking not found or not yours")
    return None