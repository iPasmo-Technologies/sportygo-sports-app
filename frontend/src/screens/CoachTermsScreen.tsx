import { useEffect, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import ScreenHeader from '@/components/ScreenHeader';
import CoachStepBar from '@/components/CoachStepBar';
import Spinner from '@/components/Spinner';
import pageBackground from '@/assets/select_sport_bk.png';
import { fetchProfile } from '@/lib/api';
import { hasContactDetailsForCoaching, sessionsLabel, sportLabel, validityLabel } from '@/lib/coaching';
import { sgd } from '@/lib/pricing';
import { announce } from '@/lib/utils';

type TermItem = {
  title: string;
  body: string;
  icon: LucideIcon;
};

// Mirrors the v1 coaching rules in the SGO-48 plan: no self-cancel, no refunds of unused sessions.
const COACH_TERM_ITEMS: TermItem[] = [
  {
    title: '1. Package & Payment',
    body: 'Full payment is required to buy a coaching package. Your sessions are added to your account as soon as the payment is confirmed.',
    icon: Ticket,
  },
  {
    title: '2. Using Your Sessions',
    body: 'Each booking uses one session from your package. Sessions can only be used for this sport, on our weekly group sessions, while spots are available.',
    icon: CalendarClock,
  },
  {
    title: '3. Validity',
    body: 'Sessions must be used before the package expiry date shown on your receipt. Unused sessions expire and are not refunded.',
    icon: RotateCcw,
  },
  {
    title: '4. Cancellations',
    body: 'Bookings cannot be cancelled by players. If SportyGo cancels a session, every booked player gets that session back in their package.',
    icon: UserCheck,
  },
  {
    title: '5. Liability',
    body: 'SportyGo, its coaches and partners are not liable for any injury, loss, or damage to personal property during coaching sessions.',
    icon: ShieldAlert,
  },
];

export default function CoachTermsScreen() {
  const { state, dispatch, navigate } = useApp();
  const [agreed, setAgreed] = useState(false);
  const [expandedTerms, setExpandedTerms] = useState<number[]>([]);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const pkg = state.selectedCoachPackage;

  // A package needs a real name and mobile; send the user to Profile first, then back here.
  // The server checks again when the payment starts, so this is only for a smoother flow.
  useEffect(() => {
    if (!state.authToken) {
      setCheckingProfile(false);
      return;
    }
    let active = true;
    fetchProfile(state.authToken)
      .then((profile) => {
        if (!active || hasContactDetailsForCoaching(profile)) return;
        dispatch({ type: 'SET_POST_LOGIN_REDIRECT', payload: 'coach-terms' });
        navigate('profile');
        announce('Please add your full name and mobile number to continue.');
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setCheckingProfile(false);
      });
    return () => {
      active = false;
    };
  }, [dispatch, navigate, state.authToken]);

  if (!pkg) return null;

  function toggleTerm(index: number) {
    setExpandedTerms(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div className="terms-phone" style={{ backgroundImage: `url(${pageBackground})` }}>
        <ScreenHeader onBack={() => navigate('coach-packages')} backAriaLabel="Back to coaching packages" />

        <CoachStepBar currentStep={2} />

        <section className="terms-title-wrap">
          <h1>
            <ShieldCheck size={28} strokeWidth={2.1} />
            <span>Coaching Terms</span>
          </h1>
          <p>Please read the coaching terms carefully before proceeding to payment.</p>
        </section>

        <section className="terms-panel">
          {COACH_TERM_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            const isExpanded = expandedTerms.includes(idx);
            const contentId = `coach-term-item-content-${idx}`;
            return (
              <article
                key={item.title}
                className={`terms-item${idx < COACH_TERM_ITEMS.length - 1 ? ' with-divider' : ''}${isExpanded ? ' expanded' : ''}`}
              >
                <div className="terms-item-icon" aria-hidden="true">
                  <Icon size={28} strokeWidth={1.9} />
                </div>
                <div className="terms-item-content">
                  <h3>{item.title}</h3>
                  {isExpanded && <p id={contentId}>{item.body}</p>}
                </div>

                <button
                  type="button"
                  className={`terms-item-toggle${isExpanded ? ' expanded' : ''}`}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.title}`}
                  aria-expanded={isExpanded}
                  aria-controls={contentId}
                  onClick={() => toggleTerm(idx)}
                >
                  <ChevronDown size={20} strokeWidth={2.1} className="terms-item-chevron" aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </section>

        <button
          type="button"
          className={`terms-agree${agreed ? ' checked' : ''}`}
          aria-pressed={agreed}
          onClick={() => setAgreed(v => !v)}
        >
          <span className="terms-agree-box">{agreed ? '✓' : ''}</span>
          <span>I have read and agree to the <strong>Coaching Terms</strong></span>
        </button>

        <section className="terms-summary-card">
          <h2>Package Summary</h2>
          <dl className="coach-summary-list">
            <div><dt>Sport</dt><dd>{sportLabel(pkg.sportId)}</dd></div>
            <div><dt>Package</dt><dd>{pkg.title}</dd></div>
            <div><dt>Sessions</dt><dd>{sessionsLabel(pkg.sessionCount)}</dd></div>
            <div><dt>Validity</dt><dd>{validityLabel(pkg.validityWeeks)} from purchase</dd></div>
            <div><dt>Total</dt><dd><strong>{sgd(pkg.pricing.grandTotal).replace('SGD', 'S$')}</strong> (incl. all fees)</dd></div>
          </dl>

          <button
            type="button"
            className="terms-proceed-btn"
            disabled={!agreed || checkingProfile}
            onClick={() => navigate('coach-checkout')}
          >
            {checkingProfile ? <Spinner /> : (
              <span className="terms-proceed-icon" aria-hidden="true">
                <Lock size={20} strokeWidth={2.1} />
              </span>
            )}
            Proceed to Payment
            <span className="terms-proceed-arrow" aria-hidden="true">&#8594;</span>
          </button>
        </section>

        <div className="terms-security-note">
          <ShieldCheck size={18} strokeWidth={2.1} />
          <span>Your payment is safe and secure with SportyGo. We do not share your personal information.</span>
        </div>
      </div>
    </div>
  );
}
