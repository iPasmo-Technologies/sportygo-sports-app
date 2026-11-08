import imgCricketCoach from '@/assets/cricket_coach.png';
import imgPickleballCoaching from '@/assets/pb-coaching.png';
import { pickCoachImage } from '@/lib/coaching';
import type { SportId } from '@/types';

// Sports with a chosen coaching picture. Used everywhere coaching is shown (sport card, packages, My Bookings).
const SPORT_COACH_IMAGES: Partial<Record<SportId, string>> = {
  pickleball: imgPickleballCoaching,
};

// Other sports can get one by adding coach_<sport>.png (e.g. coach_indoor_cricket.png); until then cricket_coach.png is used.
const COACH_IMAGES = import.meta.glob<string>('@/assets/coach_*.png', { eager: true, import: 'default' });

export function coachImageFor(sportId: SportId): string {
  return SPORT_COACH_IMAGES[sportId] ?? pickCoachImage(sportId, COACH_IMAGES, imgCricketCoach);
}
