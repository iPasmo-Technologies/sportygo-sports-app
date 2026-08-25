import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, LockKeyhole, Mail, ShieldAlert } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import { useApp } from '@/context/AppContext';
import { blockSlotsForAdmin, fetchSportFacilities, fetchSports } from '@/lib/api';
import { announce } from '@/lib/utils';
import type { AdminSlotBlockResponse, SportFacilityCard, SportId, SportOption } from '@/types';

const TIME_OPTIONS = Array.from({ length: 29 }, (_, index) => {
  const minutes = 8 * 60 + index * 30;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});

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
    setSelectedFacilityCode('');
    fetchSportFacilities(selectedSportId)
      .then(({ facilities: availableFacilities }) => {
        const enabledFacilities = availableFacilities.filter((facility) => facility.enabled);
        setFacilities(enabledFacilities);
        setSelectedFacilityCode(enabledFacilities[0]?.code ?? '');
      })
      .catch(() => {
        setFacilities([]);
        setError('Unable to load facilities for this sport.');
      });
  }, [selectedSportId]);

  const selectedSport = sports.find((sport) => sport.id === selectedSportId);
  const selectedFacility = facilities.find((facility) => facility.code === selectedFacilityCode);

  async function submitBlock() {
    if (!state.authToken) return;
    if (!selectedFacilityCode) {
      setError('Select a sport facility to block.');
      return;
    }
    if (dates.length === 0 || dates.length > 31) {
      setError('Choose a valid date range of no more than 31 days.');
      return;
    }
    if (startTime >= endTime) {
      setError('End time must be later than start time.');
      return;
    }
    if (!reason.trim()) {
      setError('Enter a reason for blocking these slots.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
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
          <h1>Block booking slots</h1>
          <p>Make a date and time range unavailable for one sport facility.</p>
        </header>

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
            <div><small>Step 2</small><h2 id="block-dates-title">Choose dates</h2></div>
          </div>
          <div className="block-slots-field-grid">
            <label className="block-slots-field">Start date<input type="date" min={today} value={startDate} onChange={(event) => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value); }} /></label>
            <label className="block-slots-field">End date<input type="date" min={startDate || today} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          </div>
          <p className="block-slots-selection">{dates.length === 1 ? formatDate(dates[0]) : `${dates.length} days selected · ${formatDate(startDate)} to ${formatDate(endDate)}`}</p>
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
            <div><dt>Dates</dt><dd>{dates.length}</dd></div>
            <div><dt>Time</dt><dd>{startTime}–{endTime}</dd></div>
            <div><dt>Slots affected</dt><dd>Up to {estimatedSlots}</dd></div>
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

        <button className="block-slots-submit" type="button" disabled={submitting || !selectedFacilityCode || dates.length === 0 || dates.length > 31 || estimatedSlots <= 0} onClick={() => void submitBlock()}>
          {submitting ? <Spinner /> : <LockKeyhole size={18} />}
          {submitting ? 'Blocking slots…' : 'Confirm and block slots'}
        </button>
      </main>
    </div>
  );
}