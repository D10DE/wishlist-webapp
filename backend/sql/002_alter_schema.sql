ALTER TABLE bookings
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'booked';

-- Optional: add a check constraint to keep values clean
ALTER TABLE bookings
ADD CONSTRAINT valid_booking_status CHECK (status IN ('booked', 'gifted'));