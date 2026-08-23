import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Clock3, MapPin } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { fetchSlots } from '@/lib/api';
import { DURATIONS } from '@/lib/constants';
import { formatDateShort, rollingDatesForMonths, toISO, announce } from '@/lib/utils';
import Spinner from '@/components/Spinner';
import ErrorBanner from '@/components/ErrorBanner';
import ScreenHeader from '@/components/ScreenHeader';
import BookingStepBar from '@/components/BookingStepBar';
import prevArrow from '@/assets/date-prev.svg';
import nextArrow from '@/assets/date-next.svg';
import scheduleBackground from '@/assets/select_sport_bk.png';
import bowlingLaneCard from '@/assets/bowling_lane.png';
import cricketNetsCard from '@/assets/cricket_nets.png';
import indoorCourtCard from '@/assets/indoor_court.png';
import cricketFacility from '@/assets/cricket_facility.png';
import pickleballIndoorCourt from '@/assets/pb-indoor-court.png';
import pickleballOutdoorCourt from '@/assets/pb-outdoor-court.png';
import fallbackSports from '@/data/json/sports.json';
import fallbackSportFacilities from '@/data/json/sport-facilities.json';
import type { SportFacilityCard, SportFacilityTemplate, SportId, SportOption } from '@/types';

const FACILITY_IMAGES: Record<SportFacilityCard['imageKey'], string> = {
  'bowling-lane': bowlingLaneCard,
  'nets-2': cricketNetsCard,
  'nets-3': cricketNetsCard,
  'nets-4': cricketNetsCard,
  'indoor-court': indoorCourtCard,
  'outdoor-field': cricketFacility,
  'pb-indoor-court': pickleballIndoorCourt,
  'pb-outdoor-court': pickleballOutdoorCourt,
};

const SLOT_STEP_MINUTES = 30;

function resolveTemplate(template: string, sportLabel: string): string {
  return template
    .replace(/\{sportLower\}/g, sportLabel.toLowerCase())
    .replace(/\{sport\}/g, sportLabel);
}

function buildFallbackFacilityPage(sportId: SportId) {
  const sport = (fallbackSports as SportOption[]).find((item) => item.id === sportId) ?? (fallbackSports as SportOption[])[0];
  const facilities = (fallbackSportFacilities as SportFacilityTemplate[])
    .filter((facility) => facility.sportId === sport.id)
    .map((facility) => ({
    id: `${sport.id}-${facility.code}`,
    sportId: sport.id,
    code: facility.code,
    title: resolveTemplate(facility.titleTemplate, sport.label),
    price: facility.price,
    tag: facility.tag,
    address: facility.address,
    mapLocationUrl: facility.mapLocationUrl,
    imageKey: facility.imageKey,
    icon: facility.icon,
    actionTarget: facility.actionTarget,
    enabled: facility.enabled,
    sortOrder: facility.sortOrder,
    }));

  return { sport, facilities };
}

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

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function canStartAtSlot(slots: { time: string; booked: boolean; past: boolean }[], startIndex: number, requiredSegments: number): boolean {
  if (startIndex + requiredSegments > slots.length) {
    return false;
  }

  for (let step = 0; step < requiredSegments; step++) {
    const current = slots[startIndex + step];
    if (!current || current.booked || current.past) {
      return false;
    }

    if (step > 0) {
      const previous = slots[startIndex + step - 1];
      const diff = toMinutes(current.time) - toMinutes(previous.time);
      if (diff !== SLOT_STEP_MINUTES) {
        return false;
      }
    }
  }

  return true;
}

function formatDurationLabel(minutes: number): string {
  return `${minutes} min`;
}

function parseRate(price: string): number {
  const parsed = Number(price.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function facilityDayLabel(date: Date, todayIso: string): string {
  const iso = toISO(date);
  const weekday = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
  }).format(date);
  return iso === todayIso ? `Today (${weekday})` : weekday;
}

