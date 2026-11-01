# SportyGo Database Design

Read this schema reference after onboarding. It describes the PostgreSQL tables created and maintained by the
backend schema initializer in [`backend/src/lib/database.ts`](../backend/src/lib/database.ts).
It is intended as a business-oriented reference for what each table and column
stores. The initializer also contains compatibility migrations; this document
describes the resulting, current schema rather than the historical schema.

## At a glance

| Table | Purpose |
|---|---|
| `users` | Customer, coach, and administrator accounts and authentication data |
| `packages` | Bookable package options and their prices |
| `sports` | Sports catalog and presentation settings |
| `sport_events` | Actions or event cards associated with a sport |
| `sport_facilities` | Bookable facilities associated with a sport |
| `slots` | Individual date-and-time availability slots for facilities |
| `slot_weekday_configurations` | Regular weekly opening/availability windows per facility |
| `slot_availability_exceptions` | Date-specific availability windows per facility |
| `slot_block_rules` | One-time or recurring rules that block facility time |
| `bookings` | Customer booking, payment, and booking-time facility details |
| `slot_reservations` | Temporary holds on a slot while a customer completes booking |
| `system_configs` | Typed application and business configuration values |

## How the data fits together

```text
sports
  ├── sport_events
  └── sport_facilities
        ├── slot_weekday_configurations
        ├── slot_availability_exceptions
        ├── slot_block_rules
        ├── slots
        ├── slot_reservations
        └── bookings

packages ── bookings
users (accounts are referenced by email in booking and reservation workflows)
```

`sport_events.sport_id` and `sport_facilities.sport_id` have database foreign
keys to `sports.id`. `bookings.package_id` references `packages.id`. Some
facility-related tables store `sport_id` and `facility_code` as a logical
facility key, but do not declare a foreign key to `sport_facilities`; the
application uses the pair to identify a facility. Likewise, booking and
reservation customer emails are stored directly rather than as foreign keys to
`users`.

## Shared conventions

- `id` is the table's primary identifier. Most operational rows use a generated
  UUID; catalog rows use stable text IDs.
- Tables with audit metadata use `created_at` and `updated_at` timestamps,
  `created_by` and `updated_by` actor labels, and (where present) `deleted_at`
  for soft deletion. `deleted_at IS NULL` generally means the row is active.
- `created_by` and `updated_by` default to `system`. Applications may set these
  to the actor responsible for a change.
- `NULL` means a value is optional or does not apply. Check constraints may
  require or prohibit optional fields depending on a row's type.
- Times are local clock times (`TIME`); dates are calendar dates (`DATE`).
  Timestamp metadata uses `TIMESTAMPTZ`.

## Tables and columns

### `users`

Stores registered accounts, sign-in credentials, password reset state, and
authorization role.

| Column | Type | Meaning |
|---|---|---|
| `id` | `UUID` | Primary account identifier; generated automatically. |
| `email` | `TEXT` | Required unique email address used to identify the account. |
| `full_name` | `TEXT` | Display name; defaults to `User`. |
| `mobile_number` | `TEXT` | Phone number; defaults to a placeholder Singapore number. |
| `password_encrypted` | `TEXT` | Encrypted-at-rest password credential; empty by default for accounts without a local password. |
| `password_reset_code` | `TEXT`, nullable | Temporary code used to reset a password. |
| `password_reset_expires_at` | `TIMESTAMPTZ`, nullable | Expiry time for the reset code. |
| `auth_provider` | `TEXT` | Sign-in method: `password` or `google`; defaults to `password`. |
| `role` | `TEXT` | Authorization role: `public`, `coach`, or `admin`; defaults to `public`. |
| `created_at` | `TIMESTAMPTZ` | Account creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

### `packages`

Defines package options that can be selected for a booking. A package may be
removed without deleting historical bookings; `bookings.package_id` is set to
`NULL` when its referenced package is deleted.

| Column | Type | Meaning |
|---|---|---|
| `id` | `TEXT` | Stable package identifier and primary key. |
| `label` | `TEXT` | Name shown to the customer. |
| `price` | `NUMERIC(12,2)` | Package price; must be zero or greater. |
| `per_label` | `TEXT` | Unit or pricing qualifier displayed with the price. |
| `sort_order` | `INTEGER` | Display ordering; defaults to `0`. |
| `created_at` | `TIMESTAMPTZ` | Row creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

