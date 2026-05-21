-- ============================================================
-- 1. Enable pgcrypto (as superuser if not already done)
-- ============================================================
-- If you are connected as wishlist_user and this fails,
-- disconnect, run it as postgres, then reconnect.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. Users table (UUID primary key)
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

-- Seed dummy user with a fixed UUID for easy testing
INSERT INTO users (id, email, phone, username, hashed_password)
VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'test@example.com',
    '+1234567890',
    'TestUser',
    'dummy_hashed_pw'
);

-- ============================================================
-- 3. Wishlists (UUID, no separate public_id)
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
-- 4. Categories (UUID, owner is UUID)
-- ============================================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(name, owner_id)
);

-- ============================================================
-- 5. Items (UUID, references UUIDs)
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
    quantity_total INT DEFAULT 1,
    quantity_booked INT DEFAULT 0,
    comment TEXT,
    shops JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. Bookings (UUID references)
-- ============================================================
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    gifter_user_id UUID NOT NULL REFERENCES users(id),
    quantity INT DEFAULT 1,
    is_anonymous BOOLEAN DEFAULT TRUE,
    message TEXT,
    booked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, gifter_user_id)
);

-- ============================================================
-- 7. Share settings (wishlist_id is UUID PK, also FK)
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
-- 8. Updated_at triggers
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

-- ============================================================
-- 9. Quantity booked sync trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_quantity_booked()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE items SET quantity_booked = quantity_booked + NEW.quantity
        WHERE id = NEW.item_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE items SET quantity_booked = quantity_booked - OLD.quantity
        WHERE id = OLD.item_id;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE items SET quantity_booked = quantity_booked - OLD.quantity + NEW.quantity
        WHERE id = NEW.item_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_quantity
    AFTER INSERT OR DELETE OR UPDATE OF quantity ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_quantity_booked();