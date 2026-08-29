import { randomUUID } from 'crypto';
import { Router } from 'express';
import { authMiddleware, requireAdminRole, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { blockSlotsForAdmin, createRecurringBlockRules, deactivateRecurringBlockRule, listAdminBlockRules, listSportFacilities, listSlotsForDate, listSports, reserveSlot, releaseReservation, SlotConfigurationMissingError, SlotAlreadyBookedError, SlotReservedError, updateRecurringBlockRule, type SportRow } from '../lib/database';
import { sendAdminSlotBlockEmail } from '../lib/email';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):(00|30)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WEEKDAYS = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
const SPORT_IDS = new Set<SportRow['id']>([
  'cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis',
  'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi',
]);

function parseSportId(value: unknown): SportRow['id'] | null {
  return typeof value === 'string' && SPORT_IDS.has(value as SportRow['id'])
    ? value as SportRow['id']
    : null;
}

async function isEnabledFacility(sportId: SportRow['id'], facilityCode: string): Promise<boolean> {
  const facilities = await listSportFacilities(sportId);
  return facilities.some((facility) => facility.code === facilityCode && facility.enabled);
}

function currentSingaporeDate(): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isValidCalendarDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function isValidBookingDate(date: string): boolean {
  return date >= currentSingaporeDate() && isValidCalendarDate(date);
}

// GET /api/slots?date=YYYY-MM-DD&sportId=cricket&facilityCode=net-2
router.get('/', async (req, res) => {
  const date = req.query.date as string;
  const sportId = parseSportId(req.query.sportId);
  const facilityCode = typeof req.query.facilityCode === 'string' ? req.query.facilityCode.trim() : '';

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !sportId || !facilityCode) {
    res.status(400).json({ error: 'A valid date, sportId, and facilityCode are required.' });
    return;
  }

  try {
    if (!await isEnabledFacility(sportId, facilityCode)) {
      res.status(400).json({ error: 'The selected facility does not exist or is disabled.' });
      return;
    }
    const slots = await listSlotsForDate(date, sportId, facilityCode);

    res.json({ slots });
  } catch (error) {
    if (error instanceof SlotConfigurationMissingError) {
      res.status(422).json({
        error: 'No weekday slot configuration found. Please configure start/end time for this weekday.',
      });
      return;
    }

    res.status(500).json({
      error: 'Unable to load slots at the moment. Please try again.',
    });
  }
});

