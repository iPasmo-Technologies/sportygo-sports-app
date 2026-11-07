-- =============================================================================
-- SportyGo database setup, v1.1 (one-on-one coaching)
--
-- Adds everything the SGO-48 branch needs on top of v1.0:
--   Part A: one-on-one coaching (packages, weekly sessions, dated sessions,
--           purchases, session bookings) and the 'coach-packages' card action.
--   Part B: other database changes on this branch that are not on main yet
--           (Stripe payment reuse protection for court bookings, and the
--           table that records one-time data migrations).
-- Generated from a database built by this branch's `db:migrate` and `db:seed`.
--
-- Run v1.0_initial_db_setup.sql first.
--
-- Safe to run more than once: IF NOT EXISTS everywhere and every INSERT uses
-- ON CONFLICT DO NOTHING. Nothing is deleted and existing rows are never
-- changed. No customer data is included.
--
-- How to run (one transaction: everything is applied, or nothing):
--   psql "<connection string>" -v ON_ERROR_STOP=1 -f database/scripts/v1.1_one_on_one_setup.sql
-- =============================================================================

BEGIN;


-- =============================================================================
-- Part A: one-on-one coaching
-- =============================================================================


-- -----------------------------------------------------------------------------
-- A1. Allow sport cards to open the coaching package screen
-- -----------------------------------------------------------------------------

-- Replaces the list of allowed card actions; the new list keeps the two old values.
ALTER TABLE sport_events DROP CONSTRAINT IF EXISTS sport_events_action_target_check;
ALTER TABLE sport_events ADD CONSTRAINT sport_events_action_target_check
  CHECK (action_target IN ('facility-select', 'schedule', 'coach-packages'));

-- -----------------------------------------------------------------------------
-- A2. Coaching tables
-- -----------------------------------------------------------------------------

-- Coaching packages per sport (sessions, price, validity)
CREATE TABLE IF NOT EXISTS coaching_packages (
    id text NOT NULL,
    sport_id text NOT NULL,
    title text NOT NULL,
    session_count integer NOT NULL,
    price numeric(12,2) NOT NULL,
    validity_weeks integer NOT NULL,
    description text DEFAULT '' NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT coaching_packages_price_check CHECK ((price > 0)),
    CONSTRAINT coaching_packages_session_count_check CHECK ((session_count > 0)),
    CONSTRAINT coaching_packages_validity_weeks_check CHECK ((validity_weeks > 0)),
    CONSTRAINT coaching_packages_pkey PRIMARY KEY (id)
);

-- Weekly coaching session pattern
CREATE TABLE IF NOT EXISTS coaching_session_templates (
    id text NOT NULL,
    sport_id text NOT NULL,
    day_of_week smallint NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    title text NOT NULL,
    location text NOT NULL,
    spots integer NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT coaching_session_templates_check CHECK ((end_time > start_time)),
    CONSTRAINT coaching_session_templates_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
    CONSTRAINT coaching_session_templates_spots_check CHECK (((spots >= 1) AND (spots <= 50))),
    CONSTRAINT coaching_session_templates_pkey PRIMARY KEY (id)
);

-- Dated coaching sessions generated from the weekly pattern
CREATE TABLE IF NOT EXISTS coaching_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id text,
    sport_id text NOT NULL,
    session_date date NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    title text NOT NULL,
    location text NOT NULL,
    spots integer NOT NULL,
    status text DEFAULT 'scheduled' NOT NULL,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT coaching_sessions_check CHECK ((end_time > start_time)),
    CONSTRAINT coaching_sessions_spots_check CHECK (((spots >= 1) AND (spots <= 50))),
    CONSTRAINT coaching_sessions_status_check CHECK ((status IN ('scheduled', 'cancelled'))),
    CONSTRAINT coaching_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT coaching_sessions_sport_id_session_date_start_time_location_key UNIQUE (sport_id, session_date, start_time, location),
    CONSTRAINT coaching_sessions_template_id_fkey FOREIGN KEY (template_id) REFERENCES coaching_session_templates(id) ON DELETE SET NULL
);

-- Packages bought by customers and their remaining sessions
CREATE TABLE IF NOT EXISTS coaching_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_email text NOT NULL,
    sport_id text NOT NULL,
    package_id text NOT NULL,
    package_title text NOT NULL,
    total_sessions integer NOT NULL,
    remaining_sessions integer NOT NULL,
    amount_paid numeric(12,2) NOT NULL,
    receipt_id text NOT NULL,
    stripe_payment_intent_id text NOT NULL,
    purchased_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT coaching_purchases_amount_paid_check CHECK ((amount_paid >= 0)),
    CONSTRAINT coaching_purchases_remaining_check CHECK (((remaining_sessions >= 0) AND (remaining_sessions <= total_sessions))),
    CONSTRAINT coaching_purchases_total_sessions_check CHECK ((total_sessions > 0)),
    CONSTRAINT coaching_purchases_pkey PRIMARY KEY (id),
    CONSTRAINT coaching_purchases_receipt_id_key UNIQUE (receipt_id),
    CONSTRAINT coaching_purchases_stripe_intent_unique UNIQUE (stripe_payment_intent_id),
    CONSTRAINT coaching_purchases_package_id_fkey FOREIGN KEY (package_id) REFERENCES coaching_packages(id)
);

