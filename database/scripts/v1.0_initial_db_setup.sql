-- =============================================================================
-- SportyGo database setup, v1.0 (initial)
--
-- Creates every table, constraint and index the backend on the `main` branch
-- uses, then loads the starter catalog data (sports, cards, facilities,
-- opening hours, packages). Generated from a database built by main's own
-- `npm run db:migrate` and `npm run db:seed`.
--
-- Run this first, then v1.1_one_on_one_setup.sql.
--
-- Safe to run more than once:
--   * tables and indexes use IF NOT EXISTS, so existing ones are left alone;
--   * every INSERT uses ON CONFLICT DO NOTHING, so existing rows (and your
--     edits to them) are never overwritten, and nothing is ever deleted.
--   * Note: a starter row you deleted on purpose is inserted again. To remove
--     something, set enabled = false instead of deleting it.
--
-- It does NOT upgrade an older existing table to a newer shape (IF NOT EXISTS
-- skips it). For an existing database, run `npm run db:migrate` from backend/.
--
-- No users or customer data are included. main's backend also created a
-- built-in admin account with a password written in its source code; that is
-- deliberately left out. Create an admin by registering and then running
-- `npm run admin:promote -- <email>` from backend/.
--
-- How to run (one transaction: everything is applied, or nothing):
--   psql "<connection string>" -v ON_ERROR_STOP=1 -f database/scripts/v1.0_initial_db_setup.sql
-- Requires PostgreSQL 13 or newer (gen_random_uuid is built in).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

-- Sports shown on the Choose Your Sport screen
CREATE TABLE IF NOT EXISTS sports (
    id text NOT NULL,
    label text NOT NULL,
    image_key text NOT NULL,
    banner_key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT sports_banner_key_check CHECK ((banner_key IN ('cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis', 'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi'))),
    CONSTRAINT sports_id_check CHECK ((id IN ('cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis', 'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi'))),
    CONSTRAINT sports_image_key_check CHECK ((image_key IN ('cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis', 'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi'))),
    CONSTRAINT sports_pkey PRIMARY KEY (id)
);

-- Cards on each sport's screen (Book a Facility, Coaching, ...)
CREATE TABLE IF NOT EXISTS sport_events (
    id text NOT NULL,
    sport_id text NOT NULL,
    title_template text NOT NULL,
    description_template text NOT NULL,
    image_key text NOT NULL,
    icon text NOT NULL,
    action_target text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT sport_events_action_target_check CHECK ((action_target IN ('facility-select', 'schedule'))),
    CONSTRAINT sport_events_icon_check CHECK ((icon IN ('calendar', 'academy', 'coach', 'shop'))),
    CONSTRAINT sport_events_image_key_check CHECK ((image_key IN ('facility', 'academy', 'coach', 'gear'))),
    CONSTRAINT sport_events_pkey PRIMARY KEY (id),
    CONSTRAINT sport_events_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
);

-- Bookable facilities (nets, lanes, courts) per sport
CREATE TABLE IF NOT EXISTS sport_facilities (
    id text NOT NULL,
    sport_id text NOT NULL,
    facility_code text NOT NULL,
    title text NOT NULL,
    price_label text NOT NULL,
    tag_label text NOT NULL,
    address text NOT NULL,
    map_location_url text NOT NULL,
    image_key text NOT NULL,
    icon text NOT NULL,
    action_target text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT sport_facilities_action_target_check CHECK ((action_target = 'schedule')),
    CONSTRAINT sport_facilities_icon_check CHECK ((icon IN ('lane', 'net', 'court', 'field', 'academy', 'gear'))),
    CONSTRAINT sport_facilities_image_key_check CHECK ((image_key IN ('bowling-lane', 'nets-2', 'nets-3', 'nets-4', 'indoor-court', 'outdoor-field', 'pb-indoor-court', 'pb-outdoor-court'))),
    CONSTRAINT sport_facilities_pkey PRIMARY KEY (id),
    CONSTRAINT sport_facilities_sport_id_facility_code_key UNIQUE (sport_id, facility_code),
    CONSTRAINT sport_facilities_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
);