router.post('/block', authMiddleware, requireAdminRole, async (req: AuthenticatedRequest, res) => {
  const { sportId: rawSportId, facilityCode: rawFacilityCode, dates, startTime, endTime, reason } = req.body as {
    sportId?: string;
    facilityCode?: string;
    dates?: string[];
    startTime?: string;
    endTime?: string;
    reason?: string;
  };
  const uniqueDates = Array.isArray(dates) ? [...new Set(dates)] : [];
  const sportId = parseSportId(rawSportId);
  const facilityCode = rawFacilityCode?.trim() ?? '';
  const normalizedReason = (reason ?? '').trim();

  if (!sportId || !facilityCode || !await isEnabledFacility(sportId, facilityCode)) {
    res.status(400).json({ error: 'Select a valid enabled sport facility.' });
    return;
  }
  if (uniqueDates.length === 0 || uniqueDates.length > 31 || uniqueDates.some((date) => !isValidBookingDate(date))) {
    res.status(400).json({ error: 'Select between 1 and 31 valid current or future dates.' });
    return;
  }
  if (!startTime || !endTime || !TIME_RE.test(startTime) || !TIME_RE.test(endTime) || startTime >= endTime) {
    res.status(400).json({ error: 'Select a valid 30-minute start and end time range.' });
    return;
  }
  if (!normalizedReason || normalizedReason.length > 200) {
    res.status(400).json({ error: 'Enter a reason of up to 200 characters.' });
    return;
  }

  try {
    const sports = await listSports();
    const sportLabel = sports.find((sport) => sport.id === sportId)?.label ?? sportId;
    const result = await blockSlotsForAdmin({
      adminEmail: req.user!.email,
      sportId,
      facilityCode,
      dates: uniqueDates,
      startTime,
      endTime,
      reason: normalizedReason,
    });

    if (result.blockedCount > 0) {
      void sendAdminSlotBlockEmail({ adminEmail: req.user!.email, sportLabel, ...result }).catch((error) => {
        console.error('[admin:block-slots] Confirmation email failed.', error);
      });
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('[admin:block-slots] Unable to block slots.', error);
    res.status(500).json({ error: 'Unable to block slots. Please try again.' });
  }
});

router.get('/blocks', authMiddleware, requireAdminRole, async (_req, res) => {
  try {
    res.json({ rules: await listAdminBlockRules() });
  } catch (error) {
    console.error('[admin:block-rules] Unable to list rules.', error);
    res.status(500).json({ error: 'Unable to load block rules.' });
  }
});

router.post('/blocks/recurring', authMiddleware, requireAdminRole, async (req: AuthenticatedRequest, res) => {
  const { sportId: rawSportId, facilityCode: rawFacilityCode, validFrom, validTo, weekdays, startTime, endTime, reason } = req.body as {
    sportId?: string; facilityCode?: string; validFrom?: string; validTo?: string;
    weekdays?: string[]; startTime?: string; endTime?: string; reason?: string;
  };
  const sportId = parseSportId(rawSportId);
  const facilityCode = rawFacilityCode?.trim() ?? '';
  const normalizedWeekdays = Array.isArray(weekdays) ? [...new Set(weekdays)] : [];
  const normalizedReason = reason?.trim() ?? '';
  if (!sportId || !facilityCode || !await isEnabledFacility(sportId, facilityCode)) {
    res.status(400).json({ error: 'Select a valid enabled sport facility.' });
    return;
  }
  if (!validFrom || !validTo || !isValidCalendarDate(validFrom) || !isValidCalendarDate(validTo) || validFrom > validTo) {
    res.status(400).json({ error: 'Select a valid effective date range.' });
    return;
  }
  if (normalizedWeekdays.length === 0 || normalizedWeekdays.some((weekday) => !WEEKDAYS.has(weekday))) {
    res.status(400).json({ error: 'Select at least one valid weekday.' });
    return;
  }
  if (!startTime || !endTime || !TIME_RE.test(startTime) || !TIME_RE.test(endTime) || startTime >= endTime) {
    res.status(400).json({ error: 'Select a valid 30-minute time range.' });
    return;
  }
  if (!normalizedReason || normalizedReason.length > 200) {
    res.status(400).json({ error: 'Enter a reason of up to 200 characters.' });
    return;
  }
  try {
    await createRecurringBlockRules({
      adminEmail: req.user!.email, sportId, facilityCode, validFrom, validTo,
      weekdays: normalizedWeekdays as Array<'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'>,
      startTime, endTime, reason: normalizedReason,
    });
    res.status(201).json({ rules: await listAdminBlockRules() });
  } catch (error) {
    console.error('[admin:block-rules] Unable to create recurring rules.', error);
    res.status(500).json({ error: 'Unable to create recurring block rules.' });
  }
});

router.put('/blocks/recurring/:id', authMiddleware, requireAdminRole, async (req: AuthenticatedRequest, res) => {
  const { validFrom, validTo, weekday, startTime, endTime, reason } = req.body as {
    validFrom?: string; validTo?: string; weekday?: string; startTime?: string; endTime?: string; reason?: string;
  };
  const normalizedReason = reason?.trim() ?? '';
  if (!UUID_RE.test(req.params.id) || !validFrom || !validTo || !isValidCalendarDate(validFrom) || !isValidCalendarDate(validTo) || validFrom > validTo
      || !weekday || !WEEKDAYS.has(weekday) || !startTime || !endTime || !TIME_RE.test(startTime) || !TIME_RE.test(endTime)
      || startTime >= endTime || !normalizedReason || normalizedReason.length > 200) {
    res.status(400).json({ error: 'Enter a valid recurring block rule.' });
    return;
  }
  try {
    const updated = await updateRecurringBlockRule({
      id: req.params.id, adminEmail: req.user!.email, validFrom, validTo,
      weekday: weekday as 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday',
      startTime, endTime, reason: normalizedReason,
    });
    if (!updated) {
      res.status(404).json({ error: 'Active recurring block rule not found.' });
      return;
    }
    res.json({ rules: await listAdminBlockRules() });
  } catch (error) {
    console.error('[admin:block-rules] Unable to update recurring rule.', error);
    res.status(500).json({ error: 'Unable to update recurring block rule.' });
  }
});

router.delete('/blocks/recurring/:id', authMiddleware, requireAdminRole, async (req: AuthenticatedRequest, res) => {
  if (!UUID_RE.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid recurring block rule identifier.' });
    return;
  }
  try {
    const deactivated = await deactivateRecurringBlockRule(req.params.id, req.user!.email);
    if (!deactivated) {
      res.status(404).json({ error: 'Active recurring block rule not found.' });
      return;
    }
    res.json({ rules: await listAdminBlockRules() });
  } catch (error) {
    console.error('[admin:block-rules] Unable to deactivate recurring rule.', error);
    res.status(500).json({ error: 'Unable to deactivate recurring block rule.' });
  }
});

// POST /api/slots/reserve  — temporarily reserves a slot before payment
router.post('/reserve', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const customerEmail = req.user?.email?.trim().toLowerCase();
  if (!customerEmail) {
    res.status(401).json({ error: 'Authorization token is required.' });
    return;
  }

  const { sportId: rawSportId, facilityCode: rawFacilityCode, selectedDate, selectedTime, durationMins } = req.body as {
    sportId?: string;
    facilityCode?: string;
    selectedDate?: string;
    selectedTime?: string;
    durationMins?: number;
  };
  const sportId = parseSportId(rawSportId);
  const facilityCode = rawFacilityCode?.trim() ?? '';

  if (!sportId || !facilityCode || !await isEnabledFacility(sportId, facilityCode)) {
    res.status(400).json({ error: 'Select a valid enabled sport facility.' });
    return;
  }

  if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    res.status(400).json({ error: 'Valid selectedDate (YYYY-MM-DD) is required.' });
    return;
  }

  if (!selectedTime || !/^\d{2}:\d{2}$/.test(selectedTime)) {
    res.status(400).json({ error: 'Valid selectedTime (HH:MM) is required.' });
    return;
  }

  if (!Number.isFinite(durationMins) || (durationMins as number) <= 0) {
    res.status(400).json({ error: 'Valid durationMins is required.' });
    return;
  }

  const lockToken = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  try {
    await reserveSlot(sportId, facilityCode, selectedDate, selectedTime, durationMins as number, customerEmail, lockToken);
    res.json({ lockToken, expiresAt });
  } catch (error) {
    if (error instanceof SlotAlreadyBookedError) {
      res.status(409).json({ error: 'This slot is no longer available. Please select a different time.' });
      return;
    }

    if (error instanceof SlotReservedError) {
      res.status(409).json({ error: 'This slot is being reserved by another user. Please try again shortly.' });
      return;
    }

    res.status(500).json({ error: 'Unable to reserve slot. Please try again.' });
  }
});

// POST /api/slots/release  — releases a reservation (best-effort, e.g. on payment failure)
router.post('/release', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const customerEmail = req.user?.email?.trim().toLowerCase();
  if (!customerEmail) {
    res.status(401).json({ error: 'Authorization token is required.' });
    return;
  }

  const { lockToken } = req.body as { lockToken?: string };
  if (!lockToken) {
    res.status(400).json({ error: 'lockToken is required.' });
    return;
  }

  await releaseReservation(lockToken, customerEmail).catch(() => undefined);
  res.json({ ok: true });
});

export default router;
