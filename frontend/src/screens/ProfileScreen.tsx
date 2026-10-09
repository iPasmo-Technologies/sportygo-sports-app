import { useEffect, useState, useRef, useMemo } from 'react';
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
  Save,
  X,
  Edit,
  Search,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ApiError, fetchProfile, updateProfile, fetchClubs } from '@/lib/api';
import { clearRememberedAuth } from '@/lib/rememberedAuth';
import { announce } from '@/lib/utils';
import ScreenHeader from '@/components/ScreenHeader';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import pageBackground from '@/assets/select_sport_bk.png';
import type { ProfileResponse } from '@/types';

const PAYMENT_TEST_PAGE_ENABLED = (import.meta.env.VITE_PAYMENT_TEST_PAGE_ENABLED ?? 'false').trim() === 'true';

type ClubOption = { key: string; label: string };

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
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ fullName: '', mobileNumber: '', clubs: '' });
  const [saving, setSaving] = useState(false);
  const [clubOptions, setClubOptions] = useState<ClubOption[]>([]);
  const [clubSearch, setClubSearch] = useState('');
  const [showClubDropdown, setShowClubDropdown] = useState(false);
  const [clubLoading, setClubLoading] = useState(true);
  const clubDropdownRef = useRef<HTMLDivElement>(null);

  // Memoize selected clubs array to avoid repeated split/filter
  const selectedClubKeys = useMemo(() => 
    formData.clubs.split(',').filter(Boolean), 
    [formData.clubs]
  );

  // Create a Map for O(1) club lookups
  const clubOptionsMap = useMemo(() => 
    new Map(clubOptions.map(c => [c.key, c])), 
    [clubOptions]
  );

  // Memoize filtered clubs to avoid recomputation on every render
  const filteredClubs = useMemo(() => 
    clubOptions.filter((club) =>
      club.label.toLowerCase().includes(clubSearch.toLowerCase()) &&
      !selectedClubKeys.includes(club.key)
    ), 
    [clubOptions, clubSearch, selectedClubKeys]
  );

  // Memoize selected clubs for display
  const selectedClubs = useMemo(() => 
    selectedClubKeys
      .map(key => clubOptionsMap.get(key))
      .filter((club): club is ClubOption => club !== undefined), 
    [selectedClubKeys, clubOptionsMap]
  );

  useEffect(() => {
    if (!state.authToken) {
      navigate('login');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setClubLoading(true);

    fetchProfile(state.authToken)
      .then((response) => {
        if (!cancelled) {
          setProfile(response);
          setFormData({ 
            fullName: response.fullName, 
            mobileNumber: response.mobileNumber,
            clubs: response.clubs ?? '',
          });
        }
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

    fetchClubs()
      .then((data) => {
        if (!cancelled) {
          const options = Object.entries(data).map(([key, label]) => ({ key, label }));
          setClubOptions(options);
        }
      })
      .catch(() => {
        if (!cancelled) setClubOptions([]);
      })
      .finally(() => {
        if (!cancelled) setClubLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, navigate, state.authToken]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clubDropdownRef.current && !clubDropdownRef.current.contains(event.target as Node)) {
        setShowClubDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function logOut() {
    dispatch({ type: 'LOG_OUT' });
    announce('You have been logged out.');
  }

  function handleEditClick() {
    setEditMode(true);
    setSuccess(null);
  }

  function handleCancelEdit() {
    setEditMode(false);
    setSuccess(null);
    if (profile) {
      setFormData({ fullName: profile.fullName, mobileNumber: profile.mobileNumber, clubs: profile.clubs ?? '' });
    }
  }

  async function handleSaveEdit() {
    if (!state.authToken || !profile) return;

    const trimmedFullName = formData.fullName.trim();
    const trimmedMobileNumber = formData.mobileNumber.trim();
    const trimmedClubs = formData.clubs.trim();

    // Check if there are any actual changes
    if (trimmedFullName === profile.fullName && trimmedMobileNumber === profile.mobileNumber && trimmedClubs === (profile.clubs ?? '')) {
      setError('No changes detected. Please modify the fields before saving.');
      return;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const updatedProfile = await updateProfile(state.authToken, trimmedFullName, trimmedMobileNumber, trimmedClubs);
      setProfile(updatedProfile);
      setEditMode(false);
      setSuccess('Profile updated successfully.');
      announce('Profile updated successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update profile. Please try again.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function handleInputChange(field: 'fullName' | 'mobileNumber' | 'clubs', value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
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

        {success && (
          <div className="success-banner" role="status">
            <span className="success-icon">✅</span>
            <span>{success}</span>
            <span
              className="success-dismiss"
              role="button"
              tabIndex={0}
              onClick={() => setSuccess(null)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSuccess(null); }}
            >
              Dismiss
            </span>
          </div>
        )}

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
              <div className="profile-section-header">
                <h2 id="account-details-title">Account details</h2>
                {!editMode && (
                  <button type="button" className="profile-edit-btn" onClick={handleEditClick} aria-label="Edit profile">
                    <Edit size={18} />
                  </button>
                )}
              </div>

              {editMode ? (
                <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} className="profile-edit-form">
                  <div className="profile-edit-field">
                    <label htmlFor="edit-fullName"><UserRound size={18} /> Full name</label>
                    <input
                      id="edit-fullName"
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange('fullName', e.target.value)}
                      required
                      minLength={2}
                      disabled={saving}
                      autoComplete="name"
                    />
                  </div>
                  <div className="profile-edit-field">
                    <label htmlFor="edit-email"><Mail size={18} /> Email address</label>
                    <input
                      id="edit-email"
                      type="email"
                      value={profile.email}
                      readOnly
                      disabled
                      className="profile-edit-field--readonly"
                    />
                  </div>
                  <div className="profile-edit-field">
                    <label htmlFor="edit-mobileNumber"><Phone size={18} /> Mobile number</label>
                    <input
                      id="edit-mobileNumber"
                      type="tel"
                      value={formData.mobileNumber}
                      onChange={(e) => handleInputChange('mobileNumber', e.target.value)}
                      required
                      disabled={saving}
                      autoComplete="tel"
                    />
                  </div>
                  <div className="profile-edit-field">
                    <label htmlFor="edit-clubs"><Search size={18} /> Organization / Club</label>
                    <div className="profile-clubs-field" ref={clubDropdownRef}>
                      <div className="profile-clubs-selected">
                        {selectedClubs.map((club) => (
                          <span key={club.key} className="profile-club-tag">
                            {club.label}
                            <button
                              type="button"
                              className="profile-club-remove"
                              onClick={() => handleInputChange('clubs', selectedClubKeys.filter(k => k !== club.key).join(','))}
                              aria-label={`Remove ${club.label}`}
                            >
                              <X size={14} strokeWidth={2.5} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="profile-club-search-wrap">
                        <div className="profile-club-search-input-wrap">
                          <Search size={18} strokeWidth={2} className="profile-club-search-icon" aria-hidden="true" />
                          <input
                            id="edit-clubs"
                            type="text"
                            className="profile-club-search-input"
                            placeholder={clubLoading ? 'Loading clubs...' : 'Search and select clubs...'}
                            value={clubSearch}
                            onChange={e => {
                              setClubSearch(e.target.value);
                              setShowClubDropdown(true);
                            }}
                            onFocus={() => setShowClubDropdown(true)}
                            autoComplete="off"
                            disabled={clubLoading || saving}
                          />
                          {clubSearch && (
                            <button
                              type="button"
                              className="profile-club-search-clear"
                              onClick={() => setClubSearch('')}
                              aria-label="Clear search"
                            >
                              <X size={16} strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                        {showClubDropdown && !clubLoading && (
                          <div className="profile-club-dropdown" role="listbox" aria-label="Available clubs">
                            {filteredClubs.length === 0 ? (
                              <div className="profile-club-dropdown-empty">
                                {clubSearch ? 'No matching clubs found' : 'All available clubs selected'}
                              </div>
                            ) : (
                              filteredClubs.map((club) => (
                                <button
                                  key={club.key}
                                  type="button"
                                  className="profile-club-dropdown-item"
                                  role="option"
                                  onClick={() => handleInputChange('clubs', [...formData.clubs.split(',').filter(Boolean), club.key].join(','))}
                                >
                                  {club.label}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="profile-edit-field">
                    <label><ShieldCheck size={18} /> Sign-in method</label>
                    <input
                      type="text"
                      value="Email & password"
                      readOnly
                      disabled
                      className="profile-edit-field--readonly"
                    />
                  </div>
                  <div className="profile-edit-actions">
                    <button type="button" className="profile-btn-cancel" onClick={handleCancelEdit} disabled={saving}>
                      <X size={18} /> Cancel
                    </button>
                    <button type="submit" className="profile-btn-save" disabled={saving || !formData.fullName.trim() || !formData.mobileNumber.trim()}>
                      {saving ? <Spinner variant="muted" /> : <Save size={18} />}
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>
              ) : (
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
                    <dt><Search size={18} /> Organization / Club</dt>
                    <dd>
                      {selectedClubs.length > 0 ? (
                        <div className="profile-clubs-display">
                          {selectedClubs.map((club) => (
                            <span key={club.key} className="profile-club-tag-display">
                              {club.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="profile-clubs-empty">No clubs selected</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt><ShieldCheck size={18} /> Sign-in method</dt>
                    <dd>Email & password</dd>
                  </div>
                </dl>
              )}
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