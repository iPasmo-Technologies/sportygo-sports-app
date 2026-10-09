import 'dotenv/config';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import DEFAULT_SPORTS from '../data/json/sports.json';
import DEFAULT_SPORT_EVENTS from '../data/json/sport-events.json';
import DEFAULT_SPORT_FACILITIES from '../data/json/sport-facilities.json';
import { decryptPasswordAtRest, encryptPasswordAtRest } from './authCrypto';

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
  sportId: SportRow['id'];
  facilityCode: string;
  slotDate: string;
  slotTime: string;
  durationMins: number;
  grandTotal: number;
  status: 'confirmed' | 'cash_pending' | 'cancelled';
  payMethod: 'STRIPE' | 'GPAY' | 'PAYNOW' | 'GRABPAY';
  paymentMethod: 'ONLINE' | 'CASH';
  facilityTitle: string | null;
  facilityAddress: string | null;
  facilityMapLocationUrl: string | null;
  facilityImageKey: SportFacilityRow['imageKey'] | null;
  facilityTag: string | null;
  clubs: string | null;
};

export type AdminBookingRow = {
  facilityTitle: string | null;
  facilityAddress: string | null;
  slotDate: string;
  slotTime: string;
  durationMins: number;
  grandTotal: number;
  payMethod: string;
  receiptId: string;
  customerEmail: string;
  createdBy: string;
  packageId: string | null;
  status: BookingHistoryRow['status'];
  createdAt: string;
  updatedAt: string;
  mobileNumber: string | null;
};

type BookingInput = {
  bookingType: string;
  sportId?: SportRow['id'] | null;
  facilityCode?: string | null;
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
  role: 'public' | 'coach' | 'admin';
  passwordResetCode?: string | null;
  passwordResetExpiresAt?: string | null;
  clubs?: string | null;
};

export type AdminUserRow = {
  fullName: string;
  email: string;
  mobileNumber: string;
  passwordResetCode: string | null;
};

export type AdminSlotBlockResult = {
  blockId: string;
  sportId: SportRow['id'];
  facilityCode: string;
  facilityTitle: string;
  blockedCount: number;
  dates: string[];
  startTime: string;
  endTime: string;
  reason: string;
};

