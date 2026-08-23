import dotenv from 'dotenv';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import DEFAULT_SPORTS from '../data/json/sports.json';
import DEFAULT_SPORT_EVENTS from '../data/json/sport-events.json';
import DEFAULT_SPORT_FACILITIES from '../data/json/sport-facilities.json';

dotenv.config();

export type PackageRow = {
  id: string;
  label: string;
  price: number;
  per: string;
};

export type SportRow = {
  id: 'cricket' | 'indoor-cricket' | 'pickleball' | 'futsal' | 'sepak-takraw' | 'tennis' | 'table-tennis' | 'soccer' | 'volleyball' | 'badminton' | 'basketball' | 'kabaddi';
  label: string;
  imageKey: SportRow['id'];
  bannerKey: SportRow['id'];
  enabled: boolean;
  sortOrder: number;
};

export type SportEventRow = {
  id: string;
  sportId: SportRow['id'];
  titleTemplate: string;
  descriptionTemplate: string;
  imageKey: 'facility' | 'academy' | 'coach' | 'gear';
  icon: 'calendar' | 'academy' | 'coach' | 'shop';
  actionTarget: 'facility-select' | 'schedule';
  enabled: boolean;
  sortOrder: number;
};

export type SportFacilityTemplateRow = {
  sportId: SportRow['id'];
  code: string;
  titleTemplate: string;
  price: string;
  tag: string;
  address: string;
  mapLocationUrl: string;
  imageKey: 'bowling-lane' | 'nets-2' | 'nets-3' | 'nets-4' | 'indoor-court' | 'outdoor-field' | 'pb-indoor-court' | 'pb-outdoor-court';
  icon: 'lane' | 'net' | 'court' | 'field' | 'academy' | 'gear';
  actionTarget: 'schedule';
  enabled: boolean;
  sortOrder: number;
};

export type SportFacilityRow = {
  id: string;
  sportId: SportRow['id'];
  code: string;
  title: string;
  price: string;
  tag: string;
  address: string;
  mapLocationUrl: string;
  imageKey: 'bowling-lane' | 'nets-2' | 'nets-3' | 'nets-4' | 'indoor-court' | 'outdoor-field' | 'pb-indoor-court' | 'pb-outdoor-court';
  icon: 'lane' | 'net' | 'court' | 'field' | 'academy' | 'gear';
  actionTarget: 'schedule';
  enabled: boolean;
  sortOrder: number;
};

export type SlotRow = {
  time: string;
  key: string;
  booked: boolean;
  past: boolean;
};

type SlotWeekdayConfiguration = {
  slotStartTime: string;
  slotEndTime: string;
};

export type BookingHistoryRow = {
  receiptId: string;
  bookingType: 'court' | 'coaching';
  slotDate: string;
  slotTime: string;
  durationMins: number;
  grandTotal: number;
  status: 'confirmed' | 'cash_pending';
  payMethod: 'STRIPE' | 'GPAY' | 'PAYNOW' | 'GRABPAY';
  paymentMethod: 'ONLINE' | 'CASH';
  facilityTitle: string | null;
  facilityAddress: string | null;
  facilityImageKey: SportFacilityRow['imageKey'] | null;
  facilityTag: string | null;
};

type BookingInput = {
  bookingType: string;
  selectedDate: string;
  selectedTime: string;
  durationMins: number;
  packageOption: string | null;
  payMethod: string;
  grandTotal: number;
  receiptId: string;
  customerEmail: string;
  bookingStatus: string;
  paymentMethod: 'ONLINE' | 'CASH';
  facilityTitle?: string | null;
  facilityAddress?: string | null;
  facilityImageKey?: SportFacilityRow['imageKey'] | null;
  facilityTag?: string | null;
  lockToken?: string | null;
};

export type ConfigValueType = 'STRING' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'JSON';

export type SystemConfigRow = {
  configType: string;
  configKey: string;
  configValue: string;
  valueType: ConfigValueType;
  description: string;
  isActive: boolean;
  isSystem: boolean;
};

// key → value map for a single config type
export type ConfigMap = Record<string, string>;

export type UserAuthRow = {
  id: string;
  email: string;
  fullName: string;
  mobileNumber: string;
  passwordEncrypted: string;
  authProvider: string;
  passwordResetCode?: string | null;
  passwordResetExpiresAt?: string | null;
};

export class SlotAlreadyBookedError extends Error {
  constructor(slotDate: string, slotTime: string) {
    super(`Slot ${slotDate} ${slotTime} is already booked.`);
    this.name = 'SlotAlreadyBookedError';
  }
}

export class SlotReservedError extends Error {
  constructor(slotDate: string, slotTime: string) {
    super(`Slot ${slotDate} ${slotTime} is temporarily reserved by another user. Please try again shortly.`);
    this.name = 'SlotReservedError';
  }
}

export class SlotConfigurationMissingError extends Error {
  constructor(weekdayName: string) {
    super(`Slot configuration is missing for weekday ${weekdayName}.`);
    this.name = 'SlotConfigurationMissingError';
  }
}

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const DATABASE_SSL = (process.env.DATABASE_SSL ?? 'true').toLowerCase() !== 'false';
const DATABASE_CONNECTION_TIMEOUT_MS = Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? '5000');
const DATABASE_POOL_MAX = Number(process.env.DATABASE_POOL_MAX ?? '10');

const USE_DATABASE = DATABASE_URL.trim().length > 0;

const pool = USE_DATABASE
  ? new Pool({
      connectionString: DATABASE_URL,
      max: Number.isFinite(DATABASE_POOL_MAX) ? DATABASE_POOL_MAX : 10,
      connectionTimeoutMillis: Number.isFinite(DATABASE_CONNECTION_TIMEOUT_MS) ? DATABASE_CONNECTION_TIMEOUT_MS : 5000,
      idleTimeoutMillis: 30000,
      options: '-c timezone=Asia/Singapore',
      ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    })
  : null;

const DEFAULT_PACKAGES: PackageRow[] = [
  { id: 'single', label: 'Single Session', price: 120, per: 'SGD 120.00 / session' },
  { id: 'pack3', label: '3-Session Pack', price: 88, per: 'SGD 29.33 / session' },
  { id: 'pack10', label: '10-Session Pack', price: 250, per: 'SGD 25.00 / session' },
  { id: 'pack15', label: '15-Session Pack', price: 350, per: 'SGD 23.33 / session' },
  { id: 'pack20', label: '20-Session Pack', price: 450, per: 'SGD 22.50 / session' },
];

const DEFAULT_SPORT_ROWS = DEFAULT_SPORTS as SportRow[];
const DEFAULT_SPORT_EVENT_ROWS = DEFAULT_SPORT_EVENTS as SportEventRow[];
const DEFAULT_SPORT_FACILITY_TEMPLATE_ROWS = DEFAULT_SPORT_FACILITIES as SportFacilityTemplateRow[];
const SLOT_INTERVAL_MINUTES = 30;
const RESERVATION_TTL_MINUTES = 10; // fallback if DB config unavailable

type SystemConfigSeed = {
  configType: string;
  configKey: string;
  configValue: string;
  valueType: ConfigValueType;
  description: string;
};

