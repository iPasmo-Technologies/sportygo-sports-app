import { useEffect, useState, useRef } from 'react';
import { ArrowRight, Eye, EyeOff, House, Lock, Mail, Phone, UserRound, Search, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { loginUser, registerUser, fetchClubs } from '@/lib/api';
import { clearRememberedAuth, readRememberedAuth, saveRememberedAuth } from '@/lib/rememberedAuth';
import { extractRoleFromToken } from '@/lib/jwtUtils';
import { announce } from '@/lib/utils';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import logoImage from '@/assets/logo.png';
import loginBackground from '@/assets/home_bk.png';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\+?[0-9]{8,15}$/;

type AuthMode = 'login' | 'register';

type ClubOption = { key: string; label: string };

export default function LoginScreen() {
  const { dispatch, state } = useApp();

  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName]           = useState('');
  const [mobile, setMobile]       = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [nameErr, setNameErr]     = useState('');
  const [mobileErr, setMobileErr] = useState('');
  const [emailErr, setEmailErr]   = useState('');
  const [pwErr, setPwErr]         = useState('');
  const [rememberPassword, setRememberPassword] = useState(true);
  const [loading, setLoading]     = useState(false);
  const [loginErr, setLoginErr]   = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [clubs, setClubs]         = useState<string[]>([]);
  const [clubSearch, setClubSearch] = useState('');
  const [clubOptions, setClubOptions] = useState<ClubOption[]>([]);
  const [showClubDropdown, setShowClubDropdown] = useState(false);
  const [clubLoading, setClubLoading] = useState(true);
  const clubDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    readRememberedAuth().then((remembered) => {
      if (!mounted || !remembered) return;
      setEmail(remembered.email);
      setPassword(remembered.password);
      setRememberPassword(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setClubLoading(true);
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

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clubDropdownRef.current && !clubDropdownRef.current.contains(event.target as Node)) {
        setShowClubDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredClubs = clubOptions.filter((club) =>
    club.label.toLowerCase().includes(clubSearch.toLowerCase()) &&
    !clubs.includes(club.key)
  );

  function handleClubSelect(club: ClubOption) {
    setClubs(prev => [...prev, club.key]);
    setClubSearch('');
    setShowClubDropdown(false);
  }

  function handleClubRemove(clubKey: string) {
    setClubs(prev => prev.filter(key => key !== clubKey));
  }

  function validateLogin(): boolean {
    let valid = true;

    if (!email) {
      setEmailErr('Email or mobile number is required.'); valid = false;
    } else if (!EMAIL_RE.test(email.trim()) && !MOBILE_RE.test(email.trim())) {
      setEmailErr('Enter a valid email address or mobile number.'); valid = false;
    } else {
      setEmailErr('');
    }

    if (!password) {
      setPwErr('Password is required.'); valid = false;
    } else if (password.length < 8) {
      setPwErr('Password must be at least 8 characters.'); valid = false;
    } else {
      setPwErr('');
    }

    return valid;
  }

  function validateRegister(): boolean {
    let valid = true;

    if (!name.trim()) {
      setNameErr('Name is required.'); valid = false;
    } else if (name.trim().length < 2) {
      setNameErr('Name must be at least 2 characters.'); valid = false;
    } else {
      setNameErr('');
    }

    if (!mobile.trim()) {
      setMobileErr('Mobile number is required.'); valid = false;
    } else if (!MOBILE_RE.test(mobile.trim())) {
      setMobileErr('Enter a valid mobile number (8-15 digits).'); valid = false;
    } else {
      setMobileErr('');
    }

    if (!email.trim()) {
      setEmailErr('Email is required.'); valid = false;
    } else if (!EMAIL_RE.test(email.trim())) {
      setEmailErr('Enter a valid email address.'); valid = false;
    } else {
      setEmailErr('');
    }

    if (!password) {
      setPwErr('Password is required.'); valid = false;
    } else if (password.length < 8) {
      setPwErr('Password must be at least 8 characters.'); valid = false;
    } else {
      setPwErr('');
    }

    return valid;
  }

  async function handleLogin() {
    if (!validateLogin()) return;
    setLoading(true);
    setLoginErr(null);
    setSuccessMsg(null);

    try {
      const res = await loginUser(email.trim(), password);
      if (rememberPassword) {
        await saveRememberedAuth({ email: email.trim(), password });
      } else {
        clearRememberedAuth();
      }

      const redirectScreen = state.postLoginRedirect ?? 'sport-select';
      const userRole = extractRoleFromToken(res.token);
      dispatch({ type: 'SET_LOGGED_IN', payload: { email: res.email, token: res.token, role: userRole } });
      dispatch({ type: 'SET_POST_LOGIN_REDIRECT', payload: null });
      dispatch({ type: 'SET_SCREEN', payload: redirectScreen });
      announce(`Login successful. Redirecting to ${redirectScreen === 'bookings' ? 'your bookings' : redirectScreen === 'checkout' ? 'checkout' : 'home'}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setLoginErr(msg);
      announce('Login failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!validateRegister()) return;
    setLoginErr(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      await registerUser({
        name: name.trim(),
        mobileNumber: mobile.trim(),
        email: email.trim(),
        password,
        clubs: clubs.join(','),
      });
      setMode('login');
      setName('');
      setMobile('');
      setPassword('');
      setShowPw(false);
      setClubs([]);
      setNameErr('');
      setMobileErr('');
      setEmailErr('');
      setPwErr('');
      setSuccessMsg('Account created successfully. Log in with your email or mobile number to continue.');
      announce('Account created successfully. Please log in.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setLoginErr(msg);
      announce('Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  const isLoginValid = !!email.trim() && (EMAIL_RE.test(email.trim()) || MOBILE_RE.test(email.trim())) && password.length >= 8;
  const isRegisterValid = !!name.trim() && MOBILE_RE.test(mobile.trim()) && EMAIL_RE.test(email.trim()) && password.length >= 8;

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div className="login-phone" style={{ backgroundImage: `url(${loginBackground})` }}>
        <div className="login-topbar">
          <button
            type="button"
            className="login-home-btn"
            aria-label="Back to home"
            onClick={() => {
              dispatch({ type: 'SET_POST_LOGIN_REDIRECT', payload: null });
              dispatch({ type: 'SET_SCREEN', payload: 'home' });
              announce('Returning to home.');
            }}
          >
            <House size={17} strokeWidth={2.3} />
          </button>
        </div>

        <div className="sport-events-logo-wrap login-logo-wrap">
          <img src={logoImage} alt="SportyGo" className="sport-events-logo" />
        </div>

        <section className="login-hero">
          <h1>
            <span>{mode === 'login' ? 'Welcome' : 'Create'}</span>
            <strong>{mode === 'login' ? 'Back!' : 'Account'}</strong>
          </h1>
          <p>
            {mode === 'login'
              ? <>Log in to continue your sports journey with <em>SportyGo.</em></>
              : <>Register to start booking your next session with <em>SportyGo.</em></>}
          </p>
        </section>

        <section className="login-card">
          {successMsg && (
            <div className="login-success-banner" role="status" aria-live="polite">
              <span className="login-success-icon" aria-hidden="true">✓</span>
              <span>{successMsg}</span>
              <button
                type="button"
                className="login-success-dismiss"
                onClick={() => setSuccessMsg(null)}
              >
                Dismiss
              </button>
            </div>
          )}
          <ErrorBanner message={loginErr} onDismiss={() => setLoginErr(null)} />

          <div className="login-mode-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={`login-mode-btn${mode === 'login' ? ' active' : ''}`}
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setLoginErr(null);
                setSuccessMsg(null);
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={`login-mode-btn${mode === 'register' ? ' active' : ''}`}
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setMode('register');
                setLoginErr(null);
                setSuccessMsg(null);
              }}
            >
              Create Account
            </button>
          </div>

          {mode === 'register' && (
            <>
              <div className="login-field">
                <label className="login-label" htmlFor="inp-name">Full Name</label>
                <div className={`login-input-wrap${nameErr ? ' has-error' : ''}`}>
                  <UserRound size={20} strokeWidth={2} className="login-input-icon" aria-hidden="true" />
                  <input
                    id="inp-name"
                    type="text"
                    className="login-input"
                    placeholder="Enter your full name"
                    autoComplete="name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onBlur={validateRegister}
                  />
                </div>
                <div className="login-field-error">{nameErr}</div>
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="inp-mobile">Mobile Number</label>
                <div className={`login-input-wrap${mobileErr ? ' has-error' : ''}`}>
                  <Phone size={20} strokeWidth={2} className="login-input-icon" aria-hidden="true" />
                  <input
                    id="inp-mobile"
                    type="tel"
                    className="login-input"
                    placeholder="e.g. +6591234567"
                    autoComplete="tel"
                    value={mobile}
                    onChange={e => setMobile(e.target.value)}
                    onBlur={validateRegister}
                  />
                </div>
                <div className="login-field-error">{mobileErr}</div>
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="inp-clubs">Organization / Club</label>
                <div className="login-clubs-field">
                  <div className="login-clubs-selected">
                    {clubs.map((clubKey) => {
                      const club = clubOptions.find(c => c.key === clubKey);
                      return club ? (
                        <span key={club.key} className="login-club-tag">
                          {club.label}
                          <button
                            type="button"
                            className="login-club-remove"
                            onClick={() => handleClubRemove(club.key)}
                            aria-label={`Remove ${club.label}`}
                          >
                            <X size={14} strokeWidth={2.5} />
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                  <div className="login-club-search-wrap" ref={clubDropdownRef}>
                    <div className="login-club-search-input-wrap">
                      <Search size={18} strokeWidth={2} className="login-club-search-icon" aria-hidden="true" />
                      <input
                        id="inp-clubs"
                        type="text"
                        className="login-club-search-input"
                        placeholder={clubLoading ? 'Loading clubs...' : 'Search and select clubs...'}
                        value={clubSearch}
                        onChange={e => {
                          setClubSearch(e.target.value);
                          setShowClubDropdown(true);
                        }}
                        onFocus={() => setShowClubDropdown(true)}
                        autoComplete="off"
                        disabled={clubLoading}
                      />
                      {clubSearch && (
                        <button
                          type="button"
                          className="login-club-search-clear"
                          onClick={() => setClubSearch('')}
                          aria-label="Clear search"
                        >
                          <X size={16} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                    {showClubDropdown && !clubLoading && (
                      <div className="login-club-dropdown" role="listbox" aria-label="Available clubs">
                        {filteredClubs.length === 0 ? (
                          <div className="login-club-dropdown-empty">
                            {clubSearch ? 'No matching clubs found' : 'All available clubs selected'}
                          </div>
                        ) : (
                          filteredClubs.map((club) => (
                            <button
                              key={club.key}
                              type="button"
                              className="login-club-dropdown-item"
                              role="option"
                              onClick={() => handleClubSelect(club)}
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
            </>
          )}

          <div className="login-field">
            <label className="login-label" htmlFor="inp-email">{mode === 'login' ? 'Email or Mobile Number' : 'Email Address'}</label>
            <div className={`login-input-wrap${emailErr ? ' has-error' : ''}`}>
              <Mail size={20} strokeWidth={2} className="login-input-icon" aria-hidden="true" />
              <input
                id="inp-email"
                type="text"
                className="login-input"
                placeholder={mode === 'login' ? 'Enter your email or mobile number' : 'Enter your email'}
                autoComplete={mode === 'register' ? 'email' : 'username'}
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={mode === 'register' ? validateRegister : validateLogin}
              />
            </div>
            <div className="login-field-error">{emailErr}</div>
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="inp-pw">Password</label>
            <div className={`login-input-wrap${pwErr ? ' has-error' : ''}`}>
              <Lock size={20} strokeWidth={2} className="login-input-icon" aria-hidden="true" />
              <input
                id="inp-pw"
                type={showPw ? 'text' : 'password'}
                className="login-input"
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onBlur={mode === 'register' ? validateRegister : validateLogin}
              />
              <button
                type="button"
                className="login-show-toggle"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                onClick={() => setShowPw(v => !v)}
              >
                {showPw ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
              </button>
            </div>
            <div className="login-field-error">{pwErr}</div>
          </div>

          {mode === 'login' && (
            <div className="login-forgot-row">
              <button
                type="button"
                className="login-forgot-link"
                onClick={() => {
                  setLoginErr(null);
                  setSuccessMsg(null);
                  dispatch({ type: 'SET_SCREEN', payload: 'forgot-password' });
                }}
              >
                Forgot Password?
              </button>
            </div>
          )}

          {mode === 'login' && (
            <label className="login-remember-row" htmlFor="remember-password">
              <input
                id="remember-password"
                type="checkbox"
                checked={rememberPassword}
                onChange={e => setRememberPassword(e.target.checked)}
              />
              <span>Remember password on this device</span>
            </label>
          )}

          {mode === 'login' ? (
            <button
              className="login-submit-btn"
              disabled={!isLoginValid || loading}
              onClick={handleLogin}
            >
              {loading && <Spinner />}
              <span>{loading ? 'Logging In...' : 'Log In'}</span>
              {!loading && <ArrowRight size={20} strokeWidth={2.3} />}
            </button>
          ) : mode === 'register' ? (
            <button
              className="login-submit-btn"
              disabled={!isRegisterValid || loading}
              onClick={handleRegister}
            >
              {loading && <Spinner />}
              <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
              {!loading && <ArrowRight size={20} strokeWidth={2.3} />}
            </button>
          ) : null}
        </section>

        <div className="login-signup-note">
          <span>{mode === 'login' ? "Don't have an account?" : 'Already have an account?'}</span>
          <button
            type="button"
            className="login-signup-btn"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setLoginErr(null);
              setSuccessMsg(null);
            }}
          >
            {mode === 'login' ? 'Create Account' : 'Log In'} <ArrowRight size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}
