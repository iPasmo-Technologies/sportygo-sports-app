import { ArrowRight, CalendarDays, Check, ShieldCheck, Ticket } from 'lucide-react';
import CopyButton from '@/components/CopyButton';
import { useApp } from '@/context/AppContext';
import pageBackground from '@/assets/select_sport_bk.png';
import logoImage from '@/assets/logo.png';
import { formatExpiryDate, sessionsLabel, sportLabel } from '@/lib/coaching';
import { sgd } from '@/lib/pricing';

export default function CoachPurchaseSuccessScreen() {
  const { state, navigate } = useApp();
  const purchase = state.coachPurchase;
  if (!purchase) return null;

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div className="success-phone" style={{ backgroundImage: `url(${pageBackground})` }}>
        <div className="sport-events-logo-wrap success-logo-wrap">
          <img src={logoImage} alt="SportyGo" className="sport-events-logo" />
        </div>

        <section className="success-hero-v2">
          <div className="success-check-v2" aria-hidden="true">
            <Check size={42} strokeWidth={3.1} />
          </div>
          <h1>Payment <span>Successful!</span></h1>
          <p>{sessionsLabel(purchase.totalSessions)} of {sportLabel(purchase.sportId)} coaching added to your account.</p>
        </section>

        <section className="success-card-v2">
          <div className="success-card-header-v2">
            <span className="success-card-icon-v2"><Ticket size={20} strokeWidth={2.2} /></span>
            <div>
              <strong>{purchase.packageTitle}</strong>
              <small>Receipt ID</small>
              <div className="success-confirm-id-v2">
                {purchase.receiptId}
                <CopyButton text={purchase.receiptId} label="Copy receipt id" iconSize={18} />
              </div>
            </div>
          </div>

          <dl className="coach-summary-list">
            <div><dt>Sessions available</dt><dd>{purchase.remainingSessions} of {purchase.totalSessions}</dd></div>
            <div><dt>Use before</dt><dd>{formatExpiryDate(purchase.expiresAt)}</dd></div>
            <div><dt>Paid</dt><dd>{sgd(purchase.amountPaid).replace('SGD', 'S$')} (incl. all fees)</dd></div>
          </dl>

          <div className="success-thanks-v2">
            <ShieldCheck size={22} strokeWidth={2.2} />
            <span>Book a spot in a weekly session now, or any time later from My Bookings.</span>
          </div>
        </section>

        <button type="button" className="success-primary-btn-v2" onClick={() => navigate('coach-sessions')}>
          <CalendarDays size={20} strokeWidth={2.2} />
          <span>Book session now</span>
          <ArrowRight size={22} strokeWidth={2.3} />
        </button>
        <button type="button" className="success-secondary-btn-v2" onClick={() => navigate('bookings')}>
          Book Later
        </button>
      </div>
    </div>
  );
}