-- Customer bookings of coaching sessions
CREATE TABLE IF NOT EXISTS coaching_session_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    purchase_id uuid NOT NULL,
    customer_email text NOT NULL,
    status text DEFAULT 'booked' NOT NULL,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by text DEFAULT 'system' NOT NULL,
    updated_by text DEFAULT 'system' NOT NULL,
    CONSTRAINT coaching_session_bookings_status_check CHECK ((status IN ('booked', 'cancelled'))),
    CONSTRAINT coaching_session_bookings_pkey PRIMARY KEY (id),
    CONSTRAINT coaching_session_bookings_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES coaching_purchases(id),
    CONSTRAINT coaching_session_bookings_session_id_fkey FOREIGN KEY (session_id) REFERENCES coaching_sessions(id)
);

-- -----------------------------------------------------------------------------
-- A3. Coaching indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_coaching_purchases_customer ON coaching_purchases (customer_email, sport_id, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coaching_session_bookings_active_unique ON coaching_session_bookings (session_id, customer_email) WHERE (status = 'booked');
CREATE INDEX IF NOT EXISTS idx_coaching_session_bookings_customer ON coaching_session_bookings (customer_email, status);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_upcoming ON coaching_sessions (sport_id, session_date, start_time);

-- -----------------------------------------------------------------------------
-- A4. Coaching starter data (insert-only)
-- -----------------------------------------------------------------------------

-- Coaching packages (cricket and indoor cricket have none yet) (4 rows)
INSERT INTO coaching_packages (id, sport_id, title, session_count, price, validity_weeks, description, enabled, sort_order, created_by, updated_by) VALUES
  ('pickleball-3-sessions', 'pickleball', 'Pickleball 3 Sessions Package', 3, 88.00, 5, 'A short starter pack to build your pickleball fundamentals.', true, 1, 'seed', 'system'),
  ('pickleball-10-sessions', 'pickleball', 'Pickleball 10 Sessions Package', 10, 250.00, 13, 'Regular coaching to sharpen your shots, footwork and court positioning.', true, 2, 'seed', 'system'),
  ('pickleball-15-sessions', 'pickleball', 'Pickleball 15 Sessions Package', 15, 350.00, 18, 'Structured development for committed players preparing for league play.', true, 3, 'seed', 'system'),
  ('pickleball-20-sessions', 'pickleball', 'Pickleball 20 Sessions Package', 20, 450.00, 25, 'Our best value per session, covering singles and doubles tactics.', true, 4, 'seed', 'system')
ON CONFLICT DO NOTHING;

-- Weekly coaching sessions (day_of_week: 0 = Sunday ... 6 = Saturday) (1 row)
INSERT INTO coaching_session_templates (id, sport_id, day_of_week, start_time, end_time, title, location, spots, enabled, created_by, updated_by) VALUES
  ('pickleball-mon-1800', 'pickleball', 1, '18:00:00', '19:00:00', 'Monday Evening Drills & Skills', 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842', 4, true, 'seed', 'system')
ON CONFLICT DO NOTHING;

-- Dated coaching sessions for the next 4 weeks (today + 27 days, Singapore time),
-- one per matching weekday of each enabled weekly session. The backend keeps
-- adding new weeks on its own whenever the session list is opened.
INSERT INTO coaching_sessions (template_id, sport_id, session_date, start_time, end_time, title, location, spots, created_by, updated_by)
SELECT template.id, template.sport_id, day::date, template.start_time, template.end_time,
       template.title, template.location, template.spots, 'system', 'system'
FROM coaching_session_templates AS template
CROSS JOIN generate_series(
  (NOW() AT TIME ZONE 'Asia/Singapore')::date,
  (NOW() AT TIME ZONE 'Asia/Singapore')::date + 27,
  INTERVAL '1 day'
) AS day
WHERE template.enabled
  AND EXTRACT(DOW FROM day) = template.day_of_week
ON CONFLICT DO NOTHING;


-- =============================================================================
-- Part B: other changes on this branch (not coaching, not on main yet)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- B1. Stop one Stripe payment confirming more than one court booking
-- -----------------------------------------------------------------------------

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_stripe_payment_intent_unique ON bookings (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);

-- -----------------------------------------------------------------------------
-- B2. Record of one-time data migrations (backend/src/lib/dataMigrations.ts)
-- -----------------------------------------------------------------------------

-- Each row is a migration that already ran on this database
CREATE TABLE IF NOT EXISTS applied_data_migrations (
    id text NOT NULL,
    description text NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT applied_data_migrations_pkey PRIMARY KEY (id)
);

COMMIT;
