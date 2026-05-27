# backend/app/api/items.py
import os
import uuid
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status, Depends
from typing import Optional, List
from pathlib import Path
from datetime import date, datetime

from app.db import fetch_one, fetch_all, execute
from app.models import ItemCreate, ItemUpdate, ItemOut, ShopEntry
from app.auth import get_current_user
from app.dependencies import get_wishlist_owner
import json
from uuid import UUID

router = APIRouter(prefix="/api/wishlists/{wishlist_id}/items", tags=["items"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads" / "items"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
async def create_item(
    wishlist_id: UUID,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    currency: str = Form("USD"),
    desired_date: Optional[date] = Form(None),
    comment: Optional[str] = Form(None),
    category_id: Optional[UUID] = Form(None),
    shops: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user),
    owner_id: str = Depends(get_wishlist_owner) 
):

    # Handle image upload
    image_filename = None
    if image:
        # Generate unique filename
        ext = Path(image.filename).suffix if image.filename else ".jpg"
        unique_name = f"{uuid.uuid4()}{ext}"
        file_path = UPLOAD_DIR / unique_name
        content = await image.read()
        with open(file_path, "wb") as f:
            f.write(content)
        image_filename = unique_name

    # Parse shops JSON if provided
    shops_list = None
    if shops:
        try:
            shops_list = json.loads(shops)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON for shops")

    # Validate category belongs to user
    if category_id:
        cat = await fetch_one(
            "SELECT id FROM categories WHERE id = $1 AND owner_id = $2",
            category_id, current_user["id"]
        )
        if not cat:
            raise HTTPException(status_code=400, detail="Category not found or not yours")

    row = await fetch_one(
        """INSERT INTO items (wishlist_id, category_id, name, description,
                              price, currency, image_filename, desired_date,
                              comment, shops)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *""",
        wishlist_id, category_id, name, description,
        price, currency, image_filename,
        desired_date, comment,
        json.dumps(shops_list) if shops_list else None
    )
    return _item_out(row)

@router.get("/", response_model=List[ItemOut])
async def list_items(
    wishlist_id: UUID, 
    current_user: dict = Depends(get_current_user),
    owner_id: str = Depends(get_wishlist_owner) 
):
    rows = await fetch_all(
        "SELECT * FROM items WHERE wishlist_id = $1 ORDER BY created_at",
        wishlist_id
    )
    return [_item_out(r) for r in rows]

@router.get("/{item_id}", response_model=ItemOut)
async def get_item(
    wishlist_id: UUID, 
    item_id: UUID, 
    current_user: dict = Depends(get_current_user),
    owner_id: str = Depends(get_wishlist_owner) 
):
    row = await fetch_one(
        "SELECT * FROM items WHERE id = $1 AND wishlist_id = $2",
        item_id, wishlist_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return _item_out(row)

@router.put("/{item_id}", response_model=ItemOut)
async def update_item(
    wishlist_id: UUID,
    item_id: UUID,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    currency: Optional[str] = Form(None),
    desired_date: Optional[date] = Form(None),
    comment: Optional[str] = Form(None),
    category_id: Optional[UUID] = Form(None),
    shops: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user),
    owner_id: str = Depends(get_wishlist_owner) 
):

    # Verify item exists and belongs to wishlist
    existing = await fetch_one(
        "SELECT * FROM items WHERE id = $1 AND wishlist_id = $2",
        item_id, wishlist_id
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")

    # Handle image upload
    image_filename = existing["image_filename"]
    if image:
        # Delete old file if exists
        if image_filename:
            old_path = UPLOAD_DIR / image_filename
            if old_path.exists():
                old_path.unlink()
        ext = Path(image.filename).suffix if image.filename else ".jpg"
        unique_name = f"{uuid.uuid4()}{ext}"
        file_path = UPLOAD_DIR / unique_name
        content = await image.read()
        with open(file_path, "wb") as f:
            f.write(content)
        image_filename = unique_name

    # Parse shops
    shops_list = existing["shops"]
    if shops is not None:
        try:
            shops_list = json.loads(shops)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON for shops")

    # Validate category
    if category_id is not None:
        if category_id != existing["category_id"]:
            cat = await fetch_one(
                "SELECT id FROM categories WHERE id = $1 AND owner_id = $2",
                category_id, current_user["id"]
            )
            if not cat:
                raise HTTPException(status_code=400, detail="Category not found or not yours")

    row = await fetch_one(
        """UPDATE items
           SET name = COALESCE($3, name),
               description = COALESCE($4, description),
               price = COALESCE($5, price),
               currency = COALESCE($6, currency),
               desired_date = COALESCE($7::date, desired_date),
               comment = COALESCE($8, comment),
               category_id = COALESCE($9, category_id),
               shops = COALESCE($10::jsonb, shops),
               image_filename = COALESCE($11, image_filename)
           WHERE id = $1 AND wishlist_id = $2
           RETURNING *""",
        item_id, wishlist_id,
        name, description, price, currency,
        desired_date, comment, category_id,
        json.dumps(shops_list) if shops_list is not None else None,
        image_filename
    )
    return _item_out(row)

@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    wishlist_id: UUID, 
    item_id: UUID, 
    current_user: dict = Depends(get_current_user),
    owner_id: str = Depends(get_wishlist_owner) 
):
    item = await fetch_one(
        "SELECT image_filename FROM items WHERE id = $1 AND wishlist_id = $2",
        item_id, wishlist_id
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    # Check for gifted bookings only
    gifted = await fetch_one(
        "SELECT COUNT(*) as cnt FROM bookings WHERE item_id = $1 AND status = 'gifted'",
        item_id
    )
    if gifted and gifted["cnt"] > 0:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete item because it has already been gifted. Cancel the booking first."
        )
    # Delete the physical file if exists
    if item["image_filename"]:
        file_path = UPLOAD_DIR / item["image_filename"]
        if file_path.exists():
            file_path.unlink()
    
    result = await execute(
        "DELETE FROM items WHERE id = $1 AND wishlist_id = $2",
        item_id, wishlist_id
    )
    if "0" in result:
        raise HTTPException(status_code=404, detail="Item not found")
    return None

# Helper to convert DB row to Pydantic model dict
def _item_out(row) -> dict:
    return {
        "id": str(row["id"]),
        "wishlist_id": str(row["wishlist_id"]),
        "category_id": str(row["category_id"]),
        "name": row["name"],
        "description": row["description"],
        "price": row["price"],
        "currency": row["currency"],
        "image_filename": row["image_filename"],
        "desired_date": row["desired_date"],
        "comment": row["comment"],
        "shops": row["shops"],   # JSONB is returned as list/dict from asyncpg
        "created_at": row["created_at"],
    }