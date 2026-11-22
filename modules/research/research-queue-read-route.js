'use strict';

const dealBoardQueueService = require('./deal-board-queue-service');
const { buildLeadContactBrief } = require('./lead-contact-brief');

const LEGACY_PATH = '/api/dashboard/free-public-deal-board/latest';
const CURRENT_PATH = '/api/dashboard/research-queue/current';

function projectContactResponse(snapshot, authorized) {
  const result = JSON.parse(JSON.stringify(snapshot, (key, value) =>
    ['contact_brief', 'contact_summary_authorized'].includes(key) ? undefined : value));
  if (authorized === true && Array.isArray(result.rows)) {
    result.rows = result.rows.map(row => row && typeof row === 'object' && !Array.isArray(row) ? ({ ...row,
      contact_brief: buildLeadContactBrief(row), contact_summary_authorized: true }) : row);
  }
  return result;
}

function createResearchQueueHandler(options = {}) {
  const read = options.readSnapshot || (input => dealBoardQueueService.latestDealBoardSnapshot(input));
  const authorize = options.authorizeSummary || (() => false);
  return function researchQueueHandler(req, res) {
    try {
      res.set('Cache-Control', 'no-store');
      const allowed = authorize(req, res) === true;
      const snapshot = read({
        market: {
          city: req.query.city || 'Dallas',
          county: req.query.county || 'Dallas',
          state: req.query.state || 'TX'
        }
      });
      res.json(projectContactResponse(snapshot, allowed));
    } catch (_) {
      res.status(500).json({ ok: false, error: 'Research queue unavailable.', code: 'deal_board_snapshot_read_failed' });
    }
  };
}

const currentResearchQueueHandler = createResearchQueueHandler();

function registerResearchQueueReadRoutes(app, authorizationFactory, options) {
  const authorization = authorizationFactory('deal_board:read');
  const handler = options ? createResearchQueueHandler(options) : currentResearchQueueHandler;
  app.get(LEGACY_PATH, authorization, handler);
  app.get(CURRENT_PATH, authorization, handler);
  return { authorization, handler };
}

module.exports = {
  LEGACY_PATH,
  CURRENT_PATH,
  currentResearchQueueHandler,
  createResearchQueueHandler,
  projectContactResponse,
  registerResearchQueueReadRoutes
};
