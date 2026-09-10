import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, MapPin, ShieldCheck, Star } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { announce } from '@/lib/utils';
import ScreenHeader from '@/components/ScreenHeader';
import BookingStepBar from '@/components/BookingStepBar';
import Spinner from '@/components/Spinner';
import selectSportBackground from '@/assets/select_sport_bk.png';
import cricketFacility from '@/assets/cricket_facility.png';
import bowlingLaneCard from '@/assets/bowling_lane.png';
import cricketNetsCard from '@/assets/cricket_nets.png';
import indoorCourtCard from '@/assets/indoor_court.png';
import pickleballIndoorCourt from '@/assets/pb-indoor-court.png';
import pickleballOutdoorCourt from '@/assets/pb-outdoor-court.png';
import { fetchSportFacilities } from '@/lib/api';
import type { SportFacilitiesResponse, SportFacilityCard } from '@/types';

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

function FacilityIcon({ kind }: { kind: SportFacilityCard['icon'] }) {
  if (kind === 'lane') return <Star size={20} strokeWidth={2.3} />;
  if (kind === 'net') return <MapPin size={20} strokeWidth={2.3} />;
  if (kind === 'court') return <CalendarDays size={20} strokeWidth={2.3} />;
  if (kind === 'field') return <ShieldCheck size={20} strokeWidth={2.3} />;
  if (kind === 'academy') return <Star size={20} strokeWidth={2.3} />;
  return <Clock3 size={20} strokeWidth={2.3} />;
}

export default function SportFacilityScreen() {
  const { navigate, state, dispatch } = useApp();
  const selectedSport = state.selectedSport ?? 'cricket';
  const [facilityPage, setFacilityPage] = useState<SportFacilitiesResponse | null>(null);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null);
  const [facilitiesRequestVersion, setFacilitiesRequestVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setFacilityPage(null);
    setLoadingFacilities(true);
    setFacilitiesError(null);

    fetchSportFacilities(selectedSport)
      .then((response) => {
        if (active) {
          setFacilityPage(response);
        }
      })
      .catch((caught) => {
        if (active) setFacilitiesError(caught instanceof Error ? caught.message : 'Unable to load facilities.');
      })
      .finally(() => {
        if (active) setLoadingFacilities(false);
      });

    return () => {
      active = false;
    };
  }, [facilitiesRequestVersion, selectedSport]);

  const sportLabel = facilityPage?.sport.label ?? 'sport';
  const facilityCards = facilityPage?.facilities ?? [];

  function handleFacilitySelect(card: SportFacilityCard) {
    if (!card.enabled) {
      return;
    }

    dispatch({ type: 'SET_SELECTED_FACILITY', payload: card });
    announce(`${card.title} selected.`);
    navigate(card.actionTarget);
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div
        className="sports-screen-shell"
        style={{ backgroundImage: `url(${selectSportBackground})` }}
      >
        <ScreenHeader onBack={() => navigate('sport-events')} backAriaLabel="Back to sport events" />

        <BookingStepBar currentStep={1} />

        <section className="facility-select-hero">
          <h1>
            Book a <span className="gold">Facility</span>
          </h1>
          <p>
            Choose from our range of premium {sportLabel.toLowerCase()} facilities and book in just a few steps.
          </p>
        </section>

        <div className="facility-select-grid" role="list" aria-label={`${sportLabel} facilities`}>
          {loadingFacilities ? <div className="catalog-state"><Spinner variant="muted" /><span>Loading facilities...</span></div> : null}
          {!loadingFacilities && facilitiesError ? <div className="catalog-state"><strong>Facilities are unavailable</strong><span>{facilitiesError}</span><button type="button" onClick={() => setFacilitiesRequestVersion((version) => version + 1)}>Retry</button></div> : null}
          {!loadingFacilities && !facilitiesError && facilityCards.length === 0 ? <div className="catalog-state"><strong>No facilities available</strong><span>Please check again later.</span></div> : null}
          {facilityCards.map((card) => (
            <button
              type="button"
              key={card.id}
              className={`facility-select-card${!card.enabled ? ' is-disabled' : ''}`}
              role="listitem"
              aria-label={`${card.title}, ${card.address}`}
              title={card.address}
              aria-disabled={!card.enabled}
              disabled={!card.enabled}
              onClick={() => handleFacilitySelect(card)}
            >
              <div className="facility-select-card-media">
                <img src={FACILITY_IMAGES[card.imageKey]} alt={card.title} className="facility-select-card-image" />
                <span className="facility-select-card-badge" aria-hidden="true">
                  <FacilityIcon kind={card.icon} />
                </span>
              </div>

              <div className="facility-select-card-body">
                <div className="facility-select-card-title">{card.title}</div>
                <div className="facility-select-card-address">
                  <MapPin size={13} strokeWidth={2.2} aria-hidden="true" />
                  <span>{card.address}</span>
                </div>
                <div className="facility-select-card-price">
                  {card.price}
                  <small>/ hour base rate</small>
                </div>
              </div>

              <div className="facility-select-card-footer">
                <span>
                  <Clock3 size={15} strokeWidth={2.4} />
                  {card.tag}
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