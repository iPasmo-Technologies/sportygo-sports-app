import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Filter, LockKeyhole, Pencil, Power, Repeat2, X } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useApp } from '@/context/AppContext';
import { deactivateAdminRecurringBlock, fetchAdminBlockRules, fetchSports, updateAdminRecurringBlock } from '@/lib/api';
import { announce } from '@/lib/utils';
import type { AdminBlockRule, AdminBlockWeekday, SportId, SportOption } from '@/types';

type CalendarView = 'week' | 'month';
type RuleTypeFilter = 'all' | AdminBlockRule['ruleType'];
type BlockOccurrence = { date: string; rule: AdminBlockRule };

const WEEKDAYS: AdminBlockWeekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TIME_OPTIONS = Array.from({ length: 29 }, (_, index) => {
  const minutes = 8 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

function localIsoDate(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function addDays(value: string, days: number): string {
  const date = dateFromIso(value);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function startOfWeek(value: string): string {
  const date = dateFromIso(value);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return localIsoDate(date);
}

function periodBounds(anchor: string, view: CalendarView): { start: string; end: string } {
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 6) };
  }
  const date = dateFromIso(anchor);
  const start = localIsoDate(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  const end = localIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
  return { start, end };
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) dates.push(current);
  return dates;
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-SG', options).format(dateFromIso(value));
}

function formatTime(value: string): string {
  const [hour, minute] = value.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function dailyBlockedSlotCount(occurrences: BlockOccurrence[]): number {
  const blockedSegments = new Set<string>();
  occurrences.forEach(({ rule }) => {
    const [startHour, startMinute] = rule.startTime.split(':').map(Number);
    const [endHour, endMinute] = rule.endTime.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    const facilityKey = `${rule.sportId ?? 'all'}:${rule.facilityCode ?? rule.id}`;
    for (let minute = start; minute < end; minute += 30) blockedSegments.add(`${facilityKey}:${minute}`);
  });
  return blockedSegments.size;
}

function ruleOccursOn(rule: AdminBlockRule, date: string): boolean {
  if (!rule.active) return false;
  if (rule.ruleType === 'one-time') return rule.dates.includes(date);
  if (!rule.validFrom || !rule.validTo || date < rule.validFrom || date > rule.validTo) return false;
  return rule.weekdays.includes(WEEKDAYS[dateFromIso(date).getDay()]);
}

function RecurringRuleDialog({ rule, token, onClose, onSaved }: {
  rule: AdminBlockRule;
  token: string;
  onClose: () => void;
  onSaved: (rules: AdminBlockRule[]) => void;
}) {
  const [validFrom, setValidFrom] = useState(rule.validFrom ?? localIsoDate());
  const [validTo, setValidTo] = useState(rule.validTo ?? localIsoDate());
  const [weekday, setWeekday] = useState<AdminBlockWeekday>(rule.weekdays[0] ?? 'monday');
  const [startTime, setStartTime] = useState(rule.startTime);
  const [endTime, setEndTime] = useState(rule.endTime);
  const [reason, setReason] = useState(rule.reason);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!validFrom || !validTo || validTo < validFrom || startTime >= endTime || !reason.trim()) {
      setError('Enter a valid date range, time range, and reason.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await updateAdminRecurringBlock(rule.id, {
        validFrom,
        validTo,
        weekday,
        startTime,
        endTime,
        reason: reason.trim(),
      }, token);
      onSaved(response.rules);
      announce('Recurring block rule updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update recurring rule.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="blocked-view-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="blocked-view-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-block-title">
        <header>
          <div><small>Recurring block</small><h2 id="edit-block-title">Edit {rule.facilityTitle}</h2></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close edit dialog"><X size={19} /></button>
        </header>
        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
        <div className="blocked-view-edit-grid">
          <label>Start date<input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></label>
          <label>End date<input type="date" min={validFrom} value={validTo} onChange={(event) => setValidTo(event.target.value)} /></label>
          <label>Weekday<select value={weekday} onChange={(event) => setWeekday(event.target.value as AdminBlockWeekday)}>{WEEKDAYS.map((day) => <option key={day} value={day}>{day[0].toUpperCase() + day.slice(1)}</option>)}</select></label>
          <label>Start time<select value={startTime} onChange={(event) => setStartTime(event.target.value)}>{TIME_OPTIONS.slice(0, -1).map((time) => <option key={time}>{time}</option>)}</select></label>
          <label>End time<select value={endTime} onChange={(event) => setEndTime(event.target.value)}>{TIME_OPTIONS.slice(1).map((time) => <option key={time}>{time}</option>)}</select></label>
          <label className="wide">Reason<textarea rows={3} maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </footer>
      </section>
    </div>
  );
}

export default function ViewBlockedSlotsScreen() {
  const { state, navigate } = useApp();
  const today = localIsoDate();
  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState(today);
  const [sportFilter, setSportFilter] = useState<'all' | SportId>('all');
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<RuleTypeFilter>('all');
  const [rules, setRules] = useState<AdminBlockRule[]>([]);
  const [sports, setSports] = useState<SportOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<AdminBlockRule | null>(null);
  const [deactivatingRule, setDeactivatingRule] = useState<AdminBlockRule | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    if (!state.isLoggedIn || state.userRole !== 'admin' || !state.authToken) navigate('sport-select');
  }, [navigate, state.authToken, state.isLoggedIn, state.userRole]);

  useEffect(() => {
    if (!state.authToken || state.userRole !== 'admin') return;
    setLoading(true);
    Promise.all([fetchAdminBlockRules(state.authToken), fetchSports()])
      .then(([rulesResponse, sportsResponse]) => {
        setRules(rulesResponse.rules);
        setSports(sportsResponse.sports.filter((sport) => sport.enabled));
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load blocked slots.'))
      .finally(() => setLoading(false));
  }, [state.authToken, state.userRole]);

  const bounds = useMemo(() => periodBounds(anchor, view), [anchor, view]);
  const sportLabels = useMemo(() => new Map(sports.map((sport) => [sport.id, sport.label])), [sports]);
  const facilityOptions = useMemo(() => {
    const options = new Map<string, string>();
    rules.filter((rule) => rule.active && (sportFilter === 'all' || rule.sportId === sportFilter))
      .forEach((rule) => {
        if (rule.facilityCode) options.set(rule.facilityCode, rule.facilityTitle);
      });
    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [rules, sportFilter]);

  useEffect(() => {
    if (facilityFilter !== 'all' && !facilityOptions.some(([code]) => code === facilityFilter)) setFacilityFilter('all');
  }, [facilityFilter, facilityOptions]);

  const occurrences = useMemo(() => {
    const visibleRules = rules.filter((rule) => rule.active
      && (sportFilter === 'all' || rule.sportId === sportFilter)
      && (facilityFilter === 'all' || rule.facilityCode === facilityFilter)
      && (typeFilter === 'all' || rule.ruleType === typeFilter));
    return enumerateDates(bounds.start, bounds.end).flatMap((date) => visibleRules
      .filter((rule) => ruleOccursOn(rule, date))
      .map((rule): BlockOccurrence => ({ date, rule })))
      .sort((left, right) => left.date.localeCompare(right.date) || left.rule.startTime.localeCompare(right.rule.startTime));
  }, [bounds.end, bounds.start, facilityFilter, rules, sportFilter, typeFilter]);

  const groupedOccurrences = useMemo(() => {
    const groups = new Map<string, BlockOccurrence[]>();
    occurrences.forEach((occurrence) => groups.set(occurrence.date, [...(groups.get(occurrence.date) ?? []), occurrence]));
    return [...groups.entries()];
  }, [occurrences]);

  const periodLabel = view === 'week'
    ? `${formatDate(bounds.start, { day: 'numeric', month: 'short' })} - ${formatDate(bounds.end, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : formatDate(bounds.start, { month: 'long', year: 'numeric' });

  function movePeriod(direction: -1 | 1) {
    if (view === 'week') setAnchor(addDays(anchor, direction * 7));
    else {
      const date = dateFromIso(anchor);
      date.setMonth(date.getMonth() + direction, 1);
      setAnchor(localIsoDate(date));
    }
  }

  async function deactivate(rule: AdminBlockRule) {
    if (!state.authToken) return;
    setDeactivating(true);
    try {
      const response = await deactivateAdminRecurringBlock(rule.id, state.authToken);
      setRules(response.rules);
      setDeactivatingRule(null);
      announce('Recurring block rule deactivated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to deactivate recurring rule.');
    } finally {
      setDeactivating(false);
    }
  }

  if (!state.isLoggedIn || state.userRole !== 'admin' || !state.authToken) return null;

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <main className="blocked-view-phone">
        <ScreenHeader onBack={() => navigate('block-slots')} backAriaLabel="Back to block rules" />
        <header className="blocked-view-heading">
          <span><LockKeyhole size={15} /> Admin control</span>
          <h1>Blocked Slots</h1>
          <p>Review facility closures by week or month.</p>
        </header>

        <div className="blocked-view-mode" role="group" aria-label="Calendar view">
          <button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Weekly</button>
          <button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Monthly</button>
        </div>

        <section className="blocked-view-toolbar" aria-label="Blocked slot filters">
          <div className="blocked-view-period">
            <button type="button" onClick={() => movePeriod(-1)} aria-label={`Previous ${view}`}><ChevronLeft size={19} /></button>
            <div><small>{view === 'week' ? 'Selected week' : 'Selected month'}</small><strong>{periodLabel}</strong></div>
            <button type="button" onClick={() => movePeriod(1)} aria-label={`Next ${view}`}><ChevronRight size={19} /></button>
          </div>
          <button type="button" className="blocked-view-today" onClick={() => setAnchor(today)}>Today</button>
          <div className="blocked-view-filters">
            <label><span><Filter size={13} /> Sport</span><select value={sportFilter} onChange={(event) => setSportFilter(event.target.value as 'all' | SportId)}><option value="all">All sports</option>{sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.label}</option>)}</select></label>
            <label><span>Facility</span><select value={facilityFilter} onChange={(event) => setFacilityFilter(event.target.value)}><option value="all">All facilities</option>{facilityOptions.map(([code, title]) => <option key={code} value={code}>{title}</option>)}</select></label>
            <label><span>Block type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as RuleTypeFilter)}><option value="all">All types</option><option value="one-time">One-time</option><option value="recurring">Recurring</option></select></label>
          </div>
        </section>

        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

        <section className="blocked-view-results" aria-live="polite">
          <header><div><small>Calendar results</small><h2>{occurrences.length} blocked {occurrences.length === 1 ? 'period' : 'periods'}</h2></div><CalendarDays size={20} /></header>
          {loading ? <div className="blocked-view-empty"><Spinner /> Loading blocked slots</div> : null}
          {!loading && groupedOccurrences.length === 0 ? <div className="blocked-view-empty"><CalendarDays size={28} /><strong>No blocked slots</strong><span>Try another period or adjust the filters.</span></div> : null}
          {!loading ? groupedOccurrences.map(([date, dayOccurrences]) => (
            <section className="blocked-view-day" key={date}>
              <header><div><strong>{formatDate(date, { weekday: 'long' })}</strong><span>{formatDate(date, { day: '2-digit', month: 'short', year: 'numeric' })}</span></div><b title="Total blocked slots" aria-label={`${dailyBlockedSlotCount(dayOccurrences)} blocked slots`}>{dailyBlockedSlotCount(dayOccurrences)}</b></header>
              <div>
                {dayOccurrences.map(({ rule }) => (
                  <article className="blocked-view-item" key={`${date}-${rule.id}`}>
                    <div className="blocked-view-item-main">
                      <span className={`block-rule-kind ${rule.ruleType}`}>{rule.ruleType === 'recurring' ? <><Repeat2 size={12} /> Recurring</> : 'One-time'}</span>
                      <h3>{rule.facilityTitle}</h3>
                      <p>{rule.sportId ? sportLabels.get(rule.sportId) ?? rule.sportId : 'All sports'} <span>•</span> {rule.reason}</p>
                    </div>
                    <div className="blocked-view-time"><Clock3 size={15} /><strong>{formatTime(rule.startTime)} - {formatTime(rule.endTime)}</strong></div>
                    {rule.ruleType === 'recurring' ? <small>Effective {rule.validFrom} to {rule.validTo}</small> : null}
                    {rule.editable && rule.ruleType === 'recurring' ? <div className="blocked-view-actions"><button type="button" onClick={() => setEditingRule(rule)} title="Edit recurring block" aria-label={`Edit recurring block for ${rule.facilityTitle}`}><Pencil size={16} /></button><button type="button" onClick={() => setDeactivatingRule(rule)} title="Deactivate recurring block" aria-label={`Deactivate recurring block for ${rule.facilityTitle}`}><Power size={16} /></button></div> : null}
                  </article>
                ))}
              </div>
            </section>
          )) : null}
        </section>
      </main>
      {editingRule ? <RecurringRuleDialog rule={editingRule} token={state.authToken} onClose={() => setEditingRule(null)} onSaved={(nextRules) => { setRules(nextRules); setEditingRule(null); }} /> : null}
      {deactivatingRule ? (
        <ConfirmDialog
          title="Deactivate recurring block?"
          message={`${deactivatingRule.facilityTitle} will become available during this recurring period. Existing bookings will not be changed.`}
          confirmLabel="Deactivate"
          busyLabel="Deactivating..."
          destructive
          busy={deactivating}
          onCancel={() => setDeactivatingRule(null)}
          onConfirm={() => void deactivate(deactivatingRule)}
        />
      ) : null}
    </div>
  );
}
