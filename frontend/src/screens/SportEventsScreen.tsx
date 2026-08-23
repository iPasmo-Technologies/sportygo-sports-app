import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  GraduationCap,
  ShoppingBag,
  User,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { announce } from '@/lib/utils';
import ScreenHeader from '@/components/ScreenHeader';
import sportEventsBackground from '@/assets/select_sport_bk.png';
import cricketBanner from '@/assets/cricket_banner.png';
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
import imgCricketFacility from '@/assets/cricket_facility.png';
import imgCricketAcademy from '@/assets/cricket_academy.png';
import imgCricketCoach from '@/assets/cricket_coach.png';
import imgCricketGear from '@/assets/cricket_gear.png';
import fallbackSports from '@/data/json/sports.json';
import fallbackSportEvents from '@/data/json/sport-events.json';
import { fetchSportEvents } from '@/lib/api';
import type { SportEventCard, SportEventsResponse, SportId, SportOption } from '@/types';

type SportBannerMap = Record<SportOption['bannerKey'], string>;
type SportCardMap = Record<SportId, string>;
type EventImageMap = Record<SportEventCard['imageKey'], string>;

const SPORT_BANNERS: SportBannerMap = {
  cricket: cricketBanner,
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

const SPORT_CARDS: SportCardMap = {
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

const EVENT_IMAGES: EventImageMap = {
  facility: imgCricketFacility,
  academy: imgCricketAcademy,
  coach: imgCricketCoach,
  gear: imgCricketGear,
};

function resolveTemplate(template: string, sportLabel: string): string {
  return template
    .replace(/\{sportLower\}/g, sportLabel.toLowerCase())
    .replace(/\{sport\}/g, sportLabel);
}

function buildFallbackSportPage(sportId: SportId): SportEventsResponse {
  const sport = (fallbackSports as SportOption[]).find((item) => item.id === sportId) ?? (fallbackSports as SportOption[])[0];
  const events = (fallbackSportEvents as Array<{
    id: string;
    sportId: SportId;
    titleTemplate: string;
    descriptionTemplate: string;
    imageKey: SportEventCard['imageKey'];
    icon: SportEventCard['icon'];
    actionTarget: SportEventCard['actionTarget'];
    enabled: boolean;
    sortOrder: number;
  }>).filter((event) => event.sportId === sport.id).map((event) => ({
    id: event.id,
    sportId: event.sportId,
    title: resolveTemplate(event.titleTemplate, sport.label),
    description: resolveTemplate(event.descriptionTemplate, sport.label),
    imageKey: event.imageKey,
    icon: event.icon,
    actionTarget: event.actionTarget,
    enabled: event.enabled,
    sortOrder: event.sortOrder,
  }));

  return { sport, events };
}

function FeatureIcon({ kind }: { kind: SportEventCard['icon'] }) {
  if (kind === 'calendar') return <CalendarDays size={22} strokeWidth={2.1} />;
  if (kind === 'academy') return <GraduationCap size={22} strokeWidth={2.1} />;
  if (kind === 'coach') return <User size={22} strokeWidth={2.1} />;
  return <ShoppingBag size={22} strokeWidth={2.1} />;
}

export default function SportEventsScreen() {
  const { navigate, state } = useApp();
  const selectedSport = state.selectedSport ?? 'cricket';
  const [sportPage, setSportPage] = useState<SportEventsResponse>(() => buildFallbackSportPage(selectedSport));

  useEffect(() => {
    let active = true;

    fetchSportEvents(selectedSport)
      .then((response) => {
        if (active) {
          setSportPage(response);
        }
      })
      .catch(() => {
        if (active) {
          setSportPage(buildFallbackSportPage(selectedSport));
        }
      });

    return () => {
      active = false;
    };
  }, [selectedSport]);

  const selectedSportMeta = sportPage.sport;
  const selectedSportBanner = SPORT_BANNERS[selectedSportMeta.bannerKey] ?? SPORT_BANNERS.cricket;
  const selectedSportCard = SPORT_CARDS[selectedSportMeta.id] ?? SPORT_CARDS.cricket;

  function handleCardAction(card: SportEventCard) {
    if (!card.enabled) {
      return;
    }

    announce(`${card.title} selected.`);
    navigate(card.actionTarget);
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div
        className="sports-screen-shell"
        style={{ backgroundImage: `url(${sportEventsBackground})` }}
      >
        <ScreenHeader onBack={() => navigate('sport-select')} backAriaLabel="Back to sport list" />

        <section className="sport-events-hero">
          <div className="sport-events-hero-left" aria-hidden="true">
            <img src={selectedSportBanner} alt="" className="sport-events-hero-banner" />
          </div>
          <div className="sport-events-hero-right">
            <h1>{selectedSportMeta.label}</h1>
            <div className="sport-events-hero-lines">
              <span className="red">Play.</span>
              <span className="white">Learn.</span>
              <span className="gold">Grow.</span>
            </div>
            <p>Everything you need for your {selectedSportMeta.label.toLowerCase()} journey, all in one place.</p>
          </div>
        </section>

        <div className="sport-events-grid" role="list" aria-label={`${selectedSportMeta.label} features`}>
          {sportPage.events.map((card) => (
            <button
              type="button"
              key={card.id}
              className={`sport-event-card${!card.enabled ? ' is-disabled' : ''}`}
              role="listitem"
              aria-label={card.title}
              aria-disabled={!card.enabled}
              disabled={!card.enabled}
              onClick={() => handleCardAction(card)}
            >
              <div className="sport-event-card-media">
                <img
                  src={EVENT_IMAGES[card.imageKey] ?? selectedSportCard}
                  alt={card.title}
                  className="sport-event-card-image"
                />
                <span className="sport-event-card-badge" aria-hidden="true">
                  <FeatureIcon kind={card.icon} />
                </span>
              </div>

              <div className="sport-event-card-body">
                <div className="sport-event-card-title">{card.title}</div>
                <div className="sport-event-card-desc">{card.description}</div>
              </div>

              <div className="sport-event-card-footer">
                <span>Explore</span>
                <ArrowRight size={22} strokeWidth={2.6} className="sport-event-card-arrow" aria-hidden="true" />
              </div>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}