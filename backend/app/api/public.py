# backend/app/api/public.py
from fastapi import APIRouter, HTTPException, Query
from app.db import fetch_one, fetch_all
from typing import Optional
from uuid import UUID

router = APIRouter(prefix="/api/public", tags=["public"])

@router.get("/wishlists/{wishlist_id}")
async def view_public_wishlist(
    wishlist_id: UUID,
    gifter_id: Optional[str] = Query(None)
):
    """
    Public read‑only view of a shared wishlist.
    Respects share_settings: hides booked details if surprise mode,
    enforces anonymity, and optionally shows the gifter's own bookings.
    """

    # 1. Fetch wishlist (must exist)
    wishlist = await fetch_one(
        "SELECT id, title, description FROM wishlists WHERE id = $1",
        wishlist_id
    )
    if not wishlist:
        raise HTTPException(status_code=404, detail="Wishlist not found")

    # 2. Fetch share settings
    share = await fetch_one(
        "SELECT * FROM share_settings WHERE wishlist_id = $1",
        wishlist_id
    )
    if not share:
        raise HTTPException(status_code=404, detail="Share settings not found")

    # 3. Fetch all items in this wishlist
    items = await fetch_all(
        """SELECT id, name, description, price, currency, image_filename,
                  desired_date, comment, shops, category_id
           FROM items
           WHERE wishlist_id = $1
           ORDER BY created_at""",
        wishlist_id
    )

    # 4. Fetch all bookings for this wishlist
    bookings = await fetch_all(
        """SELECT item_id, id AS booking_id, is_anonymous, gifter_user_id
           FROM bookings
           WHERE wishlist_id = $1""",
        wishlist_id
    )

    # Build a lookup: item_id -> booking info
    booked_map = {}
    for b in bookings:
        booked_map[str(b["item_id"])] = {
            "booking_id": str(b["booking_id"]),
            "is_anonymous": b["is_anonymous"],
            "gifter_user_id": str(b["gifter_user_id"])
        }

    # 5. Build the item list while applying privacy settings
    result_items = []
    for item in items:
        booking = booked_map.get(str(item["id"]))

        item_data = {
            "id": str(item["id"]),
            "name": item["name"],
            "description": item["description"],
            "price": item["price"],
            "currency": item["currency"],
            "image_url": f"/uploads/{item['image_filename']}" if item["image_filename"] else None,
            "desired_date": item["desired_date"],
            "comment": item["comment"],
            "shops": item["shops"],   # JSONB list
            "category_id": str(item["category_id"]) if item["category_id"] else None,
        }

        # Apply show_booked_details setting
        if share["show_booked_details"]:
            # Transparency mode: show real booking status
            if booking:
                item_data["is_booked"] = True
                if not booking["is_anonymous"]:
                    item_data["booked_by"] = booking["gifter_user_id"]
                else:
                    item_data["booked_by"] = "anonymous"
            else:
                item_data["is_booked"] = False
        else:
            # Surprise mode: hide all booking info; look available
            item_data["is_booked"] = False

        # Attach the current gifter's own booking, if any
        if gifter_id:
            # Find booking for this item made by the given gifter
            my_booking = next(
                (b for b in bookings
                 if str(b["item_id"]) == str(item["id"])
                 and str(b["gifter_user_id"]) == gifter_id),
                None
            )
            if my_booking:
                item_data["my_booking"] = {
                    "booking_id": str(my_booking["booking_id"])
                }
            else:
                item_data["my_booking"] = None

        result_items.append(item_data)

    # 6. Return the full response
    return {
        "wishlist": {
            "id": str(wishlist["id"]),
            "title": wishlist["title"],
            "description": wishlist["description"],
        },
        "share_settings": {
            "show_booked_details": share["show_booked_details"],
            "max_items_per_gifter": share["max_items_per_gifter"],
            "allow_anonymous": share["allow_anonymous"],
            "custom_message": share["custom_message"],
        },
        "items": result_items,
    }