const DEFAULT_SYSTEM_CONFIGS: SystemConfigSeed[] = [
  // ── RESERVATION ──────────────────────────────────────────────
  { configType: 'RESERVATION', configKey: 'SLOT_LOCK_DURATION_MINS',  configValue: '10',   valueType: 'INTEGER', description: 'Minutes a slot is held after reservation before auto-expiry' },
  { configType: 'RESERVATION', configKey: 'MAX_LOCKS_PER_USER',       configValue: '1',    valueType: 'INTEGER', description: 'Maximum simultaneous active reservations per user' },

  // ── PRICING ───────────────────────────────────────────────────
  { configType: 'PRICING', configKey: 'PLATFORM_FEE_SGD',             configValue: '1.50', valueType: 'DECIMAL', description: 'Fixed platform fee per booking (SGD)' },
  { configType: 'PRICING', configKey: 'STRIPE_FEE_RATE',              configValue: '0.035',valueType: 'DECIMAL', description: 'Stripe card processing fee rate (e.g. 0.035 = 3.5%)' },
  { configType: 'PRICING', configKey: 'DEFAULT_COURT_RATE_PER_HOUR',  configValue: '28.00',valueType: 'DECIMAL', description: 'Fallback court rate per hour when facility price is unset (SGD)' },

  // ── SLOTS ─────────────────────────────────────────────────────
  { configType: 'SLOTS', configKey: 'SLOT_INTERVAL_MINS',             configValue: '30',   valueType: 'INTEGER', description: 'Duration of each bookable time slot in minutes' },
  { configType: 'SLOTS', configKey: 'DEFAULT_WINDOW_START',           configValue: '08:00',valueType: 'STRING',  description: 'Default slot window opening time (HH:MM)' },
  { configType: 'SLOTS', configKey: 'DEFAULT_WINDOW_END',             configValue: '22:00',valueType: 'STRING',  description: 'Default slot window closing time (HH:MM)' },

  // ── BOOKING ───────────────────────────────────────────────────
  { configType: 'BOOKING', configKey: 'MAX_ADVANCE_BOOKING_MONTHS',   configValue: '3',    valueType: 'INTEGER', description: 'How many months ahead a slot can be booked' },
  { configType: 'BOOKING', configKey: 'MIN_DURATION_MINS',            configValue: '60',   valueType: 'INTEGER', description: 'Minimum allowed booking duration in minutes' },
  { configType: 'BOOKING', configKey: 'CANCELLATION_WINDOW_HOURS',    configValue: '24',   valueType: 'INTEGER', description: 'Hours before start time within which cancellation earns a refund' },

  // ── PAYMENTS ──────────────────────────────────────────────────
  { configType: 'PAYMENTS', configKey: 'CURRENCY',                    configValue: 'sgd',  valueType: 'STRING',  description: 'ISO 4217 currency code for all payment processing' },
  { configType: 'PAYMENTS', configKey: 'PAYMENT_SESSION_TIMEOUT_SECS',configValue: '300',  valueType: 'INTEGER', description: 'Seconds before an in-progress payment session expires' },
  { configType: 'PAYMENTS', configKey: 'STRIPE_ENABLED',              configValue: 'true', valueType: 'BOOLEAN', description: 'Whether Stripe card payments are active' },
  { configType: 'PAYMENTS', configKey: 'PAYMENT_TEST_MODE_ENABLED',   configValue: 'true', valueType: 'BOOLEAN', description: 'Whether the developer-only custom-amount Stripe test endpoint is active' },
  { configType: 'PAYMENTS', configKey: 'PAYNOW_ENABLED',              configValue: 'false',valueType: 'BOOLEAN', description: 'Whether PayNow payments are active' },
  { configType: 'PAYMENTS', configKey: 'GRABPAY_ENABLED',             configValue: 'false',valueType: 'BOOLEAN', description: 'Whether GrabPay payments are active' },
  { configType: 'PAYMENTS', configKey: 'GPAY_ENABLED',                configValue: 'false',valueType: 'BOOLEAN', description: 'Whether Google Pay payments are active' },

  // ── NOTIFICATIONS ─────────────────────────────────────────────
  { configType: 'NOTIFICATIONS', configKey: 'BOOKING_CONFIRMATION_ENABLED', configValue: 'true', valueType: 'BOOLEAN', description: 'Send booking confirmation email after successful payment' },
  { configType: 'NOTIFICATIONS', configKey: 'REMINDER_HOURS_BEFORE',        configValue: '24',   valueType: 'INTEGER', description: 'Hours before booking to dispatch a reminder' },
  { configType: 'NOTIFICATIONS', configKey: 'SUPPORT_EMAIL',                configValue: 'support@sportygo.sg', valueType: 'STRING', description: 'Customer-facing support email address' },

  // ── APP ───────────────────────────────────────────────────────
  { configType: 'APP', configKey: 'TIMEZONE',        configValue: 'Asia/Singapore', valueType: 'STRING', description: 'Primary application operating timezone' },
  { configType: 'APP', configKey: 'APP_NAME',         configValue: 'SportyGo',       valueType: 'STRING', description: 'Application display name' },
  { configType: 'APP', configKey: 'TERMS_VERSION',    configValue: '1.0',            valueType: 'STRING', description: 'Active terms and conditions version shown to users' },
];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const DEFAULT_WEEKDAY_SLOT_WINDOWS: Record<(typeof WEEKDAY_NAMES)[number], { startTime: string; endTime: string }> = {
  sunday: { startTime: '08:00', endTime: '22:00' },
  monday: { startTime: '15:30', endTime: '22:00' },
  tuesday: { startTime: '15:30', endTime: '22:00' },
  wednesday: { startTime: '15:30', endTime: '22:00' },
  thursday: { startTime: '15:30', endTime: '22:00' },
  friday: { startTime: '15:30', endTime: '22:00' },
  saturday: { startTime: '08:00', endTime: '22:00' },
};

let bootstrapPromise: Promise<void> | null = null;
const fallbackUsers = new Map<string, UserAuthRow>();

function toTotalMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function toTimeLabel(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const SINGAPORE_TIME_ZONE = 'Asia/Singapore';

type SingaporeDateTimeParts = {
  date: string;
  time: string;
};

function currentSingaporeDateTimeParts(base = new Date()): SingaporeDateTimeParts {
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: SINGAPORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base).map((part) => [part.type, part.value]));

  const timeParts = Object.fromEntries(new Intl.DateTimeFormat('en-SG', {
    timeZone: SINGAPORE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(base).map((part) => [part.type, part.value]));

  return {
    date: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    time: `${timeParts.hour}:${timeParts.minute}`,
  };
}

function isPastOrCurrentSlot(dateStr: string, time: string, reference: SingaporeDateTimeParts = currentSingaporeDateTimeParts()): boolean {
  return dateStr === reference.date && toTotalMinutes(time) <= toTotalMinutes(reference.time);
}

function weekdayNameForDate(dateStr: string): (typeof WEEKDAY_NAMES)[number] {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAY_NAMES[dayIndex];
}

function generateDailySlots(dateStr: string, slotStartTime: string, slotEndTime: string): SlotRow[] {
  const slots: SlotRow[] = [];
  const startMinutes = toTotalMinutes(slotStartTime);
  const endMinutes = toTotalMinutes(slotEndTime);

  for (let current = startMinutes; current + SLOT_INTERVAL_MINUTES <= endMinutes; current += SLOT_INTERVAL_MINUTES) {
    const time = toTimeLabel(current);
    slots.push({
      time,
      key: `${dateStr}_${time}`,
      booked: false,
      past: false,
    });
  }

  return slots;
}

function assertDatabaseConfigured(): void {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured.');
  }
}

async function seedPackages(client: PoolClient): Promise<void> {
  const values: unknown[] = [];
  const placeholders = DEFAULT_PACKAGES.map((pkg, index) => {
    const base = index * 6;
    values.push(pkg.id, pkg.label, pkg.price, pkg.per, index + 1, 'system');
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });

  await client.query(
    `INSERT INTO packages (id, label, price, per_label, sort_order, created_by)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (id)
     DO UPDATE SET
       label = EXCLUDED.label,
       price = EXCLUDED.price,
       per_label = EXCLUDED.per_label,
       sort_order = EXCLUDED.sort_order,
       updated_at = NOW(),
       updated_by = EXCLUDED.created_by,
       deleted_at = NULL`,
    values
  );
}

