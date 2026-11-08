import { useEffect, useState } from 'react';
import { ArrowRight, GraduationCap, ShoppingCart, Ticket } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import ScreenHeader from '@/components/ScreenHeader';
import CoachStepBar from '@/components/CoachStepBar';
import Spinner from '@/components/Spinner';
import selectSportBackground from '@/assets/select_sport_bk.png';
import { fetchCoachingBalance, fetchCoachingPackages } from '@/lib/api';
import { coachNavigationGuard, noPackagesMessage, pricePerSession, sessionsLabel, sportLabel, validityLabel } from '@/lib/coaching';
import { coachImageFor } from '@/lib/coachImages';
import { sgd } from '@/lib/pricing';
import { announce } from '@/lib/utils';
import type { CoachingPackage } from '@/types';

function money(amount: number): string {
  return sgd(amount).replace('SGD', 'S$');
}

export default function CoachPackagesScreen() {
  const { state, dispatch, navigate } = useApp();
  const sportId = state.selectedSport ?? 'cricket';
  const label = sportLabel(sportId);
  const coachImage = coachImageFor(sportId);
  const [packages, setPackages] = useState<CoachingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchCoachingPackages(sportId)
      .then((response) => {
        if (active) setPackages(response.packages.filter((pkg) => pkg.enabled));
      })
      .catch(() => {
        if (active) setError('Unable to load coaching packages right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [requestVersion, sportId]);

  useEffect(() => {
    if (!state.authToken) return;
    let active = true;
    // The balance is a nice-to-have here; the packages still work without it.
    fetchCoachingBalance(sportId, state.authToken)
      .then((response) => {
        if (active) setBalance(response.remainingSessions);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [sportId, state.authToken]);

  function handlePackageSelect(pkg: CoachingPackage) {
    dispatch({ type: 'SET_COACH_PACKAGE', payload: pkg });
    announce(`${pkg.title} selected.`);

    // navigate() still sees the previous package until the next render, so apply the same
    // guard here with the package just tapped.
    const guard = coachNavigationGuard('coach-terms', {
      screen: state.screen,
      isLoggedIn: state.isLoggedIn,
      selectedCoachPackage: pkg,
      coachPurchase: state.coachPurchase,
    });
    if (guard?.kind === 'login') {
      dispatch({ type: 'SET_POST_LOGIN_REDIRECT', payload: guard.returnTo });
      dispatch({ type: 'SET_SCREEN', payload: 'login' });
      return;
    }
    dispatch({ type: 'SET_SCREEN', payload: 'coach-terms' });
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div
        className="sports-screen-shell"
        style={{ backgroundImage: `url(${selectSportBackground})` }}
      >
        <ScreenHeader onBack={() => navigate('sport-events')} backAriaLabel="Back to sport activities" />

        <CoachStepBar currentStep={1} />

        <section className="facility-select-hero">
          <h1>
            Coaching <span className="gold">Packages</span>
          </h1>
          <p>
            Buy a package of {label.toLowerCase()} sessions, then book your spot in our weekly group coaching.
          </p>
        </section>

        {balance !== null && balance > 0 && (
          <section className="checkout-panel-v2 coach-balance-panel">
            <Ticket size={20} strokeWidth={2.2} aria-hidden="true" />
            <span>You have <strong>{sessionsLabel(balance)}</strong> left for {label}.</span>
            <button type="button" onClick={() => navigate('coach-sessions')}>Book a session</button>
          </section>
        )}

        <div className="facility-select-grid" role="list" aria-label={`${label} coaching packages`}>
          {loading ? <div className="catalog-state"><Spinner variant="muted" /><span>Loading packages...</span></div> : null}
          {!loading && error ? (
            <div className="catalog-state">
              <strong>Packages are unavailable</strong>
              <span>{error}</span>
              <button type="button" onClick={() => setRequestVersion((version) => version + 1)}>Retry</button>
            </div>
          ) : null}
          {!loading && !error && packages.length === 0 ? (
            <div className="catalog-state"><strong>{noPackagesMessage(sportId)}</strong><span>Please check again later.</span></div>
          ) : null}
          {!loading && !error && packages.map((pkg) => (
            <button
              type="button"
              key={pkg.id}
              className="facility-select-card"
              role="listitem"
              aria-label={`${pkg.title}, ${sessionsLabel(pkg.sessionCount)}, ${money(pkg.pricing.grandTotal)}`}
              onClick={() => handlePackageSelect(pkg)}
            >
              <div className="facility-select-card-media">
                <img src={coachImage} alt="" className="facility-select-card-image" />
                <span className="facility-select-card-badge" aria-hidden="true">
                  <GraduationCap size={20} strokeWidth={2.3} />
                </span>
              </div>

              <div className="facility-select-card-body">
                <div className="facility-select-card-title">{pkg.title}</div>
                <div className="facility-select-card-address">
                  <Ticket size={13} strokeWidth={2.2} aria-hidden="true" />
                  <span>{sessionsLabel(pkg.sessionCount)} · {validityLabel(pkg.validityWeeks)}</span>
                </div>
                <div className="facility-select-card-price">
                  {money(pkg.pricing.grandTotal)}
                  <small>(incl. all fees)</small>
                </div>
                <div className="coach-pkg-per-session">{money(pricePerSession(pkg))} per session</div>
              </div>

              <div className="facility-select-card-footer">
                <span>
                  <ShoppingCart size={15} strokeWidth={2.4} />
                  Buy Now
                </span>
                <ArrowRight size={22} strokeWidth={2.6} className="facility-select-card-arrow" aria-hidden="true" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
