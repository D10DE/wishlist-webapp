# backend/app/api/share_settings.py
from fastapi import APIRouter, HTTPException, Depends
from app.db import fetch_one, execute
from app.models import ShareSettingsUpdate, ShareSettingsOut
from uuid import UUID
from app.auth import get_current_user
from app.dependencies import get_wishlist_owner
router = APIRouter(prefix="/api/wishlists/{wishlist_id}/share-settings", tags=["share-settings"])

# Helper: verify wishlist ownership

def _row_to_dict(row) -> dict:
    return {
        "wishlist_id": str(row["wishlist_id"]),
        "restrict_to_contacts": row["restrict_to_contacts"],
        "max_items_per_gifter": row[ "max_items_per_gifter"],
        "allow_anonymous": row["allow_anonymous"],
        "custom_message": row["custom_message"],
        "updated_at": row["updated_at"],
    }

@router.get("/", response_model=ShareSettingsOut)
async def get_share_settings(
    wishlist_id: UUID, 
    current_user: dict = Depends(get_current_user),
    owner_id: str = Depends(get_wishlist_owner)
):
    row = await fetch_one(
        "SELECT * FROM share_settings WHERE wishlist_id = $1",
        wishlist_id
    )
    if not row:
        # This should never happen if triggers are in place, but handle gracefully
        raise HTTPException(status_code=404, detail="Share settings not found")
    return _row_to_dict(row)

@router.put("/", response_model=ShareSettingsOut)
async def update_share_settings(
    wishlist_id: UUID, 
    data: ShareSettingsUpdate, 
    current_user: dict = Depends(get_current_user),
    owner_id: str = Depends(get_wishlist_owner)
):
    fields = []
    values = []
    idx = 1

    for field in ("restrict_to_contacts", "max_items_per_gifter", 
                    "allow_anonymous", "custom_message"):
        val = getattr(data, field)
        if val is not None:
            fields.append(f"{field} = ${idx}")
            values.append(val)
            idx += 1

    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to update")

    values.append(str(wishlist_id))
    query = f"""
        UPDATE share_settings
        SET {', '.join(fields)}
        WHERE wishlist_id = ${idx}
        RETURNING *
    """
    row = await fetch_one(query, *values)
    if not row:
        raise HTTPException(status_code=404, detail="Wishlist not found")
    return _row_to_dict(row)