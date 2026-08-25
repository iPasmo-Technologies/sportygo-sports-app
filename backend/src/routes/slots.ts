import { randomUUID } from 'crypto';
import { Router } from 'express';
import { authMiddleware, requireAdminRole, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { blockSlotsForAdmin, listSportFacilities, listSlotsForDate, listSports, reserveSlot, releaseReservation, SlotConfigurationMissingError, SlotAlreadyBookedError, SlotReservedError, type SportRow } from '../lib/database';
import { sendAdminSlotBlockEmail } from '../lib/email';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):(00|30)$/;
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

function isValidBookingDate(date: string): boolean {
  if (!DATE_RE.test(date) || date < currentSingaporeDate()) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
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