### `sports`

The sports catalog used to present and order sport choices in the application.

| Column | Type | Meaning |
|---|---|---|
| `id` | `TEXT` | Stable sport key and primary key. Current allowed keys: `cricket`, `indoor-cricket`, `pickleball`, `futsal`, `sepak-takraw`, `tennis`, `table-tennis`, `soccer`, `volleyball`, `badminton`, `basketball`, `kabaddi`. |
| `label` | `TEXT` | Customer-facing sport name. |
| `image_key` | `TEXT` | Asset key for the sport image; constrained to the current sport keys listed above. |
| `banner_key` | `TEXT` | Asset key for the sport banner; constrained to the current sport keys listed above. |
| `enabled` | `BOOLEAN` | Whether the sport is available in the customer-facing catalog; defaults to `TRUE`. |
| `sort_order` | `INTEGER` | Catalog display ordering; defaults to `0`. |
| `created_at` | `TIMESTAMPTZ` | Row creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

### `sport_events`

Stores sport-specific event or action cards, including their copy, visual
assets, and the destination/action they trigger.

| Column | Type | Meaning |
|---|---|---|
| `id` | `TEXT` | Stable event key and primary key. |
| `sport_id` | `TEXT` | Parent sport; references `sports.id`, and is required. |
| `title_template` | `TEXT` | Display title, potentially formatted using sport-related context. |
| `description_template` | `TEXT` | Supporting display copy. |
| `image_key` | `TEXT` | Event-card image category: `facility`, `academy`, `coach`, or `gear`. |
| `icon` | `TEXT` | UI icon category: `calendar`, `academy`, `coach`, or `shop`. |
| `action_target` | `TEXT` | Destination action: `facility-select` or `schedule`. |
| `enabled` | `BOOLEAN` | Whether the event is shown; defaults to `TRUE`. |
| `sort_order` | `INTEGER` | Display ordering; defaults to `0`. |
| `created_at` | `TIMESTAMPTZ` | Row creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

Deleting a sport cascades to its `sport_events`.

### `sport_facilities`

Stores the bookable venues/courts/facilities for each sport, along with
customer-facing descriptions, location, and visual metadata.

| Column | Type | Meaning |
|---|---|---|
| `id` | `TEXT` | Stable facility row identifier and primary key. |
| `sport_id` | `TEXT` | Parent sport; references `sports.id`, and is required. |
| `facility_code` | `TEXT` | Facility key unique within its sport. The `(sport_id, facility_code)` pair identifies the facility for scheduling and booking. |
| `title` | `TEXT` | Facility name shown to customers. |
| `price_label` | `TEXT` | Customer-facing price text for the facility. |
| `tag_label` | `TEXT` | Short customer-facing tag or callout. |
| `address` | `TEXT` | Physical facility address. |
| `map_location_url` | `TEXT` | Link to the facility's map location. |
| `image_key` | `TEXT` | Facility image asset key; currently one of `bowling-lane`, `nets-2`, `nets-3`, `nets-4`, `indoor-court`, `outdoor-field`, `pb-indoor-court`, or `pb-outdoor-court`. |
| `icon` | `TEXT` | UI icon category: `lane`, `net`, `court`, `field`, `academy`, or `gear`. |
| `action_target` | `TEXT` | Facility action destination; currently `schedule`. |
| `enabled` | `BOOLEAN` | Whether customers can see/select the facility; defaults to `TRUE`. |
| `sort_order` | `INTEGER` | Display ordering within the sport; defaults to `0`. |
| `created_at` | `TIMESTAMPTZ` | Row creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

The `(sport_id, facility_code)` pair is unique. Deleting a sport cascades to its
facilities.

### `slots`

Represents an individual facility time slot on a specific date. The unique
facility/date/time combination prevents duplicate slots for the same facility.

| Column | Type | Meaning |
|---|---|---|
| `id` | `UUID` | Primary slot identifier; generated automatically. |
| `sport_id` | `TEXT` | Sport key for the facility this slot belongs to. |
| `facility_code` | `TEXT` | Facility key; used with `sport_id` to identify the facility. |
| `slot_date` | `DATE` | Calendar date of the slot. |
| `slot_time` | `TIME` | Start time of the slot. |
| `is_booked` | `BOOLEAN` | Whether the slot is booked; defaults to `FALSE`. |
| `created_at` | `TIMESTAMPTZ` | Row creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

