import { useEffect, useState } from 'react';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { useApp, useSelectBookingType } from '@/context/AppContext';
import { announce } from '@/lib/utils';
import ScreenHeader from '@/components/ScreenHeader';
import selectSportBackground from '@/assets/select_sport_bk.png';
import cricketCard from '@/assets/card_cricket.png';
import indoorCricketCard from '@/assets/card_indoor_cricket.png';
import pickleballCard from '@/assets/card_pickle_ball.png';
import futsalCard from '@/assets/card_futsal.png';
import sepakTakrawCard from '@/assets/card_sepak_takraw.png';
import tennisCard from '@/assets/card_tennis.png';
import tableTennisCard from '@/assets/card_table_tennis.png';
import soccerCard from '@/assets/card_soccer.png';
import volleyballCard from '@/assets/card_volley_ball.png';
import badmintonCard from '@/assets/card_badminton.png';
import basketballCard from '@/assets/card_basket_ball.png';
import kabaddiCard from '@/assets/card_kabaddi.png';
import fallbackSports from '@/data/json/sports.json';
import { fetchSports } from '@/lib/api';
import type { SportId, SportOption } from '@/types';

type SportTile = {
  id: SportId;
  label: string;
  image: string;
  enabled: boolean;
};

const SPORT_IMAGES: Record<SportOption['imageKey'], string> = {
  cricket: cricketCard,
  'indoor-cricket': indoorCricketCard,
  pickleball: pickleballCard,
  futsal: futsalCard,
  'sepak-takraw': sepakTakrawCard,
  tennis: tennisCard,
  'table-tennis': tableTennisCard,
  soccer: soccerCard,
  volleyball: volleyballCard,
  badminton: badmintonCard,
  basketball: basketballCard,
  kabaddi: kabaddiCard,
};

function toSportTiles(sports: SportOption[]): SportTile[] {
  return sports.map((sport) => ({
    id: sport.id,
    label: sport.label,
    image: SPORT_IMAGES[sport.imageKey] ?? SPORT_IMAGES.cricket,
    enabled: sport.enabled,
  }));
}

export default function SportSelectScreen() {
  const { navigate, dispatch } = useApp();
  const selectType = useSelectBookingType();
  const fallbackSportTiles = toSportTiles(fallbackSports as SportOption[]);
  const [sports, setSports] = useState<SportTile[]>(() => fallbackSportTiles);

  useEffect(() => {
    let active = true;

    fetchSports()
      .then((response) => {
        if (!active || response.sports.length === 0) {
          return;
        }

        setSports(toSportTiles(response.sports));
      })
      .catch(() => {
        if (active) {
          setSports(fallbackSportTiles);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function handleSportSelect(sport: SportTile) {
    if (!sport.enabled) {
      return;
    }

    selectType('court');
    dispatch({ type: 'SET_SELECTED_SPORT', payload: sport.id });
    announce(`${sport.label} selected.`);
    navigate('sport-events');
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div
        className="sports-screen-shell"
        style={{ backgroundImage: `url(${selectSportBackground})` }}
      >
        <ScreenHeader onBack={() => navigate('home')} backAriaLabel="Back to home" />

        <div className="sport-steps" aria-hidden="true">
          <span className="sport-step active" />
          <span className="sport-step" />
          <span className="sport-step" />
        </div>

        <div className="sport-heading">
          <h1>
            <span className="gold">Choose</span> Your Sport
          </h1>
          <p>Select the sport you love to get started</p>
        </div>

        <div className="sport-grid" role="list" aria-label="Sports">
          {sports.map((sport) => (
            <button
              type="button"
              key={sport.id}
              className={`sport-card${!sport.enabled ? ' is-disabled' : ''}`}
              role="listitem"
              aria-label={`Select ${sport.label}`}
              aria-disabled={!sport.enabled}
              disabled={!sport.enabled}
              onClick={() => handleSportSelect(sport)}
            >
              <img src={sport.image} alt={sport.label} className="sport-card-img" />
              <span className="sport-card-label">{sport.label}</span>
            </button>
          ))}
        </div>

        <button type="button" className="sport-info-banner" aria-label="Explore and switch sports anytime">
          <span className="sport-info-icon" aria-hidden="true">
            <ShieldCheck size={20} strokeWidth={2.1} />
          </span>
          <span className="sport-info-text">
            <strong>Not sure which one to choose?</strong>
            <small>You can explore and switch sports anytime.</small>
          </span>
          <ChevronRight size={18} strokeWidth={2.4} className="sport-info-arrow" aria-hidden="true" />
        </button>

      </div>
    </div>
  );
}