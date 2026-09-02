import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Eye, LockKeyhole, Mail, Repeat2, ShieldAlert } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useApp } from '@/context/AppContext';
import { blockSlotsForAdmin, createAdminRecurringBlocks, fetchSportFacilities, fetchSports } from '@/lib/api';
import { announce } from '@/lib/utils';
import type { AdminBlockWeekday, AdminSlotBlockResponse, SportFacilityCard, SportId, SportOption } from '@/types';

const TIME_OPTIONS = Array.from({ length: 29 }, (_, index) => {
  const minutes = 8 * 60 + index * 30;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});
const WEEKDAY_OPTIONS: Array<{ value: AdminBlockWeekday; label: string }> = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

function localIsoDate(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function enumerateDates(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end && dates.length < 32) {
    dates.push(localIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(`${date}T12:00:00`));
}

function minutesFor(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export default function BlockSlotBookingScreen() {
  const { state, navigate } = useApp();
  const today = localIsoDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [reason, setReason] = useState('Facility maintenance');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminSlotBlockResponse | null>(null);
  const [sports, setSports] = useState<SportOption[]>([]);
  const [facilities, setFacilities] = useState<SportFacilityCard[]>([]);
  const [selectedSportId, setSelectedSportId] = useState<SportId>('cricket');
  const [selectedFacilityCode, setSelectedFacilityCode] = useState('');
  const [mode, setMode] = useState<'one-time' | 'recurring'>('one-time');
  const [weekdays, setWeekdays] = useState<AdminBlockWeekday[]>([]);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const dates = useMemo(() => enumerateDates(startDate, endDate), [startDate, endDate]);
  const slotsPerDate = Math.max(0, (minutesFor(endTime) - minutesFor(startTime)) / 30);
  const estimatedSlots = dates.length * slotsPerDate;

  useEffect(() => {
    if (!state.isLoggedIn || state.userRole !== 'admin' || !state.authToken) {
      navigate('sport-select');
    }
  }, [navigate, state.authToken, state.isLoggedIn, state.userRole]);

  useEffect(() => {
    fetchSports()
      .then(({ sports: availableSports }) => {
        const enabledSports = availableSports.filter((sport) => sport.enabled);
        setSports(enabledSports);
        if (!enabledSports.some((sport) => sport.id === selectedSportId) && enabledSports[0]) {
          setSelectedSportId(enabledSports[0].id);
        }
      })
      .catch(() => setError('Unable to load sports. Please try again.'));
  }, []);

  useEffect(() => {
    fetchSportFacilities(selectedSportId)
      .then(({ facilities: availableFacilities }) => {
        const enabledFacilities = availableFacilities.filter((facility) => facility.enabled);
        setFacilities(enabledFacilities);
        setSelectedFacilityCode((current) => enabledFacilities.some((facility) => facility.code === current)
          ? current
          : enabledFacilities[0]?.code ?? '');
      })
      .catch(() => {
        setFacilities([]);
        setError('Unable to load facilities for this sport.');
      });
  }, [selectedSportId]);

  const selectedSport = sports.find((sport) => sport.id === selectedSportId);
  const selectedFacility = facilities.find((facility) => facility.code === selectedFacilityCode);

  async function submitBlock() {
    if (!state.authToken) {
      setConfirmingBlock(false);
      return;
    }
    if (!selectedFacilityCode) {
      setError('Select a sport facility to block.');
      setConfirmingBlock(false);
      return;
    }
    if (mode === 'one-time' && (dates.length === 0 || dates.length > 31)) {
      setError('Choose a valid date range of no more than 31 days.');
      setConfirmingBlock(false);
      return;
    }
    if (mode === 'recurring' && (!startDate || !endDate || endDate < startDate || weekdays.length === 0)) {
      setError('Choose an effective date range and at least one weekday.');
      setConfirmingBlock(false);
      return;
    }
    if (startTime >= endTime) {
      setError('End time must be later than start time.');
      setConfirmingBlock(false);
      return;
    }
    if (!reason.trim()) {
      setError('Enter a reason for blocking these slots.');
      setConfirmingBlock(false);
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      if (mode === 'recurring') {
        await createAdminRecurringBlocks({
          sportId: selectedSportId,
          facilityCode: selectedFacilityCode,
          validFrom: startDate,
          validTo: endDate,
          weekdays,
          startTime,
          endTime,
          reason: reason.trim(),
        }, state.authToken);
        announce('Recurring block rules created.');
        return;
      }
      const response = await blockSlotsForAdmin({
        sportId: selectedSportId,
        facilityCode: selectedFacilityCode,
        dates,
        startTime,
        endTime,
        reason: reason.trim(),
      }, state.authToken);
      if (response.blockedCount === 0) {
        setError('No new slots were blocked. The range may be outside configured booking hours or already unavailable.');
        announce('No new slots were blocked.');
        return;
      }
      setResult(response);
      announce(`${response.blockedCount} slots blocked successfully.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to block slots.';
      setError(message);
      announce(message);
    } finally {
      setSubmitting(false);
      setConfirmingBlock(false);
    }
  }

  if (!state.isLoggedIn || state.userRole !== 'admin' || !state.authToken) {
    return null;
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <main className="block-slots-phone">
        <ScreenHeader onBack={() => navigate('sport-select')} backAriaLabel="Back to sports" />

        <header className="block-slots-heading">
          <span className="block-slots-eyebrow"><LockKeyhole size={15} /> Admin control</span>
          <h1>Manage block rules</h1>
          <p>Create one-time closures and recurring Academy schedules for each facility.</p>
        </header>

        <div className="block-mode-switch" role="group" aria-label="Block rule type">
          <button type="button" className={mode === 'one-time' ? 'active' : ''} onClick={() => setMode('one-time')}>One-time</button>
          <button type="button" className={mode === 'recurring' ? 'active' : ''} onClick={() => setMode('recurring')}>Recurring</button>
        </div>

        <section className="block-slots-section" aria-labelledby="block-facility-title">
          <div className="block-slots-section-title">
            <span><LockKeyhole size={18} /></span>
            <div><small>Step 1</small><h2 id="block-facility-title">Choose facility</h2></div>
          </div>
          <div className="block-slots-field-grid">
            <label className="block-slots-field">Sport
              <select value={selectedSportId} onChange={(event) => setSelectedSportId(event.target.value as SportId)}>
                {sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.label}</option>)}
              </select>
            </label>
            <label className="block-slots-field">Facility
              <select value={selectedFacilityCode} disabled={facilities.length === 0} onChange={(event) => setSelectedFacilityCode(event.target.value)}>
                {facilities.length === 0 ? <option value="">No facilities available</option> : null}
                {facilities.map((facility) => <option key={facility.id} value={facility.code}>{facility.title}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="block-slots-section" aria-labelledby="block-dates-title">
          <div className="block-slots-section-title">
            <span><CalendarDays size={18} /></span>
            <div><small>Step 2</small><h2 id="block-dates-title">{mode === 'recurring' ? 'Set effective period' : 'Choose dates'}</h2></div>
          </div>
          <div className="block-slots-field-grid">
            <label className="block-slots-field">Start date<input type="date" min={mode === 'one-time' ? today : undefined} value={startDate} onChange={(event) => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value); }} /></label>
            <label className="block-slots-field">End date<input type="date" min={startDate || (mode === 'one-time' ? today : undefined)} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          </div>
          {mode === 'recurring' ? (
            <div className="block-weekdays" aria-label="Recurring weekdays">
              {WEEKDAY_OPTIONS.map((weekday) => (
                <label key={weekday.value}>
                  <input
                    type="checkbox"
                    checked={weekdays.includes(weekday.value)}
                    onChange={(event) => setWeekdays((current) => event.target.checked
                      ? [...current, weekday.value]
                      : current.filter((value) => value !== weekday.value))}
                  />
                  <span>{weekday.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="block-slots-selection">{dates.length === 1 ? formatDate(dates[0]) : `${dates.length} days selected · ${formatDate(startDate)} to ${formatDate(endDate)}`}</p>
          )}
        </section>

        <section className="block-slots-section" aria-labelledby="block-time-title">
          <div className="block-slots-section-title">
            <span><Clock3 size={18} /></span>
            <div><small>Step 3</small><h2 id="block-time-title">Set time range</h2></div>
          </div>
          <div className="block-slots-field-grid">
            <label className="block-slots-field">Start time<select value={startTime} onChange={(event) => setStartTime(event.target.value)}>{TIME_OPTIONS.slice(0, -1).map((time) => <option key={time}>{time}</option>)}</select></label>
            <label className="block-slots-field">End time<select value={endTime} onChange={(event) => setEndTime(event.target.value)}>{TIME_OPTIONS.slice(1).map((time) => <option key={time}>{time}</option>)}</select></label>
          </div>
          <label className="block-slots-field block-slots-reason">Reason<textarea maxLength={200} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        </section>

        <section className="block-slots-review" aria-labelledby="block-review-title">
          <div><ShieldAlert size={20} /><h2 id="block-review-title">Review impact</h2></div>
          <dl>
            <div><dt>Sport</dt><dd>{selectedSport?.label ?? selectedSportId}</dd></div>
            <div><dt>Facility</dt><dd>{selectedFacility?.title ?? 'Select facility'}</dd></div>
            <div><dt>{mode === 'recurring' ? 'Schedule' : 'Dates'}</dt><dd>{mode === 'recurring' ? weekdays.map((weekday) => weekday.slice(0, 3)).join(', ') || 'None' : dates.length}</dd></div>
            <div><dt>Time</dt><dd>{startTime}–{endTime}</dd></div>
            <div><dt>{mode === 'recurring' ? 'Period' : 'Slots affected'}</dt><dd>{mode === 'recurring' ? `${startDate} to ${endDate}` : `Up to ${estimatedSlots}`}</dd></div>
            <div><dt>Payment</dt><dd>Not applicable</dd></div>
          </dl>
        </section>

        {error ? <ErrorBanner message={error} /> : null}
        {result ? (
          <div className="block-slots-success" role="status">
            <CheckCircle2 size={22} />
            <div><strong>{result.blockedCount} slots blocked for {result.facilityTitle}</strong><span><Mail size={14} /> Confirmation sent to {state.customerEmail}</span></div>
          </div>
        ) : null}

        <button className="block-slots-submit" type="button" disabled={submitting || !selectedFacilityCode || (mode === 'one-time' ? dates.length === 0 || dates.length > 31 || estimatedSlots <= 0 : weekdays.length === 0)} onClick={() => setConfirmingBlock(true)}>
          {submitting ? <Spinner /> : mode === 'recurring' ? <Repeat2 size={18} /> : <LockKeyhole size={18} />}
          {submitting ? 'Saving rule…' : mode === 'recurring' ? 'Create recurring rule' : 'Confirm and block slots'}
        </button>

        <button className="block-slots-view" type="button" onClick={() => navigate('blocked-slots')}>
          <Eye size={18} /> View Blocked Slots
        </button>
      </main>
      {confirmingBlock ? (
        <ConfirmDialog
          title={mode === 'recurring' ? 'Create recurring block?' : 'Block selected slots?'}
          message={mode === 'recurring'
            ? `${selectedFacility?.title ?? 'This facility'} will be unavailable on the selected weekdays from ${startDate} to ${endDate}, ${startTime} to ${endTime}.`
            : `${selectedFacility?.title ?? 'This facility'} will have up to ${estimatedSlots} slots blocked from ${startDate} to ${endDate}, ${startTime} to ${endTime}.`}
          confirmLabel={mode === 'recurring' ? 'Create Rule' : 'Confirm Block'}
          busyLabel="Blocking..."
          busy={submitting}
          onCancel={() => setConfirmingBlock(false)}
          onConfirm={() => void submitBlock()}
        />
      ) : null}
    </div>
  );
}