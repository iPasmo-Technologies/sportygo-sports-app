import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Copy,
  CreditCard,
  Headphones,
  MapPin,
  ReceiptText,
  Tag,
  Timer,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cancelMyBooking, fetchMyBookings, fetchSlots, rescheduleMyBooking } from '@/lib/api';
import { announce } from '@/lib/utils';
import ScreenHeader from '@/components/ScreenHeader';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import { formatDateShort } from '@/lib/utils';
import pageBackground from '@/assets/select_sport_bk.png';
import indoorCricketCard from '@/assets/card_indoor_cricket.png';
import cricketFacilityImage from '@/assets/cricket_facility.png';
import cricketCard from '@/assets/card_cricket.png';
import cricketGear from '@/assets/cricket_gear.png';
import pickleballIndoorCourt from '@/assets/pb-indoor-court.png';
import pickleballOutdoorCourt from '@/assets/pb-outdoor-court.png';
import type { BookingHistoryItem, TimeSlot } from '@/types';

const FACILITY_IMAGES = {
  'bowling-lane': cricketFacilityImage,
  'nets-2': indoorCricketCard,
  'nets-3': cricketCard,
  'nets-4': indoorCricketCard,
  'indoor-court': cricketGear,
  'outdoor-field': cricketFacilityImage,
  'pb-indoor-court': pickleballIndoorCourt,
  'pb-outdoor-court': pickleballOutdoorCourt,
} as const;

type BookingTab = 'upcoming' | 'previous';

type BookingCard = {
  id: string;
  bookingType: BookingHistoryItem['bookingType'];
  sportId: BookingHistoryItem['sportId'];
  facilityCode: string;
  slotDate: string;
  slotTime: string;
  title: string;
  location: string | null;
  mapLocationUrl: string | null;
  dateText: string;
  timeText: string;
  durationMins: number;
  amount: string;
  statusLabel: string;
  status: BookingHistoryItem['status'];
  statusType: 'upcoming' | 'completed' | 'cancelled';
  payMethod: BookingHistoryItem['payMethod'];
  paymentMethod: BookingHistoryItem['paymentMethod'];
  image: string | null;
};

function currentSingaporeDateTimeKey(): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function bookingDateTimeKey(item: BookingHistoryItem): string {
  return `${item.slotDate}T${item.slotTime.slice(0, 5)}`;
}