The unique key is `(sport_id, facility_code, slot_date, slot_time)`.

### `slot_weekday_configurations`

Defines the regular weekly time window when a facility can offer slots, one
configuration per weekday and facility.

| Column | Type | Meaning |
|---|---|---|
| `id` | `UUID` | Primary configuration identifier; generated automatically. |
| `sport_id` | `TEXT` | Sport key for the facility. |
| `facility_code` | `TEXT` | Facility key; used with `sport_id` to identify the facility. |
| `weekday_name` | `TEXT` | Day of week: `sunday`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, or `saturday`. |
| `slot_start_time` | `TIME` | Start of the regular availability window. |
| `slot_end_time` | `TIME` | End of the regular availability window; must be later than the start. |
| `created_at` | `TIMESTAMPTZ` | Row creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

The unique key is `(sport_id, facility_code, weekday_name)`.

### `slot_availability_exceptions`

Defines an availability window for a specific facility and calendar date. It is
used when that date's availability differs from the regular weekday schedule.

| Column | Type | Meaning |
|---|---|---|
| `id` | `UUID` | Primary exception identifier; generated automatically. |
| `sport_id` | `TEXT` | Sport key for the facility. |
| `facility_code` | `TEXT` | Facility key; used with `sport_id` to identify the facility. |
| `exception_date` | `DATE` | Date the exception applies to. |
| `slot_start_time` | `TIME` | Start of the exception availability window. |
| `slot_end_time` | `TIME` | End of the exception availability window; must be later than the start. |
| `created_at` | `TIMESTAMPTZ` | Row creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

The unique key is `(sport_id, facility_code, exception_date)`.

### `slot_block_rules`

Stores rules that make facility time unavailable. A rule can apply to selected
dates once or recur on a weekday over a date range.

| Column | Type | Meaning |
|---|---|---|
| `id` | `UUID` | Primary block-rule identifier; generated automatically. |
| `rule_type` | `TEXT` | Rule kind: `one-time` or `recurring`. |
| `admin_email` | `TEXT`, nullable | Administrator associated with a one-time block. Required for a `one-time` rule. |
| `sport_id` | `TEXT`, nullable | Sport key for the blocked facility. Required for a `recurring` rule. |
| `facility_code` | `TEXT`, nullable | Facility key; paired with `sport_id`. Required for a `recurring` rule. |
| `facility_title` | `TEXT`, nullable | Facility title captured for a one-time block/display context. |
| `selected_dates` | `JSONB`, nullable | Array of dates for a `one-time` rule; must be absent for a `recurring` rule. |
| `valid_from` | `DATE`, nullable | First applicable date for a `recurring` rule. |
| `valid_to` | `DATE`, nullable | Last applicable date for a `recurring` rule; cannot precede `valid_from`. |
| `weekday_name` | `TEXT`, nullable | Weekday for a `recurring` rule, using the lowercase weekday names listed above. |
| `slot_start_time` | `TIME` | Start of the blocked time window. |
| `slot_end_time` | `TIME` | End of the blocked time window; must be later than the start. |
| `reason` | `TEXT` | Explanation for blocking the time. |
| `blocked_slot_count` | `INTEGER` | Count of slots affected by a one-time block; defaults to `0`. |
| `created_at` | `TIMESTAMPTZ` | Row creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

The table enforces that start precedes end and that `sport_id` and
`facility_code` are either both set or both unset. One-time rules require
`admin_email` and a JSON array of `selected_dates`, and do not use recurrence
fields. Recurring rules require the facility pair, date range, and weekday, and
do not use `selected_dates`. A partial unique index prevents duplicate
recurring rules with the same facility, date range, weekday, and time window.

### `bookings`

Stores the confirmed or pending/cancelled customer booking and payment summary.
Facility display fields are snapshots so booking history retains the details
present at booking time even if facility catalog data later changes.