export default function SlotBookingScreen() {
  const { state, dispatch, navigate, goBack } = useApp();
  const selectedSport = state.selectedSport ?? 'cricket';
  const fallbackPage = useMemo(() => buildFallbackFacilityPage(selectedSport), [selectedSport]);
  const selectedFacility = state.selectedFacility ?? fallbackPage.facilities[0];
  const dateList = useMemo(() => rollingDatesForMonths(3), []);
  const todayIso = useMemo(() => toISO(new Date()), []);
  const dateStripWrapRef = useRef<HTMLDivElement | null>(null);
  const ratePerHour = parseRate(selectedFacility.price);
  const isDateSelectionLocked = state.slotsLoading;
  const [conflictPrompt, setConflictPrompt] = useState<{ blockedTimes: string[] } | null>(null);

  useEffect(() => {
    if (!state.selectedFacility) {
      dispatch({ type: 'SET_SELECTED_FACILITY', payload: selectedFacility });
    }
  }, [dispatch, selectedFacility, state.selectedFacility]);

  useEffect(() => {
    if (!state.selectedDate) {
      dispatch({ type: 'SET_DATE', payload: todayIso });
    }
  }, [state.selectedDate, dispatch, todayIso]);

  useEffect(() => {
    if (!state.selectedDate) return;

    dispatch({ type: 'SET_SLOTS_LOADING' });
    fetchSlots(state.selectedDate)
      .then((res) => dispatch({ type: 'SET_SLOTS', payload: res.slots }))
      .catch((err) => dispatch({ type: 'SET_SLOTS_ERROR', payload: err.message ?? 'Failed to load slots.' }));
  }, [state.selectedDate, dispatch]);

  useEffect(() => {
    if (!state.bookingType || state.priceSubtotal !== 0) {
      return;
    }
    dispatch({ type: 'SET_DURATION', payload: state.durationMins });
  }, [dispatch, state.bookingType, state.durationMins, state.priceSubtotal]);

  const canContinue = !!state.selectedDate && !!state.selectedTime;
  const selectedEndTime = state.selectedTime ? addMinutes(state.selectedTime, state.durationMins) : null;
  const selectedDateText = state.selectedDate
    ? formatDateShort(state.selectedDate)
    : 'Not selected';
  const durationPrice = (ratePerHour * (state.durationMins / 60)).toFixed(2);

  const blockedIntermediateTimes = useMemo(() => {
    if (!state.selectedTime) return [];

    const start = toMinutes(state.selectedTime);
    const end = start + state.durationMins;

    return state.slots
      .filter((slot) => slot.booked)
      .map((slot) => slot.time)
      .filter((time) => {
        const point = toMinutes(time);
        return point > start && point < end;
      })
      .sort();
  }, [state.selectedTime, state.durationMins, state.slots]);

  const availableStartTimes = useMemo(() => {
    const requiredSegments = Math.max(1, Math.ceil(state.durationMins / SLOT_STEP_MINUTES));
    const starts = new Set<string>();

    for (let index = 0; index < state.slots.length; index++) {
      if (canStartAtSlot(state.slots, index, requiredSegments)) {
        starts.add(state.slots[index].time);
      }
    }

    return starts;
  }, [state.durationMins, state.slots]);

  useEffect(() => {
    if (!state.selectedTime) {
      return;
    }

    if (!availableStartTimes.has(state.selectedTime)) {
      dispatch({ type: 'SET_TIME', payload: '' });
    }
  }, [availableStartTimes, dispatch, state.selectedTime]);

  const blockedIntermediateTimesLabel = blockedIntermediateTimes
    .map((time) => `${to12Hour(time)}-${to12Hour(addMinutes(time, 60))}`)
    .join(', ');

  function handleDateSelect(dateStr: string, dateObj: Date) {
    if (dateStr === state.selectedDate) {
      return;
    }

    dispatch({ type: 'SET_DATE', payload: dateStr });
    announce(
      `Date selected: ${new Intl.DateTimeFormat('en-SG', {
        timeZone: 'Asia/Singapore',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(dateObj)}`
    );
  }

  function handleSlotSelect(time: string) {
    dispatch({ type: 'SET_TIME', payload: time });
    announce(`Time ${time} selected`);
  }

  function handleContinue() {
    if (!canContinue) return;

    if (blockedIntermediateTimes.length > 0) {
      setConflictPrompt({ blockedTimes: blockedIntermediateTimes });
      return;
    }

    navigate('terms');
  }

  function handleProceedAfterConflictConfirm() {
    setConflictPrompt(null);
    navigate('terms');
  }

  function handleConflictPromptCancel() {
    setConflictPrompt(null);
  }

  function moveDateWindow(direction: 'prev' | 'next') {
    if (isDateSelectionLocked) return;

    const wrap = dateStripWrapRef.current;
    if (!wrap) return;
    const distance = direction === 'next' ? 420 : -420;
    wrap.scrollBy({ left: distance, behavior: 'smooth' });
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div className="schedule-phone" style={{ backgroundImage: `url(${scheduleBackground})` }}>
        <ScreenHeader onBack={goBack} backAriaLabel="Back" />

        <BookingStepBar currentStep={2} />

        <section className="schedule-venue-card">
          <img src={FACILITY_IMAGES[selectedFacility.imageKey]} alt={selectedFacility.title} className="schedule-venue-image" />
          <div className="schedule-venue-meta">
            <h1>{selectedFacility.title}</h1>
            <div className="schedule-venue-location">
              <a
                className="schedule-venue-location-link"
                href={selectedFacility.mapLocationUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open map for ${selectedFacility.title}`}
              >
                <MapPin size={14} strokeWidth={2.3} />
              </a>
              <span className="schedule-venue-location-text">
                {selectedFacility.address}
              </span>
            </div>
            <div className="schedule-venue-price">{selectedFacility.price} <small>/ hour base rate</small></div>
          </div>
        </section>

        <section className="schedule-section">
          <h2 className="schedule-heading">1. Select Date</h2>
          <div className="date-strip-shell schedule-date-shell">
            <button
              type="button"
              className="date-inline-nav prev schedule-date-nav"
              onClick={() => moveDateWindow('prev')}
              disabled={isDateSelectionLocked}
              aria-label="Show previous dates"
              title="Show previous dates"
            >
              <img src={prevArrow} className="date-inline-nav-icon" alt="Previous dates" />
            </button>

            <div ref={dateStripWrapRef} className="date-strip-wrap schedule-date-wrap">
              <div className="date-strip">
                {dateList.map((d) => {
                  const ds = toISO(d);
                  const sel = ds === state.selectedDate;
                  return (
                    <div
                      key={ds}
                      className={`date-card schedule-date-card${sel ? ' selected' : ''}${ds === todayIso ? ' today' : ''}${isDateSelectionLocked ? ' loading-disabled' : ''}`}
                      role="button"
                      tabIndex={isDateSelectionLocked ? -1 : 0}
                      aria-disabled={isDateSelectionLocked}
                      aria-pressed={sel}
                      onClick={!isDateSelectionLocked ? () => handleDateSelect(ds, d) : undefined}
                      onKeyDown={!isDateSelectionLocked
                        ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleDateSelect(ds, d);
                          }
                        }
                        : undefined}
                    >
                      <div className="day-name">{facilityDayLabel(d, todayIso)}</div>
                      <div className="month-lbl">
                        {new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', month: 'short' }).format(d)}
                      </div>
                      <div className="day-num">{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="date-inline-nav next schedule-date-nav"
              onClick={() => moveDateWindow('next')}
              disabled={isDateSelectionLocked}
              aria-label="Show next dates"
              title="Show next dates"
            >
              <img src={nextArrow} className="date-inline-nav-icon" alt="Next dates" />
            </button>
          </div>

          <div className="schedule-legend" aria-hidden="true">
            <span><Circle className="dot available" fill="currentColor" strokeWidth={0} />Available</span>
            <span><Circle className="dot full" fill="currentColor" strokeWidth={0} />Booked</span>
            <span><Circle className="dot unavailable" fill="currentColor" strokeWidth={0} />Unavailable</span>
          </div>
        </section>

        {!state.bookingType || state.bookingType === 'court' ? (
          <section className="schedule-section">
            <h2 className="schedule-heading">2. Select Duration</h2>
            <div className="schedule-duration-grid">
              {DURATIONS.map((d) => {
                const selected = state.durationMins === d.value;
                const amount = (ratePerHour * (d.value / 60)).toFixed(2);
                return (
                  <button
                    type="button"
                    key={d.value}
                    className={`schedule-duration-card${selected ? ' selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => {
                      dispatch({ type: 'SET_DURATION', payload: d.value });
                      announce(`Duration set to ${d.label}`);
                    }}
                  >
                    <Clock3 size={20} strokeWidth={2.2} />
                    <span>{formatDurationLabel(d.value)}</span>
                    <strong>S${amount}</strong>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="schedule-section">
          <h2 className="schedule-heading">3. Select Time Slot</h2>
          {state.selectedDate && state.slotsLoading && (
            <div className="no-slots schedule-no-slots">
              <Spinner variant="muted" />
              <div style={{ marginTop: 14 }}>Loading available slots...</div>
            </div>
          )}

          {state.selectedDate && !state.slotsLoading && state.slotsError && (
            <ErrorBanner
              message={state.slotsError}
              onDismiss={() => dispatch({ type: 'CLEAR_SLOTS_ERROR' })}
            />
          )}

          {state.selectedDate && !state.slotsLoading && !state.slotsError && state.slots.length === 0 && (
            <div className="no-slots schedule-no-slots">
              <div className="no-slots-icon">No slots</div>
              <div>No available slots on this date. Please try another day.</div>
            </div>
          )}

          {state.selectedDate && !state.slotsLoading && state.slots.length > 0 && (
            <div className="schedule-slot-grid">
              {state.slots.map((s) => {
                const durationUnavailable = !s.booked && !s.past && !availableStartTimes.has(s.time);
                const disabled = s.booked || s.past || durationUnavailable;
                const sel = !disabled && state.selectedTime === s.time;
                const mood = s.booked ? 'full' : s.past || durationUnavailable ? 'unavailable' : 'available';
                const endTime = addMinutes(s.time, state.durationMins);
                return (
                  <div
                    key={s.key}
                    className={`schedule-slot${s.booked ? ' booked' : ''}${s.past || durationUnavailable ? ' unavailable' : ''}${sel ? ' selected' : ''} ${mood}`}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled}
                    aria-pressed={sel}
                    onClick={!disabled ? () => handleSlotSelect(s.time) : undefined}
                    onKeyDown={!disabled
                      ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSlotSelect(s.time);
                        }
                      }
                      : undefined
                    }
                  >
                    <div className="schedule-slot-main">{to12Hour(s.time)}</div>
                    <div className="schedule-slot-sub">- {to12Hour(endTime)}</div>
                    <Circle className={`schedule-slot-dot ${mood}`} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="schedule-booking-summary">
          <div>
            <small>Facility</small>
            <strong>{selectedFacility.title}</strong>
          </div>
          <div>
            <small>Date &amp; Time</small>
            <strong>
              {selectedDateText}
              {state.selectedTime && selectedEndTime ? `, ${to12Hour(state.selectedTime)} - ${to12Hour(selectedEndTime)}` : ''}
            </strong>
          </div>
          <div>
            <small>Duration</small>
            <strong>{formatDurationLabel(state.durationMins)}</strong>
          </div>
        </section>

        <section className="schedule-footer">
          <div className="schedule-total">
            <small>Total Amount</small>
            <strong>S${durationPrice}</strong>
            <span>(Base rate only)</span>
          </div>
          <button
            className="schedule-continue-btn"
            disabled={!canContinue}
            onClick={handleContinue}
          >
            Continue to Book <span aria-hidden="true">&#8594;</span>
          </button>
        </section>

        {conflictPrompt && (
          <div className="schedule-conflict-backdrop" role="dialog" aria-modal="true" aria-labelledby="schedule-conflict-title" aria-describedby="schedule-conflict-desc">
            <div className="schedule-conflict-modal">
              <h3 id="schedule-conflict-title">Some in-between slots are already booked</h3>
              <p id="schedule-conflict-desc">
                Your selected duration overlaps booked slot(s): {blockedIntermediateTimesLabel}.
              </p>
              <p>Do you want to proceed anyway?</p>
              <div className="schedule-conflict-actions">
                <button type="button" className="schedule-conflict-btn secondary" onClick={handleConflictPromptCancel}>Go back</button>
                <button type="button" className="schedule-conflict-btn primary" onClick={handleProceedAfterConflictConfirm}>Proceed</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
