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
    comment: Optional[str] = None
    shops: Optional[List[ShopEntry]] = None
    category_id: Optional[str] = None

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    desired_date: Optional[date] = None
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
    comment: Optional[str]
    shops: Optional[List[ShopEntry]]
    created_at: datetime

# Auth models
class UserRegister(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6)
    display_name: str = Field(..., min_length=1, max_length=100)   
    phone: Optional[str] = Field(None, max_length=20)
    username: Optional[str] = Field(None, max_length=100)

class UserLogin(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict   # we'll return user id, email, etc.

# Bookings

class BookingRequest(BaseModel):
    item_id: str
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

class BookingWithDetailsOut(BaseModel):
    id: str
    wishlist_id: str
    wishlist_title: str          # for display
    item_id: str
    item_name: str
    gifter_user_id: str
    is_anonymous: bool
    message: Optional[str]
    status: str                  # 'booked' or 'gifted'
    booked_at: datetime

class BookingStatusUpdate(BaseModel):
    status: str

class WishlistBookingOut(BaseModel):
    id: str
    item_id: str
    status: str
    is_anonymous: bool
    gifter_user_id: str
    gifter_name: Optional[str] = None