export type AdminBlockRuleRow = {
  id: string;
  ruleType: 'one-time' | 'recurring';
  sportId: SportRow['id'] | null;
  facilityCode: string | null;
  facilityTitle: string;
  dates: string[];
  validFrom: string | null;
  validTo: string | null;
  weekdays: string[];
  startTime: string;
  endTime: string;
  reason: string;
  source: 'admin' | 'system-seed' | 'legacy';
  active: boolean;
  editable: boolean;
  createdAt: string;
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

export class FacilityUnavailableError extends Error {
  constructor() {
    super('The selected sport facility does not exist or is disabled.');
    this.name = 'FacilityUnavailableError';
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
  { configType: 'RESERVATION', configKey: 'SLOT_LOCK_DURATION_MINS',  configValue: '10',   valueType: 'INTEGER', description: 'Minutes a slot is held after reservation before auto-expiry' },
  { configType: 'PAYMENTS', configKey: 'PAYMENT_TEST_MODE_ENABLED',   configValue: 'true', valueType: 'BOOLEAN', description: 'Whether the developer-only custom-amount Stripe test endpoint is active' },
  // Club/Organization data for user affiliation
  { configType: 'CLUBS', configKey: 'SINGAPORE_CRICKET_CLUB', configValue: 'Singapore Cricket Club', valueType: 'STRING', description: 'Singapore Cricket Club' },
  { configType: 'CLUBS', configKey: 'SINGAPORE_RECREATION_CLUB', configValue: 'Singapore Recreation Club', valueType: 'STRING', description: 'Singapore Recreation Club' },
  { configType: 'CLUBS', configKey: 'TANGLIN_CLUB', configValue: 'Tanglin Club', valueType: 'STRING', description: 'Tanglin Club' },
  { configType: 'CLUBS', configKey: 'AMERICAN_CLUB', configValue: 'American Club', valueType: 'STRING', description: 'American Club' },
  { configType: 'CLUBS', configKey: 'BRITISH_CLUB', configValue: 'British Club', valueType: 'STRING', description: 'British Club' },
  { configType: 'CLUBS', configKey: 'DUTCH_CLUB', configValue: 'Dutch Club', valueType: 'STRING', description: 'Dutch Club' },
  { configType: 'CLUBS', configKey: 'JAPANESE_ASSOCIATION', configValue: 'Japanese Association', valueType: 'STRING', description: 'Japanese Association' },
  { configType: 'CLUBS', configKey: 'CHINESE_SWIMMING_CLUB', configValue: 'Chinese Swimming Club', valueType: 'STRING', description: 'Chinese Swimming Club' },
  { configType: 'CLUBS', configKey: 'SINGAPORE_SWIMMING_CLUB', configValue: 'Singapore Swimming Club', valueType: 'STRING', description: 'Singapore Swimming Club' },
  { configType: 'CLUBS', configKey: 'SELETAR_COUNTRY_CLUB', configValue: 'Seletar Country Club', valueType: 'STRING', description: 'Seletar Country Club' },
  { configType: 'CLUBS', configKey: 'KEPPEL_CLUB', configValue: 'Keppel Club', valueType: 'STRING', description: 'Keppel Club' },
  { configType: 'CLUBS', configKey: 'SINGAPORE_ISLAND_COUNTRY_CLUB', configValue: 'Singapore Island Country Club', valueType: 'STRING', description: 'Singapore Island Country Club' },
  { configType: 'CLUBS', configKey: 'LAGUNA_NATIONAL_GOLF_CLUB', configValue: 'Laguna National Golf & Country Club', valueType: 'STRING', description: 'Laguna National Golf & Country Club' },
  { configType: 'CLUBS', configKey: 'SENTOSA_GOLF_CLUB', configValue: 'Sentosa Golf Club', valueType: 'STRING', description: 'Sentosa Golf Club' },
  { configType: 'CLUBS', configKey: 'TANJONG_PAGAR_CENTRE', configValue: 'Tanjong Pagar Centre', valueType: 'STRING', description: 'Tanjong Pagar Centre' },
];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const DEFAULT_WEEKDAY_SLOT_WINDOWS: Record<(typeof WEEKDAY_NAMES)[number], { startTime: string; endTime: string }> = {
  sunday: { startTime: '08:00', endTime: '19:00' },
  monday: { startTime: '16:00', endTime: '19:00' },
  tuesday: { startTime: '16:00', endTime: '19:00' },
  wednesday: { startTime: '16:00', endTime: '19:00' },
  thursday: { startTime: '16:00', endTime: '19:00' },
  friday: { startTime: '16:00', endTime: '19:00' },
  saturday: { startTime: '08:00', endTime: '19:00' },
};
const EXCEPTION_FACILITIES_2026: Array<{ sportId: SportRow['id']; facilityCode: string }> = [
  ...['bowling-lane', 'net-2', 'net-3', 'net-4', 'indoor-court', 'outdoor-field']
    .map((facilityCode) => ({ sportId: 'cricket' as const, facilityCode })),
  { sportId: 'pickleball', facilityCode: 'indoor-court' },
  { sportId: 'pickleball', facilityCode: 'outdoor-field' },
];

type RecurringSlotBlockSeed = {
  sportId: SportRow['id'];
  facilityCode: string;
  weekdayName: (typeof WEEKDAY_NAMES)[number];
  startTime: string;
  endTime: string;
};

const ACADEMY_BLOCKS_2026: RecurringSlotBlockSeed[] = [
  { sportId: 'cricket', facilityCode: 'bowling-lane', weekdayName: 'saturday', startTime: '08:00', endTime: '10:00' },
  { sportId: 'cricket', facilityCode: 'bowling-lane', weekdayName: 'saturday', startTime: '16:00', endTime: '18:00' },
  ...['net-2', 'net-3', 'net-4'].flatMap((facilityCode) => [
    { sportId: 'cricket' as const, facilityCode, weekdayName: 'wednesday' as const, startTime: '16:00', endTime: '18:00' },
    { sportId: 'cricket' as const, facilityCode, weekdayName: 'friday' as const, startTime: '16:00', endTime: '18:00' },
    { sportId: 'cricket' as const, facilityCode, weekdayName: 'saturday' as const, startTime: '08:00', endTime: '10:00' },
    { sportId: 'cricket' as const, facilityCode, weekdayName: 'saturday' as const, startTime: '13:30', endTime: '18:00' },
    { sportId: 'cricket' as const, facilityCode, weekdayName: 'sunday' as const, startTime: '08:00', endTime: '10:00' },
    { sportId: 'cricket' as const, facilityCode, weekdayName: 'sunday' as const, startTime: '16:00', endTime: '18:00' },
  ]),
  { sportId: 'cricket', facilityCode: 'indoor-court', weekdayName: 'saturday', startTime: '16:00', endTime: '18:00' },
];
const ACADEMY_BLOCK_REASON = 'SGO Academy Sessions';

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

function availabilityExceptionDates2026(): string[] {
  const dates = ['2026-08-10', '2026-11-09'];
  for (let day = 1; day <= 31; day++) {
    const date = `2026-12-${String(day).padStart(2, '0')}`;
    const weekdayName = weekdayNameForDate(date);
    if (weekdayName !== 'saturday' && weekdayName !== 'sunday') dates.push(date);
  }
  return dates;
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

async function seedFacilityWeekdayConfigurations(client: PoolClient, overwriteExisting: boolean): Promise<void> {
  for (const facility of DEFAULT_SPORT_FACILITY_TEMPLATE_ROWS) {
    for (const weekdayName of WEEKDAY_NAMES) {
      const window = DEFAULT_WEEKDAY_SLOT_WINDOWS[weekdayName];
      await client.query(
        `INSERT INTO slot_weekday_configurations (
           sport_id,
           facility_code,
           weekday_name,
           slot_start_time,
           slot_end_time,
           created_by,
           updated_by
         ) VALUES ($1, $2, $3, $4::time, $5::time, 'seed', 'seed')
         ON CONFLICT (sport_id, facility_code, weekday_name)
         ${overwriteExisting ? `DO UPDATE SET
           slot_start_time = EXCLUDED.slot_start_time,
           slot_end_time = EXCLUDED.slot_end_time,
           updated_at = NOW(),
           updated_by = 'seed',
           deleted_at = NULL` : 'DO NOTHING'}`,
        [facility.sportId, facility.code, weekdayName, window.startTime, window.endTime]
      );
    }
  }
}

async function seedAvailabilityExceptions2026(client: PoolClient, overwriteExisting: boolean): Promise<void> {
  for (const facility of EXCEPTION_FACILITIES_2026) {
    for (const exceptionDate of availabilityExceptionDates2026()) {
      await client.query(
        `INSERT INTO slot_availability_exceptions (
           sport_id, facility_code, exception_date, slot_start_time, slot_end_time, created_by, updated_by
         ) VALUES ($1, $2, $3::date, '08:00'::time, '19:00'::time, 'seed', 'seed')
         ON CONFLICT (sport_id, facility_code, exception_date)
         ${overwriteExisting ? `DO UPDATE SET
           slot_start_time = EXCLUDED.slot_start_time,
           slot_end_time = EXCLUDED.slot_end_time,
           updated_at = NOW(),
           updated_by = 'seed',
           deleted_at = NULL` : 'DO NOTHING'}`,
        [facility.sportId, facility.facilityCode, exceptionDate]
      );
    }
  }
}

async function seedRecurringAcademyBlocks2026(client: PoolClient, overwriteExisting: boolean): Promise<void> {
  for (const block of ACADEMY_BLOCKS_2026) {
    await client.query(
      `INSERT INTO slot_block_rules (
         rule_type, sport_id, facility_code, valid_from, valid_to, weekday_name,
         slot_start_time, slot_end_time, reason, created_by, updated_by
       ) VALUES ('recurring', $1, $2, '2026-01-01'::date, '2026-12-31'::date, $3, $4::time, $5::time, $6, 'seed', 'seed')
       ON CONFLICT (sport_id, facility_code, valid_from, valid_to, weekday_name, slot_start_time, slot_end_time)
       WHERE rule_type = 'recurring'
       ${overwriteExisting ? `DO UPDATE SET
         reason = EXCLUDED.reason,
         updated_at = NOW(),
         updated_by = 'seed',
         deleted_at = NULL` : 'DO NOTHING'}`,
      [block.sportId, block.facilityCode, block.weekdayName, block.startTime, block.endTime, ACADEMY_BLOCK_REASON]
    );
  }
}

async function ensureSchema(client: PoolClient): Promise<void> {
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
      role TEXT NOT NULL DEFAULT 'public' CHECK (role IN ('public', 'coach', 'admin')),
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
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'public'
      CHECK (role IN ('public', 'coach', 'admin'))
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

  // Add clubs column for organization/club affiliations
  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS clubs TEXT
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
    UPDATE sports
    SET enabled = FALSE,
        updated_at = NOW(),
        updated_by = 'system'
    WHERE id IN ('futsal', 'sepak-takraw', 'tennis', 'table-tennis')
      AND enabled IS DISTINCT FROM FALSE
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
    SET address = 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842',
        map_location_url = 'https://maps.app.goo.gl/BWiBvM8FU3meALV27'
    WHERE address IS DISTINCT FROM 'SportyGo @ DPS International School, 36 Aroozoo Ave, Singapore 539842'
       OR map_location_url IS DISTINCT FROM 'https://maps.app.goo.gl/BWiBvM8FU3meALV27'
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
        price_label = CASE facility_code
          WHEN 'indoor-court' THEN 'S$30'
          WHEN 'outdoor-field' THEN 'S$25'
          ELSE price_label
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

  await client.query('ALTER TABLE slots ADD COLUMN IF NOT EXISTS sport_id TEXT NULL');
  await client.query('ALTER TABLE slots ADD COLUMN IF NOT EXISTS facility_code TEXT NULL');
  await client.query('ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_slot_date_slot_time_key');
  await client.query('DELETE FROM slots WHERE sport_id IS NULL OR facility_code IS NULL');
  await client.query('ALTER TABLE slots ALTER COLUMN sport_id SET NOT NULL');
  await client.query('ALTER TABLE slots ALTER COLUMN facility_code SET NOT NULL');
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_slots_facility_date_time_unique
    ON slots (sport_id, facility_code, slot_date, slot_time)
  `);

  // Remove obsolete per-date slot configuration table from previous schema iteration.
  await client.query('DROP TABLE IF EXISTS slot_day_configurations');

  await client.query(`
    CREATE TABLE IF NOT EXISTS slot_weekday_configurations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sport_id TEXT NOT NULL,
      facility_code TEXT NOT NULL,
      weekday_name TEXT NOT NULL,
      slot_start_time TIME NOT NULL,
      slot_end_time TIME NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system',
      CHECK (weekday_name IN ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')),
      CHECK (slot_start_time < slot_end_time)
    )
  `);

  await client.query('ALTER TABLE slot_weekday_configurations ADD COLUMN IF NOT EXISTS sport_id TEXT NULL');
  await client.query('ALTER TABLE slot_weekday_configurations ADD COLUMN IF NOT EXISTS facility_code TEXT NULL');
  await client.query('ALTER TABLE slot_weekday_configurations DROP CONSTRAINT IF EXISTS slot_weekday_configurations_weekday_name_key');
  await client.query('DELETE FROM slot_weekday_configurations WHERE sport_id IS NULL OR facility_code IS NULL');
  await client.query('ALTER TABLE slot_weekday_configurations ALTER COLUMN sport_id SET NOT NULL');
  await client.query('ALTER TABLE slot_weekday_configurations ALTER COLUMN facility_code SET NOT NULL');
  await client.query('DROP INDEX IF EXISTS idx_slot_weekday_configurations_name');
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_weekday_configurations_facility_day_unique
    ON slot_weekday_configurations (sport_id, facility_code, weekday_name)
  `);
  await seedFacilityWeekdayConfigurations(client, false);

  await client.query(`
    CREATE TABLE IF NOT EXISTS slot_availability_exceptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sport_id TEXT NOT NULL,
      facility_code TEXT NOT NULL,
      exception_date DATE NOT NULL,
      slot_start_time TIME NOT NULL,
      slot_end_time TIME NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system',
      CHECK (slot_start_time < slot_end_time)
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_availability_exceptions_facility_date
    ON slot_availability_exceptions (sport_id, facility_code, exception_date)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS slot_block_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_type TEXT NOT NULL CHECK (rule_type IN ('one-time', 'recurring')),
      admin_email TEXT NULL,
      sport_id TEXT NULL,
      facility_code TEXT NULL,
      facility_title TEXT NULL,
      selected_dates JSONB NULL,
      valid_from DATE NULL,
      valid_to DATE NULL,
      weekday_name TEXT NULL,
      slot_start_time TIME NOT NULL,
      slot_end_time TIME NOT NULL,
      reason TEXT NOT NULL,
      blocked_slot_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      updated_by TEXT NOT NULL DEFAULT 'system',
      CHECK (slot_start_time < slot_end_time),
      CHECK ((sport_id IS NULL) = (facility_code IS NULL)),
      CHECK (
        (rule_type = 'one-time'
          AND admin_email IS NOT NULL
          AND selected_dates IS NOT NULL AND jsonb_typeof(selected_dates) = 'array'
          AND valid_from IS NULL AND valid_to IS NULL AND weekday_name IS NULL)
        OR
        (rule_type = 'recurring'
          AND sport_id IS NOT NULL AND facility_code IS NOT NULL
          AND selected_dates IS NULL
          AND valid_from IS NOT NULL AND valid_to IS NOT NULL AND valid_from <= valid_to
          AND weekday_name IN ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'))
      )
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_block_rules_recurring_unique
    ON slot_block_rules (
      sport_id, facility_code, valid_from, valid_to, weekday_name, slot_start_time, slot_end_time
    )
    WHERE rule_type = 'recurring'
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_slot_block_rules_active_lookup
    ON slot_block_rules (rule_type, sport_id, facility_code)
    WHERE deleted_at IS NULL
  `);

  // Preserve existing rule IDs and audit history before retiring the two legacy tables.
  await client.query(`
    DO $migration$
    BEGIN
      IF to_regclass('public.slot_recurring_blocks') IS NOT NULL THEN
        EXECUTE $sql$
          INSERT INTO slot_block_rules (
            id, rule_type, sport_id, facility_code, valid_from, valid_to, weekday_name,
            slot_start_time, slot_end_time, reason, created_at, updated_at, deleted_at, created_by, updated_by
          )
          SELECT id, 'recurring', sport_id, facility_code, valid_from, valid_to, weekday_name,
            slot_start_time, slot_end_time, reason, created_at, updated_at, deleted_at, created_by, updated_by
          FROM slot_recurring_blocks
          ON CONFLICT (id) DO NOTHING
        $sql$;
      END IF;

      IF to_regclass('public.admin_slot_blocks') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE admin_slot_blocks ADD COLUMN IF NOT EXISTS sport_id TEXT NULL';
        EXECUTE 'ALTER TABLE admin_slot_blocks ADD COLUMN IF NOT EXISTS facility_code TEXT NULL';
        EXECUTE 'ALTER TABLE admin_slot_blocks ADD COLUMN IF NOT EXISTS facility_title TEXT NULL';
        EXECUTE $sql$
          INSERT INTO slot_block_rules (
            id, rule_type, admin_email, sport_id, facility_code, facility_title, selected_dates,
            slot_start_time, slot_end_time, reason, blocked_slot_count,
            created_at, updated_at, deleted_at, created_by, updated_by
          )
          SELECT id, 'one-time', admin_email, sport_id, facility_code, facility_title, selected_dates,
            slot_start_time, slot_end_time, reason, blocked_slot_count,
            created_at, updated_at, deleted_at, created_by, updated_by
          FROM admin_slot_blocks
          ON CONFLICT (id) DO NOTHING
        $sql$;
      END IF;
    END
    $migration$
  `);
  await client.query('DROP TABLE IF EXISTS slot_recurring_blocks');
  await client.query('DROP TABLE IF EXISTS admin_slot_blocks');
  await seedAvailabilityExceptions2026(client, false);
  await seedRecurringAcademyBlocks2026(client, false);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_slots_slot_date_booked
    ON slots (slot_date, is_booked, slot_time)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_type TEXT NOT NULL CHECK (booking_type IN ('court', 'coaching')),
      sport_id TEXT NULL,
      facility_code TEXT NULL,
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
      status TEXT NOT NULL CHECK (status IN ('confirmed', 'cash_pending', 'cancelled')),
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
  await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sport_id TEXT NULL');
  await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS facility_code TEXT NULL');
  await client.query('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check');
  await client.query(`
    ALTER TABLE bookings
    ADD CONSTRAINT bookings_status_check CHECK (status IN ('confirmed', 'cash_pending', 'cancelled'))
  `);

  await client.query(`
    UPDATE bookings AS booking
    SET sport_id = facility.sport_id,
        facility_code = facility.facility_code
    FROM sport_facilities AS facility
    WHERE booking.sport_id IS NULL
      AND booking.facility_code IS NULL
      AND booking.facility_title = facility.title
      AND facility.deleted_at IS NULL
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_bookings_facility
    ON bookings (sport_id, facility_code)
  `);

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

  await client.query('ALTER TABLE slot_reservations ADD COLUMN IF NOT EXISTS sport_id TEXT NULL');
  await client.query('ALTER TABLE slot_reservations ADD COLUMN IF NOT EXISTS facility_code TEXT NULL');
  await client.query('DELETE FROM slot_reservations WHERE sport_id IS NULL OR facility_code IS NULL');
  await client.query('ALTER TABLE slot_reservations ALTER COLUMN sport_id SET NOT NULL');
  await client.query('ALTER TABLE slot_reservations ALTER COLUMN facility_code SET NOT NULL');

  await client.query(`
    DROP INDEX IF EXISTS idx_slot_reservations_lookup
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_slot_reservations_lookup
    ON slot_reservations (sport_id, facility_code, slot_date, slot_time, status, expires_at)
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
  await client.query(`
    DELETE FROM system_configs
    WHERE (config_type, config_key) IN (
      ('RESERVATION', 'MAX_LOCKS_PER_USER'),
      ('PRICING', 'PLATFORM_FEE_SGD'),
      ('PRICING', 'STRIPE_FEE_RATE'),
      ('PRICING', 'DEFAULT_COURT_RATE_PER_HOUR'),
      ('SLOTS', 'SLOT_INTERVAL_MINS'),
      ('SLOTS', 'DEFAULT_WINDOW_START'),
      ('SLOTS', 'DEFAULT_WINDOW_END'),
      ('BOOKING', 'MAX_ADVANCE_BOOKING_MONTHS'),
      ('BOOKING', 'MIN_DURATION_MINS'),
      ('BOOKING', 'CANCELLATION_WINDOW_HOURS'),
      ('PAYMENTS', 'CURRENCY'),
      ('PAYMENTS', 'PAYMENT_SESSION_TIMEOUT_SECS'),
      ('PAYMENTS', 'STRIPE_ENABLED'),
      ('PAYMENTS', 'PAYNOW_ENABLED'),
      ('PAYMENTS', 'GRABPAY_ENABLED'),
      ('PAYMENTS', 'GPAY_ENABLED'),
      ('NOTIFICATIONS', 'BOOKING_CONFIRMATION_ENABLED'),
      ('NOTIFICATIONS', 'REMINDER_HOURS_BEFORE'),
      ('NOTIFICATIONS', 'SUPPORT_EMAIL'),
      ('APP', 'TIMEZONE'),
      ('APP', 'APP_NAME'),
      ('APP', 'TERMS_VERSION')
    )
  `);
}

async function ensureInitialAdminUser(client: PoolClient): Promise<void> {
  const email = 'dharmichand@sportygo.com.sg';
  const passwordEncrypted = await encryptPasswordAtRest('Admin@123');

  const existingResult = await client.query<{ password_encrypted: string }>(
    `SELECT password_encrypted
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );
  let repairPassword = existingResult.rowCount === 0;
  if (existingResult.rows[0]?.password_encrypted) {
    try {
      await decryptPasswordAtRest(existingResult.rows[0].password_encrypted);
    } catch {
      repairPassword = true;
    }
  }

  await client.query(
    `INSERT INTO users (
       email, full_name, mobile_number, password_encrypted, auth_provider, role, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, 'password', 'admin', 'system', 'system')
     ON CONFLICT (email)
     DO UPDATE SET
       role = 'admin',
       password_encrypted = CASE
         WHEN $5::boolean THEN EXCLUDED.password_encrypted
         ELSE users.password_encrypted
       END,
       updated_at = NOW(),
       updated_by = 'system',
       deleted_at = NULL`,
    [email, 'Dharmichand', '+6500000000', passwordEncrypted, repairPassword]
  );
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
        await ensureInitialAdminUser(client);
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

export async function ensureSlotsForDate(
  client: PoolClient,
  dateStr: string,
  sportId: SportRow['id'],
  facilityCode: string
): Promise<void> {
  const weekdayName = weekdayNameForDate(dateStr);

  const configResult = await client.query<SlotWeekdayConfiguration>(
    `SELECT slot_start_time::text AS "slotStartTime",
            slot_end_time::text AS "slotEndTime"
     FROM (
       SELECT slot_start_time, slot_end_time, 0 AS priority
       FROM slot_availability_exceptions
       WHERE sport_id = $1
         AND facility_code = $2
         AND exception_date = $3::date
         AND deleted_at IS NULL
       UNION ALL
       SELECT slot_start_time, slot_end_time, 1 AS priority
       FROM slot_weekday_configurations
       WHERE sport_id = $1
         AND facility_code = $2
         AND weekday_name = $4
         AND deleted_at IS NULL
     ) AS configured_window
     ORDER BY priority
     LIMIT 1`,
    [sportId, facilityCode, dateStr, weekdayName]
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
       AND s.sport_id = $4
       AND s.facility_code = $5
       AND s.deleted_at IS NULL
       AND s.is_booked = FALSE
       AND (s.slot_time < $2::time OR s.slot_time >= $3::time)
       AND NOT EXISTS (
         SELECT 1
         FROM bookings b
         WHERE b.slot_date = s.slot_date
           AND b.sport_id = s.sport_id
           AND b.facility_code = s.facility_code
           AND b.deleted_at IS NULL
           AND b.status IN ('confirmed', 'cash_pending')
           AND s.slot_time >= b.slot_time
           AND s.slot_time < (b.slot_time + make_interval(mins => b.duration_mins))
       )`,
    [dateStr, config.slotStartTime.slice(0, 5), config.slotEndTime.slice(0, 5), sportId, facilityCode]
  );

  const existingRows = await client.query<{ slot_time: string }>(
    `SELECT slot_time::text AS slot_time
     FROM slots
     WHERE slot_date = $1
       AND sport_id = $2
       AND facility_code = $3
       AND deleted_at IS NULL`,
     [dateStr, sportId, facilityCode]
  );

  const existingTimes = new Set(existingRows.rows.map((row) => row.slot_time.slice(0, 5)));
  const slotsToInsert = generatedSlots.filter((slot) => !existingTimes.has(slot.time));
  if (slotsToInsert.length > 0) {
    const values: unknown[] = [];
    const placeholders = slotsToInsert.map((slot, index) => {
      const base = index * 7;
      values.push(sportId, facilityCode, dateStr, slot.time, slot.booked, 'system', 'system');
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, NOW(), NOW(), $${base + 6}, $${base + 7})`;
    });

    await client.query(
      `INSERT INTO slots (sport_id, facility_code, slot_date, slot_time, is_booked, created_at, updated_at, created_by, updated_by)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (sport_id, facility_code, slot_date, slot_time) DO NOTHING`,
      values
    );
  }

  await client.query(
    `UPDATE slots s
     SET is_booked = TRUE,
         updated_at = NOW(),
         updated_by = 'recurring-block'
     WHERE s.sport_id = $1
       AND s.facility_code = $2
       AND s.slot_date = $3
       AND s.deleted_at IS NULL
       AND s.is_booked = FALSE
       AND EXISTS (
         SELECT 1
         FROM slot_block_rules block
         WHERE block.sport_id = s.sport_id
           AND block.facility_code = s.facility_code
           AND block.rule_type = 'recurring'
           AND s.slot_date BETWEEN block.valid_from AND block.valid_to
           AND block.weekday_name = $4
           AND block.deleted_at IS NULL
           AND s.slot_time >= block.slot_start_time
           AND s.slot_time < block.slot_end_time
       )`,
    [sportId, facilityCode, dateStr, weekdayName]
  );

  // Replay manual blocks so slots added later by an expanded exception window remain unavailable.
  await client.query(
    `UPDATE slots s
     SET is_booked = TRUE,
         updated_at = NOW(),
         updated_by = 'admin-block'
     WHERE s.sport_id = $1
       AND s.facility_code = $2
       AND s.slot_date = $3
       AND s.deleted_at IS NULL
       AND s.is_booked = FALSE
       AND EXISTS (
         SELECT 1
         FROM slot_block_rules block
         WHERE block.deleted_at IS NULL
           AND block.rule_type = 'one-time'
           AND block.selected_dates ? ($3::date)::text
           AND (
             (block.sport_id = s.sport_id AND block.facility_code = s.facility_code)
             OR (block.sport_id IS NULL AND block.facility_code IS NULL)
           )
           AND s.slot_time >= block.slot_start_time
           AND s.slot_time < block.slot_end_time
       )`,
    [sportId, facilityCode, dateStr]
  );
}

export async function listSlotsForDate(
  dateStr: string,
  sportId: SportRow['id'],
  facilityCode: string
): Promise<SlotRow[]> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Slot listing requires a configured database.');
  }

  return withDatabaseClient(async (client) => {
    const currentDateTime = currentSingaporeDateTimeParts();
    await ensureSlotsForDate(client, dateStr, sportId, facilityCode);
    const result = await client.query<{ slot_time: string; is_booked: boolean }>(
      `SELECT s.slot_time::text AS slot_time,
              (
                s.is_booked OR EXISTS (
                  SELECT 1
                  FROM bookings b
                  WHERE b.slot_date = s.slot_date
                    AND b.sport_id = s.sport_id
                    AND b.facility_code = s.facility_code
                    AND b.deleted_at IS NULL
                    AND b.status IN ('confirmed', 'cash_pending')
                    AND s.slot_time >= b.slot_time
                    AND s.slot_time < (b.slot_time + make_interval(mins => b.duration_mins))
                ) OR EXISTS (
                  SELECT 1
                  FROM slot_reservations sr
                  WHERE sr.slot_date = s.slot_date
                    AND sr.slot_time = s.slot_time
                    AND sr.sport_id = s.sport_id
                    AND sr.facility_code = s.facility_code
                    AND sr.status = 'pending'
                    AND sr.expires_at > NOW()
                )
              ) AS is_booked
       FROM slots s
       WHERE s.slot_date = $1
         AND s.sport_id = $2
         AND s.facility_code = $3
         AND s.deleted_at IS NULL
       ORDER BY s.slot_time ASC`,
      [dateStr, sportId, facilityCode]
    );

    return result.rows.map((row) => ({
      time: row.slot_time.slice(0, 5),
      key: `${sportId}_${facilityCode}_${dateStr}_${row.slot_time.slice(0, 5)}`,
      booked: row.is_booked,
      past: isPastOrCurrentSlot(dateStr, row.slot_time.slice(0, 5), currentDateTime),
    }));
  });
}

