-- Enable extension (as superuser if needed; if already enabled in template, may not need, but safe)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    username VARCHAR(100),
    hashed_password VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO users (id, email, phone, username, hashed_password)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test@example.com', '+1234567890', 'TestUser', 'dummy_hashed_pw'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'gifter@example.com', '+0987654321', 'GifterUser', 'dummy_hashed_pw');

-- ============================================================
-- WISHLISTS
-- ============================================================
CREATE TABLE wishlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) DEFAULT 'My Wishlist',
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(name, owner_id)
);

-- ============================================================
-- ITEMS (no quantity columns)
-- ============================================================
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    image_filename VARCHAR(255),
    desired_date DATE,
    comment TEXT,
    shops JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BOOKINGS (one gifter per item, no quantity)
-- ============================================================
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    gifter_user_id UUID NOT NULL REFERENCES users(id),
    is_anonymous BOOLEAN DEFAULT TRUE,
    message TEXT,
    booked_at TIMESTAMPTZ DEFAULT NOW(),
    -- Only one booking per item allowed
    UNIQUE(item_id),
    -- Still prevent same gifter booking same item twice (redundant but safe)
    UNIQUE(item_id, gifter_user_id)
);

-- ============================================================
-- SHARE SETTINGS
-- ============================================================
CREATE TABLE share_settings (
    wishlist_id UUID PRIMARY KEY REFERENCES wishlists(id) ON DELETE CASCADE,
    show_booked_details BOOLEAN DEFAULT TRUE,
    restrict_to_contacts BOOLEAN DEFAULT FALSE,
    max_items_per_gifter INT,
    allow_anonymous BOOLEAN DEFAULT TRUE,
    custom_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIGGERS for updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_wishlist_updated_at
    BEFORE UPDATE ON wishlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_share_settings_updated_at
    BEFORE UPDATE ON share_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();