-- Legacy court/coaching packages used by the original checkout
CREATE TABLE IF NOT EXISTS packages (
    id text NOT NULL,
    label text NOT NULL,
    price numeric(12,2) NOT NULL,
    per_label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT packages_price_check CHECK ((price >= 0)),
    CONSTRAINT packages_pkey PRIMARY KEY (id)
);

-- Customer, coach and admin accounts
CREATE TABLE IF NOT EXISTS users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    full_name text DEFAULT 'User' NOT NULL,
    mobile_number text DEFAULT '+6500000000' NOT NULL,
    password_encrypted text DEFAULT '' NOT NULL,
    password_reset_code text,
    password_reset_expires_at TIMESTAMPTZ,
    auth_provider text DEFAULT 'password' NOT NULL,
    role text DEFAULT 'public' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT users_auth_provider_check CHECK ((auth_provider IN ('password', 'google'))),
    CONSTRAINT users_role_check CHECK ((role IN ('public', 'coach', 'admin'))),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- Generated 30-minute slots per facility and date (created on demand)
CREATE TABLE IF NOT EXISTS slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_date date NOT NULL,
    slot_time TIME NOT NULL,
    is_booked boolean DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    sport_id text NOT NULL,
    facility_code text NOT NULL,
    CONSTRAINT slots_pkey PRIMARY KEY (id)
);

-- Opening hours per facility and weekday
CREATE TABLE IF NOT EXISTS slot_weekday_configurations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sport_id text NOT NULL,
    facility_code text NOT NULL,
    weekday_name text NOT NULL,
    slot_start_time TIME NOT NULL,
    slot_end_time TIME NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT slot_weekday_configurations_check CHECK ((slot_start_time < slot_end_time)),
    CONSTRAINT slot_weekday_configurations_weekday_name_check CHECK ((weekday_name IN ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'))),
    CONSTRAINT slot_weekday_configurations_pkey PRIMARY KEY (id)
);

-- Dates with different opening hours (e.g. school holidays)
CREATE TABLE IF NOT EXISTS slot_availability_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sport_id text NOT NULL,
    facility_code text NOT NULL,
    exception_date date NOT NULL,
    slot_start_time TIME NOT NULL,
    slot_end_time TIME NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT slot_availability_exceptions_check CHECK ((slot_start_time < slot_end_time)),
    CONSTRAINT slot_availability_exceptions_pkey PRIMARY KEY (id)
);

