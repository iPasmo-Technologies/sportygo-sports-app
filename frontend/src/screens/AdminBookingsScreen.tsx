import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, Mail, MapPin, Package, Phone, ReceiptText, Search, WalletCards } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import { useApp } from '@/context/AppContext';
import { fetchAdminBookings } from '@/lib/api';
import type { AdminBookingItem } from '@/types';

type CalendarView = 'week' | 'month';

function localIsoDate(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function addDays(value: string, days: number): string {
  const date = dateFromIso(value);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function startOfWeek(value: string): string {
  const date = dateFromIso(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localIsoDate(date);
}

function periodBounds(anchor: string, view: CalendarView): { start: string; end: string } {
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 6) };
  }
  const date = dateFromIso(anchor);
  return {
    start: localIsoDate(new Date(date.getFullYear(), date.getMonth(), 1, 12)),
    end: localIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)),
  };
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-SG', options).format(dateFromIso(value));
}

function formatTime(value: string): string {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function currentSingaporeDateTimeKey(): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function isUpcomingBooking(booking: AdminBookingItem, nowKey: string): boolean {
  return `${booking.slotDate}T${booking.slotTime.slice(0, 5)}` > nowKey;
}

function bookingAuditDetails(booking: AdminBookingItem): { label: string; value: string } {
  const createdAt = new Date(booking.createdAt);
  const updatedAt = new Date(booking.updatedAt);
  const wasUpdated = updatedAt.getTime() > createdAt.getTime();
  const auditDate = wasUpdated ? updatedAt : createdAt;
  return {
    label: wasUpdated ? 'Updated on' : 'Booked on',
    value: new Intl.DateTimeFormat('en-SG', {
      timeZone: 'Asia/Singapore',
      day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(auditDate),
  };
}

function matchesSearch(booking: AdminBookingItem, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [booking.facilityTitle, booking.facilityAddress, booking.receiptId, booking.customerEmail,
    booking.createdBy, booking.payMethod, booking.packageId, booking.slotDate, booking.status,
    booking.durationMins, booking.grandTotal, booking.createdAt, booking.updatedAt, booking.mobileNumber].filter((value) => value !== null && value !== undefined).join(' ').toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

export default function AdminBookingsScreen() {
  const { state, navigate } = useApp();
  const today = localIsoDate();
  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState(today);
  const [selectedDate, setSelectedDate] = useState('');
  const [search, setSearch] = useState('');
  const [bookings, setBookings] = useState<AdminBookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.isLoggedIn || state.userRole !== 'admin' || !state.authToken) navigate('sport-select');
  }, [navigate, state.authToken, state.isLoggedIn, state.userRole]);

  useEffect(() => {
    if (!state.authToken || state.userRole !== 'admin') return;
    setLoading(true);
    fetchAdminBookings(state.authToken)
      .then((response) => {
        setBookings(response.bookings);
        const currentBounds = periodBounds(today, 'week');
        const hasCurrentWeekBooking = response.bookings.some((booking) => booking.slotDate >= currentBounds.start && booking.slotDate <= currentBounds.end);
        if (!hasCurrentWeekBooking && response.bookings.length > 0) {
          const todayTime = dateFromIso(today).getTime();
          const nearestBooking = [...response.bookings].sort((left, right) =>
            Math.abs(dateFromIso(left.slotDate).getTime() - todayTime) - Math.abs(dateFromIso(right.slotDate).getTime() - todayTime))[0];
          setAnchor(nearestBooking.slotDate);
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load bookings.'))
      .finally(() => setLoading(false));
  }, [state.authToken, state.userRole]);

  const bounds = useMemo(() => periodBounds(anchor, view), [anchor, view]);
  const nowKey = currentSingaporeDateTimeKey();
  const visibleBookings = useMemo(() => bookings.filter((booking) => {
    const inCalendarPeriod = booking.slotDate >= bounds.start && booking.slotDate <= bounds.end;
    const matchesDate = !selectedDate || booking.slotDate === selectedDate;
    return inCalendarPeriod && matchesDate && matchesSearch(booking, search);
  }), [bookings, bounds.end, bounds.start, search, selectedDate]);

  const periodLabel = view === 'week'
    ? `${formatDate(bounds.start, { day: 'numeric', month: 'short' })} - ${formatDate(bounds.end, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : formatDate(bounds.start, { month: 'long', year: 'numeric' });

  function movePeriod(direction: -1 | 1) {
    setSelectedDate('');
    if (view === 'week') setAnchor(addDays(anchor, direction * 7));
    else {
      const date = dateFromIso(anchor);
      date.setMonth(date.getMonth() + direction, 1);
      setAnchor(localIsoDate(date));
    }
  }

  function selectExactDate(value: string) {
    setSelectedDate(value);
    if (value) setAnchor(value);
  }

  if (!state.isLoggedIn || state.userRole !== 'admin' || !state.authToken) return null;

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <main className="admin-bookings-phone">
        <ScreenHeader onBack={() => navigate('sport-select')} backAriaLabel="Back to sport select" />
        <header className="admin-bookings-heading">
          <span><ReceiptText size={15} /> Admin control</span>
          <h1>All User Bookings</h1>
          <p>Review bookings across every customer and facility.</p>
        </header>

        <div className="admin-bookings-view" role="group" aria-label="Calendar view">
          <button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Weekly</button>
          <button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Monthly</button>
        </div>

        <section className="admin-bookings-toolbar">
          <div className="admin-bookings-period">
            <button type="button" onClick={() => movePeriod(-1)} aria-label={`Previous ${view}`}><ChevronLeft size={18} /></button>
            <strong>{periodLabel}</strong>
            <button type="button" onClick={() => movePeriod(1)} aria-label={`Next ${view}`}><ChevronRight size={18} /></button>
          </div>
          <label className="admin-bookings-search"><Search size={15} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, facility, receipt, phone..." /></label>
          <label className="admin-bookings-date"><span>Booking date</span><input type="date" value={selectedDate} onChange={(event) => selectExactDate(event.target.value)} /></label>
        </section>

        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

        <section className="admin-bookings-results" aria-live="polite">
          <header><div><small>All bookings</small><h2>{visibleBookings.length} {visibleBookings.length === 1 ? 'booking' : 'bookings'}</h2></div><CalendarDays size={20} /></header>
          {loading ? <div className="admin-bookings-empty"><Spinner /> Loading bookings</div> : null}
          {!loading && visibleBookings.length === 0 ? <div className="admin-bookings-empty"><CalendarDays size={28} /><strong>No bookings found</strong><span>Try another date, period, or search term.</span></div> : null}
          {!loading ? visibleBookings.map((booking) => {
            const showCreatedBy = booking.createdBy.trim().toLowerCase() !== booking.customerEmail.trim().toLowerCase();
            const scheduleState = booking.status === 'cancelled'
              ? 'cancelled'
              : isUpcomingBooking(booking, nowKey) ? 'upcoming' : 'completed';
            const auditDetails = bookingAuditDetails(booking);
            return (
              <article className="admin-booking-card" key={booking.receiptId}>
                <header><div><h3>{booking.facilityTitle ?? 'Facility unavailable'}</h3></div><strong>S${booking.grandTotal.toFixed(2)}</strong></header>
                <p className="admin-booking-address"><MapPin size={14} />{booking.facilityAddress ?? 'Address unavailable'}</p>
                <div className="admin-booking-facts">
                  <span><CalendarDays size={14} />{formatDate(booking.slotDate, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  <span><Clock3 size={14} />{formatTime(booking.slotTime)} · {booking.durationMins} min</span>
                  <span><WalletCards size={14} />{booking.payMethod}</span>
                  {booking.packageId ? <span><Package size={14} />{booking.packageId}</span> : null}
                </div>
                <div className="admin-booking-meta">
                  <span><ReceiptText size={13} />{booking.receiptId}</span>
                  <a href={`mailto:${booking.customerEmail}`}><Mail size={13} />{booking.customerEmail}</a>
                  {booking.mobileNumber ? <a href={`tel:${booking.mobileNumber}`}><Phone size={13} />{booking.mobileNumber}</a> : null}
                  {showCreatedBy ? <span>Created by {booking.createdBy}</span> : null}
                  <span><CalendarClock size={13} />{auditDetails.label}: {auditDetails.value}</span>
                  <strong className={`admin-booking-schedule ${scheduleState}`}>
                    {scheduleState === 'upcoming' ? 'Upcoming' : scheduleState === 'cancelled' ? 'Cancelled' : 'Completed'}
                  </strong>
                </div>
              </article>
            );
          }) : null}
        </section>
      </main>
    </div>
  );
}
