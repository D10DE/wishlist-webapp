CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    username VARCHAR(100),
    hashed_password VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    wishlist_id INT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    image_filename VARCHAR(255),          -- Stored on server disk, DB holds filename only
    desired_date DATE,
    quantity_total INT DEFAULT 1,
    quantity_booked INT DEFAULT 0,        -- Denormalized cache for fast availability checks
    comment TEXT,
    shops JSONB,                          -- JSONB = indexed, faster than JSON in PG
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    wishlist_id INT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    gifter_user_id INT NOT NULL REFERENCES users(id),  -- Gifter must be a user
    quantity INT DEFAULT 1,
    is_anonymous BOOLEAN DEFAULT TRUE,   -- UI flag: hide name in frontend, DB keeps link
    message TEXT,
    booked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, gifter_user_id)      -- Prevents same user booking same item twice
);

-- (1:1 with wishlist)
CREATE TABLE share_settings (
    wishlist_id INT PRIMARY KEY REFERENCES wishlists(id) ON DELETE CASCADE,
    show_booked_details BOOLEAN DEFAULT TRUE,
    restrict_to_contacts BOOLEAN DEFAULT FALSE,
    max_items_per_gifter INT,
    allow_anonymous BOOLEAN DEFAULT TRUE,
    custom_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_wishlist_updated_at BEFORE UPDATE ON wishlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_share_settings_updated_at BEFORE UPDATE ON share_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();