import { useEffect } from 'react';
import { ArrowRight, CalendarDays, Check, Clock3, Copy, Lock, MapPin, ShieldCheck, Trophy } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { sgd } from '@/lib/pricing';
import { announce, formatDateLong } from '@/lib/utils';
import logoImage from '@/assets/logo.png';
import pageBackground from '@/assets/select_sport_bk.png';
import indoorCricketCard from '@/assets/card_indoor_cricket.png';
import bowlingLaneCard from '@/assets/bowling_lane.png';
import cricketNetsCard from '@/assets/cricket_nets.png';
import indoorCourtCard from '@/assets/indoor_court.png';
import cricketFacility from '@/assets/cricket_facility.png';
import pickleballIndoorCourt from '@/assets/pb-indoor-court.png';
import pickleballOutdoorCourt from '@/assets/pb-outdoor-court.png';

const SPORT_LABELS = {
  cricket: 'Cricket',
  'indoor-cricket': 'Indoor Cricket',
  pickleball: 'Pickleball',
  futsal: 'Futsal',
  'sepak-takraw': 'Sepak Takraw',
  tennis: 'Tennis',
  'table-tennis': 'Table Tennis',
  soccer: 'Soccer',
  volleyball: 'Volleyball',
  badminton: 'Badminton',
  basketball: 'Basketball',
  kabaddi: 'Kabaddi',
} as const;

const FACILITY_IMAGES = {
  'bowling-lane': bowlingLaneCard,
  'nets-2': cricketNetsCard,
  'nets-3': cricketNetsCard,
  'nets-4': cricketNetsCard,
  'indoor-court': indoorCourtCard,
  'outdoor-field': cricketFacility,
  'pb-indoor-court': pickleballIndoorCourt,
  'pb-outdoor-court': pickleballOutdoorCourt,
} as const;

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

function paymentMethodLabel(method: string | null, card: { brand: string; last4: string } | null): string {
  if (method === 'STRIPE') {
    if (!card) return 'Card';
    const brandLabels: Record<string, string> = {
      amex: 'AMEX',
      mastercard: 'Mastercard',
      unionpay: 'UnionPay',
      visa: 'Visa',
    };
    return `${brandLabels[card.brand] ?? card.brand} •••• ${card.last4}`;
  }
  if (method === 'GPAY') return 'Google Pay';
  if (method === 'PAYNOW') return 'PayNow';
  if (method === 'GRABPAY') return 'GrabPay';
  return 'Cash Payment';
}

