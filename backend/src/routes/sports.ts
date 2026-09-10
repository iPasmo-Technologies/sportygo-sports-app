import { Router } from 'express';
import { listSportEvents, listSportFacilities, listSports } from '../lib/database';

const router = Router();

function resolveTemplate(template: string, sportLabel: string): string {
  return template
    .replace(/\{sportLower\}/g, sportLabel.toLowerCase())
    .replace(/\{sport\}/g, sportLabel);
}

// GET /api/sports
router.get('/', async (_req, res) => {
  const sports = await listSports();
  res.json({ sports });
});

// GET /api/sports/:sportId/events
router.get('/:sportId/events', async (req, res) => {
  const sports = await listSports();
  const sport = sports.find((item) => item.id === req.params.sportId);

  if (!sport) {
    res.status(404).json({ error: 'Sport not found.' });
    return;
  }

  const eventTemplates = await listSportEvents(sport.id);
  const events = eventTemplates.map((event) => ({
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

  res.json({ sport, events });
});

// GET /api/sports/:sportId/facilities
router.get('/:sportId/facilities', async (req, res) => {
  const sports = await listSports();
  const sport = sports.find((item) => item.id === req.params.sportId);

  if (!sport) {
    res.status(404).json({ error: 'Sport not found.' });
    return;
  }

  const facilities = (await listSportFacilities(sport.id)).filter((facility) => facility.enabled);
  res.json({ sport, facilities });
});

export default router;