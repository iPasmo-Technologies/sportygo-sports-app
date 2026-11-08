import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, Check, Clock3, MapPin, Search, Ticket, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import ScreenHeader from '@/components/ScreenHeader';
import CoachStepBar from '@/components/CoachStepBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import pageBackground from '@/assets/select_sport_bk.png';
import { ApiError, bookCoachingSession, fetchCoachingBalance, fetchCoachingSessions } from '@/lib/api';
import {
  bookableSessionsOn,
  formatTimeRange,
  groupSessionsByDate,
  sessionSearchRange,
  sessionsLabel,
  sportLabel,
  spotsLeftLabel,
} from '@/lib/coaching';
import { announce, formatDateLong, toSgtIsoDate } from '@/lib/utils';
import type { CoachingSession } from '@/types';

export default function CoachSessionsScreen() {
  const { state, navigate } = useApp();
  const sportId = state.selectedSport ?? state.coachPurchase?.sportId ?? 'cricket';
  const label = sportLabel(sportId);
  const [sessions, setSessions] = useState<CoachingSession[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [confirming, setConfirming] = useState<CoachingSession | null>(null);
  const [booking, setBooking] = useState(false);
  const [searchDate, setSearchDate] = useState('');
  const [appliedDate, setAppliedDate] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.authToken) return;
    let active = true;
    setLoading(true);
    setLoadError(null);

    Promise.all([fetchCoachingSessions(sportId, state.authToken), fetchCoachingBalance(sportId, state.authToken)])
      .then(([sessionResponse, balanceResponse]) => {
        if (!active) return;
        setSessions(sessionResponse.sessions);
        setRemaining(balanceResponse.remainingSessions);
      })
      .catch(() => {
        if (active) setLoadError('Unable to load coaching sessions right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [requestVersion, sportId, state.authToken]);

  async function handleConfirmBooking() {
    if (!confirming || !state.authToken || booking) return;
    setBooking(true);
    setBookError(null);
    try {
      await bookCoachingSession(confirming.id, state.authToken);
      announce('Coaching session booked.');
      setConfirming(null);
      navigate('bookings');
    } catch (caught) {
      setConfirming(null);
      setBookError(caught instanceof Error ? caught.message : 'Unable to book this session. Please try again.');
      announce('Booking failed.');
      // Spots or credits changed since the list loaded; show the current picture.
      if (caught instanceof ApiError && caught.status === 409) setRequestVersion((version) => version + 1);
    } finally {
      setBooking(false);
    }
  }

  function bookButtonLabel(session: CoachingSession): string {
    if (session.bookedByMe) return 'Booked';
    if (session.spotsLeft <= 0) return 'Full';
    if (remaining <= 0) return 'No sessions left';
    return 'Book Now';
  }

  function spotsPill(session: CoachingSession): { label: string; tone: '' | ' booked' | ' full' } {
    if (session.bookedByMe) return { label: "You're booked", tone: ' booked' };
    if (session.spotsLeft <= 0) return { label: `Full · ${spotsLeftLabel(session)}`, tone: ' full' };
    return { label: spotsLeftLabel(session), tone: '' };
  }

  const searchRange = sessionSearchRange(sessions, toSgtIsoDate(new Date()));
  const visibleSessions = appliedDate ? bookableSessionsOn(sessions, appliedDate) : sessions;
  const groups = groupSessionsByDate(visibleSessions);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Typed dates can skip the picker's min/max in some browsers, so check the range here too.
    if (!searchDate || searchDate < searchRange.min || searchDate > searchRange.max) {
      setSearchError(`Choose a date from ${formatDateLong(searchRange.min)} to ${formatDateLong(searchRange.max)}.`);
      return;
    }
    setSearchError(null);
    setAppliedDate(searchDate);
    const found = bookableSessionsOn(sessions, searchDate).length;
    announce(`${found} ${found === 1 ? 'session' : 'sessions'} with spots on ${formatDateLong(searchDate)}.`);
  }

  function clearSearch() {
    setAppliedDate(null);
    setSearchDate('');
    setSearchError(null);
    announce('Showing all upcoming sessions.');
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div className="terms-phone" style={{ backgroundImage: `url(${pageBackground})` }}>
        <ScreenHeader onBack={() => navigate('coach-packages')} backAriaLabel="Back to coaching packages" />

        <CoachStepBar currentStep={4} />

        <section className="terms-title-wrap">
          <h1>
            <CalendarDays size={28} strokeWidth={2.1} />
            <span>{label} Sessions</span>
          </h1>
          <p>Pick a weekly group session. Each booking uses one session from your package.</p>
        </section>

        <ErrorBanner message={bookError} onDismiss={() => setBookError(null)} />

        {!loading && !loadError && (
          <section className="checkout-panel-v2 coach-balance-panel">
            <Ticket size={20} strokeWidth={2.2} aria-hidden="true" />
            <span>You have <strong>{sessionsLabel(remaining)}</strong> left for {label}.</span>
            {remaining <= 0 && <button type="button" onClick={() => navigate('coach-packages')}>Buy a package</button>}
          </section>
        )}

        {loading ? (
          <div className="catalog-state"><Spinner variant="muted" /><span>Loading sessions...</span></div>
        ) : loadError ? (
          <div className="catalog-state">
            <strong>Sessions are unavailable</strong>
            <span>{loadError}</span>
            <button type="button" onClick={() => setRequestVersion((version) => version + 1)}>Retry</button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="catalog-state"><strong>No upcoming {label} sessions</strong><span>Please check again later.</span></div>
        ) : (
          <form className="coach-session-search" onSubmit={handleSearch} role="search" aria-label={`Search ${label} sessions by date`}>
            <label htmlFor="coach-session-date">Find a session</label>
            <div className="coach-session-search-row">
              <input
                id="coach-session-date"
                type="date"
                min={searchRange.min}
                max={searchRange.max}
                value={searchDate}
                onChange={(event) => setSearchDate(event.target.value)}
                aria-describedby="coach-session-search-hint"
              />
              <button type="submit" className="terms-proceed-btn coach-session-search-btn" disabled={!searchDate}>
                <Search size={18} strokeWidth={2.4} aria-hidden="true" />
                Search
              </button>
            </div>
            {searchError ? (
              <p id="coach-session-search-hint" className="coach-session-search-error" role="alert">{searchError}</p>
            ) : appliedDate ? (
              <p id="coach-session-search-hint" className="coach-session-search-result">
                <span>
                  {sessionsLabel(visibleSessions.length)} with spots on <strong>{formatDateLong(appliedDate)}</strong>
                </span>
                <button type="button" onClick={clearSearch}>Show all sessions</button>
              </p>
            ) : (
              <p id="coach-session-search-hint" className="coach-session-search-hint">Pick a date to see sessions with free spots that day.</p>
            )}
          </form>
        )}

        {loading || loadError || sessions.length === 0 ? null : groups.length === 0 ? (
          <div className="catalog-state">
            <strong>No sessions with free spots on {appliedDate ? formatDateLong(appliedDate) : 'this day'}</strong>
            <span>Try another date, or see every upcoming session.</span>
            <button type="button" onClick={clearSearch}>Show all sessions</button>
          </div>
        ) : (
          <div className="coach-session-list" role="list" aria-label={`Upcoming ${label} sessions`}>
            {groups.flatMap((group) => group.sessions.map((session) => {
              const canBook = !session.bookedByMe && session.spotsLeft > 0 && remaining > 0;
              const dateLabel = formatDateLong(group.date);
              const pill = spotsPill(session);
              return (
                <article key={session.id} className="coach-session-card" role="listitem" aria-label={`${session.title}, ${dateLabel}`}>
                  <header className="coach-session-card-header">
                    <span className="coach-session-card-badge" aria-hidden="true">
                      <CalendarDays size={20} strokeWidth={2.3} />
                    </span>
                    <h2>{dateLabel}</h2>
                  </header>

                  <div className="coach-session-card-body">
                    <strong className="coach-session-card-title">{session.title}</strong>
                    <p><Clock3 size={15} strokeWidth={2.3} aria-hidden="true" /> {formatTimeRange(session.startTime, session.endTime)}</p>
                    <p><MapPin size={15} strokeWidth={2.3} aria-hidden="true" /> {session.location}</p>
                    <span className={`coach-spots-pill${pill.tone}`}>
                      <Users size={14} strokeWidth={2.3} aria-hidden="true" /> {pill.label}
                    </span>
                  </div>

                  <div className="coach-session-card-footer">
                    <span>
                      <Ticket size={15} strokeWidth={2.4} aria-hidden="true" />
                      Uses 1 session
                    </span>
                    <button
                      type="button"
                      className={`terms-proceed-btn coach-session-book-btn${session.bookedByMe ? ' booked' : ''}`}
                      disabled={!canBook}
                      onClick={() => setConfirming(session)}
                    >
                      {bookButtonLabel(session)}
                      {session.bookedByMe
                        ? <Check size={18} strokeWidth={2.6} aria-hidden="true" />
                        : canBook ? <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" /> : null}
                    </button>
                  </div>
                </article>
              );
            }))}
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title="Book this session?"
          message={`${confirming.title}, ${formatDateLong(confirming.sessionDate)}, ${formatTimeRange(confirming.startTime, confirming.endTime)}. This uses 1 session from your package and cannot be cancelled by you.`}
          confirmLabel="Book session"
          busyLabel="Booking..."
          busy={booking}
          onCancel={() => setConfirming(null)}
          onConfirm={handleConfirmBooking}
        />
      )}
    </div>
  );
}
