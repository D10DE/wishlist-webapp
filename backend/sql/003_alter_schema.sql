-- Remove unused column
ALTER TABLE share_settings DROP COLUMN IF EXISTS show_booked_details;

-- Set default for max_items_per_gifter
ALTER TABLE share_settings ALTER COLUMN max_items_per_gifter SET DEFAULT 1;

-- Update existing rows that have NULL to 1 (optional, for consistency)
UPDATE share_settings SET max_items_per_gifter = 1 WHERE max_items_per_gifter IS NULL;