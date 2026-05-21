
CREATE USER wishlist_user WITH ENCRYPTED PASSWORD 'your_strong_password';
ALTER ROLE wishlist_user CREATEDB;   -- optional, only if you want the user to create databases

CREATE DATABASE wishlist_db OWNER wishlist_user;

    -- Grant all on existing objects
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO wishlist_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO wishlist_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO wishlist_user;

-- Make future objects also accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO wishlist_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO wishlist_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO wishlist_user;