export async function blockSlotsForAdmin(input: {
  adminEmail: string;
  sportId: SportRow['id'];
  facilityCode: string;
  dates: string[];
  startTime: string;
  endTime: string;
  reason: string;
}): Promise<AdminSlotBlockResult> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Slot blocking requires a configured database.');
  }

  const dates = [...new Set(input.dates)].sort();
  const adminEmail = input.adminEmail.trim().toLowerCase();
  const reason = input.reason.trim() || 'Admin blocked';
  let blockedCount = 0;

  return withDatabaseClient(async (client) => {
    await client.query('BEGIN');
    try {
      const facilityResult = await client.query<{ title: string }>(
        `SELECT title FROM sport_facilities
         WHERE sport_id = $1 AND facility_code = $2 AND enabled = TRUE AND deleted_at IS NULL
         LIMIT 1`,
        [input.sportId, input.facilityCode]
      );
      if (facilityResult.rowCount === 0) {
        throw new Error('Selected facility does not exist or is disabled.');
      }
      const facilityTitle = facilityResult.rows[0].title;

      for (const date of dates) {
        await ensureSlotsForDate(client, date, input.sportId, input.facilityCode);
        const result = await client.query(
          `UPDATE slots
           SET is_booked = TRUE,
               updated_at = NOW(),
               updated_by = $4
           WHERE slot_date = $1
             AND sport_id = $5
             AND facility_code = $6
             AND slot_time >= $2::time
             AND slot_time < $3::time
             AND is_booked = FALSE
             AND deleted_at IS NULL`,
          [date, input.startTime, input.endTime, adminEmail, input.sportId, input.facilityCode]
        );
        blockedCount += result.rowCount ?? 0;
      }

      const blockResult = await client.query<{ id: string }>(
        `INSERT INTO slot_block_rules (
           rule_type, admin_email, sport_id, facility_code, facility_title,
           selected_dates, slot_start_time, slot_end_time, reason,
           blocked_slot_count, created_by, updated_by
         ) VALUES ('one-time', $1, $2, $3, $4, $5::jsonb, $6::time, $7::time, $8, $9, $1, $1)
         RETURNING id`,
        [adminEmail, input.sportId, input.facilityCode, facilityTitle, JSON.stringify(dates), input.startTime, input.endTime, reason, blockedCount]
      );

      await client.query('COMMIT');
      return {
        blockId: blockResult.rows[0].id,
        sportId: input.sportId,
        facilityCode: input.facilityCode,
        facilityTitle,
        blockedCount,
        dates,
        startTime: input.startTime,
        endTime: input.endTime,
        reason,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function listAdminBlockRules(): Promise<AdminBlockRuleRow[]> {
  const rules = await query<{
    id: string; rule_type: 'one-time' | 'recurring'; sport_id: SportRow['id'] | null;
    facility_code: string | null; facility_title: string | null; selected_dates: string[] | null;
    valid_from: string | null; valid_to: string | null; weekday_name: string | null;
    slot_start_time: string; slot_end_time: string; reason: string; created_by: string;
    deleted_at: string | null; created_at: string;
  }>(
    `SELECT block.id, block.rule_type, block.sport_id, block.facility_code,
        COALESCE(facility.title, block.facility_title) AS facility_title,
        block.selected_dates, block.valid_from::text, block.valid_to::text, block.weekday_name,
        block.slot_start_time::text, block.slot_end_time::text, block.reason,
        block.created_by, block.deleted_at::text, block.created_at::text
     FROM slot_block_rules block
     LEFT JOIN sport_facilities facility
       ON facility.sport_id = block.sport_id AND facility.facility_code = block.facility_code
     ORDER BY block.deleted_at NULLS FIRST, block.created_at DESC`
  );

  return rules.map((rule): AdminBlockRuleRow => rule.rule_type === 'recurring' ? ({
      id: rule.id,
      ruleType: 'recurring',
      sportId: rule.sport_id,
      facilityCode: rule.facility_code,
      facilityTitle: rule.facility_title ?? rule.facility_code ?? 'Unknown facility',
      dates: [],
      validFrom: rule.valid_from,
      validTo: rule.valid_to,
      weekdays: rule.weekday_name ? [rule.weekday_name] : [],
      startTime: rule.slot_start_time.slice(0, 5),
      endTime: rule.slot_end_time.slice(0, 5),
      reason: rule.reason,
      source: rule.created_by === 'seed' ? 'system-seed' : 'admin',
      active: rule.deleted_at === null,
      editable: true,
      createdAt: rule.created_at,
    }) : ({
      id: rule.id,
      ruleType: 'one-time',
      sportId: rule.sport_id,
      facilityCode: rule.facility_code,
      facilityTitle: rule.facility_title ?? 'All legacy facilities',
      dates: rule.selected_dates ?? [],
      validFrom: null,
      validTo: null,
      weekdays: [],
      startTime: rule.slot_start_time.slice(0, 5),
      endTime: rule.slot_end_time.slice(0, 5),
      reason: rule.reason,
      source: rule.sport_id && rule.facility_code ? 'admin' : 'legacy',
      active: rule.deleted_at === null,
      editable: false,
      createdAt: rule.created_at,
    }));
}

export async function createRecurringBlockRules(input: {
  adminEmail: string;
  sportId: SportRow['id'];
  facilityCode: string;
  validFrom: string;
  validTo: string;
  weekdays: Array<(typeof WEEKDAY_NAMES)[number]>;
  startTime: string;
  endTime: string;
  reason: string;
}): Promise<void> {
  await withDatabaseClient(async (client) => {
    for (const weekdayName of [...new Set(input.weekdays)]) {
      await client.query(
        `INSERT INTO slot_block_rules (
          rule_type, sport_id, facility_code, valid_from, valid_to, weekday_name,
          slot_start_time, slot_end_time, reason, created_by, updated_by
        ) VALUES ('recurring', $1, $2, $3::date, $4::date, $5, $6::time, $7::time, $8, $9, $9)
        ON CONFLICT (sport_id, facility_code, valid_from, valid_to, weekday_name, slot_start_time, slot_end_time)
        WHERE rule_type = 'recurring'
        DO UPDATE SET reason = EXCLUDED.reason, updated_at = NOW(), updated_by = EXCLUDED.updated_by, deleted_at = NULL`,
        [input.sportId, input.facilityCode, input.validFrom, input.validTo, weekdayName,
          input.startTime, input.endTime, input.reason, input.adminEmail]
      );
    }
  });
}

export async function updateRecurringBlockRule(input: {
  id: string;
  adminEmail: string;
  validFrom: string;
  validTo: string;
  weekday: (typeof WEEKDAY_NAMES)[number];
  startTime: string;
  endTime: string;
  reason: string;
}): Promise<boolean> {
  return withDatabaseClient(async (client) => {
    const rows = await client.query<{ id: string; sport_id: SportRow['id']; facility_code: string }>(
      `UPDATE slot_block_rules
       SET valid_from = $2::date, valid_to = $3::date, weekday_name = $4,
           slot_start_time = $5::time, slot_end_time = $6::time, reason = $7,
           updated_at = NOW(), updated_by = $8
      WHERE id = $1 AND rule_type = 'recurring' AND deleted_at IS NULL
       RETURNING id, sport_id, facility_code`,
      [input.id, input.validFrom, input.validTo, input.weekday, input.startTime, input.endTime, input.reason, input.adminEmail]
    );
    const rule = rows.rows[0];
    if (!rule) return false;
    await client.query(
      `UPDATE slots SET is_booked = FALSE, updated_at = NOW(), updated_by = 'system'
       WHERE sport_id = $1 AND facility_code = $2 AND updated_by = 'recurring-block'`,
      [rule.sport_id, rule.facility_code]
    );
    return true;
  });
}

export async function deactivateRecurringBlockRule(id: string, adminEmail: string): Promise<boolean> {
  return withDatabaseClient(async (client) => {
    const rows = await client.query<{ id: string; sport_id: SportRow['id']; facility_code: string }>(
      `UPDATE slot_block_rules
       SET deleted_at = NOW(), updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND rule_type = 'recurring' AND deleted_at IS NULL
       RETURNING id, sport_id, facility_code`,
      [id, adminEmail]
    );
    const rule = rows.rows[0];
    if (!rule) return false;
    await client.query(
      `UPDATE slots SET is_booked = FALSE, updated_at = NOW(), updated_by = 'system'
       WHERE sport_id = $1 AND facility_code = $2 AND updated_by = 'recurring-block'`,
      [rule.sport_id, rule.facility_code]
    );
    return true;
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
      if (!input.sportId || !input.facilityCode) {
        throw new FacilityUnavailableError();
      }
      const facilityResult = await client.query(
        `SELECT 1 FROM sport_facilities
         WHERE sport_id = $1 AND facility_code = $2 AND enabled = TRUE AND deleted_at IS NULL
         LIMIT 1`,
        [input.sportId, input.facilityCode]
      );
      if (facilityResult.rowCount === 0) {
        throw new FacilityUnavailableError();
      }
      if (isPastOrCurrentSlot(input.selectedDate, input.selectedTime, currentDateTime)) {
        // Allow booking to proceed if the user holds a valid reservation (locked before slot became past)
        let bypassPastCheck = false;
        if (input.lockToken) {
          const lockResult = await client.query<{ id: string }>(
            `SELECT id FROM slot_reservations
             WHERE lock_token = $1
               AND slot_date = $2
               AND slot_time = $3::time
               AND sport_id = $4
               AND facility_code = $5
               AND LOWER(BTRIM(customer_email)) = $6
               AND status = 'pending'
               AND expires_at > NOW()`,
            [input.lockToken, input.selectedDate, input.selectedTime, input.sportId, input.facilityCode, customerEmail]
          );
          bypassPastCheck = (lockResult.rowCount ?? 0) > 0;
        }
        if (!bypassPastCheck) {
          throw new SlotAlreadyBookedError(input.selectedDate, input.selectedTime);
        }
      }

      await ensureSlotsForDate(client, input.selectedDate, input.sportId, input.facilityCode);
      const requiredSegments = Math.max(1, Math.ceil(input.durationMins / SLOT_INTERVAL_MINUTES));

      // Lock every 30-min segment covered by this booking window.
      const lockWindowResult = await client.query<{ id: string; slot_time: string; is_booked: boolean }>(
        `SELECT id,
                slot_time::text AS slot_time,
                is_booked
         FROM slots
         WHERE slot_date = $1
           AND sport_id = $4
           AND facility_code = $5
           AND slot_time >= $2::time
           AND slot_time < ($2::time + make_interval(mins => $3))
           AND deleted_at IS NULL
         ORDER BY slot_time ASC
         FOR UPDATE`,
        [input.selectedDate, input.selectedTime, input.durationMins, input.sportId, input.facilityCode]
      );

      const hasAllSegments = lockWindowResult.rowCount === requiredSegments;
      const hasBookedSegment = lockWindowResult.rows.some((row) => row.is_booked);
      const bookingOverlapResult = await client.query<{ overlaps: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM bookings b
           WHERE b.slot_date = $1
             AND b.sport_id = $4
             AND b.facility_code = $5
             AND b.deleted_at IS NULL
             AND b.status IN ('confirmed', 'cash_pending')
             AND $2::time < (b.slot_time + make_interval(mins => b.duration_mins))
             AND b.slot_time < ($2::time + make_interval(mins => $3))
         ) AS overlaps`,
        [input.selectedDate, input.selectedTime, input.durationMins, input.sportId, input.facilityCode]
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
            sport_id,
            facility_code,
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
         ) VALUES ($1, $2, $3, $4, $5::time, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          input.bookingType,
          input.sportId ?? null,
          input.facilityCode ?? null,
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
      booking.sport_id AS "sportId",
      booking.facility_code AS "facilityCode",
       slot_date::text AS "slotDate",
       slot_time::text AS "slotTime",
       duration_mins AS "durationMins",
       grand_total::float8 AS "grandTotal",
      pay_method AS "payMethod",
       COALESCE(facility.title, booking.facility_title) AS "facilityTitle",
       COALESCE(facility.address, booking.facility_address) AS "facilityAddress",
       facility.map_location_url AS "facilityMapLocationUrl",
       COALESCE(facility.image_key, booking.facility_image_key) AS "facilityImageKey",
       COALESCE(facility.tag_label, booking.facility_tag) AS "facilityTag",
       booking.status,
       booking.payment_method AS "paymentMethod",
       users.clubs
     FROM bookings AS booking
     LEFT JOIN sport_facilities AS facility
       ON facility.sport_id = booking.sport_id
      AND facility.facility_code = booking.facility_code
      AND facility.deleted_at IS NULL
     LEFT JOIN users ON users.email = booking.customer_email AND users.deleted_at IS NULL
     WHERE booking.deleted_at IS NULL
       AND LOWER(BTRIM(booking.customer_email)) = $1
     ORDER BY booking.slot_date DESC, booking.slot_time DESC`,
    [normalizedCustomerEmail]
  );
}

export async function listAllBookingsForAdmin(): Promise<AdminBookingRow[]> {
  if (!pool) {
    return [];
  }

  return query<AdminBookingRow>(
      `SELECT booking.facility_title AS "facilityTitle",
        booking.facility_address AS "facilityAddress",
            booking.slot_date::text AS "slotDate",
            booking.slot_time::text AS "slotTime",
            booking.duration_mins AS "durationMins",
            booking.grand_total::float8 AS "grandTotal",
            booking.pay_method AS "payMethod",
            booking.receipt_id AS "receiptId",
            booking.customer_email AS "customerEmail",
            booking.created_by AS "createdBy",
            booking.package_id AS "packageId",
                 booking.status,
                 booking.created_at::text AS "createdAt",
                 booking.updated_at::text AS "updatedAt",
                 users.mobile_number AS "mobileNumber"
     FROM bookings AS booking
     LEFT JOIN users ON users.email = booking.customer_email AND users.deleted_at IS NULL
     WHERE booking.deleted_at IS NULL
     ORDER BY booking.slot_date DESC, booking.slot_time DESC, booking.created_at DESC`
  );
}

type ManagedBookingRow = {
  id: string;
  sport_id: SportRow['id'];
  facility_code: string;
  slot_date: string;
  slot_time: string;
  duration_mins: number;
  status: BookingHistoryRow['status'];
};

async function synchronizeSlotBookingState(
  client: PoolClient,
  slotDate: string,
  sportId: SportRow['id'],
  facilityCode: string
): Promise<void> {
  const weekdayName = weekdayNameForDate(slotDate);
  await client.query(
    `UPDATE slots s
     SET is_booked = (
       EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.slot_date = s.slot_date
           AND b.sport_id = s.sport_id
           AND b.facility_code = s.facility_code
           AND b.deleted_at IS NULL
           AND b.status IN ('confirmed', 'cash_pending')
           AND s.slot_time >= b.slot_time
           AND s.slot_time < (b.slot_time + make_interval(mins => b.duration_mins))
       ) OR EXISTS (
         SELECT 1 FROM slot_block_rules block
         WHERE block.sport_id = s.sport_id
           AND block.facility_code = s.facility_code
           AND block.rule_type = 'recurring'
           AND s.slot_date BETWEEN block.valid_from AND block.valid_to
           AND block.weekday_name = $4
           AND block.deleted_at IS NULL
           AND s.slot_time >= block.slot_start_time
           AND s.slot_time < block.slot_end_time
       ) OR EXISTS (
         SELECT 1 FROM slot_block_rules block
         WHERE block.deleted_at IS NULL
           AND block.rule_type = 'one-time'
           AND block.selected_dates ? (s.slot_date)::text
           AND ((block.sport_id = s.sport_id AND block.facility_code = s.facility_code)
             OR (block.sport_id IS NULL AND block.facility_code IS NULL))
           AND s.slot_time >= block.slot_start_time
           AND s.slot_time < block.slot_end_time
       )
     ), updated_at = NOW(), updated_by = 'booking-lifecycle'
     WHERE s.slot_date = $1
       AND s.sport_id = $2
       AND s.facility_code = $3
       AND s.deleted_at IS NULL`,
    [slotDate, sportId, facilityCode, weekdayName]
  );
}

async function lockManagedBooking(client: PoolClient, receiptId: string, customerEmail: string): Promise<ManagedBookingRow | null> {
  const result = await client.query<ManagedBookingRow>(
    `SELECT id, sport_id, facility_code, slot_date::text, slot_time::text, duration_mins, status
     FROM bookings
     WHERE receipt_id = $1
       AND LOWER(BTRIM(customer_email)) = $2
       AND deleted_at IS NULL
     FOR UPDATE`,
    [receiptId, customerEmail.trim().toLowerCase()]
  );
  return result.rows[0] ?? null;
}

export class BookingNotManageableError extends Error {}

export async function cancelBooking(receiptId: string, customerEmail: string): Promise<BookingHistoryRow['status'] | null> {
  if (!pool) throw new Error('DATABASE_URL is not configured.');
  return withDatabaseClient(async (client) => {
    await client.query('BEGIN');
    try {
      const booking = await lockManagedBooking(client, receiptId, customerEmail);
      if (!booking) {
        await client.query('ROLLBACK');
        return null;
      }
      if (booking.status === 'cancelled') {
        await client.query('COMMIT');
        return 'cancelled';
      }
      if (isPastOrCurrentSlot(booking.slot_date, booking.slot_time, currentSingaporeDateTimeParts())) {
        throw new BookingNotManageableError('Past or already-started bookings cannot be cancelled.');
      }
      await client.query(
        `UPDATE bookings SET status = 'cancelled', updated_at = NOW(), updated_by = $2 WHERE id = $1`,
        [booking.id, customerEmail.trim().toLowerCase()]
      );
      await synchronizeSlotBookingState(client, booking.slot_date, booking.sport_id, booking.facility_code);
      await client.query('COMMIT');
      return 'cancelled';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function rescheduleBooking(
  receiptId: string,
  customerEmail: string,
  selectedDate: string,
  selectedTime: string
): Promise<boolean | null> {
  if (!pool) throw new Error('DATABASE_URL is not configured.');
  return withDatabaseClient(async (client) => {
    await client.query('BEGIN');
    try {
      const booking = await lockManagedBooking(client, receiptId, customerEmail);
      if (!booking) {
        await client.query('ROLLBACK');
        return null;
      }
      if (booking.status === 'cancelled' || isPastOrCurrentSlot(booking.slot_date, booking.slot_time, currentSingaporeDateTimeParts())) {
        throw new BookingNotManageableError('Only active future bookings can be rescheduled.');
      }
      if (isPastOrCurrentSlot(selectedDate, selectedTime, currentSingaporeDateTimeParts())) {
        throw new BookingNotManageableError('Select a future time for the booking.');
      }

      const facility = await client.query(
        `SELECT 1 FROM sport_facilities
         WHERE sport_id = $1 AND facility_code = $2 AND enabled = TRUE AND deleted_at IS NULL`,
        [booking.sport_id, booking.facility_code]
      );
      if (facility.rowCount === 0) throw new FacilityUnavailableError();

      await ensureSlotsForDate(client, selectedDate, booking.sport_id, booking.facility_code);
      const requiredSegments = Math.max(1, Math.ceil(booking.duration_mins / SLOT_INTERVAL_MINUTES));
      const targetSlots = await client.query<{ id: string; slot_time: string }>(
        `SELECT id, slot_time::text FROM slots
         WHERE slot_date = $1 AND sport_id = $4 AND facility_code = $5
           AND slot_time >= $2::time AND slot_time < ($2::time + make_interval(mins => $3))
           AND deleted_at IS NULL ORDER BY slot_time FOR UPDATE`,
        [selectedDate, selectedTime, booking.duration_mins, booking.sport_id, booking.facility_code]
      );
      const hasGap = targetSlots.rows.some((row, index, rows) => index > 0
        && toTotalMinutes(row.slot_time.slice(0, 5)) - toTotalMinutes(rows[index - 1].slot_time.slice(0, 5)) !== SLOT_INTERVAL_MINUTES);
      const conflict = await client.query<{ blocked: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.id <> $6 AND b.slot_date = $1 AND b.sport_id = $4 AND b.facility_code = $5
             AND b.deleted_at IS NULL AND b.status IN ('confirmed', 'cash_pending')
             AND $2::time < (b.slot_time + make_interval(mins => b.duration_mins))
             AND b.slot_time < ($2::time + make_interval(mins => $3))
         ) OR EXISTS (
           SELECT 1 FROM slots s
           WHERE s.slot_date = $1 AND s.sport_id = $4 AND s.facility_code = $5
             AND s.slot_time >= $2::time AND s.slot_time < ($2::time + make_interval(mins => $3))
             AND s.deleted_at IS NULL AND s.is_booked = TRUE
             AND NOT (s.slot_date = $7::date AND s.slot_time >= $8::time
               AND s.slot_time < ($8::time + make_interval(mins => $3)))
         ) OR EXISTS (
           SELECT 1 FROM slot_reservations sr
           WHERE sr.slot_date = $1 AND sr.sport_id = $4 AND sr.facility_code = $5
             AND sr.slot_time >= $2::time AND sr.slot_time < ($2::time + make_interval(mins => $3))
             AND sr.status = 'pending' AND sr.expires_at > NOW()
         ) OR EXISTS (
           SELECT 1 FROM slot_block_rules block
           WHERE block.deleted_at IS NULL
             AND (
               (block.rule_type = 'recurring' AND block.sport_id = $4 AND block.facility_code = $5
                 AND $1::date BETWEEN block.valid_from AND block.valid_to
                 AND block.weekday_name = $9
                 AND $2::time < block.slot_end_time
                 AND block.slot_start_time < ($2::time + make_interval(mins => $3)))
               OR (block.rule_type = 'one-time' AND block.selected_dates ? ($1::date)::text
                 AND ((block.sport_id = $4 AND block.facility_code = $5)
                   OR (block.sport_id IS NULL AND block.facility_code IS NULL))
                 AND $2::time < block.slot_end_time
                 AND block.slot_start_time < ($2::time + make_interval(mins => $3)))
             )
         ) AS blocked`,
        [selectedDate, selectedTime, booking.duration_mins, booking.sport_id, booking.facility_code,
          booking.id, booking.slot_date, booking.slot_time, weekdayNameForDate(selectedDate)]
      );
      if (targetSlots.rowCount !== requiredSegments || hasGap || conflict.rows[0]?.blocked) {
        throw new SlotAlreadyBookedError(selectedDate, selectedTime);
      }

      await client.query(
        `UPDATE bookings SET slot_date = $2, slot_time = $3::time, updated_at = NOW(), updated_by = $4 WHERE id = $1`,
        [booking.id, selectedDate, selectedTime, customerEmail.trim().toLowerCase()]
      );
      await synchronizeSlotBookingState(client, booking.slot_date, booking.sport_id, booking.facility_code);
      if (selectedDate !== booking.slot_date) {
        await synchronizeSlotBookingState(client, selectedDate, booking.sport_id, booking.facility_code);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
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
            auth_provider AS "authProvider",
            role,
            clubs
     FROM users
     WHERE deleted_at IS NULL
       AND LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  return rows[0] ?? null;
}

export async function listAllUsersForAdmin(): Promise<AdminUserRow[]> {
  if (!pool) {
    return [...fallbackUsers.values()].map((user) => ({
      fullName: user.fullName,
      email: user.email,
      mobileNumber: user.mobileNumber,
      passwordResetCode: user.passwordResetCode ?? null,
    }));
  }

  return query<AdminUserRow>(
    `SELECT full_name AS "fullName",
            email,
            mobile_number AS "mobileNumber",
            password_reset_code AS "passwordResetCode"
     FROM users
     WHERE deleted_at IS NULL
     ORDER BY full_name ASC, email ASC`
  );
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
            auth_provider AS "authProvider",
            role,
            clubs
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

export async function countUsersByMobileNumber(mobileNumber: string): Promise<number> {
  const normalizedMobile = mobileNumber.trim().toLowerCase();

  if (!pool) {
    let count = 0;
    for (const user of fallbackUsers.values()) {
      if (user.mobileNumber.trim().toLowerCase() === normalizedMobile) {
        count++;
      }
    }
    return count;
  }

  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM users
     WHERE deleted_at IS NULL
       AND LOWER(mobile_number) = LOWER($1)`,
    [normalizedMobile]
  );

  return parseInt(result[0]?.count ?? '0', 10);
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
               auth_provider AS "authProvider",
               role,
               clubs`,
    [normalizedLoginId, input.passwordEncrypted]
  );

  return rows[0] ?? null;
}

export async function updateUserProfile(input: {
  email: string;
  fullName: string;
  mobileNumber: string;
  clubs?: string;
}): Promise<UserAuthRow | null> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedFullName = input.fullName.trim();
  const normalizedMobileNumber = input.mobileNumber.trim();

  if (!normalizedFullName || normalizedFullName.length < 2) {
    throw new Error('Name must be at least 2 characters.');
  }

  const MOBILE_RE = /^\+?[0-9]{8,15}$/;
  if (!normalizedMobileNumber || !MOBILE_RE.test(normalizedMobileNumber)) {
    throw new Error('Enter a valid mobile number.');
  }

  if (!pool) {
    const existing = await findUserByEmail(normalizedEmail);
    if (!existing) {
      return null;
    }

    const updated: UserAuthRow = {
      ...existing,
      fullName: normalizedFullName,
      mobileNumber: normalizedMobileNumber,
      clubs: input.clubs ?? existing.clubs ?? null,
    };

    fallbackUsers.set(normalizedEmail, updated);
    return updated;
  }

  const rows = await query<UserAuthRow>(
    `UPDATE users
     SET full_name = $2,
         mobile_number = $3,
         clubs = $4,
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
               auth_provider AS "authProvider",
               role,
               clubs`,
    [normalizedEmail, normalizedFullName, normalizedMobileNumber, input.clubs ?? null]
  );

  return rows[0] ?? null;
}

export async function createUserPasswordAccount(input: {
  email: string;
  fullName: string;
  mobileNumber: string;
  passwordEncrypted: string;
  clubs?: string;
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
      role: 'public',
      passwordResetCode: null,
      passwordResetExpiresAt: null,
      clubs: input.clubs ?? null,
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
       role,
       clubs,
       created_by,
       updated_by
     ) VALUES ($1, $2, $3, $4, 'password', 'public', $5, $1, $1)
     ON CONFLICT (email) DO NOTHING
     RETURNING id,
               email,
               full_name AS "fullName",
               mobile_number AS "mobileNumber",
               password_encrypted AS "passwordEncrypted",
               password_reset_code AS "passwordResetCode",
               password_reset_expires_at::text AS "passwordResetExpiresAt",
               auth_provider AS "authProvider",
               role,
               clubs`,
    [input.email, input.fullName, input.mobileNumber, input.passwordEncrypted, input.clubs ?? null]
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
               auth_provider AS "authProvider",
               role,
               clubs`,
    [normalizedEmail, input.code, input.expiresAtIso]
  );

  return rows[0] ?? null;
}

export async function extendPasswordResetExpiry(email: string, expiresAtIso: string): Promise<UserAuthRow | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!pool) {
    const existing = fallbackUsers.get(normalizedEmail);
    if (!existing?.passwordResetCode) {
      return null;
    }

    const updated: UserAuthRow = { ...existing, passwordResetExpiresAt: expiresAtIso };
    fallbackUsers.set(normalizedEmail, updated);
    return updated;
  }

  const rows = await query<UserAuthRow>(
    `UPDATE users
     SET password_reset_expires_at = $2::timestamptz,
         updated_at = NOW(),
         updated_by = email
     WHERE deleted_at IS NULL
       AND LOWER(email) = LOWER($1)
       AND password_reset_code IS NOT NULL
     RETURNING id,
               email,
               full_name AS "fullName",
               mobile_number AS "mobileNumber",
               password_encrypted AS "passwordEncrypted",
               password_reset_code AS "passwordResetCode",
               password_reset_expires_at::text AS "passwordResetExpiresAt",
               auth_provider AS "authProvider",
               role,
               clubs`,
    [normalizedEmail, expiresAtIso]
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
      await ensureInitialAdminUser(client);
      await client.query('DELETE FROM sport_facilities');
      await client.query('DELETE FROM sport_events');
      await client.query('DELETE FROM sports');
      await seedPackages(client);
      await seedSports(client);
      await seedSportEvents(client);
      await seedSportFacilities(client);
      await seedSystemConfigs(client);
      await seedFacilityWeekdayConfigurations(client, true);
      await client.query("DELETE FROM slot_availability_exceptions WHERE created_by = 'seed'");
      await client.query("DELETE FROM slot_block_rules WHERE rule_type = 'recurring' AND created_by = 'seed'");
      await seedAvailabilityExceptions2026(client, true);
      await seedRecurringAcademyBlocks2026(client, true);

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
      await client.query('TRUNCATE TABLE bookings, slots, users, packages, sports, sport_events, sport_facilities, slot_weekday_configurations, slot_availability_exceptions, slot_block_rules RESTART IDENTITY CASCADE');
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
  sportId: SportRow['id'],
  facilityCode: string,
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
      await ensureSlotsForDate(client, slotDate, sportId, facilityCode);
      const lockResult = await client.query<{ id: string; is_booked: boolean }>(
        `SELECT id, is_booked
         FROM slots
         WHERE slot_date = $1
           AND sport_id = $4
           AND facility_code = $5
           AND slot_time >= $2::time
           AND slot_time < ($2::time + make_interval(mins => $3))
           AND deleted_at IS NULL
         ORDER BY slot_time ASC
         FOR UPDATE`,
        [slotDate, slotTime, durationMins, sportId, facilityCode]
      );

      if ((lockResult.rowCount ?? 0) < requiredSegments || lockResult.rows.some((r) => r.is_booked)) {
        throw new SlotAlreadyBookedError(slotDate, slotTime);
      }

      // Check for an active reservation by a different user
      const conflictResult = await client.query<{ id: string }>(
        `SELECT id FROM slot_reservations
         WHERE slot_date = $1
           AND slot_time = $2::time
           AND sport_id = $4
           AND facility_code = $5
           AND status = 'pending'
           AND expires_at > NOW()
           AND LOWER(BTRIM(customer_email)) != $3`,
        [slotDate, slotTime, customerEmail, sportId, facilityCode]
      );

      if ((conflictResult.rowCount ?? 0) > 0) {
        throw new SlotReservedError(slotDate, slotTime);
      }

      // Release any stale reservation by this user for the same slot
      await client.query(
        `UPDATE slot_reservations
         SET status = 'released', updated_at = NOW()
         WHERE slot_date = $1 AND slot_time = $2::time
          AND sport_id = $4 AND facility_code = $5
          AND LOWER(BTRIM(customer_email)) = $3 AND status = 'pending'`,
        [slotDate, slotTime, customerEmail, sportId, facilityCode]
      );

      await client.query(
        `INSERT INTO slot_reservations (sport_id, facility_code, slot_date, slot_time, customer_email, lock_token, expires_at)
         VALUES ($1, $2, $3, $4::time, $5, $6, NOW() + make_interval(mins => $7))`,
        [sportId, facilityCode, slotDate, slotTime, customerEmail, lockToken, ttlMins]
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