function to12Hour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const isPm = h >= 12;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${isPm ? 'PM' : 'AM'}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  const nextH = Math.floor(total / 60);
  const nextM = total % 60;
  return `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
}

function formatDateForCard(date: string): string {
  return formatDateShort(date);
}

function mapHistoryToCard(item: BookingHistoryItem): BookingCard {
  const isPast = bookingDateTimeKey(item) < currentSingaporeDateTimeKey();
  const start = item.slotTime.slice(0, 5);
  const end = addMinutes(start, item.durationMins);
  const statusLabel = item.status === 'cancelled' ? 'Cancelled' : item.status === 'cash_pending' ? 'Pending Cash' : isPast ? 'Completed' : 'Upcoming';

  return {
    id: item.receiptId,
    bookingType: item.bookingType,
    sportId: item.sportId,
    facilityCode: item.facilityCode,
    slotDate: item.slotDate,
    slotTime: item.slotTime,
    title: item.facilityTitle ?? 'Facility details unavailable',
    location: item.facilityAddress,
    mapLocationUrl: item.facilityMapLocationUrl,
    dateText: formatDateForCard(item.slotDate),
    timeText: `${to12Hour(start)} - ${to12Hour(end)} (${item.durationMins} min)`,
    durationMins: item.durationMins,
    amount: `S$${item.grandTotal.toFixed(2)}`,
    statusLabel,
    status: item.status,
    statusType: item.status === 'cancelled' ? 'cancelled' : isPast ? 'completed' : 'upcoming',
    payMethod: item.payMethod,
    paymentMethod: item.paymentMethod,
    image: item.facilityImageKey ? FACILITY_IMAGES[item.facilityImageKey] : null,
  };
}

function BookingCardView({
  booking,
  showActions,
  onViewDetails,
  onReschedule,
  onCancel,
}: {
  booking: BookingCard;
  showActions: boolean;
  onViewDetails: (booking: BookingCard) => void;
  onReschedule: (booking: BookingCard) => void;
  onCancel: (booking: BookingCard) => void;
}) {
  function copyId() {
    navigator.clipboard.writeText(booking.id).catch(() => undefined);
    announce('Booking ID copied.');
  }

  return (
    <article className="bookings-card-v2">
      <div className="bookings-card-main-v2">
        <div className="bookings-card-top-v2">
          {booking.image && (
            <img src={booking.image} alt={booking.title} className="bookings-card-image-v2" />
          )}
          <span className={`bookings-status-v2 ${booking.statusType}`}>{booking.statusLabel}</span>
          <div className="bookings-card-price-v2">
            <strong>{booking.amount}</strong>
            <small>(Incl. taxes)</small>
          </div>
        </div>

        <div className="bookings-card-info-v2">
          <h3>{booking.title}</h3>
          <p className="bookings-location-v2">
            {booking.mapLocationUrl ? (
              <a
                className="bookings-location-link-v2"
                href={booking.mapLocationUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open map for ${booking.title}`}
              >
                <MapPin size={14} strokeWidth={2.1} />
              </a>
            ) : (
              <MapPin size={14} strokeWidth={2.1} aria-hidden="true" />
            )}
            {booking.location ?? 'Location unavailable'}
          </p>
          <p><CalendarDays size={14} strokeWidth={2.1} />{booking.dateText}</p>
          <p><Clock3 size={14} strokeWidth={2.1} />{booking.timeText}</p>
        </div>
      </div>

      <div className="bookings-card-footer-v2">
        <div className="bookings-id-v2">
          <small>Booking ID</small>
          <strong>{booking.id}</strong>
          <button type="button" className="bookings-copy-btn-v2" onClick={copyId} aria-label="Copy booking id">
            <Copy size={16} strokeWidth={2.3} />
          </button>
        </div>

        {showActions ? (
          <div className="bookings-actions-v2">
            <button type="button" className="bookings-action-btn-v2" onClick={() => onReschedule(booking)}>Reschedule</button>
            <button type="button" className="bookings-action-btn-v2 danger" onClick={() => onCancel(booking)}>Cancel Booking</button>
          </div>
        ) : (
          <div className="bookings-actions-v2">
            <button
              type="button"
              className="bookings-action-btn-v2 ghost"
              onClick={() => onViewDetails(booking)}
            >
              View Details
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function availableStartTimes(slots: TimeSlot[], durationMins: number): TimeSlot[] {
  const requiredSegments = Math.max(1, Math.ceil(durationMins / 30));
  return slots.filter((slot, index) => {
    if (slot.booked || slot.past) return false;
    for (let offset = 1; offset < requiredSegments; offset += 1) {
      const next = slots[index + offset];
      if (!next || next.booked || next.past || addMinutes(slot.time, offset * 30) !== next.time) return false;
    }
    return true;
  });
}

function BookingActionDialog({ booking, mode, token, onClose, onCancelled, onRescheduled }: {
  booking: BookingHistoryItem;
  mode: 'cancel' | 'reschedule';
  token: string;
  onClose: () => void;
  onCancelled: () => void;
  onRescheduled: (selectedDate: string, selectedTime: string) => void;
}) {
  const minimumDate = currentSingaporeDateTimeKey().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(booking.slotDate);
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(mode === 'reschedule');
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

  useEffect(() => {
    if (mode !== 'reschedule') return;
    let cancelled = false;
    setLoadingSlots(true);
    setDialogError(null);
    setSelectedTime('');
    fetchSlots(selectedDate, booking.sportId, booking.facilityCode)
      .then((response) => {
        if (!cancelled) setSlots(availableStartTimes(response.slots, booking.durationMins));
      })
      .catch((error) => {
        if (!cancelled) setDialogError(error instanceof Error ? error.message : 'Unable to load available times.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => { cancelled = true; };
  }, [booking.durationMins, booking.facilityCode, booking.sportId, mode, selectedDate]);

  async function submit() {
    if (mode === 'reschedule' && !selectedTime) return;
    setSubmitting(true);
    setDialogError(null);
    try {
      if (mode === 'cancel') {
        await cancelMyBooking(booking, token);
        announce('Booking cancelled. The slot is available for others.');
        onCancelled();
      } else {
        await rescheduleMyBooking(booking, selectedDate, selectedTime, token);
        announce('Booking rescheduled successfully.');
        onRescheduled(selectedDate, selectedTime);
      }
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : 'Unable to update the booking.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="booking-details-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section className="booking-details-dialog booking-action-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-action-title">
        <header className="booking-details-header">
          <div>
            <span className="booking-details-eyebrow">Booking {booking.receiptId}</span>
            <h2 id="booking-action-title">{mode === 'cancel' ? 'Cancel Booking?' : 'Reschedule Booking'}</h2>
          </div>
          <button type="button" className="booking-details-close" onClick={onClose} disabled={submitting} aria-label="Close">
            <X size={20} strokeWidth={2.3} />
          </button>
        </header>

        {dialogError && <ErrorBanner message={dialogError} onDismiss={() => setDialogError(null)} />}

        {mode === 'cancel' ? (
          <div className="booking-cancel-message">
            <AlertTriangle size={24} strokeWidth={2.1} />
            <div>
              <strong>The reserved slot will be released immediately.</strong>
              <p>{booking.paymentMethod === 'ONLINE'
                ? 'This action does not automatically refund the card payment. Contact support for refund assistance.'
                : 'Any pending cash payment will no longer be required.'}</p>
            </div>
          </div>
        ) : (
          <div className="booking-reschedule-form">
            <label htmlFor="reschedule-date">New date</label>
            <input id="reschedule-date" type="date" min={minimumDate} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            <span className="booking-reschedule-label">Available start times ({booking.durationMins} minutes)</span>
            {loadingSlots ? <Spinner /> : slots.length === 0 ? (
              <p className="booking-reschedule-empty">No suitable times are available on this date.</p>
            ) : (
              <div className="booking-reschedule-slots">
                {slots.map((slot) => (
                  <button key={slot.key} type="button" className={selectedTime === slot.time ? 'selected' : ''} onClick={() => setSelectedTime(slot.time)}>
                    {to12Hour(slot.time)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="booking-action-footer">
          <button type="button" className="bookings-action-btn-v2 ghost" onClick={onClose} disabled={submitting}>Keep Booking</button>
          <button type="button" className={`bookings-action-btn-v2${mode === 'cancel' ? ' danger' : ''}`} onClick={submit} disabled={submitting || (mode === 'reschedule' && !selectedTime)}>
            {submitting ? 'Saving...' : mode === 'cancel' ? 'Confirm Cancellation' : 'Confirm Reschedule'}
          </button>
        </div>
      </section>
    </div>
  );
}

function BookingDetailsDialog({ booking, onClose }: { booking: BookingCard; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function copyId() {
    navigator.clipboard.writeText(booking.id).catch(() => undefined);
    announce('Booking ID copied.');
  }

  const paymentMethodLabel = booking.paymentMethod === 'CASH'
    ? 'Cash at Venue'
    : {
        STRIPE: 'Credit / Debit Card',
        GPAY: 'Google Pay',
        PAYNOW: 'PayNow',
        GRABPAY: 'GrabPay',
      }[booking.payMethod];

  return (
    <div
      className="booking-details-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="booking-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-details-title"
      >
        <header className="booking-details-header">
          <div>
            <span className="booking-details-eyebrow">Booking receipt</span>
            <h2 id="booking-details-title">Booking Details</h2>
          </div>
          <button type="button" className="booking-details-close" onClick={onClose} aria-label="Close booking details" autoFocus>
            <X size={20} strokeWidth={2.3} />
          </button>
        </header>

        <div className="booking-details-venue">
          {booking.image && <img src={booking.image} alt={booking.title} />}
          <div>
            <h3>{booking.title}</h3>
            <p>
              {booking.mapLocationUrl ? (
                <a
                  className="bookings-location-link-v2"
                  href={booking.mapLocationUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open map for ${booking.title}`}
                >
                  <MapPin size={15} strokeWidth={2.2} />
                </a>
              ) : (
                <MapPin size={15} strokeWidth={2.2} aria-hidden="true" />
              )}
              {booking.location ?? 'Location unavailable'}
            </p>
            <span className={`bookings-status-v2 ${booking.statusType}`}>{booking.statusLabel}</span>
          </div>
        </div>

        <div className="booking-details-grid">
          <div className="booking-details-field">
            <CalendarDays size={18} strokeWidth={2.1} />
            <span><small>Date</small><strong>{booking.dateText}</strong></span>
          </div>
          <div className="booking-details-field">
            <Clock3 size={18} strokeWidth={2.1} />
            <span><small>Time</small><strong>{booking.timeText}</strong></span>
          </div>
          <div className="booking-details-field">
            <Timer size={18} strokeWidth={2.1} />
            <span><small>Duration</small><strong>{booking.durationMins} minutes</strong></span>
          </div>
          <div className="booking-details-field">
            <Tag size={18} strokeWidth={2.1} />
            <span><small>Booking type</small><strong>{booking.bookingType === 'coaching' ? 'Coaching' : 'Court Booking'}</strong></span>
          </div>
          <div className="booking-details-field">
            <CreditCard size={18} strokeWidth={2.1} />
            <span><small>Payment method</small><strong>{paymentMethodLabel}</strong></span>
          </div>
          <div className="booking-details-field">
            <ReceiptText size={18} strokeWidth={2.1} />
            <span><small>Total paid</small><strong>{booking.amount}</strong></span>
          </div>
        </div>

        <div className="booking-details-id">
          <span><small>Booking ID</small><strong>{booking.id}</strong></span>
          <button type="button" onClick={copyId} aria-label="Copy booking id">
            <Copy size={17} strokeWidth={2.3} />
          </button>
        </div>

        <button type="button" className="booking-details-done" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}

export default function ViewBookingsScreen() {
  const { state } = useApp();
  const [tab, setTab] = useState<BookingTab>('upcoming');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<BookingHistoryItem[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<BookingCard | null>(null);
  const [actionBooking, setActionBooking] = useState<{ booking: BookingHistoryItem; mode: 'cancel' | 'reschedule' } | null>(null);

  useEffect(() => {
    if (!state.authToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMyBookings(state.authToken)
      .then((response) => {
        if (cancelled) return;
        setHistoryItems(response.bookings);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unable to load bookings right now.';
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [state.authToken]);

  const activeList = useMemo(() => {
    const currentKey = currentSingaporeDateTimeKey();
    return historyItems
      .filter((item) => tab === 'upcoming'
        ? item.status !== 'cancelled' && bookingDateTimeKey(item) >= currentKey
        : item.status === 'cancelled' || bookingDateTimeKey(item) < currentKey)
      .map(mapHistoryToCard);
  }, [historyItems, tab]);

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div className="bookings-phone" style={{ backgroundImage: `url(${pageBackground})` }}>
        <div className="bookings-scroll-v2">
          <ScreenHeader hideBack />

          <section className="bookings-title-v2">
            <h1>My Bookings</h1>
            <p>Manage your facility bookings</p>
          </section>

          <ErrorBanner message={error} onDismiss={() => setError(null)} />

          <section className="bookings-tabs-v2" aria-label="Bookings filter tabs">
            <button
              type="button"
              className={`bookings-tab-v2${tab === 'upcoming' ? ' active' : ''}`}
              onClick={() => setTab('upcoming')}
            >
              Upcoming Bookings
            </button>
            <button
              type="button"
              className={`bookings-tab-v2${tab === 'previous' ? ' active' : ''}`}
              onClick={() => setTab('previous')}
            >
              Previous Bookings
            </button>
          </section>

          <section className="bookings-section-v2">
            <header>
              <h2>
                <CalendarDays size={18} strokeWidth={2.2} />
                {tab === 'upcoming' ? 'Upcoming Bookings' : 'Previous Bookings'}
              </h2>
              <span>{activeList.length}</span>
            </header>

            {loading ? (
              <div className="bookings-list-v2">
                <Spinner />
              </div>
            ) : activeList.length === 0 ? (
              <div className="bookings-list-v2">
                <p>{tab === 'upcoming' ? 'No upcoming bookings yet.' : 'No previous bookings yet.'}</p>
              </div>
            ) : (
              <div className="bookings-list-v2">
                {activeList.map((booking) => (
                  <BookingCardView
                    key={booking.id}
                    booking={booking}
                    showActions={tab === 'upcoming'}
                    onViewDetails={setSelectedBooking}
                    onReschedule={(selected) => {
                      const item = historyItems.find((candidate) => candidate.receiptId === selected.id);
                      if (item) setActionBooking({ booking: item, mode: 'reschedule' });
                    }}
                    onCancel={(selected) => {
                      const item = historyItems.find((candidate) => candidate.receiptId === selected.id);
                      if (item) setActionBooking({ booking: item, mode: 'cancel' });
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="bookings-help-v2">
            <div>
              <strong>
                <Headphones size={18} strokeWidth={2.2} />
                Need help with your booking?
              </strong>
              <p>Contact our support team for assistance.</p>
            </div>
            <a href="mailto:admin@sportygo.com.sg?subject=SportyGo%20Booking%20Support">Contact Support</a>
          </section>
        </div>

      </div>
      {selectedBooking && (
        <BookingDetailsDialog booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
      )}
      {actionBooking && state.authToken && (
        <BookingActionDialog
          booking={actionBooking.booking}
          mode={actionBooking.mode}
          token={state.authToken}
          onClose={() => setActionBooking(null)}
          onCancelled={() => {
            setHistoryItems((items) => items.map((item) => item.receiptId === actionBooking.booking.receiptId
              ? { ...item, status: 'cancelled' }
              : item));
            setActionBooking(null);
          }}
          onRescheduled={(selectedDate, selectedTime) => {
            setHistoryItems((items) => items.map((item) => item.receiptId === actionBooking.booking.receiptId
              ? { ...item, slotDate: selectedDate, slotTime: selectedTime }
              : item));
            setActionBooking(null);
          }}
        />
      )}
    </div>
  );
}