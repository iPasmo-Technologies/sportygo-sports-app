import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { listPackages } from '../lib/database';

const router = Router();

// GET /api/packages
router.get('/', asyncHandler(async (_req, res) => {
  const packages = await listPackages();
  res.json({ packages });
}));

export default router;
