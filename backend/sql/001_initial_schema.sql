-- ============================================================
-- 1. Enable required extension (must be superuser or owner)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. Users table
-- ============================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    username VARCHAR(100),
    hashed_password VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. Wishlists
-- ============================================================
CREATE TABLE wishlists (
    id SERIAL PRIMARY KEY,
    public_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) DEFAULT 'My Wishlist',
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. Categories
-- ============================================================
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(name, owner_id)   -- each user can have unique category names
);

-- ============================================================
-- 5. Items (with category_id and shops JSONB)
-- ============================================================
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    wishlist_id INT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
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
-- 6. Bookings
-- ============================================================
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    wishlist_id INT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    gifter_user_id INT NOT NULL REFERENCES users(id),
    quantity INT DEFAULT 1,
    is_anonymous BOOLEAN DEFAULT TRUE,
    message TEXT,
    booked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, gifter_user_id)
);

-- ============================================================
-- 7. Share settings (1:1 with wishlist)
-- ============================================================
CREATE TABLE share_settings (
    wishlist_id INT PRIMARY KEY REFERENCES wishlists(id) ON DELETE CASCADE,
    show_booked_details BOOLEAN DEFAULT TRUE,
    restrict_to_contacts BOOLEAN DEFAULT FALSE,
    max_items_per_gifter INT,
    allow_anonymous BOOLEAN DEFAULT TRUE,
    custom_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. Updated_at triggers for wishlists and share_settings
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

-- ============================================================
-- 10. Seed a dummy user for development
-- ============================================================
INSERT INTO users (email, phone, username, hashed_password)
VALUES ('test@example.com', '+1234567890', 'TestUser', 'dummy_hashed_pw');