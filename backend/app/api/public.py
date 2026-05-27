# backend/app/api/public.py
from fastapi import APIRouter, HTTPException, Depends
from app.db import fetch_one, fetch_all
from typing import Optional
from uuid import UUID
from app.auth import get_optional_user

router = APIRouter(prefix="/api/public", tags=["public"])

@router.get("/wishlists/{wishlist_id}")
async def view_public_wishlist(
    wishlist_id: UUID,
    current_user: Optional[dict] = Depends(get_optional_user)
):
    wishlist = await fetch_one(
        """SELECT w.id, w.title, w.description, w.owner_id, w.is_public,
                  u.display_name AS owner_name
           FROM wishlists w
           JOIN users u ON u.id = w.owner_id
           WHERE w.id = $1""",
        wishlist_id
    )
    if not wishlist:
        raise HTTPException(status_code=404, detail="Not found")

    # Enforce is_public: if not public, only the owner can view
    if not wishlist["is_public"]:
        if not current_user or str(current_user["id"]) != str(wishlist["owner_id"]):
            raise HTTPException(status_code=404, detail="Not found")

    share = await fetch_one(
        "SELECT * FROM share_settings WHERE wishlist_id = $1", wishlist_id
    )

    # Enforce anonymous access
    if not share["allow_anonymous"] and not current_user:
        raise HTTPException(status_code=401, detail="You must be logged in to view this wishlist")

    items = await fetch_all(
        """SELECT i.id, i.name, i.description, i.price, i.currency,
                  i.image_filename, i.desired_date, i.comment, i.shops,
                  i.category_id, c.name AS category_name
           FROM items i
           LEFT JOIN categories c ON c.id = i.category_id
           WHERE i.wishlist_id = $1
           ORDER BY i.created_at""",
        wishlist_id
    )

    bookings = await fetch_all(
        "SELECT item_id, id, is_anonymous, gifter_user_id FROM bookings WHERE wishlist_id = $1",
        wishlist_id
    )
    booked_map = {str(b["item_id"]): dict(b) for b in bookings}

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
            "shops": item["shops"],
            "category_name": item["category_name"],
            "is_booked": booking is not None,
        }
        if booking:
            if not booking["is_anonymous"]:
                item_data["booked_by"] = str(booking["gifter_user_id"])  # for potential future use
            else:
                item_data["booked_by"] = "anonymous"
        # Attach current user's booking
        if current_user:
            my_booking = next(
                (b for b in bookings if str(b["gifter_user_id"]) == str(current_user["id"]) and str(b["item_id"]) == str(item["id"])),
                None
            )
            item_data["my_booking"] = {"booking_id": str(my_booking["booking_id"])} if my_booking else None
        else:
            item_data["my_booking"] = None
        result_items.append(item_data)

    return {
        "wishlist": {
            "id": str(wishlist["id"]),
            "title": wishlist["title"],
            "description": wishlist["description"],
            "owner_name": wishlist["owner_name"],
            "is_public": wishlist["is_public"],
        },
        "share_settings": {
            "max_items_per_gifter": share["max_items_per_gifter"],
            "allow_anonymous": share["allow_anonymous"],
            "custom_message": share["custom_message"],
        },
        "items": result_items,
    }