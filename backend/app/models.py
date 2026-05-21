# backend/app/models.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime

# ---------- Wishlist ----------
class WishlistCreate(BaseModel):
    title: str = Field("My Wishlist", max_length=200)
    description: Optional[str] = None
    is_public: bool = False

class WishlistUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None

class WishlistOut(BaseModel):
    id: str
    owner_id: str
    title: str
    description: Optional[str]
    is_public: bool
    created_at: datetime
    updated_at: datetime

# ---------- Share Settings ----------
class ShareSettingsUpdate(BaseModel):
    show_booked_details: Optional[bool] = None
    restrict_to_contacts: Optional[bool] = None
    max_items_per_gifter: Optional[int] = None
    allow_anonymous: Optional[bool] = None
    custom_message: Optional[str] = None

class ShareSettingsOut(BaseModel):
    wishlist_id: str
    show_booked_details: bool
    restrict_to_contacts: bool
    max_items_per_gifter: Optional[int]
    allow_anonymous: bool
    custom_message: Optional[str]
    updated_at: datetime

# ---------- Category ----------
class CategoryCreate(BaseModel):
    name: str = Field(..., max_length=100)

class CategoryOut(BaseModel):
    id: str
    name: str
    owner_id: str

# ---------- Item ----------
class ShopEntry(BaseModel):
    # A shop can be just a name, or a name + URL
    name: str
    url: Optional[str] = None

class ItemCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    price: Optional[float] = None
    currency: str = Field("USD", max_length=3)
    desired_date: Optional[date] = None
    quantity_total: int = Field(1, ge=1)
    comment: Optional[str] = None
    shops: Optional[List[ShopEntry]] = None
    category_id: Optional[str] = None

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    desired_date: Optional[date] = None
    quantity_total: Optional[int] = Field(None, ge=1)
    comment: Optional[str] = None
    shops: Optional[List[ShopEntry]] = None
    category_id: Optional[str] = None

class ItemOut(BaseModel):
    id: str
    wishlist_id: str
    category_id: Optional[str]
    name: str
    description: Optional[str]
    price: Optional[float]
    currency: str
    image_filename: Optional[str]
    desired_date: Optional[date]
    quantity_total: int
    quantity_booked: int
    comment: Optional[str]
    shops: Optional[List[ShopEntry]]
    created_at: datetime