| Column | Type | Meaning |
|---|---|---|
| `id` | `UUID` | Primary booking identifier; generated automatically. |
| `booking_type` | `TEXT` | Booking category: `court` or `coaching`. |
| `sport_id` | `TEXT`, nullable | Sport key associated with the booked facility. |
| `facility_code` | `TEXT`, nullable | Facility key; paired with `sport_id`. |
| `slot_date` | `DATE` | Date of the booking. |
| `slot_time` | `TIME` | Start time of the booking. |
| `duration_mins` | `INTEGER` | Booking length in minutes; must be greater than zero. |
| `package_id` | `TEXT`, nullable | Selected package; references `packages.id`. Set to `NULL` if the package is deleted. |
| `pay_method` | `TEXT` | Payment provider/method: `STRIPE`, `GPAY`, `PAYNOW`, or `GRABPAY`. |
| `grand_total` | `NUMERIC(12,2)` | Amount charged/owed; must be zero or greater. |
| `receipt_id` | `TEXT` | Unique receipt/reference identifier. |
| `customer_email` | `TEXT` | Email address of the customer who made the booking. |
| `facility_title` | `TEXT`, nullable | Facility name snapshot at booking time. |
| `facility_address` | `TEXT`, nullable | Facility address snapshot at booking time. |
| `facility_image_key` | `TEXT`, nullable | Facility image key snapshot at booking time. |
| `facility_tag` | `TEXT`, nullable | Facility tag snapshot at booking time. |
| `status` | `TEXT` | Booking state: `confirmed`, `cash_pending`, or `cancelled`. |
| `payment_method` | `TEXT` | Payment flow: `ONLINE` or `CASH`. |
| `created_at` | `TIMESTAMPTZ` | Booking creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

Indexes support customer booking history, date/time slot lookups, and facility
lookups. A booking's facility pair is application-linked rather than enforced
with a foreign key.

### `slot_reservations`

Holds a slot temporarily while a customer proceeds through the booking flow.
`expires_at` lets the application treat stale pending holds as expired, and
`lock_token` uniquely identifies each hold.

| Column | Type | Meaning |
|---|---|---|
| `id` | `UUID` | Primary reservation identifier; generated automatically. |
| `sport_id` | `TEXT` | Sport key for the held facility. |
| `facility_code` | `TEXT` | Facility key; used with `sport_id` to identify the held facility. |
| `slot_date` | `DATE` | Date of the held slot. |
| `slot_time` | `TIME` | Start time of the held slot. |
| `customer_email` | `TEXT` | Email address of the customer holding the slot. |
| `lock_token` | `TEXT` | Unique token identifying the hold. |
| `expires_at` | `TIMESTAMPTZ` | Time after which the hold is no longer valid. |
| `status` | `TEXT` | Hold state: `pending`, `confirmed`, or `released`; defaults to `pending`. |
| `created_at` | `TIMESTAMPTZ` | Hold creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |

### `system_configs`

Stores application settings as text values with an explicit type marker.
Configuration type and key together are unique.

| Column | Type | Meaning |
|---|---|---|
| `id` | `UUID` | Primary configuration identifier; generated automatically. |
| `config_type` | `TEXT` | Namespace/category, such as pricing, slots, booking, or payments. |
| `config_key` | `TEXT` | Setting name within its category. |
| `config_value` | `TEXT` | Stored value; parse according to `value_type`. |
| `value_type` | `TEXT` | Interpretation of `config_value`: `STRING`, `INTEGER`, `DECIMAL`, `BOOLEAN`, or `JSON`; defaults to `STRING`. |
| `description` | `TEXT` | Human-readable description; defaults to an empty string. |
| `is_active` | `BOOLEAN` | Whether the setting is currently active; defaults to `TRUE`. |
| `is_system` | `BOOLEAN` | Whether the setting is system-managed; defaults to `TRUE`. |
| `created_at` | `TIMESTAMPTZ` | Row creation time. |
| `updated_at` | `TIMESTAMPTZ` | Most recent update time. |
| `deleted_at` | `TIMESTAMPTZ`, nullable | Soft-deletion time, if deleted. |
| `created_by` | `TEXT` | Creator/audit actor; defaults to `system`. |
| `updated_by` | `TEXT` | Last updater/audit actor; defaults to `system`. |

## Historical tables

`slot_recurring_blocks` and `admin_slot_blocks` are **not current tables**.
During schema initialization, any existing rows are migrated into
`slot_block_rules`, after which the legacy tables are dropped.
`slot_day_configurations` is also dropped as an obsolete prior design; regular
weekly availability is now represented by `slot_weekday_configurations`.

## Keeping this document current

The executable schema and compatibility migrations are maintained in
[`backend/src/lib/database.ts`](../backend/src/lib/database.ts). When adding or
changing a table, column, constraint, or relationship, update this reference
alongside the schema change.
