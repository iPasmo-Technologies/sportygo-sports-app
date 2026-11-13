import { useEffect, useState, useRef } from 'react';
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
  Camera,
  Image,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ApiError, fetchProfile, updateProfile, updateProfilePhoto } from '@/lib/api';
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
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ fullName: '', mobileNumber: '' });
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.authToken) {
      navigate('login');
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchProfile(state.authToken)
      .then((response) => {
        if (!cancelled) {
          setProfile(response);
          setFormData({ fullName: response.fullName, mobileNumber: response.mobileNumber });
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

    return () => {
      cancelled = true;
    };
  }, [dispatch, navigate, state.authToken]);

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
      setFormData({ fullName: profile.fullName, mobileNumber: profile.mobileNumber });
    }
  }

  async function handleSaveEdit() {
    if (!state.authToken || !profile) return;

    const trimmedFullName = formData.fullName.trim();
    const trimmedMobileNumber = formData.mobileNumber.trim();

    // Check if there are any actual changes
    if (trimmedFullName === profile.fullName && trimmedMobileNumber === profile.mobileNumber) {
      setError('No changes detected. Please modify the fields before saving.');
      return;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const updatedProfile = await updateProfile(state.authToken, trimmedFullName, trimmedMobileNumber);
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

  async function handlePhotoUpload(file: File) {
    if (!state.authToken || !profile) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB.');
      return;
    }

    setError(null);
    setSuccess(null);
    setPhotoSaving(true);

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const updatedProfile = await updateProfilePhoto(state.authToken, base64);
      setProfile(updatedProfile);
      setPhotoPreview(null);
      setSuccess('Profile photo updated successfully.');
      announce('Profile photo updated successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update profile photo. Please try again.';
      setError(message);
    } finally {
      setPhotoSaving(false);
    }
  }

  async function handleRemovePhoto() {
    if (!state.authToken || !profile) return;

    setError(null);
    setSuccess(null);
    setPhotoSaving(true);

    try {
      const updatedProfile = await updateProfilePhoto(state.authToken, null);
      setProfile(updatedProfile);
      setPhotoPreview(null);
      setSuccess('Profile photo removed successfully.');
      announce('Profile photo removed successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to remove profile photo. Please try again.';
      setError(message);
    } finally {
      setPhotoSaving(false);
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      const preview = URL.createObjectURL(file);
      setPhotoPreview(preview);
      handlePhotoUpload(file);
    }
  }

  function handlePhotoPreviewClick() {
    fileInputRef.current?.click();
  }

  function handleInputChange(field: 'fullName' | 'mobileNumber', value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  const displayName = profile?.fullName ?? 'SportyGo Member';
  const avatarContent = photoPreview || profile?.profilePhoto ? (
    <img src={photoPreview || profile?.profilePhoto!} alt={`${displayName}'s profile photo`} className="profile-avatar-image" />
  ) : (
    initialsFor(displayName)
  );

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
              <div className="profile-avatar" aria-hidden="true">{avatarContent}</div>
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
                  <div className="profile-edit-field profile-photo-field">
                    <label><Camera size={18} /> Profile Photo</label>
                    <div className="profile-photo-upload">
                      <div className="profile-photo-preview" onClick={handlePhotoPreviewClick} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handlePhotoPreviewClick(); }}>
                        {photoPreview || profile?.profilePhoto ? (
                          <img src={photoPreview || profile?.profilePhoto!} alt={`${displayName}'s profile photo`} className="profile-photo-image" />
                        ) : (
                          <>
                            <Image size={32} strokeWidth={1.5} className="profile-photo-placeholder" aria-hidden="true" />
                            <span className="profile-photo-text">Add Photo</span>
                          </>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="profile-photo-input"
                          disabled={photoSaving}
                          aria-label="Upload profile photo"
                        />
                        {(photoPreview || profile?.profilePhoto) && !photoSaving && (
                          <button
                            type="button"
                            className="profile-photo-remove"
                            onClick={handleRemovePhoto}
                            aria-label="Remove profile photo"
                          >
                            <X size={18} strokeWidth={2.5} />
                          </button>
                        )}
                        {photoSaving && <div className="profile-photo-spinner"><Spinner variant="muted" /></div>}
                      </div>
                      <p className="profile-photo-hint">Click to upload a photo (max 5MB). Supported formats: JPG, PNG, WebP.</p>
                    </div>
                  </div>
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