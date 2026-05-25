# backend/app/api/categories.py
from fastapi import APIRouter, HTTPException, status, Depends
from app.db import fetch_all, fetch_one, execute
from app.models import CategoryCreate, CategoryOut
from typing import List
from uuid import UUID
from app.auth import get_current_user

router = APIRouter(prefix="/api/categories", tags=["categories"])

def _row_to_dict(row) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "owner_id": str(row["owner_id"]),
    }

@router.post("/", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: CategoryCreate,
    current_user: dict = Depends(get_current_user)
):
    # Check for duplicate
    existing = await fetch_one(
        "SELECT id FROM categories WHERE name = $1 AND owner_id = $2",
        data.name, current_user["id"]
    )
    if existing:
        raise HTTPException(status_code=400, detail="Category with that name already exists")
    row = await fetch_one(
        "INSERT INTO categories (name, owner_id) VALUES ($1, $2) RETURNING id, name, owner_id",
        data.name, current_user["id"]
    )
    return _row_to_dict(row)

@router.get("/", response_model=List[CategoryOut])
async def list_categories(current_user: dict = Depends(get_current_user)):
    rows = await fetch_all(
        "SELECT id, name, owner_id FROM categories WHERE owner_id = $1 ORDER BY name",
        current_user["id"]
    )
    return [_row_to_dict(r) for r in rows]

@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    # Items linked to this category will have their category_id set to NULL (ON DELETE SET NULL)
    result = await execute(
        "DELETE FROM categories WHERE id = $1 AND owner_id = $2",
        str(category_id), current_user["id"]
    )
    if "0" in result:
        raise HTTPException(status_code=404, detail="Category not found")
    return None