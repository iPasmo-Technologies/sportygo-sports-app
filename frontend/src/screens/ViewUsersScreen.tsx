import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Mail, MessageCircle, Search, Send, TimerReset, Users } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import { useApp } from '@/context/AppContext';
import { extendUserPasscodeExpiry, fetchAdminUsers, resendUserPasscode } from '@/lib/api';
import { announce } from '@/lib/utils';
import type { AdminUserRow } from '@/types';

const DEFAULT_COUNTRY_CODE = '+65';
const INDIA_COUNTRY_CODE = '+91';
const SINGAPORE_LOCAL_NUMBER_RE = /^\d{8}$/;
const INDIA_LOCAL_NUMBER_RE = /^\d{10}$/;

// Leaves numbers that already carry a country code untouched; bare 8-digit numbers
// get the Singapore country code, and bare 10-digit numbers get the India country code.
function normalizeMobileNumber(rawMobileNumber: string): string {
  const withoutSpaces = rawMobileNumber.replace(/\s+/g, '');
  if (withoutSpaces.startsWith('+')) return withoutSpaces;
  if (SINGAPORE_LOCAL_NUMBER_RE.test(withoutSpaces)) return `${DEFAULT_COUNTRY_CODE}${withoutSpaces}`;
  if (INDIA_LOCAL_NUMBER_RE.test(withoutSpaces)) return `${INDIA_COUNTRY_CODE}${withoutSpaces}`;
  return withoutSpaces;
}

function buildWhatsAppLink(normalizedMobileNumber: string, fullName: string): string {
  const digitsOnly = normalizedMobileNumber.replace(/^\+/, '');
  const message = `Hi ${fullName}, this is SportyGo.`;
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

function matchesSearch(user: AdminUserRow, query: string): boolean {
  if (!query) return true;
  const haystack = `${user.fullName} ${user.email} ${user.mobileNumber}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function ViewUsersScreen() {
  const { state, navigate } = useApp();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [extendingEmail, setExtendingEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!state.isLoggedIn || state.userRole !== 'admin' || !state.authToken) navigate('sport-select');
  }, [navigate, state.authToken, state.isLoggedIn, state.userRole]);

  useEffect(() => {
    if (!state.authToken || state.userRole !== 'admin') return;
    setLoading(true);
    fetchAdminUsers(state.authToken)
      .then((response) => setUsers(response.users))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load users.'))
      .finally(() => setLoading(false));
  }, [state.authToken, state.userRole]);

  const visibleUsers = useMemo(() => users.filter((user) => matchesSearch(user, search)), [users, search]);

  async function handleResendPasscode(user: AdminUserRow) {
    if (!state.authToken) return;
    setResendingEmail(user.email);
    try {
      await resendUserPasscode(user.email, state.authToken);
      announce(`Passcode email sent to ${user.fullName}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send passcode email.');
    } finally {
      setResendingEmail(null);
    }
  }

  async function handleExtendPasscode(user: AdminUserRow) {
    if (!state.authToken) return;
    setExtendingEmail(user.email);
    try {
      await extendUserPasscodeExpiry(user.email, state.authToken);
      announce(`Passcode expiry extended for ${user.fullName}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to extend passcode expiry.');
    } finally {
      setExtendingEmail(null);
    }
  }

  if (!state.isLoggedIn || state.userRole !== 'admin' || !state.authToken) return null;

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <main className="users-view-phone">
        <ScreenHeader onBack={() => navigate('sport-select')} backAriaLabel="Back to sport select" />
        <header className="users-view-heading">
          <span><Users size={15} /> Admin control</span>
          <h1>User Details</h1>
          <p>Review registered accounts and reach out directly.</p>
        </header>

        <div className="users-view-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email, or mobile number"
            aria-label="Search users"
          />
        </div>

        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

        <section className="users-view-results" aria-live="polite">
          <header>
            <div><small>Directory</small><h2>{visibleUsers.length} {visibleUsers.length === 1 ? 'user' : 'users'}</h2></div>
            <Users size={20} />
          </header>

          {loading ? <div className="users-view-empty"><Spinner /> Loading users</div> : null}
          {!loading && visibleUsers.length === 0 ? (
            <div className="users-view-empty">
              <Users size={28} />
              <strong>No users found</strong>
              <span>Try a different search term.</span>
            </div>
          ) : null}

          {!loading ? visibleUsers.map((user) => {
            const normalizedMobileNumber = normalizeMobileNumber(user.mobileNumber);
            return (
              <article className="users-view-card" key={user.email}>
                <div className="users-view-card-main">
                  <h3>{user.fullName}</h3>
                  <a className="users-view-link" href={`mailto:${user.email}`} title={`Email ${user.fullName}`}>
                    <Mail size={14} aria-hidden="true" />
                    <span>{user.email}</span>
                  </a>
                  <a
                    className="users-view-link users-view-link--whatsapp"
                    href={buildWhatsAppLink(normalizedMobileNumber, user.fullName)}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={`Message ${user.fullName} on WhatsApp`}
                  >
                    <MessageCircle size={14} aria-hidden="true" />
                    <span>{normalizedMobileNumber}</span>
                  </a>
                </div>
                <div className="users-view-card-code">
                  <span><KeyRound size={13} aria-hidden="true" /> Reset code</span>
                  <strong>{user.passwordResetCode ?? '—'}</strong>
                  {user.passwordResetCode ? (
                    <div className="users-view-code-actions">
                      <button
                        type="button"
                        onClick={() => void handleResendPasscode(user)}
                        disabled={resendingEmail === user.email}
                        title={`Email passcode to ${user.fullName}`}
                        aria-label={`Email passcode to ${user.fullName}`}
                      >
                        <Send size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExtendPasscode(user)}
                        disabled={extendingEmail === user.email}
                        title={`Extend passcode expiry for ${user.fullName} by 15 minutes`}
                        aria-label={`Extend passcode expiry for ${user.fullName} by 15 minutes`}
                      >
                        <TimerReset size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          }) : null}
        </section>
      </main>
    </div>
  );
}