export default function BookingConfirmationScreen() {
  const { state, dispatch, navigate } = useApp();

  const selectedSportLabel = state.selectedSport ? SPORT_LABELS[state.selectedSport] : 'Cricket';
  const selectedFacilityTitle = state.selectedFacility?.title ?? `${selectedSportLabel} Facility`;
  const selectedFacilityAddress = state.selectedFacility?.address ?? 'Location not available';
  const selectedFacilityImage = state.selectedFacility ? FACILITY_IMAGES[state.selectedFacility.imageKey] : indoorCricketCard;
  const dateLong      = state.selectedDate ? formatDateLong(state.selectedDate) : 'Not selected';
  const paymentStatus = state.paymentStatus ?? 'success';
  const isPaid = paymentStatus === 'success';
  const timeLabel = state.selectedTime
    ? `${to12Hour(state.selectedTime)} - ${to12Hour(addMinutes(state.selectedTime, state.durationMins))} (${state.durationMins} min)`
    : 'Time not selected';
  const displayReceipt = state.receiptId.replace(/-/g, '');

  // Mark WhatsApp mock sent once
  useEffect(() => {
    if (!state.whatsAppMockSent) {
      dispatch({ type: 'MARK_WHATSAPP_SENT' });
    }
  }, [state.whatsAppMockSent, dispatch]);

  function handleReset() {
    dispatch({ type: 'RESET' });
  }

  function handleBackHome() {
    dispatch({ type: 'RESET' });
    dispatch({ type: 'SET_SCREEN', payload: 'sport-select' });
  }

  function handleViewBookings() {
    if (!state.isLoggedIn) {
      dispatch({ type: 'SET_POST_LOGIN_REDIRECT', payload: 'bookings' });
      dispatch({ type: 'SET_SCREEN', payload: 'login' });
      announce('Please log in to view your bookings.');
      return;
    }

    dispatch({ type: 'SET_POST_LOGIN_REDIRECT', payload: null });
    navigate('bookings');
  }

  function copyReceiptId() {
    navigator.clipboard.writeText(displayReceipt).catch(() => undefined);
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div className="success-phone" style={{ backgroundImage: `url(${pageBackground})` }}>
        <div className="sport-events-logo-wrap success-logo-wrap">
          <img src={logoImage} alt="SportyGo" className="sport-events-logo" />
        </div>

        <section className="success-hero-v2">
          <div className={`success-check-v2${isPaid ? '' : ' cash'}`} aria-hidden="true">
            {isPaid ? <Check size={42} strokeWidth={3.1} /> : <Lock size={38} strokeWidth={2.8} />}
          </div>
          <h1>
            {isPaid ? (
              <>
                Payment <span>Successful!</span>
              </>
            ) : (
              <>
                Payment <span>Pending</span>
              </>
            )}
          </h1>
          <p>
            {isPaid
              ? 'Your booking is confirmed. We look forward to seeing you on the field!'
              : 'Online payment was not completed. Your slot is blocked. Please proceed to pay in cash at the venue.'}
          </p>
        </section>

        <section className="success-card-v2">
          <div className="success-card-header-v2">
            <span className="success-card-icon-v2"><CalendarDays size={20} strokeWidth={2.2} /></span>
            <div>
              <strong>Booking Confirmation</strong>
              <small>Confirmation ID</small>
              <div className="success-confirm-id-v2">
                {displayReceipt}
                <button type="button" onClick={copyReceiptId} aria-label="Copy confirmation id">
                  <Copy size={18} strokeWidth={2.2} />
                </button>
              </div>
              <p>A confirmation has been sent to <span>{state.customerEmail}</span></p>
            </div>
          </div>

          <div className="success-venue-v2">
            <img src={selectedFacilityImage} alt={selectedFacilityTitle} />
            <div>
              <h2>{selectedFacilityTitle}</h2>
              <p>
                {state.selectedFacility?.mapLocationUrl ? (
                  <a
                    className="success-venue-icon-pill-v2"
                    href={state.selectedFacility.mapLocationUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open map for ${selectedFacilityTitle}`}
                  >
                    <MapPin size={15} strokeWidth={2.3} />
                  </a>
                ) : (
                  <span className="success-venue-icon-pill-v2" aria-hidden="true">
                    <MapPin size={15} strokeWidth={2.3} />
                  </span>
                )}
                {selectedFacilityAddress}
              </p>
              <p>
                <span className="success-venue-icon-pill-v2" aria-hidden="true">
                  <CalendarDays size={15} strokeWidth={2.3} />
                </span>
                {dateLong}
              </p>
              <p>
                <span className="success-venue-icon-pill-v2" aria-hidden="true">
                  <Clock3 size={15} strokeWidth={2.3} />
                </span>
                {timeLabel}
              </p>
            </div>
          </div>

          <div className="success-payment-row-v2">
            <div>
              <small>{isPaid ? 'Paid Amount' : 'Amount Due in Cash'}</small>
              <strong>{sgd(state.grandTotal).replace('SGD', 'S$')}</strong>
              <span>(Incl. all fees)</span>
            </div>
            <div>
              <small>Payment Method</small>
              <strong>{isPaid ? paymentMethodLabel(state.payMethod, state.paymentCard) : 'Cash at Venue'}</strong>
            </div>
          </div>

          <div className="success-thanks-v2">
            <ShieldCheck size={22} strokeWidth={2.2} />
            <span>
              {isPaid ? 'Thank you for choosing SportyGo! We hope you have a great game.' : 'Please arrive 10 minutes early and complete your cash payment at the counter.'}
            </span>
          </div>
        </section>

        <section className="success-banner-v2">
          <span className="success-banner-icon-v2"><Trophy size={22} strokeWidth={2.2} /></span>
          <div>
            <strong>{isPaid ? 'Keep Moving. Keep Achieving!' : 'Your Slot Is Reserved!'}</strong>
            <small>{isPaid ? 'See you on the field!' : 'Proceed to cash payment at check-in.'}</small>
          </div>
        </section>

        <button className="success-primary-btn-v2" onClick={isPaid ? handleViewBookings : handleReset}>
          <span>{isPaid ? 'View My Bookings' : 'Proceed to Pay in Cash'}</span>
          <ArrowRight size={22} strokeWidth={2.3} />
        </button>
        <button className="success-secondary-btn-v2" onClick={handleBackHome}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
