ALTER TABLE bookings
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'booked';

-- Optional: add a check constraint to keep values clean
ALTER TABLE bookings
ADD CONSTRAINT valid_booking_status CHECK (status IN ('booked', 'gifted'));

ALTER TABLE users ADD COLUMN display_name VARCHAR(100);

-- Optionally backfill existing users:
UPDATE users SET display_name = username WHERE display_name IS NULL;

CREATE TABLE saved_shared_wishlists (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, wishlist_id)
);