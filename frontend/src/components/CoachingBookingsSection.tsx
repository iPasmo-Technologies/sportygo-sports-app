import { useEffect, useState } from 'react';
import { CalendarDays, Clock3, GraduationCap, MapPin, ReceiptText, Tag, Ticket, Timer, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import BookingsSection from '@/components/BookingsSection';
import CopyButton from '@/components/CopyButton';
import Spinner from '@/components/Spinner';
import { fetchCoachingBalance, fetchMyCoachingBookings } from '@/lib/api';
import { COACHING_SPORT_IDS, formatTimeRange, sessionDurationMinutes, sessionsLabel, sportLabel } from '@/lib/coaching';
import { coachImageFor } from '@/lib/coachImages';
import { formatDateShort } from '@/lib/utils';
import type { CoachingBooking, SportId } from '@/types';

type SportBalance = { sportId: SportId; remainingSessions: number };

function isCancelled(booking: CoachingBooking): boolean {
  return booking.status === 'cancelled' || booking.sessionStatus === 'cancelled';
}

function timeText(booking: CoachingBooking): string {
  return `${formatTimeRange(booking.startTime, booking.endTime)} (${sessionDurationMinutes(booking.startTime, booking.endTime)} min)`;
}

// Same layout as the court booking cards (bookings-card-v2). Coaching has no self-cancel or
// reschedule in v1, so the only action is View Details, as on Previous Bookings.
function CoachingBookingCard({ booking, onViewDetails }: { booking: CoachingBooking; onViewDetails: () => void }) {
  const cancelled = isCancelled(booking);
  return (
    <article className="bookings-card-v2">
      <div className="bookings-card-main-v2">
        <div className="bookings-card-top-v2">
          <img src={coachImageFor(booking.sportId)} alt={booking.title} className="bookings-card-image-v2" />
          <span className={`bookings-status-v2 ${cancelled ? 'cancelled' : 'upcoming'}`}>{cancelled ? 'Cancelled' : 'Upcoming'}</span>
          <div className="bookings-card-price-v2">
            <strong>1 Session</strong>
            <small>(from package)</small>
          </div>
        </div>

        <div className="bookings-card-info-v2">
          <h3>{booking.title}</h3>
          <p className="bookings-location-v2">
            <MapPin size={14} strokeWidth={2.1} aria-hidden="true" />
            {booking.location}
          </p>
          <p><CalendarDays size={14} strokeWidth={2.1} />{formatDateShort(booking.sessionDate)}</p>
          <p><Clock3 size={14} strokeWidth={2.1} />{timeText(booking)}</p>
          {cancelled && <p className="coach-booking-status">Cancelled by SportyGo. The session was returned to your package.</p>}
        </div>
      </div>

      <div className="bookings-card-footer-v2">
        <div className="bookings-id-v2">
          <small>Booking ID</small>
          <strong>{booking.bookingId}</strong>
          <CopyButton text={booking.bookingId} label="Copy booking id" className="bookings-copy-btn-v2" />
        </div>
        <div className="bookings-actions-v2">
          <button type="button" className="bookings-action-btn-v2 ghost" onClick={onViewDetails}>View Details</button>
        </div>
      </div>
    </article>
  );
}

// Same layout as the court BookingDetailsDialog, with coaching fields.
function CoachingBookingDetailsDialog({ booking, onClose }: { booking: CoachingBooking; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const cancelled = isCancelled(booking);

  return (
    <div
      className="booking-details-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="booking-details-dialog" role="dialog" aria-modal="true" aria-labelledby="coach-booking-details-title">
        <header className="booking-details-header">
          <div>
            <span className="booking-details-eyebrow">Coaching booking</span>
            <h2 id="coach-booking-details-title">Booking Details</h2>
          </div>
          <button type="button" className="booking-details-close" onClick={onClose} aria-label="Close booking details" autoFocus>
            <X size={20} strokeWidth={2.3} />
          </button>
        </header>

        <div className="booking-details-venue">
          <img src={coachImageFor(booking.sportId)} alt={booking.title} />
          <div>
            <h3>{booking.title}</h3>
            <p>
              <MapPin size={15} strokeWidth={2.2} aria-hidden="true" />
              {booking.location}
            </p>
            <span className={`bookings-status-v2 ${cancelled ? 'cancelled' : 'upcoming'}`}>{cancelled ? 'Cancelled' : 'Upcoming'}</span>
          </div>
        </div>

        <div className="booking-details-grid">
          <div className="booking-details-field">
            <CalendarDays size={18} strokeWidth={2.1} />
            <span><small>Date</small><strong>{formatDateShort(booking.sessionDate)}</strong></span>
          </div>
          <div className="booking-details-field">
            <Clock3 size={18} strokeWidth={2.1} />
            <span><small>Time</small><strong>{formatTimeRange(booking.startTime, booking.endTime)}</strong></span>
          </div>
          <div className="booking-details-field">
            <Timer size={18} strokeWidth={2.1} />
            <span><small>Duration</small><strong>{sessionDurationMinutes(booking.startTime, booking.endTime)} minutes</strong></span>
          </div>
          <div className="booking-details-field">
            <Tag size={18} strokeWidth={2.1} />
            <span><small>Booking type</small><strong>{sportLabel(booking.sportId)} Coaching</strong></span>
          </div>
          <div className="booking-details-field">
            <Ticket size={18} strokeWidth={2.1} />
            <span><small>Paid with</small><strong>{cancelled ? 'Session returned' : '1 package session'}</strong></span>
          </div>
          <div className="booking-details-field">
            <ReceiptText size={18} strokeWidth={2.1} />
            <span><small>Booked on</small><strong>{formatDateShort(booking.bookedAt.slice(0, 10))}</strong></span>
          </div>
        </div>

        <div className="booking-details-id">
          <span><small>Booking ID</small><strong>{booking.bookingId}</strong></span>
          <CopyButton text={booking.bookingId} label="Copy booking id" iconSize={17} />
        </div>

        <button type="button" className="booking-details-done" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}

// Coaching bookings and remaining sessions, shown on My Bookings. Failures here never hide court bookings.
export default function CoachingBookingsSection() {
  const { state, dispatch, navigate } = useApp();
  const [bookings, setBookings] = useState<CoachingBooking[]>([]);
  const [balances, setBalances] = useState<SportBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CoachingBooking | null>(null);

  useEffect(() => {
    const token = state.authToken;
    if (!token) return;
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchMyCoachingBookings(token),
      Promise.all(COACHING_SPORT_IDS.map(async (sportId) => ({
        sportId,
        remainingSessions: (await fetchCoachingBalance(sportId, token)).remainingSessions,
      }))),
    ])
      .then(([bookingResponse, sportBalances]) => {
        if (!active) return;
        setBookings(bookingResponse.bookings);
        setBalances(sportBalances.filter((balance) => balance.remainingSessions > 0));
      })
      .catch(() => {
        if (active) setError('Unable to load your coaching sessions right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [state.authToken]);

  function bookFor(sportId: SportId) {
    dispatch({ type: 'SET_SELECTED_SPORT', payload: sportId });
    navigate('coach-sessions');
  }

  // Nothing bought and nothing booked: keep My Bookings as it was.
  if (!loading && !error && bookings.length === 0 && balances.length === 0) return null;

  // Before the data arrives the sport isn't known yet, so loading and errors use a plain "Coaching" heading.
  if (loading || error) {
    return (
      <BookingsSection title="Coaching" icon={<GraduationCap size={18} strokeWidth={2.2} />} className="coach-bookings-section">
        <div className="bookings-list-v2">{loading ? <Spinner /> : <p>{error}</p>}</div>
      </BookingsSection>
    );
  }

  // One section per sport ("Pickleball Coaching", ...), in the same order as the sport list.
  const sportsShown = COACHING_SPORT_IDS.filter((sportId) =>
    balances.some((balance) => balance.sportId === sportId) || bookings.some((booking) => booking.sportId === sportId));

  return (
    <>
      {sportsShown.map((sportId) => {
        const balance = balances.find((item) => item.sportId === sportId);
        const sportBookings = bookings.filter((booking) => booking.sportId === sportId);
        return (
          <BookingsSection
            key={sportId}
            title={`${sportLabel(sportId)} Coaching`}
            icon={<GraduationCap size={18} strokeWidth={2.2} />}
            count={sportBookings.length}
            className="coach-bookings-section"
          >
            <div className="bookings-list-v2">
              {balance && (
                <div className="checkout-panel-v2 coach-balance-panel">
                  <Ticket size={20} strokeWidth={2.2} aria-hidden="true" />
                  <span><strong>{sessionsLabel(balance.remainingSessions)}</strong> left for {sportLabel(sportId)}</span>
                  <button type="button" onClick={() => bookFor(sportId)}>Book a session</button>
                </div>
              )}

              {sportBookings.map((booking) => (
                <CoachingBookingCard key={booking.bookingId} booking={booking} onViewDetails={() => setSelected(booking)} />
              ))}
            </div>
          </BookingsSection>
        );
      })}

      {selected && <CoachingBookingDetailsDialog booking={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
