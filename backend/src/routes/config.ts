import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getAllConfigs, getConfigByType } from '../lib/database';

const router = Router();

// GET /api/config — all active configs grouped by type
router.get('/', asyncHandler(async (_req, res) => {
  try {
    const configs = await getAllConfigs();
    res.json({ configs });
  } catch {
    res.status(500).json({ error: 'Unable to load configuration.' });
  }
}));

// GET /api/config/:type — configs for one type (e.g. /api/config/pricing)
router.get('/:type', asyncHandler(async (req, res) => {
  const configType = req.params.type.toUpperCase();
  try {
    const configs = await getConfigByType(configType);
    if (Object.keys(configs).length === 0) {
      res.status(404).json({ error: `No configuration found for type "${configType}".` });
      return;
    }
    res.json({ configType, configs });
  } catch {
    res.status(500).json({ error: 'Unable to load configuration.' });
  }
}));

export default router;
