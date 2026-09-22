'use strict';

const dealBoardQueueService = require('./deal-board-queue-service');

const LEGACY_PATH = '/api/dashboard/free-public-deal-board/latest';
const CURRENT_PATH = '/api/dashboard/research-queue/current';

function currentResearchQueueHandler(req, res) {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(dealBoardQueueService.latestDealBoardSnapshot({
      market: {
        city: req.query.city || 'Dallas',
        county: req.query.county || 'Dallas',
        state: req.query.state || 'TX'
      }
    }));
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message, code: 'deal_board_snapshot_read_failed' });
  }
}

function registerResearchQueueReadRoutes(app, authorizationFactory) {
  const authorization = authorizationFactory('deal_board:read');
  app.get(LEGACY_PATH, authorization, currentResearchQueueHandler);
  app.get(CURRENT_PATH, authorization, currentResearchQueueHandler);
  return { authorization, handler: currentResearchQueueHandler };
}

module.exports = {
  LEGACY_PATH,
  CURRENT_PATH,
  currentResearchQueueHandler,
  registerResearchQueueReadRoutes
};