async function seedSports(client: PoolClient): Promise<void> {
  const values: unknown[] = [];
  const placeholders = DEFAULT_SPORT_ROWS.map((sport, index) => {
    const base = index * 7;
    values.push(sport.id, sport.label, sport.imageKey, sport.bannerKey, sport.enabled, sport.sortOrder, 'system');
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
  });

  await client.query(
    `INSERT INTO sports (id, label, image_key, banner_key, enabled, sort_order, created_by)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (id)
     DO UPDATE SET
       label = EXCLUDED.label,
       image_key = EXCLUDED.image_key,
       banner_key = EXCLUDED.banner_key,
       enabled = EXCLUDED.enabled,
       sort_order = EXCLUDED.sort_order,
       updated_at = NOW(),
       updated_by = EXCLUDED.created_by,
       deleted_at = NULL`,
    values
  );
}

async function seedSportEvents(client: PoolClient): Promise<void> {
  const values: unknown[] = [];
  const placeholders = DEFAULT_SPORT_EVENT_ROWS.map((event, index) => {
    const base = index * 10;
    values.push(
      event.id,
      event.sportId,
      event.titleTemplate,
      event.descriptionTemplate,
      event.imageKey,
      event.icon,
      event.actionTarget,
      event.enabled,
      event.sortOrder,
      'system'
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
  });

  await client.query(
    `INSERT INTO sport_events (id, sport_id, title_template, description_template, image_key, icon, action_target, enabled, sort_order, created_by)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (id)
     DO UPDATE SET
       sport_id = EXCLUDED.sport_id,
       title_template = EXCLUDED.title_template,
       description_template = EXCLUDED.description_template,
       image_key = EXCLUDED.image_key,
       icon = EXCLUDED.icon,
       action_target = EXCLUDED.action_target,
       enabled = EXCLUDED.enabled,
       sort_order = EXCLUDED.sort_order,
       updated_at = NOW(),
       updated_by = EXCLUDED.created_by,
       deleted_at = NULL`,
    values
  );
}

async function seedSportFacilities(client: PoolClient): Promise<void> {
  const values: unknown[] = [];
  const placeholders: string[] = [];

  const sportById = new Map(DEFAULT_SPORT_ROWS.map((sport) => [sport.id, sport]));

  DEFAULT_SPORT_FACILITY_TEMPLATE_ROWS.forEach((facility, index) => {
    const sport = sportById.get(facility.sportId);
    if (!sport) {
      return;
    }

    const base = index * 14;
    const id = `${sport.id}-${facility.code}`;
    values.push(
      id,
      sport.id,
      facility.code,
      facility.titleTemplate
        .replace(/\{sportLower\}/g, sport.label.toLowerCase())
        .replace(/\{sport\}/g, sport.label),
      facility.price,
      facility.tag,
      facility.address,
      facility.mapLocationUrl,
      facility.imageKey,
      facility.icon,
      facility.actionTarget,
      facility.enabled,
      facility.sortOrder,
      'system'
    );

    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14})`
    );
  });

  await client.query(
    `INSERT INTO sport_facilities (
       id,
       sport_id,
       facility_code,
       title,
       price_label,
       tag_label,
        address,
        map_location_url,
       image_key,
       icon,
       action_target,
       enabled,
       sort_order,
       created_by
     )
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (id)
     DO UPDATE SET
       sport_id = EXCLUDED.sport_id,
       facility_code = EXCLUDED.facility_code,
       title = EXCLUDED.title,
       price_label = EXCLUDED.price_label,
       tag_label = EXCLUDED.tag_label,
        address = EXCLUDED.address,
        map_location_url = EXCLUDED.map_location_url,
       image_key = EXCLUDED.image_key,
       icon = EXCLUDED.icon,
       action_target = EXCLUDED.action_target,
        enabled = EXCLUDED.enabled,
       sort_order = EXCLUDED.sort_order,
       updated_at = NOW(),
       updated_by = EXCLUDED.created_by,
       deleted_at = NULL`,
    values
  );
}

async function seedSystemConfigs(client: PoolClient): Promise<void> {
  for (const cfg of DEFAULT_SYSTEM_CONFIGS) {
    await client.query(
      `INSERT INTO system_configs
         (config_type, config_key, config_value, value_type, description, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'system', 'system')
       ON CONFLICT (config_type, config_key) DO NOTHING`,
      [cfg.configType, cfg.configKey, cfg.configValue, cfg.valueType, cfg.description]
    );
  }
}

async function ensureSchema(client: PoolClient): Promise<void> {
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL DEFAULT 'User',
      mobile_number TEXT NOT NULL DEFAULT '+6500000000',
      password_encrypted TEXT NOT NULL DEFAULT '',
      password_reset_code TEXT NULL,
      password_reset_expires_at TIMESTAMPTZ NULL,
      auth_provider TEXT NOT NULL DEFAULT 'password' CHECK (auth_provider IN ('password', 'google')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system'
    )
  `);

  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS full_name TEXT
  `);

  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS mobile_number TEXT
  `);

  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_encrypted TEXT
  `);

  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_reset_code TEXT
  `);

  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ
  `);

  await client.query(`
    UPDATE users
    SET full_name = COALESCE(NULLIF(full_name, ''), 'User'),
        mobile_number = COALESCE(NULLIF(mobile_number, ''), '+6500000000'),
        password_encrypted = COALESCE(password_encrypted, '')
    WHERE full_name IS NULL
       OR mobile_number IS NULL
       OR password_encrypted IS NULL
  `);

  await client.query(`
    ALTER TABLE users
    ALTER COLUMN full_name SET NOT NULL
  `);

  await client.query(`
    ALTER TABLE users
    ALTER COLUMN mobile_number SET NOT NULL
  `);

  await client.query(`
    ALTER TABLE users
    ALTER COLUMN password_encrypted SET NOT NULL
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS packages (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
      per_label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system'
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS sports (
      id TEXT PRIMARY KEY CHECK (id IN ('cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis', 'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi')),
      label TEXT NOT NULL,
      image_key TEXT NOT NULL CHECK (image_key IN ('cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis', 'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi')),
      banner_key TEXT NOT NULL CHECK (banner_key IN ('cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis', 'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi')),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system'
    )
  `);

  await client.query(`
    ALTER TABLE sports
    ADD COLUMN IF NOT EXISTS banner_key TEXT
  `);

  await client.query(`
    ALTER TABLE sports
    ADD COLUMN IF NOT EXISTS enabled BOOLEAN
  `);

  await client.query(`
    UPDATE sports
    SET banner_key = COALESCE(banner_key, image_key)
    WHERE banner_key IS NULL
  `);

  await client.query(`
    UPDATE sports
    SET enabled = CASE
      WHEN id IN ('cricket', 'indoor-cricket', 'pickleball') THEN TRUE
      ELSE FALSE
    END
    WHERE enabled IS NULL
  `);

  await client.query(`
    ALTER TABLE sports
    ALTER COLUMN banner_key SET NOT NULL
  `);

  await client.query(`
    ALTER TABLE sports
    ALTER COLUMN enabled SET NOT NULL
  `);

  await client.query('ALTER TABLE sports DROP CONSTRAINT IF EXISTS sports_id_check');
  await client.query('ALTER TABLE sports DROP CONSTRAINT IF EXISTS sports_image_key_check');
  await client.query('ALTER TABLE sports DROP CONSTRAINT IF EXISTS sports_banner_key_check');
  await client.query(`
    ALTER TABLE sports
    ADD CONSTRAINT sports_id_check
    CHECK (id IN ('cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis', 'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi'))
  `);
  await client.query(`
    ALTER TABLE sports
    ADD CONSTRAINT sports_image_key_check
    CHECK (image_key IN ('cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis', 'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi'))
  `);
  await client.query(`
    ALTER TABLE sports
    ADD CONSTRAINT sports_banner_key_check
    CHECK (banner_key IN ('cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis', 'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi'))
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS sport_events (
      id TEXT PRIMARY KEY,
      sport_id TEXT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
      title_template TEXT NOT NULL,
      description_template TEXT NOT NULL,
      image_key TEXT NOT NULL CHECK (image_key IN ('facility', 'academy', 'coach', 'gear')),
      icon TEXT NOT NULL CHECK (icon IN ('calendar', 'academy', 'coach', 'shop')),
      action_target TEXT NOT NULL CHECK (action_target IN ('facility-select', 'schedule')),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system'
    )
  `);

  await client.query('ALTER TABLE sport_events ADD COLUMN IF NOT EXISTS sport_id TEXT');
  await client.query('ALTER TABLE sport_events ADD COLUMN IF NOT EXISTS enabled BOOLEAN');
  await client.query(`
    UPDATE sport_events
    SET enabled = CASE
      WHEN id LIKE '%-book-facility' THEN TRUE
      ELSE FALSE
    END
    WHERE enabled IS NULL
  `);
  await client.query('ALTER TABLE sport_events ALTER COLUMN enabled SET NOT NULL');

  await client.query(`
    CREATE TABLE IF NOT EXISTS sport_facilities (
      id TEXT PRIMARY KEY,
      sport_id TEXT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
      facility_code TEXT NOT NULL,
      title TEXT NOT NULL,
      price_label TEXT NOT NULL,
      tag_label TEXT NOT NULL,
      address TEXT NOT NULL,
      map_location_url TEXT NOT NULL,
      image_key TEXT NOT NULL CHECK (image_key IN ('bowling-lane', 'nets-2', 'nets-3', 'nets-4', 'indoor-court', 'outdoor-field', 'pb-indoor-court', 'pb-outdoor-court')),
      icon TEXT NOT NULL CHECK (icon IN ('lane', 'net', 'court', 'field', 'academy', 'gear')),
      action_target TEXT NOT NULL CHECK (action_target IN ('schedule')),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system',
      UNIQUE (sport_id, facility_code)
    )
  `);

  await client.query(`
    UPDATE sport_facilities
    SET tag_label = 'Book Now'
    WHERE tag_label = 'Per Hour'
  `);

  await client.query('ALTER TABLE sport_facilities ADD COLUMN IF NOT EXISTS address TEXT');
  await client.query('ALTER TABLE sport_facilities ADD COLUMN IF NOT EXISTS map_location_url TEXT');
  await client.query('ALTER TABLE sport_facilities ADD COLUMN IF NOT EXISTS enabled BOOLEAN');

  await client.query(`
    UPDATE sport_facilities
    SET address = CASE facility_code
      WHEN 'bowling-lane' THEN 'Kallang Sports Hub, 1 Stadium Walk, Singapore 397688'
      WHEN 'net-2' THEN 'Singapore Indoor Stadium, 2 Stadium Walk, Singapore 397691'
      WHEN 'net-3' THEN 'OCBC Square, 1 Stadium Place, Singapore 397628'
      WHEN 'net-4' THEN 'National Stadium, 1 Stadium Drive, Singapore 397629'
      WHEN 'indoor-court' THEN 'Kallang ActiveSG, 5 Stadium Walk, Singapore 397693'
      WHEN 'outdoor-field' THEN 'Bishan ActiveSG, 21 Bishan Street 14, Singapore 579778'
      ELSE address
    END,
    map_location_url = CASE facility_code
      WHEN 'bowling-lane' THEN 'https://www.google.com/maps?q=Kallang%20Sports%20Hub%20Singapore'
      WHEN 'net-2' THEN 'https://www.google.com/maps?q=Singapore%20Indoor%20Stadium'
      WHEN 'net-3' THEN 'https://www.google.com/maps?q=OCBC%20Square%20Singapore'
      WHEN 'net-4' THEN 'https://www.google.com/maps?q=National%20Stadium%20Singapore'
      WHEN 'indoor-court' THEN 'https://www.google.com/maps?q=Kallang%20ActiveSG%20Singapore'
      WHEN 'outdoor-field' THEN 'https://www.google.com/maps?q=Bishan%20ActiveSG%20Singapore'
      ELSE map_location_url
    END
    WHERE address IS NULL OR map_location_url IS NULL
  `);

  await client.query('ALTER TABLE sport_facilities ALTER COLUMN address SET NOT NULL');
  await client.query('ALTER TABLE sport_facilities ALTER COLUMN map_location_url SET NOT NULL');
  await client.query(`
    UPDATE sport_facilities
    SET enabled = TRUE
    WHERE enabled IS NULL
  `);
  await client.query('ALTER TABLE sport_facilities ALTER COLUMN enabled SET NOT NULL');

  await client.query('ALTER TABLE sport_facilities DROP CONSTRAINT IF EXISTS sport_facilities_image_key_check');
  await client.query(`
    UPDATE sport_facilities
    SET image_key = CASE image_key
      WHEN 'gear' THEN 'bowling-lane'
      WHEN 'indoor-card' THEN 'nets-2'
      WHEN 'facility' THEN 'nets-3'
      WHEN 'cricket-card' THEN 'nets-4'
      WHEN 'coach' THEN 'indoor-court'
      WHEN 'academy' THEN 'outdoor-field'
      ELSE image_key
    END
    WHERE image_key IN ('gear', 'indoor-card', 'facility', 'cricket-card', 'coach', 'academy')
  `);
  await client.query(`
    ALTER TABLE sport_facilities
    ADD CONSTRAINT sport_facilities_image_key_check
    CHECK (image_key IN ('bowling-lane', 'nets-2', 'nets-3', 'nets-4', 'indoor-court', 'outdoor-field', 'pb-indoor-court', 'pb-outdoor-court'))
  `);

  await client.query(`
    UPDATE sport_facilities
    SET image_key = CASE facility_code
      WHEN 'indoor-court' THEN 'pb-indoor-court'
      WHEN 'outdoor-field' THEN 'pb-outdoor-court'
      ELSE image_key
    END,
    updated_at = NOW(),
    updated_by = 'system'
    WHERE sport_id = 'pickleball'
      AND facility_code IN ('indoor-court', 'outdoor-field')
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sport_facilities_sport_sort
    ON sport_facilities (sport_id, sort_order, facility_code)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS slots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slot_date DATE NOT NULL,
      slot_time TIME NOT NULL,
      is_booked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system',
      UNIQUE (slot_date, slot_time)
    )
  `);

  // Remove obsolete per-date slot configuration table from previous schema iteration.
  await client.query('DROP TABLE IF EXISTS slot_day_configurations');

  await client.query(`
    CREATE TABLE IF NOT EXISTS slot_weekday_configurations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      weekday_name TEXT NOT NULL,
      slot_start_time TIME NOT NULL,
      slot_end_time TIME NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system',
      UNIQUE (weekday_name),
      CHECK (weekday_name IN ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')),
      CHECK (slot_start_time < slot_end_time)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_slot_weekday_configurations_name
    ON slot_weekday_configurations (weekday_name)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_slots_slot_date_booked
    ON slots (slot_date, is_booked, slot_time)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_type TEXT NOT NULL CHECK (booking_type IN ('court', 'coaching')),
      slot_date DATE NOT NULL,
      slot_time TIME NOT NULL,
      duration_mins INTEGER NOT NULL CHECK (duration_mins > 0),
      package_id TEXT NULL REFERENCES packages(id) ON DELETE SET NULL,
      pay_method TEXT NOT NULL CHECK (pay_method IN ('STRIPE', 'GPAY', 'PAYNOW', 'GRABPAY')),
      grand_total NUMERIC(12,2) NOT NULL CHECK (grand_total >= 0),
      receipt_id TEXT NOT NULL UNIQUE,
      customer_email TEXT NOT NULL,
      facility_title TEXT NULL,
      facility_address TEXT NULL,
      facility_image_key TEXT NULL,
      facility_tag TEXT NULL,
      status TEXT NOT NULL CHECK (status IN ('confirmed', 'cash_pending')),
      payment_method TEXT NOT NULL CHECK (payment_method IN ('ONLINE', 'CASH')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system'
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_bookings_customer_email
    ON bookings (customer_email, created_at DESC)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_bookings_slot_lookup
    ON bookings (slot_date, slot_time)
  `);

  await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS facility_title TEXT NULL');
  await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS facility_address TEXT NULL');
  await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS facility_image_key TEXT NULL');
  await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS facility_tag TEXT NULL');

  await client.query(`
    CREATE TABLE IF NOT EXISTS slot_reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slot_date DATE NOT NULL,
      slot_time TIME NOT NULL,
      customer_email TEXT NOT NULL,
      lock_token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'released')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_slot_reservations_lookup
    ON slot_reservations (slot_date, slot_time, status, expires_at)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS system_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      config_type TEXT NOT NULL,
      config_key TEXT NOT NULL,
      config_value TEXT NOT NULL,
      value_type TEXT NOT NULL DEFAULT 'STRING'
        CHECK (value_type IN ('STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'JSON')),
      description TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_system BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system',
      UNIQUE (config_type, config_key)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_system_configs_type
    ON system_configs (config_type) WHERE deleted_at IS NULL AND is_active = TRUE
  `);
}

export async function ensureDatabaseReady(): Promise<void> {
  if (!pool) {
    return;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await ensureSchema(client);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    })();
  }

  await bootstrapPromise;
}

export async function query<T extends QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  assertDatabaseConfigured();
  await ensureDatabaseReady();
  const result = await pool!.query<T>(text, params);
  return result.rows;
}

export async function withDatabaseClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  assertDatabaseConfigured();
  await ensureDatabaseReady();

  const client = await pool!.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

export function isDatabaseConfigured(): boolean {
  return USE_DATABASE;
}

export function getFallbackPackages(): PackageRow[] {
  return DEFAULT_PACKAGES;
}

export function getFallbackSports(): SportRow[] {
  return DEFAULT_SPORT_ROWS;
}

export function getFallbackSportEvents(): SportEventRow[] {
  return DEFAULT_SPORT_EVENT_ROWS;
}

export function getFallbackSportFacilityTemplates(): SportFacilityTemplateRow[] {
  return DEFAULT_SPORT_FACILITY_TEMPLATE_ROWS;
}

export async function listPackages(): Promise<PackageRow[]> {
  if (!pool) {
    return DEFAULT_PACKAGES;
  }

  return query<PackageRow>(
    `SELECT id, label, price::float8 AS price, per_label AS per
     FROM packages
     WHERE deleted_at IS NULL
     ORDER BY sort_order ASC, id ASC`
  );
}

export async function listSports(): Promise<SportRow[]> {
  if (!pool) {
    return DEFAULT_SPORT_ROWS;
  }

  return query<SportRow>(
    `SELECT id,
            label,
            image_key AS "imageKey",
            banner_key AS "bannerKey",
            enabled,
            sort_order AS "sortOrder"
     FROM sports
     WHERE deleted_at IS NULL
     ORDER BY sort_order ASC, id ASC`
  );
}

export async function listSportEvents(sportId: SportRow['id']): Promise<SportEventRow[]> {
  if (!pool) {
    return DEFAULT_SPORT_EVENT_ROWS.filter((event) => event.sportId === sportId);
  }

  return query<SportEventRow>(
    `SELECT id,
            sport_id AS "sportId",
            title_template AS "titleTemplate",
            description_template AS "descriptionTemplate",
            image_key AS "imageKey",
            icon,
            action_target AS "actionTarget",
            enabled,
            sort_order AS "sortOrder"
     FROM sport_events
     WHERE deleted_at IS NULL
       AND sport_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [sportId]
  );
}

export async function listSportFacilities(sportId: SportRow['id']): Promise<SportFacilityRow[]> {
  if (!pool) {
    const sport = DEFAULT_SPORT_ROWS.find((item) => item.id === sportId);
    if (!sport) {
      return [];
    }

    return DEFAULT_SPORT_FACILITY_TEMPLATE_ROWS
      .filter((facility) => facility.sportId === sportId)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((facility) => ({
        id: `${sport.id}-${facility.code}`,
        sportId: sport.id,
        code: facility.code,
        title: facility.titleTemplate
          .replace(/\{sportLower\}/g, sport.label.toLowerCase())
          .replace(/\{sport\}/g, sport.label),
        price: facility.price,
        tag: facility.tag,
        address: facility.address,
        mapLocationUrl: facility.mapLocationUrl,
        imageKey: facility.imageKey,
        icon: facility.icon,
        actionTarget: facility.actionTarget,
        enabled: facility.enabled,
        sortOrder: facility.sortOrder,
      }));
  }

  return query<SportFacilityRow>(
    `SELECT id,
            sport_id AS "sportId",
            facility_code AS code,
            title,
            price_label AS price,
            tag_label AS tag,
            address,
            map_location_url AS "mapLocationUrl",
            image_key AS "imageKey",
            icon,
            action_target AS "actionTarget",
                 enabled,
            sort_order AS "sortOrder"
     FROM sport_facilities
     WHERE deleted_at IS NULL
       AND sport_id = $1
     ORDER BY sort_order ASC, facility_code ASC`,
    [sportId]
  );
}

export async function ensureSlotsForDate(client: PoolClient, dateStr: string): Promise<void> {
  const weekdayName = weekdayNameForDate(dateStr);

  const configResult = await client.query<SlotWeekdayConfiguration>(
    `SELECT slot_start_time::text AS "slotStartTime",
            slot_end_time::text AS "slotEndTime"
     FROM slot_weekday_configurations
     WHERE weekday_name = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [weekdayName]
  );

  if (configResult.rowCount === 0) {
    throw new SlotConfigurationMissingError(weekdayName);
  }

  const config = configResult.rows[0];
  const generatedSlots = generateDailySlots(dateStr, config.slotStartTime.slice(0, 5), config.slotEndTime.slice(0, 5));
  if (generatedSlots.length === 0) {
    return;
  }

  // Keep slots aligned with the configured weekday window in case prior runs used a mismatched weekday.
  await client.query(
    `DELETE FROM slots s
     WHERE s.slot_date = $1
       AND s.deleted_at IS NULL
       AND s.is_booked = FALSE
       AND (s.slot_time < $2::time OR s.slot_time >= $3::time)
       AND NOT EXISTS (
         SELECT 1
         FROM bookings b
         WHERE b.slot_date = s.slot_date
           AND b.deleted_at IS NULL
           AND s.slot_time >= b.slot_time
           AND s.slot_time < (b.slot_time + make_interval(mins => b.duration_mins))
       )`,
    [dateStr, config.slotStartTime.slice(0, 5), config.slotEndTime.slice(0, 5)]
  );

  const existingRows = await client.query<{ slot_time: string }>(
    `SELECT slot_time::text AS slot_time
     FROM slots
     WHERE slot_date = $1
       AND deleted_at IS NULL`,
    [dateStr]
  );

  const existingTimes = new Set(existingRows.rows.map((row) => row.slot_time.slice(0, 5)));
  const slotsToInsert = generatedSlots.filter((slot) => !existingTimes.has(slot.time));
  if (slotsToInsert.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders = slotsToInsert.map((slot, index) => {
    const base = index * 5;
    values.push(dateStr, slot.time, slot.booked, 'system', 'system');
    return `($${base + 1}, $${base + 2}, $${base + 3}, NOW(), NOW(), $${base + 4}, $${base + 5})`;
  });

  await client.query(
    `INSERT INTO slots (slot_date, slot_time, is_booked, created_at, updated_at, created_by, updated_by)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (slot_date, slot_time) DO NOTHING`,
    values
  );
}

export async function listSlotsForDate(dateStr: string): Promise<SlotRow[]> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Slot listing requires a configured database.');
  }

  return withDatabaseClient(async (client) => {
    const currentDateTime = currentSingaporeDateTimeParts();
    await ensureSlotsForDate(client, dateStr);
    const result = await client.query<{ slot_time: string; is_booked: boolean }>(
      `SELECT s.slot_time::text AS slot_time,
              (
                s.is_booked OR EXISTS (
                  SELECT 1
                  FROM bookings b
                  WHERE b.slot_date = s.slot_date
                    AND b.deleted_at IS NULL
                    AND s.slot_time >= b.slot_time
                    AND s.slot_time < (b.slot_time + make_interval(mins => b.duration_mins))
                ) OR EXISTS (
                  SELECT 1
                  FROM slot_reservations sr
                  WHERE sr.slot_date = s.slot_date
                    AND sr.slot_time = s.slot_time
                    AND sr.status = 'pending'
                    AND sr.expires_at > NOW()
                )
              ) AS is_booked
       FROM slots s
       WHERE s.slot_date = $1
         AND s.deleted_at IS NULL
       ORDER BY s.slot_time ASC`,
      [dateStr]
    );

    return result.rows.map((row) => ({
      time: row.slot_time.slice(0, 5),
      key: `${dateStr}_${row.slot_time.slice(0, 5)}`,
      booked: row.is_booked,
      past: isPastOrCurrentSlot(dateStr, row.slot_time.slice(0, 5), currentDateTime),
    }));
  });
}

export async function saveBooking(input: BookingInput): Promise<void> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Booking requires a configured database.');
  }

  const customerEmail = input.customerEmail.trim().toLowerCase();

  await withDatabaseClient(async (client) => {
    await client.query('BEGIN');
    try {
      const currentDateTime = currentSingaporeDateTimeParts();
      if (isPastOrCurrentSlot(input.selectedDate, input.selectedTime, currentDateTime)) {
        // Allow booking to proceed if the user holds a valid reservation (locked before slot became past)
        let bypassPastCheck = false;
        if (input.lockToken) {
          const lockResult = await client.query<{ id: string }>(
            `SELECT id FROM slot_reservations
             WHERE lock_token = $1
               AND slot_date = $2
               AND slot_time = $3::time
               AND LOWER(BTRIM(customer_email)) = $4
               AND status = 'pending'
               AND expires_at > NOW()`,
            [input.lockToken, input.selectedDate, input.selectedTime, customerEmail]
          );
          bypassPastCheck = (lockResult.rowCount ?? 0) > 0;
        }
        if (!bypassPastCheck) {
          throw new SlotAlreadyBookedError(input.selectedDate, input.selectedTime);
        }
      }

      await ensureSlotsForDate(client, input.selectedDate);
      const requiredSegments = Math.max(1, Math.ceil(input.durationMins / SLOT_INTERVAL_MINUTES));

      // Lock every 30-min segment covered by this booking window.
      const lockWindowResult = await client.query<{ id: string; slot_time: string; is_booked: boolean }>(
        `SELECT id,
                slot_time::text AS slot_time,
                is_booked
         FROM slots
         WHERE slot_date = $1
           AND slot_time >= $2::time
           AND slot_time < ($2::time + make_interval(mins => $3))
           AND deleted_at IS NULL
         ORDER BY slot_time ASC
         FOR UPDATE`,
        [input.selectedDate, input.selectedTime, input.durationMins]
      );

      const hasAllSegments = lockWindowResult.rowCount === requiredSegments;
      const hasBookedSegment = lockWindowResult.rows.some((row) => row.is_booked);
      const bookingOverlapResult = await client.query<{ overlaps: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM bookings b
           WHERE b.slot_date = $1
             AND b.deleted_at IS NULL
             AND $2::time < (b.slot_time + make_interval(mins => b.duration_mins))
             AND b.slot_time < ($2::time + make_interval(mins => $3))
         ) AS overlaps`,
        [input.selectedDate, input.selectedTime, input.durationMins]
      );
      const hasBookingOverlap = bookingOverlapResult.rows[0]?.overlaps ?? false;
      const hasGapInSegments = lockWindowResult.rows.some((row, index, rows) => {
        if (index === 0) {
          return false;
        }

        const previous = rows[index - 1].slot_time.slice(0, 5);
        const current = row.slot_time.slice(0, 5);
        const [prevHour, prevMinute] = previous.split(':').map(Number);
        const [currHour, currMinute] = current.split(':').map(Number);
        const previousTotal = prevHour * 60 + prevMinute;
        const currentTotal = currHour * 60 + currMinute;
        return currentTotal - previousTotal !== SLOT_INTERVAL_MINUTES;
      });

      if (!hasAllSegments || hasBookedSegment || hasBookingOverlap || hasGapInSegments) {
        throw new SlotAlreadyBookedError(input.selectedDate, input.selectedTime);
      }

      const slotIds = lockWindowResult.rows.map((row) => row.id);
      await client.query(
        `UPDATE slots
         SET is_booked = TRUE,
             updated_at = NOW(),
             updated_by = $2
         WHERE id = ANY($1::uuid[])
           AND deleted_at IS NULL`,
        [slotIds, customerEmail]
      );

      await client.query(
        `INSERT INTO bookings (
           booking_type,
           slot_date,
           slot_time,
           duration_mins,
           package_id,
           pay_method,
           grand_total,
           receipt_id,
           customer_email,
           facility_title,
           facility_address,
           facility_image_key,
           facility_tag,
           status,
           payment_method,
           created_by,
           updated_by
         ) VALUES ($1, $2, $3::time, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          input.bookingType,
          input.selectedDate,
          input.selectedTime,
          input.durationMins,
          input.packageOption,
          input.payMethod,
          input.grandTotal,
          input.receiptId,
          customerEmail,
          input.facilityTitle ?? null,
          input.facilityAddress ?? null,
          input.facilityImageKey ?? null,
          input.facilityTag ?? null,
          input.bookingStatus,
          input.paymentMethod,
          customerEmail,
          customerEmail,
        ]
      );

      // Mark reservation confirmed so it stays consistent with the booking record
      if (input.lockToken) {
        await client.query(
          `UPDATE slot_reservations SET status = 'confirmed', updated_at = NOW() WHERE lock_token = $1`,
          [input.lockToken]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function listBookingsByCustomer(customerEmail: string): Promise<BookingHistoryRow[]> {
  if (!pool) {
    return [];
  }

  const normalizedCustomerEmail = customerEmail.trim().toLowerCase();

  return query<BookingHistoryRow>(
    `SELECT
       receipt_id AS "receiptId",
       booking_type AS "bookingType",
       slot_date::text AS "slotDate",
       slot_time::text AS "slotTime",
       duration_mins AS "durationMins",
       grand_total::float8 AS "grandTotal",
      pay_method AS "payMethod",
       facility_title AS "facilityTitle",
       facility_address AS "facilityAddress",
       facility_image_key AS "facilityImageKey",
       facility_tag AS "facilityTag",
       status,
       payment_method AS "paymentMethod"
     FROM bookings
     WHERE deleted_at IS NULL
       AND LOWER(BTRIM(customer_email)) = $1
     ORDER BY slot_date DESC, slot_time DESC`,
    [normalizedCustomerEmail]
  );
}

export async function upsertUserByEmail(email: string, provider: 'password' | 'google'): Promise<void> {
  if (!pool) {
    return;
  }

  await query(
    `INSERT INTO users (email, auth_provider, created_by, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email)
     DO UPDATE SET
       auth_provider = EXCLUDED.auth_provider,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by,
       deleted_at = NULL`,
    [email, provider, email, email]
  );
}

export async function findUserByEmail(email: string): Promise<UserAuthRow | null> {
  if (!pool) {
    return fallbackUsers.get(email.toLowerCase()) ?? null;
  }

  const rows = await query<UserAuthRow>(
    `SELECT id,
            email,
            full_name AS "fullName",
            mobile_number AS "mobileNumber",
            password_encrypted AS "passwordEncrypted",
            password_reset_code AS "passwordResetCode",
            password_reset_expires_at::text AS "passwordResetExpiresAt",
            auth_provider AS "authProvider"
     FROM users
     WHERE deleted_at IS NULL
       AND LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  return rows[0] ?? null;
}

export async function findUserByEmailOrMobile(loginId: string): Promise<UserAuthRow | null> {
  const normalizedLoginId = loginId.trim().toLowerCase();

  if (!pool) {
    const fallbackByEmail = fallbackUsers.get(normalizedLoginId);
    if (fallbackByEmail) {
      return fallbackByEmail;
    }

    for (const user of fallbackUsers.values()) {
      if (user.mobileNumber.trim().toLowerCase() === normalizedLoginId) {
        return user;
      }
    }

    return null;
  }

  const rows = await query<UserAuthRow>(
    `SELECT id,
            email,
            full_name AS "fullName",
            mobile_number AS "mobileNumber",
            password_encrypted AS "passwordEncrypted",
                 password_reset_code AS "passwordResetCode",
                 password_reset_expires_at::text AS "passwordResetExpiresAt",
            auth_provider AS "authProvider"
     FROM users
     WHERE deleted_at IS NULL
       AND (
         LOWER(email) = LOWER($1)
         OR LOWER(mobile_number) = LOWER($1)
       )
     LIMIT 1`,
    [normalizedLoginId]
  );

  return rows[0] ?? null;
}

export async function updateUserPasswordByEmailOrMobile(input: {
  loginId: string;
  passwordEncrypted: string;
}): Promise<UserAuthRow | null> {
  const normalizedLoginId = input.loginId.trim().toLowerCase();

  if (!pool) {
    const existing = await findUserByEmailOrMobile(normalizedLoginId);
    if (!existing) {
      return null;
    }

    const updated: UserAuthRow = {
      ...existing,
      passwordEncrypted: input.passwordEncrypted,
      passwordResetCode: null,
      passwordResetExpiresAt: null,
    };

    fallbackUsers.set(existing.email.toLowerCase(), updated);
    return updated;
  }

  const rows = await query<UserAuthRow>(
    `UPDATE users
     SET password_encrypted = $2,
         password_reset_code = NULL,
         password_reset_expires_at = NULL,
         updated_at = NOW(),
         updated_by = COALESCE(NULLIF(email, ''), $1)
     WHERE deleted_at IS NULL
       AND (
         LOWER(email) = LOWER($1)
         OR LOWER(mobile_number) = LOWER($1)
       )
     RETURNING id,
               email,
               full_name AS "fullName",
               mobile_number AS "mobileNumber",
               password_encrypted AS "passwordEncrypted",
               password_reset_code AS "passwordResetCode",
               password_reset_expires_at::text AS "passwordResetExpiresAt",
               auth_provider AS "authProvider"`,
    [normalizedLoginId, input.passwordEncrypted]
  );

  return rows[0] ?? null;
}

export async function createUserPasswordAccount(input: {
  email: string;
  fullName: string;
  mobileNumber: string;
  passwordEncrypted: string;
}): Promise<UserAuthRow> {
  if (!pool) {
    const key = input.email.toLowerCase();
    const existing = fallbackUsers.get(key);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const user: UserAuthRow = {
      id: `local-${key}`,
      email: input.email,
      fullName: input.fullName,
      mobileNumber: input.mobileNumber,
      passwordEncrypted: input.passwordEncrypted,
      authProvider: 'password',
      passwordResetCode: null,
      passwordResetExpiresAt: null,
    };

    fallbackUsers.set(key, user);
    return user;
  }

  const rows = await query<UserAuthRow>(
    `INSERT INTO users (
       email,
       full_name,
       mobile_number,
       password_encrypted,
       auth_provider,
       created_by,
       updated_by
     ) VALUES ($1, $2, $3, $4, 'password', $1, $1)
     ON CONFLICT (email) DO NOTHING
     RETURNING id,
               email,
               full_name AS "fullName",
               mobile_number AS "mobileNumber",
               password_encrypted AS "passwordEncrypted",
               password_reset_code AS "passwordResetCode",
               password_reset_expires_at::text AS "passwordResetExpiresAt",
               auth_provider AS "authProvider"`,
    [input.email, input.fullName, input.mobileNumber, input.passwordEncrypted]
  );

  const created = rows[0];
  if (!created) {
    throw new Error('An account with this email already exists.');
  }

  return created;
}

export async function savePasswordResetCode(input: {
  email: string;
  code: string;
  expiresAtIso: string;
}): Promise<UserAuthRow | null> {
  const normalizedEmail = input.email.trim().toLowerCase();

  if (!pool) {
    const existing = await findUserByEmail(normalizedEmail);
    if (!existing) {
      return null;
    }

    const updated: UserAuthRow = {
      ...existing,
      passwordResetCode: input.code,
      passwordResetExpiresAt: input.expiresAtIso,
    };

    fallbackUsers.set(existing.email.toLowerCase(), updated);
    return updated;
  }

  const rows = await query<UserAuthRow>(
    `UPDATE users
     SET password_reset_code = $2,
         password_reset_expires_at = $3::timestamptz,
         updated_at = NOW(),
         updated_by = email
     WHERE deleted_at IS NULL
       AND LOWER(email) = LOWER($1)
     RETURNING id,
               email,
               full_name AS "fullName",
               mobile_number AS "mobileNumber",
               password_encrypted AS "passwordEncrypted",
               password_reset_code AS "passwordResetCode",
               password_reset_expires_at::text AS "passwordResetExpiresAt",
               auth_provider AS "authProvider"`,
    [normalizedEmail, input.code, input.expiresAtIso]
  );

  return rows[0] ?? null;
}

export async function verifyPasswordResetCode(input: {
  email: string;
  code: string;
}): Promise<boolean> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const nowMs = Date.now();

  if (!pool) {
    const existing = await findUserByEmail(normalizedEmail);
    if (!existing?.passwordResetCode || !existing.passwordResetExpiresAt) {
      return false;
    }

    return existing.passwordResetCode === input.code && new Date(existing.passwordResetExpiresAt).getTime() > nowMs;
  }

  const rows = await query<{ matches: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM users
       WHERE deleted_at IS NULL
         AND LOWER(email) = LOWER($1)
         AND password_reset_code = $2
         AND password_reset_expires_at IS NOT NULL
         AND password_reset_expires_at > NOW()
     ) AS matches`,
    [normalizedEmail, input.code]
  );

  return rows[0]?.matches ?? false;
}

export async function completePasswordReset(input: {
  email: string;
  code: string;
  passwordEncrypted: string;
}): Promise<UserAuthRow | null> {
  const normalizedEmail = input.email.trim().toLowerCase();

  if (!(await verifyPasswordResetCode({ email: normalizedEmail, code: input.code }))) {
    return null;
  }

  return updateUserPasswordByEmailOrMobile({
    loginId: normalizedEmail,
    passwordEncrypted: input.passwordEncrypted,
  });
}

export async function seedDatabase(): Promise<void> {
  if (!pool) {
    return;
  }

  await withDatabaseClient(async (client) => {
    await client.query('BEGIN');
    try {
      await ensureSchema(client);
      await client.query('DELETE FROM sport_facilities');
      await client.query('DELETE FROM sport_events');
      await client.query('DELETE FROM sports');
      await seedPackages(client);
      await seedSports(client);
      await seedSportEvents(client);
      await seedSportFacilities(client);
      await seedSystemConfigs(client);

      for (const weekdayName of WEEKDAY_NAMES) {
        const window = DEFAULT_WEEKDAY_SLOT_WINDOWS[weekdayName];
        await client.query(
          `INSERT INTO slot_weekday_configurations (
             weekday_name,
             slot_start_time,
             slot_end_time,
             created_by,
             updated_by
           ) VALUES ($1, $2::time, $3::time, 'seed', 'seed')
           ON CONFLICT (weekday_name)
           DO UPDATE SET
             slot_start_time = EXCLUDED.slot_start_time,
             slot_end_time = EXCLUDED.slot_end_time,
             updated_at = NOW(),
             updated_by = 'seed',
             deleted_at = NULL`,
          [weekdayName, window.startTime, window.endTime]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function resetDatabaseAndSeed(): Promise<void> {
  if (!pool) {
    return;
  }

  await withDatabaseClient(async (client) => {
    await client.query('BEGIN');
    try {
      await ensureSchema(client);
      await client.query('TRUNCATE TABLE bookings, slots, users, packages, sports, sport_events, sport_facilities, slot_weekday_configurations RESTART IDENTITY CASCADE');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });

  await seedDatabase();
}

// ─── System Config Service ────────────────────────────────────

let _configCache: Map<string, string> | null = null;
let _configCacheExpiry = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL; call invalidateConfigCache() after any write

function _cacheKey(type: string, key: string): string {
  return `${type}::${key}`;
}

async function _reloadConfigCache(): Promise<void> {
  if (!pool) return;
  try {
    const rows = await query<{ config_type: string; config_key: string; config_value: string }>(
      `SELECT config_type, config_key, config_value
       FROM system_configs
       WHERE deleted_at IS NULL AND is_active = TRUE`
    );
    _configCache = new Map(rows.map((r) => [_cacheKey(r.config_type, r.config_key), r.config_value]));
    _configCacheExpiry = Date.now() + CONFIG_CACHE_TTL_MS;
  } catch {
    // Table may not exist during the very first schema creation run; use empty cache briefly
    _configCache = new Map();
    _configCacheExpiry = Date.now() + 30_000;
  }
}

export function invalidateConfigCache(): void {
  _configCache = null;
  _configCacheExpiry = 0;
}

async function _ensureCache(): Promise<void> {
  if (!_configCache || Date.now() >= _configCacheExpiry) {
    await _reloadConfigCache();
  }
}

export async function getConfigValue(configType: string, configKey: string): Promise<string | null> {
  if (!pool) return null;
  await _ensureCache();
  return _configCache?.get(_cacheKey(configType, configKey)) ?? null;
}

export async function getConfigByType(configType: string): Promise<ConfigMap> {
  if (!pool) return {};
  await _ensureCache();
  const result: ConfigMap = {};
  for (const [k, v] of (_configCache ?? [])) {
    const [type, key] = k.split('::');
    if (type === configType) result[key] = v;
  }
  return result;
}

export async function getAllConfigs(): Promise<Record<string, ConfigMap>> {
  if (!pool) return {};
  await _ensureCache();
  const result: Record<string, ConfigMap> = {};
  for (const [k, v] of (_configCache ?? [])) {
    const separatorIdx = k.indexOf('::');
    const type = k.slice(0, separatorIdx);
    const key = k.slice(separatorIdx + 2);
    if (!result[type]) result[type] = {};
    result[type][key] = v;
  }
  return result;
}

export async function getConfigNumber(configType: string, configKey: string, fallback: number): Promise<number> {
  const raw = await getConfigValue(configType, configKey);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getConfigBoolean(configType: string, configKey: string, fallback: boolean): Promise<boolean> {
  const raw = await getConfigValue(configType, configKey);
  if (raw === null) return fallback;
  return raw.trim().toLowerCase() === 'true';
}

export async function reserveSlot(
  slotDate: string,
  slotTime: string,
  durationMins: number,
  customerEmail: string,
  lockToken: string
): Promise<void> {
  if (!pool) return;

  // Read TTL from config table; fall back to hardcoded constant if unavailable
  const ttlMins = await getConfigNumber('RESERVATION', 'SLOT_LOCK_DURATION_MINS', RESERVATION_TTL_MINUTES);

  await withDatabaseClient(async (client) => {
    await client.query('BEGIN');
    try {
      // Reject if the slot time has already passed
      const currentDateTime = currentSingaporeDateTimeParts();
      if (isPastOrCurrentSlot(slotDate, slotTime, currentDateTime)) {
        throw new SlotAlreadyBookedError(slotDate, slotTime);
      }

      // Lock the slot rows to prevent concurrent reservations
      const requiredSegments = Math.max(1, Math.ceil(durationMins / SLOT_INTERVAL_MINUTES));
      const lockResult = await client.query<{ id: string; is_booked: boolean }>(
        `SELECT id, is_booked
         FROM slots
         WHERE slot_date = $1
           AND slot_time >= $2::time
           AND slot_time < ($2::time + make_interval(mins => $3))
           AND deleted_at IS NULL
         ORDER BY slot_time ASC
         FOR UPDATE`,
        [slotDate, slotTime, durationMins]
      );

      if ((lockResult.rowCount ?? 0) < requiredSegments || lockResult.rows.some((r) => r.is_booked)) {
        throw new SlotAlreadyBookedError(slotDate, slotTime);
      }

      // Check for an active reservation by a different user
      const conflictResult = await client.query<{ id: string }>(
        `SELECT id FROM slot_reservations
         WHERE slot_date = $1
           AND slot_time = $2::time
           AND status = 'pending'
           AND expires_at > NOW()
           AND LOWER(BTRIM(customer_email)) != $3`,
        [slotDate, slotTime, customerEmail]
      );

      if ((conflictResult.rowCount ?? 0) > 0) {
        throw new SlotReservedError(slotDate, slotTime);
      }

      // Release any stale reservation by this user for the same slot
      await client.query(
        `UPDATE slot_reservations
         SET status = 'released', updated_at = NOW()
         WHERE slot_date = $1 AND slot_time = $2::time
           AND LOWER(BTRIM(customer_email)) = $3 AND status = 'pending'`,
        [slotDate, slotTime, customerEmail]
      );

      await client.query(
        `INSERT INTO slot_reservations (slot_date, slot_time, customer_email, lock_token, expires_at)
         VALUES ($1, $2::time, $3, $4, NOW() + make_interval(mins => $5))`,
        [slotDate, slotTime, customerEmail, lockToken, ttlMins]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function releaseReservation(lockToken: string, customerEmail: string): Promise<void> {
  if (!pool) return;

  await query(
    `UPDATE slot_reservations
     SET status = 'released', updated_at = NOW()
     WHERE lock_token = $1
       AND LOWER(BTRIM(customer_email)) = $2
       AND status = 'pending'`,
    [lockToken, customerEmail]
  );
}
