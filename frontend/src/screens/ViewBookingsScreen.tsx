import { useEffect, useMemo, useState } from 'react';
import {
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
import { fetchMyBookings } from '@/lib/api';
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
import type { BookingHistoryItem } from '@/types';

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
  title: string;
  location: string | null;
  mapLocationUrl: string | null;
  dateText: string;
  timeText: string;
  durationMins: number;
  amount: string;
  statusLabel: string;
  statusType: 'upcoming' | 'completed';
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
  const statusLabel = item.status === 'cash_pending' ? 'Pending Cash' : isPast ? 'Completed' : 'Upcoming';

  return {
    id: item.receiptId,
    bookingType: item.bookingType,
    title: item.facilityTitle ?? 'Facility details unavailable',
    location: item.facilityAddress,
    mapLocationUrl: item.facilityMapLocationUrl,
    dateText: formatDateForCard(item.slotDate),
    timeText: `${to12Hour(start)} - ${to12Hour(end)} (${item.durationMins} min)`,
    durationMins: item.durationMins,
    amount: `S$${item.grandTotal.toFixed(2)}`,
    statusLabel,
    statusType: isPast ? 'completed' : 'upcoming',
    payMethod: item.payMethod,
    paymentMethod: item.paymentMethod,
    image: item.facilityImageKey ? FACILITY_IMAGES[item.facilityImageKey] : null,
  };
}

function BookingCardView({
  booking,
  showActions,
  onViewDetails,
}: {
  booking: BookingCard;
  showActions: boolean;
  onViewDetails: (booking: BookingCard) => void;
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
            <button type="button" className="bookings-action-btn-v2">Reschedule</button>
            <button type="button" className="bookings-action-btn-v2 danger">Cancel Booking</button>
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
        ? bookingDateTimeKey(item) >= currentKey
        : bookingDateTimeKey(item) < currentKey)
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
            <button type="button">Contact Support</button>
          </section>
        </div>

      </div>
      {selectedBooking && (
        <BookingDetailsDialog booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
      )}
    </div>
  );
}