-- One-time and recurring blocks (admin closures, Academy sessions)
CREATE TABLE IF NOT EXISTS slot_block_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_type text NOT NULL,
    admin_email text,
    sport_id text,
    facility_code text,
    facility_title text,
    selected_dates jsonb,
    valid_from date,
    valid_to date,
    weekday_name text,
    slot_start_time TIME NOT NULL,
    slot_end_time TIME NOT NULL,
    reason text NOT NULL,
    blocked_slot_count integer DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT slot_block_rules_check CHECK ((slot_start_time < slot_end_time)),
    CONSTRAINT slot_block_rules_check1 CHECK (((sport_id IS NULL) = (facility_code IS NULL))),
    CONSTRAINT slot_block_rules_check2 CHECK ((((rule_type = 'one-time') AND (admin_email IS NOT NULL) AND (selected_dates IS NOT NULL) AND (jsonb_typeof(selected_dates) = 'array') AND (valid_from IS NULL) AND (valid_to IS NULL) AND (weekday_name IS NULL)) OR ((rule_type = 'recurring') AND (sport_id IS NOT NULL) AND (facility_code IS NOT NULL) AND (selected_dates IS NULL) AND (valid_from IS NOT NULL) AND (valid_to IS NOT NULL) AND (valid_from <= valid_to) AND (weekday_name IN ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'))))),
    CONSTRAINT slot_block_rules_rule_type_check CHECK ((rule_type IN ('one-time', 'recurring'))),
    CONSTRAINT slot_block_rules_pkey PRIMARY KEY (id)
);

-- Short-lived holds on slots during checkout
CREATE TABLE IF NOT EXISTS slot_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_date date NOT NULL,
    slot_time TIME NOT NULL,
    customer_email text NOT NULL,
    lock_token text NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    sport_id text NOT NULL,
    facility_code text NOT NULL,
    CONSTRAINT slot_reservations_status_check CHECK ((status IN ('pending', 'confirmed', 'released'))),
    CONSTRAINT slot_reservations_lock_token_key UNIQUE (lock_token),
    CONSTRAINT slot_reservations_pkey PRIMARY KEY (id)
);

-- Court bookings and their payments
CREATE TABLE IF NOT EXISTS bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_type text NOT NULL,
    sport_id text,
    facility_code text,
    slot_date date NOT NULL,
    slot_time TIME NOT NULL,
    duration_mins integer NOT NULL,
    package_id text,
    pay_method text NOT NULL,
    grand_total numeric(12,2) NOT NULL,
    receipt_id text NOT NULL,
    customer_email text NOT NULL,
    facility_title text,
    facility_address text,
    facility_image_key text,
    facility_tag text,
    status text NOT NULL,
    payment_method text NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT bookings_booking_type_check CHECK ((booking_type IN ('court', 'coaching'))),
    CONSTRAINT bookings_duration_mins_check CHECK ((duration_mins > 0)),
    CONSTRAINT bookings_grand_total_check CHECK ((grand_total >= 0)),
    CONSTRAINT bookings_pay_method_check CHECK ((pay_method IN ('STRIPE', 'GPAY', 'PAYNOW', 'GRABPAY'))),
    CONSTRAINT bookings_payment_method_check CHECK ((payment_method IN ('ONLINE', 'CASH'))),
    CONSTRAINT bookings_status_check CHECK ((status IN ('confirmed', 'cash_pending', 'cancelled'))),
    CONSTRAINT bookings_pkey PRIMARY KEY (id),
    CONSTRAINT bookings_receipt_id_key UNIQUE (receipt_id),
    CONSTRAINT bookings_package_id_fkey FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL
);

-- Runtime settings (key/value)
CREATE TABLE IF NOT EXISTS system_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_type text NOT NULL,
    config_key text NOT NULL,
    config_value text NOT NULL,
    value_type text DEFAULT 'STRING' NOT NULL,
    description text DEFAULT '' NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT system_configs_value_type_check CHECK ((value_type IN ('STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'JSON'))),
    CONSTRAINT system_configs_config_type_config_key_key UNIQUE (config_type, config_key),
    CONSTRAINT system_configs_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_bookings_customer_email ON bookings (customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_facility ON bookings (sport_id, facility_code);
CREATE INDEX IF NOT EXISTS idx_bookings_slot_lookup ON bookings (slot_date, slot_time);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_availability_exceptions_facility_date ON slot_availability_exceptions (sport_id, facility_code, exception_date);
CREATE INDEX IF NOT EXISTS idx_slot_block_rules_active_lookup ON slot_block_rules (rule_type, sport_id, facility_code) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_block_rules_recurring_unique ON slot_block_rules (sport_id, facility_code, valid_from, valid_to, weekday_name, slot_start_time, slot_end_time) WHERE (rule_type = 'recurring');
CREATE INDEX IF NOT EXISTS idx_slot_reservations_lookup ON slot_reservations (sport_id, facility_code, slot_date, slot_time, status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_weekday_configurations_facility_day_unique ON slot_weekday_configurations (sport_id, facility_code, weekday_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slots_facility_date_time_unique ON slots (sport_id, facility_code, slot_date, slot_time);
CREATE INDEX IF NOT EXISTS idx_slots_slot_date_booked ON slots (slot_date, is_booked, slot_time);
CREATE INDEX IF NOT EXISTS idx_sport_facilities_sport_sort ON sport_facilities (sport_id, sort_order, facility_code);
CREATE INDEX IF NOT EXISTS idx_system_configs_type ON system_configs (config_type) WHERE ((deleted_at IS NULL) AND (is_active = true));

-- -----------------------------------------------------------------------------
-- 3. Starter data (insert-only: existing rows are never changed)
-- -----------------------------------------------------------------------------

-- Legacy packages (5 rows)
INSERT INTO packages (id, label, price, per_label, sort_order, created_by, updated_by) VALUES
  ('single', 'Single Session', 120.00, 'SGD 120.00 / session', 1, 'system', 'system'),
  ('pack3', '3-Session Pack', 88.00, 'SGD 29.33 / session', 2, 'system', 'system'),
  ('pack10', '10-Session Pack', 250.00, 'SGD 25.00 / session', 3, 'system', 'system'),
  ('pack15', '15-Session Pack', 350.00, 'SGD 23.33 / session', 4, 'system', 'system'),
  ('pack20', '20-Session Pack', 450.00, 'SGD 22.50 / session', 5, 'system', 'system')
ON CONFLICT DO NOTHING;

-- Sports (12 rows)
INSERT INTO sports (id, label, image_key, banner_key, enabled, sort_order, created_by, updated_by) VALUES
  ('cricket', 'Cricket', 'cricket', 'cricket', true, 1, 'system', 'system'),
  ('indoor-cricket', 'Indoor Cricket', 'indoor-cricket', 'indoor-cricket', true, 2, 'system', 'system'),
  ('pickleball', 'Pickleball', 'pickleball', 'pickleball', true, 3, 'system', 'system'),
  ('futsal', 'Futsal', 'futsal', 'futsal', false, 4, 'system', 'system'),
  ('sepak-takraw', 'Sepak Takraw', 'sepak-takraw', 'sepak-takraw', false, 5, 'system', 'system'),
  ('tennis', 'Tennis', 'tennis', 'tennis', false, 6, 'system', 'system'),
  ('table-tennis', 'Table Tennis', 'table-tennis', 'table-tennis', false, 7, 'system', 'system'),
  ('soccer', 'Soccer', 'soccer', 'soccer', false, 8, 'system', 'system'),
  ('volleyball', 'Volleyball', 'volleyball', 'volleyball', false, 9, 'system', 'system'),
  ('badminton', 'Badminton', 'badminton', 'badminton', false, 10, 'system', 'system'),
  ('basketball', 'Basketball', 'basketball', 'basketball', false, 11, 'system', 'system'),
  ('kabaddi', 'Kabaddi', 'kabaddi', 'kabaddi', false, 12, 'system', 'system')
ON CONFLICT DO NOTHING;

-- Sport screen cards (28 rows)
INSERT INTO sport_events (id, sport_id, title_template, description_template, image_key, icon, action_target, enabled, sort_order, created_by, updated_by) VALUES
  ('cricket-book-facility', 'cricket', 'Book a Facility', 'Find and book top {sportLower} venues near you.', 'facility', 'calendar', 'facility-select', true, 1, 'system', 'system'),
  ('cricket-join-academy', 'cricket', 'Join {sport} Academy', 'Learn from expert coaches and take your {sportLower} game to the next level.', 'academy', 'academy', 'schedule', false, 2, 'system', 'system'),
  ('cricket-coach-session', 'cricket', 'Book a One on One Session with Coach', 'Get personalized {sportLower} coaching to improve your skills faster.', 'coach', 'coach', 'schedule', false, 3, 'system', 'system'),
  ('cricket-purchase-gear', 'cricket', 'Purchase Gear', 'Shop the best {sportLower} gear and equipment.', 'gear', 'shop', 'schedule', false, 4, 'system', 'system'),
  ('futsal-book-facility', 'futsal', 'Book a Facility', 'Find and book top {sportLower} venues near you.', 'facility', 'calendar', 'facility-select', true, 1, 'system', 'system'),
  ('futsal-join-academy', 'futsal', 'Join {sport} Academy', 'Learn from expert coaches and take your {sportLower} game to the next level.', 'academy', 'academy', 'schedule', false, 2, 'system', 'system'),
  ('futsal-coach-session', 'futsal', 'Book a One on One Session with Coach', 'Get personalized {sportLower} coaching to improve your skills faster.', 'coach', 'coach', 'schedule', false, 3, 'system', 'system'),
  ('futsal-purchase-gear', 'futsal', 'Purchase Gear', 'Shop the best {sportLower} gear and equipment.', 'gear', 'shop', 'schedule', false, 4, 'system', 'system'),
  ('indoor-cricket-book-facility', 'indoor-cricket', 'Book a Facility', 'Find and book top {sportLower} venues near you.', 'facility', 'calendar', 'facility-select', true, 1, 'system', 'system'),
  ('indoor-cricket-join-academy', 'indoor-cricket', 'Join {sport} Academy', 'Learn from expert coaches and take your {sportLower} game to the next level.', 'academy', 'academy', 'schedule', false, 2, 'system', 'system'),
  ('indoor-cricket-coach-session', 'indoor-cricket', 'Book a One on One Session with Coach', 'Get personalized {sportLower} coaching to improve your skills faster.', 'coach', 'coach', 'schedule', false, 3, 'system', 'system'),
  ('indoor-cricket-purchase-gear', 'indoor-cricket', 'Purchase Gear', 'Shop the best {sportLower} gear and equipment.', 'gear', 'shop', 'schedule', false, 4, 'system', 'system'),
  ('pickleball-book-facility', 'pickleball', 'Book a Facility', 'Find and book top {sportLower} venues near you.', 'facility', 'calendar', 'facility-select', true, 1, 'system', 'system'),
  ('pickleball-join-academy', 'pickleball', 'Join {sport} Academy', 'Learn from expert coaches and take your {sportLower} game to the next level.', 'academy', 'academy', 'schedule', false, 2, 'system', 'system'),
  ('pickleball-coach-session', 'pickleball', 'Book a One on One Session with Coach', 'Get personalized {sportLower} coaching to improve your skills faster.', 'coach', 'coach', 'schedule', false, 3, 'system', 'system'),
  ('pickleball-purchase-gear', 'pickleball', 'Purchase Gear', 'Shop the best {sportLower} gear and equipment.', 'gear', 'shop', 'schedule', false, 4, 'system', 'system'),
  ('sepak-takraw-book-facility', 'sepak-takraw', 'Book a Facility', 'Find and book top {sportLower} venues near you.', 'facility', 'calendar', 'facility-select', true, 1, 'system', 'system'),
  ('sepak-takraw-join-academy', 'sepak-takraw', 'Join {sport} Academy', 'Learn from expert coaches and take your {sportLower} game to the next level.', 'academy', 'academy', 'schedule', false, 2, 'system', 'system'),
  ('sepak-takraw-coach-session', 'sepak-takraw', 'Book a One on One Session with Coach', 'Get personalized {sportLower} coaching to improve your skills faster.', 'coach', 'coach', 'schedule', false, 3, 'system', 'system'),
  ('sepak-takraw-purchase-gear', 'sepak-takraw', 'Purchase Gear', 'Shop the best {sportLower} gear and equipment.', 'gear', 'shop', 'schedule', false, 4, 'system', 'system'),
  ('table-tennis-book-facility', 'table-tennis', 'Book a Facility', 'Find and book top {sportLower} venues near you.', 'facility', 'calendar', 'facility-select', true, 1, 'system', 'system'),
  ('table-tennis-join-academy', 'table-tennis', 'Join {sport} Academy', 'Learn from expert coaches and take your {sportLower} game to the next level.', 'academy', 'academy', 'schedule', false, 2, 'system', 'system'),
  ('table-tennis-coach-session', 'table-tennis', 'Book a One on One Session with Coach', 'Get personalized {sportLower} coaching to improve your skills faster.', 'coach', 'coach', 'schedule', false, 3, 'system', 'system'),
  ('table-tennis-purchase-gear', 'table-tennis', 'Purchase Gear', 'Shop the best {sportLower} gear and equipment.', 'gear', 'shop', 'schedule', false, 4, 'system', 'system'),
  ('tennis-book-facility', 'tennis', 'Book a Facility', 'Find and book top {sportLower} venues near you.', 'facility', 'calendar', 'facility-select', true, 1, 'system', 'system'),
  ('tennis-join-academy', 'tennis', 'Join {sport} Academy', 'Learn from expert coaches and take your {sportLower} game to the next level.', 'academy', 'academy', 'schedule', false, 2, 'system', 'system'),
  ('tennis-coach-session', 'tennis', 'Book a One on One Session with Coach', 'Get personalized {sportLower} coaching to improve your skills faster.', 'coach', 'coach', 'schedule', false, 3, 'system', 'system'),
  ('tennis-purchase-gear', 'tennis', 'Purchase Gear', 'Shop the best {sportLower} gear and equipment.', 'gear', 'shop', 'schedule', false, 4, 'system', 'system')
ON CONFLICT DO NOTHING;

-- Facilities (17 rows)
INSERT INTO sport_facilities (id, sport_id, facility_code, title, price_label, tag_label, address, map_location_url, image_key, icon, action_target, enabled, sort_order, created_by, updated_by) VALUES
  ('cricket-bowling-lane', 'cricket', 'bowling-lane', 'Cricket Bowling Machine Lane', 'S$60', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'bowling-lane', 'lane', 'schedule', true, 1, 'system', 'system'),
  ('cricket-net-2', 'cricket', 'net-2', 'Cricket Net 2', 'S$45', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'nets-2', 'net', 'schedule', true, 2, 'system', 'system'),
  ('cricket-net-3', 'cricket', 'net-3', 'Cricket Net 3', 'S$45', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'nets-3', 'net', 'schedule', true, 3, 'system', 'system'),
  ('cricket-net-4', 'cricket', 'net-4', 'Cricket Net 4', 'S$45', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'nets-4', 'net', 'schedule', true, 4, 'system', 'system'),
  ('cricket-indoor-court', 'cricket', 'indoor-court', 'Cricket Indoor Court', 'S$140', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'indoor-court', 'court', 'schedule', true, 5, 'system', 'system'),
  ('cricket-outdoor-field', 'cricket', 'outdoor-field', 'Cricket Outdoor Field', 'S$100', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'outdoor-field', 'field', 'schedule', true, 6, 'system', 'system'),
  ('futsal-indoor-court', 'futsal', 'indoor-court', 'Futsal Indoor Court', 'S$140', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'pb-indoor-court', 'court', 'schedule', true, 1, 'system', 'system'),
  ('futsal-outdoor-field', 'futsal', 'outdoor-field', 'Futsal Outdoor Court', 'S$100', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'pb-outdoor-court', 'field', 'schedule', true, 2, 'system', 'system'),
  ('indoor-cricket-indoor-court', 'indoor-cricket', 'indoor-court', 'Indoor Cricket Indoor Court', 'S$140', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'indoor-court', 'court', 'schedule', true, 1, 'system', 'system'),
  ('pickleball-indoor-court', 'pickleball', 'indoor-court', 'Pickleball Indoor Court', 'S$30', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'pb-indoor-court', 'court', 'schedule', true, 1, 'system', 'system'),
  ('pickleball-outdoor-field', 'pickleball', 'outdoor-field', 'Pickleball Outdoor Court', 'S$25', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'pb-outdoor-court', 'field', 'schedule', true, 2, 'system', 'system'),
  ('sepak-takraw-indoor-court', 'sepak-takraw', 'indoor-court', 'Sepak Takraw Indoor Court', 'S$140', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'pb-indoor-court', 'court', 'schedule', true, 1, 'system', 'system'),
  ('sepak-takraw-outdoor-field', 'sepak-takraw', 'outdoor-field', 'Sepak Takraw Outdoor Court', 'S$100', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'pb-outdoor-court', 'field', 'schedule', true, 2, 'system', 'system'),
  ('table-tennis-indoor-court', 'table-tennis', 'indoor-court', 'Table Tennis Indoor Court', 'S$30', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'pb-indoor-court', 'court', 'schedule', true, 1, 'system', 'system'),
  ('table-tennis-outdoor-field', 'table-tennis', 'outdoor-field', 'Table Tennis Outdoor Court', 'S$25', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'pb-outdoor-court', 'field', 'schedule', true, 2, 'system', 'system'),
  ('tennis-indoor-court', 'tennis', 'indoor-court', 'Tennis Indoor Court', 'S$140', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'pb-indoor-court', 'court', 'schedule', true, 1, 'system', 'system'),
  ('tennis-outdoor-field', 'tennis', 'outdoor-field', 'Tennis Outdoor Court', 'S$100', 'Book Now', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 'https://maps.app.goo.gl/BWiBvM8FU3meALV27', 'pb-outdoor-court', 'field', 'schedule', true, 2, 'system', 'system')
ON CONFLICT DO NOTHING;

-- Runtime settings (2 rows)
INSERT INTO system_configs (config_type, config_key, config_value, value_type, description, created_by, updated_by) VALUES
  ('PAYMENTS', 'PAYMENT_TEST_MODE_ENABLED', 'true', 'BOOLEAN', 'Whether the developer-only custom-amount Stripe test endpoint is active', 'system', 'system'),
  ('RESERVATION', 'SLOT_LOCK_DURATION_MINS', '10', 'INTEGER', 'Minutes a slot is held after reservation before auto-expiry', 'system', 'system')
ON CONFLICT DO NOTHING;

-- Opening hours per facility and weekday (119 rows)
INSERT INTO slot_weekday_configurations (sport_id, facility_code, weekday_name, slot_start_time, slot_end_time, created_by, updated_by) VALUES
  ('cricket', 'bowling-lane', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'indoor-court', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'indoor-court', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'indoor-court', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'indoor-court', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'indoor-court', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'indoor-court', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'indoor-court', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'outdoor-field', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'outdoor-field', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'outdoor-field', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'outdoor-field', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'outdoor-field', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'outdoor-field', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('futsal', 'outdoor-field', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('indoor-cricket', 'indoor-court', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('indoor-cricket', 'indoor-court', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('indoor-cricket', 'indoor-court', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('indoor-cricket', 'indoor-court', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('indoor-cricket', 'indoor-court', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('indoor-cricket', 'indoor-court', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('indoor-cricket', 'indoor-court', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'indoor-court', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'indoor-court', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'indoor-court', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'indoor-court', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'indoor-court', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'indoor-court', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'indoor-court', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'outdoor-field', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'outdoor-field', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'outdoor-field', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'outdoor-field', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'outdoor-field', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'outdoor-field', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('sepak-takraw', 'outdoor-field', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'indoor-court', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'indoor-court', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'indoor-court', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'indoor-court', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'indoor-court', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'indoor-court', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'indoor-court', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'outdoor-field', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'outdoor-field', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'outdoor-field', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'outdoor-field', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'outdoor-field', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'outdoor-field', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('table-tennis', 'outdoor-field', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'indoor-court', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'indoor-court', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'indoor-court', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'indoor-court', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'indoor-court', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'indoor-court', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'indoor-court', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'outdoor-field', 'sunday', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'outdoor-field', 'monday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'outdoor-field', 'tuesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'outdoor-field', 'wednesday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'outdoor-field', 'thursday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'outdoor-field', 'friday', '16:00:00', '19:00:00', 'seed', 'seed'),
  ('tennis', 'outdoor-field', 'saturday', '08:00:00', '19:00:00', 'seed', 'seed')
ON CONFLICT DO NOTHING;

-- 2026 opening-hour exceptions (08:00-19:00 on these dates) (200 rows)
INSERT INTO slot_availability_exceptions (sport_id, facility_code, exception_date, slot_start_time, slot_end_time, created_by, updated_by) VALUES
  ('cricket', 'bowling-lane', '2026-08-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-11-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-01', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-02', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-03', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-04', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-07', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-08', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-11', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-14', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-15', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-16', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-17', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-18', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-21', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-22', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-23', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-24', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-25', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-28', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-29', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-30', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'bowling-lane', '2026-12-31', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-08-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-11-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-01', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-02', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-03', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-04', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-07', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-08', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-11', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-14', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-15', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-16', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-17', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-18', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-21', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-22', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-23', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-24', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-25', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-28', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-29', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-30', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'indoor-court', '2026-12-31', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-08-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-11-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-01', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-02', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-03', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-04', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-07', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-08', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-11', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-14', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-15', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-16', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-17', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-18', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-21', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-22', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-23', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-24', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-25', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-28', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-29', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-30', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-2', '2026-12-31', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-08-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-11-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-01', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-02', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-03', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-04', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-07', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-08', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-11', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-14', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-15', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-16', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-17', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-18', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-21', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-22', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-23', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-24', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-25', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-28', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-29', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-30', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-3', '2026-12-31', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-08-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-11-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-01', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-02', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-03', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-04', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-07', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-08', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-11', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-14', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-15', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-16', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-17', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-18', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-21', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-22', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-23', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-24', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-25', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-28', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-29', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-30', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'net-4', '2026-12-31', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-08-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-11-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-01', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-02', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-03', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-04', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-07', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-08', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-11', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-14', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-15', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-16', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-17', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-18', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-21', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-22', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-23', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-24', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-25', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-28', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-29', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-30', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('cricket', 'outdoor-field', '2026-12-31', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-08-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-11-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-01', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-02', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-03', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-04', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-07', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-08', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-11', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-14', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-15', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-16', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-17', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-18', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-21', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-22', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-23', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-24', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-25', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-28', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-29', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-30', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'indoor-court', '2026-12-31', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-08-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-11-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-01', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-02', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-03', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-04', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-07', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-08', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-09', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-10', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-11', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-14', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-15', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-16', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-17', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-18', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-21', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-22', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-23', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-24', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-25', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-28', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-29', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-30', '08:00:00', '19:00:00', 'seed', 'seed'),
  ('pickleball', 'outdoor-field', '2026-12-31', '08:00:00', '19:00:00', 'seed', 'seed')
ON CONFLICT DO NOTHING;

-- 2026 recurring Academy blocks (21 rows)
INSERT INTO slot_block_rules (rule_type, sport_id, facility_code, valid_from, valid_to, weekday_name, slot_start_time, slot_end_time, reason, created_by, updated_by) VALUES
  ('recurring', 'cricket', 'bowling-lane', '2026-01-01', '2026-12-31', 'saturday', '08:00:00', '10:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'bowling-lane', '2026-01-01', '2026-12-31', 'saturday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'indoor-court', '2026-01-01', '2026-12-31', 'saturday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-2', '2026-01-01', '2026-12-31', 'sunday', '08:00:00', '10:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-2', '2026-01-01', '2026-12-31', 'sunday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-2', '2026-01-01', '2026-12-31', 'wednesday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-2', '2026-01-01', '2026-12-31', 'friday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-2', '2026-01-01', '2026-12-31', 'saturday', '08:00:00', '10:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-2', '2026-01-01', '2026-12-31', 'saturday', '13:30:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-3', '2026-01-01', '2026-12-31', 'sunday', '08:00:00', '10:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-3', '2026-01-01', '2026-12-31', 'sunday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-3', '2026-01-01', '2026-12-31', 'wednesday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-3', '2026-01-01', '2026-12-31', 'friday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-3', '2026-01-01', '2026-12-31', 'saturday', '08:00:00', '10:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-3', '2026-01-01', '2026-12-31', 'saturday', '13:30:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-4', '2026-01-01', '2026-12-31', 'sunday', '08:00:00', '10:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-4', '2026-01-01', '2026-12-31', 'sunday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-4', '2026-01-01', '2026-12-31', 'wednesday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-4', '2026-01-01', '2026-12-31', 'friday', '16:00:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-4', '2026-01-01', '2026-12-31', 'saturday', '08:00:00', '10:00:00', 'SGO Academy Sessions', 'seed', 'seed'),
  ('recurring', 'cricket', 'net-4', '2026-01-01', '2026-12-31', 'saturday', '13:30:00', '18:00:00', 'SGO Academy Sessions', 'seed', 'seed')
ON CONFLICT DO NOTHING;

COMMIT;
