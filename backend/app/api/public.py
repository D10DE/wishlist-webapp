# backend/app/api/public.py
from fastapi import APIRouter, HTTPException, Query
from app.db import fetch_one, fetch_all
from typing import Optional
from uuid import UUID

router = APIRouter(prefix="/api/public", tags=["public"])

@router.get("/wishlists/{wishlist_id}")
async def view_public_wishlist(wishlist_id: UUID):
    """
    Public read‑only view of a shared wishlist.
    Respects share_settings: hides booked details, enforces anonymity, etc.
    """
    # 1. Fetch wishlist (must exist and be active – we can ignore is_public or use it as a kill switch)
    wishlist = await fetch_one(
        "SELECT id, owner_id, title, description FROM wishlists WHERE id = $1",
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
        # Should never happen due to trigger on wishlist creation, but just in case
        raise HTTPException(status_code=404, detail="Share settings not found")

    # 3. Fetch items with availability info
    items = await fetch_all(
        """SELECT id, name, description, price, currency, image_filename,
                  desired_date, quantity_total, quantity_booked,
                  comment, shops, category_id
           FROM items
           WHERE wishlist_id = $1
           ORDER BY created_at""",
        wishlist_id
    )

    # 4. Build response respecting privacy settings
    result_items = []
    for item in items:
        item_data = {
            "id": str(item["id"]),
            "name": item["name"],
            "description": item["description"],
            "price": item["price"],
            "currency": item["currency"],
            "image_url": f"/uploads/{item['image_filename']}" if item["image_filename"] else None,
            "desired_date": item["desired_date"],
            "comment": item["comment"],
            "shops": item["shops"],  # JSONB list
            "category_id": str(item["category_id"]) if item["category_id"] else None,
        }

        if share["show_booked_details"]:
            item_data["quantity_total"] = item["quantity_total"]
            item_data["quantity_booked"] = item["quantity_booked"]
            item_data["available"] = item["quantity_total"] - item["quantity_booked"]
        else:
            # Surprise mode: show only total, but hide how many are booked
            item_data["quantity_total"] = item["quantity_total"]
            item_data["available"] = item["quantity_total"]  # Looks fully available
            # Optionally hide the booked count entirely
            item_data["quantity_booked"] = 0  # or None
            item_data["surprise"] = True

        result_items.append(item_data)

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