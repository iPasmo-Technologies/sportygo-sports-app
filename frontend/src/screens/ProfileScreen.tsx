import { useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  Compass,
  FlaskConical,
  Headphones,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ApiError, fetchProfile } from '@/lib/api';
import { clearRememberedAuth } from '@/lib/rememberedAuth';
import { announce } from '@/lib/utils';
import ScreenHeader from '@/components/ScreenHeader';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import pageBackground from '@/assets/select_sport_bk.png';
import type { ProfileResponse } from '@/types';

const PAYMENT_TEST_PAGE_ENABLED = (import.meta.env.VITE_PAYMENT_TEST_PAGE_ENABLED ?? 'false').trim() === 'true';

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'SG';
}

export default function ProfileScreen() {
  const { state, dispatch, navigate } = useApp();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!state.authToken) {
      navigate('login');
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchProfile(state.authToken)
      .then((response) => {
        if (!cancelled) setProfile(response);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
          clearRememberedAuth();
          dispatch({ type: 'LOG_OUT' });
          announce('Your session is no longer active. Please log in again.');
          return;
        }
        const message = err instanceof Error ? err.message : 'Unable to load your profile right now.';
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, navigate, state.authToken]);

  function logOut() {
    dispatch({ type: 'LOG_OUT' });
    announce('You have been logged out.');
  }

  const displayName = profile?.fullName ?? 'SportyGo Member';

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <main className="profile-phone" style={{ backgroundImage: `url(${pageBackground})` }}>
        <ScreenHeader onBack={() => navigate('home')} backAriaLabel="Back to home" />

        <section className="profile-title">
          <h1>My Profile</h1>
          <p>Your account and SportyGo activity</p>
        </section>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        {loading ? (
          <div className="profile-loading"><Spinner /></div>
        ) : profile ? (
          <>
            <section className="profile-identity" aria-labelledby="profile-name">
              <div className="profile-avatar" aria-hidden="true">{initialsFor(displayName)}</div>
              <div>
                <span className="profile-member-label">SportyGo Member</span>
                <h2 id="profile-name">{displayName}</h2>
                <p><Mail size={14} />{profile.email}</p>
              </div>
              <span className="profile-verified"><ShieldCheck size={15} /> Verified</span>
            </section>

            <section className="profile-shortcuts" aria-label="Quick actions">
              <button type="button" onClick={() => navigate('bookings')}>
                <CalendarDays size={21} />
                <span><strong>My Bookings</strong><small>View your activity</small></span>
                <ChevronRight size={18} />
              </button>
              <button type="button" onClick={() => navigate('sport-select')}>
                <Compass size={21} />
                <span><strong>Explore Sports</strong><small>Book your next session</small></span>
                <ChevronRight size={18} />
              </button>
            </section>

            <section className="profile-section" aria-labelledby="account-details-title">
              <h2 id="account-details-title">Account details</h2>
              <dl className="profile-details">
                <div>
                  <dt><UserRound size={18} /> Full name</dt>
                  <dd>{profile.fullName}</dd>
                </div>
                <div>
                  <dt><Mail size={18} /> Email address</dt>
                  <dd>{profile.email}</dd>
                </div>
                <div>
                  <dt><Phone size={18} /> Mobile number</dt>
                  <dd>{profile.mobileNumber}</dd>
                </div>
                <div>
                  <dt><ShieldCheck size={18} /> Sign-in method</dt>
                  <dd>Email & password</dd>
                </div>
              </dl>
            </section>

            <section className="profile-section" aria-labelledby="support-title">
              <h2 id="support-title">Help & support</h2>
              <div className="profile-link-list">
                <a href="mailto:support@sportygo.sg?subject=SportyGo%20Support">
                  <Headphones size={19} />
                  <span><strong>Contact support</strong><small>Get help with your account or booking</small></span>
                  <ChevronRight size={18} />
                </a>
                <a href="mailto:support@sportygo.sg?subject=SportyGo%20Privacy%20Question">
                  <ShieldCheck size={19} />
                  <span><strong>Privacy & account help</strong><small>Ask about your data and account</small></span>
                  <ChevronRight size={18} />
                </a>
              </div>
            </section>

            {PAYMENT_TEST_PAGE_ENABLED && (
              <button type="button" className="profile-test-pay-btn"
                onClick={() => navigate('payment-test')}>
                <FlaskConical size={16} strokeWidth={2} />
                <span>Payment Integration Test</span>
              </button>
            )}
          </>
        ) : null}

        {state.authToken && (
          <button type="button" className="profile-logout" onClick={logOut}>
            <LogOut size={19} /> Log Out
          </button>
        )}
      </main>
    </div>
  );
}