import { Router } from 'express';
import { getLeaderboard } from './database.js';

export function createScoresRouter(): Router {
  const router = Router();

  router.get('/api/scores', (req, res) => {
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'games_won';
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    const entries = getLeaderboard(sort, isNaN(limit) ? 50 : limit);
    res.json(entries);
  });

  return router;
}
